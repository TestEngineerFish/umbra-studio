/** 泛型文件层（M8-1 / M8-2，doc/01 §4.2）。
 *
 *  `.dc.html` 有自己那条唯一写入口（`write_draft`：归一化 → `@ds` 展开 → `__resources` →
 *  节点地址 → 语义快照 → changelog）。别的文件没有那套语义，但**同样不能裸写**：
 *  要有写前校验、要留得住上一版。所以这里给它们一条对应的路：
 *
 *      sha256 校验（Q8）→ 存一份原文快照 s<N> → 原子写 → 返回快照号
 *
 *  两条路的快照放在同一个目录（`.umbrastudio/snapshots/<路径>/`），靠前缀分开：
 *  稿是 `v<N>.json`（语义快照），别的文件是 `s<N>.json`（原文 + 元数据）。
 *  `listVersions` 只认 `v<N>`，互不干扰。
 *
 *  **不做的**：不归一化、不改编码、不动换行、不碰 frontmatter —— 写进去什么样，盘上就什么样（H5）。
 */
import { createHash } from "node:crypto";
import { commitAfterWrite, commitExternalChanges } from "./gitkeep.js";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, posix, relative, sep } from "node:path";
import { gzipSync, gunzip as gunzipCb } from "node:zlib";
import { promisify } from "node:util";
/** 异步解压（issue #48）—— 同步版会把整个服务进程停住 */
const gunzip = promisify(gunzipCb);
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";
import { type VersionOrigin, snapDir } from "./history.js";
import { isToolPage } from "./indexpage.js";
import { writeAtomic } from "./normalize.js";
import { listDrafts, type Project } from "./project.js";

/* 类型联合也只有一份（`shared/kinds.ts`）。这儿曾经自己写了一遍，
   加 `json` 时它没跟上，编译器当场就抓出来了 —— 这正是统一的用处。 */
export type { FileKind };

/** 文本文件的上限：超过就只给元数据，不把整份塞进响应 */
export const TEXT_MAX = 2 * 1024 * 1024;

/** 文件类型认定走 `shared/kinds.ts` 那一份唯一出处（M8-14）。
 *  以前这里有一份扩展名映射、前端 `layout.ts` 里还有一份，两份今天一致纯属运气 ——
 *  没有任何机制保证下次加扩展名时两边都会改。现在只有一处。 */
/* 文件类型的认定**只有一份**，在 `shared/kinds.ts` —— 前端 `app/` 也 import 同一份
   （`@shared/kinds`）。以前前后端各写一套 `kindOf`，两边迟早判不一样。
   注意是 import 进来再 re-export：`export {} from` 只转发，本模块内部还是取不到这个名字。 */
import { kindOf, isTextualPath, type FileKind } from "./shared/kinds.js";
export { kindOf };

/** 这个扩展名的内容能不能当文本读 */
/** 是不是文本 —— 走 shared 那一份（`.svg` 是图片但也是文本，只看 kind 会误判） */
export function isTextual(rel: string): boolean { return isTextualPath(rel); }

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

/** 工具自己产的东西不算用户的文件（索引页、壳页、运行时副本、缩略图目录） */
const TOOL_FILES = new Set(["index-data.js", "support.js", "react.production.min.js", "react-dom.production.min.js", ".DS_Store"]);
function isToolArtifact(rel: string): boolean {
  const name = basename(rel);
  if (TOOL_FILES.has(name)) return true;
  if (isToolPage(name)) return true;
  return rel.split("/").some((seg) => seg === "_ds-tool" || seg === "_runtime" || seg.startsWith("."));
}

export interface FileEntry {
  /** 相对项目根，始终用 / 分隔 */
  path: string;
  name: string;
  kind: FileKind;
  isDir: boolean;
  size: number;
  updatedAt: string;
  /** 目录：里面有几项；dc：元素数由索引给，这里不算 */
  count?: number;
  /** 图片的原始尺寸（读不出来就没有这一项） */
  width?: number;
  height?: number;
  /** 文本文件的第一行有效内容，给目录视图的第二行摘录用 */
  excerpt?: string;
  /** 最新快照号：稿是 v<N>，别的文件是 s<N> */
  snapshot?: string;
}

export interface ListFilesResult {
  dir: string;
  entries: FileEntry[];
  /** 这一层里非目录文件的类型分布，给「自动网格」与 S1 的类型统计用 */
  types: { dc: number; md: number; image: number; other: number };
  /** 这一层实际有多少项（截断之前）。界面用它显示「还有 N 项」 */
  total: number;
  /** entries 是不是被截断过 */
  truncated: boolean;
}

/** 列一层目录（不递归）。目录在前，其余按更新时间倒序 —— 和 S12 定的顺序一致。 */
/** 一次最多返回多少条。超出的不传 —— 一个几千项的目录全传回去，
 *  光 JSON 就几 MB，而屏幕上一次也看不了那么多。设计侧第六轮定的口径：
 *  先给 200 条，末尾让界面显示「还有 N 项 · 全部显示」。 */
export const LIST_PAGE = 200;

export async function listFiles(p: Project, dirRel = "", limit = LIST_PAGE): Promise<ListFilesResult> {
  const abs = safeJoin(p, dirRel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new ToolError(err(X.IO, dirRel || ".", { kind: "path", name: dirRel },
      `${dirRel || "项目根"} 不是一个目录`, { fix: "先用 list_files 看看上一层有什么" }));
  }
  const entries: FileEntry[] = [];
  const types = { dc: 0, md: 0, image: 0, other: 0 };
  for (const e of await readdir(abs, { withFileTypes: true })) {
    const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
    if (isToolArtifact(rel)) continue;
    const full = join(abs, e.name);
    let st;
    try { st = statSync(full); } catch { continue; }   // 刚被删掉的，跳过
    const entry: FileEntry = {
      path: rel, name: e.name, kind: kindOf(rel, e.isDirectory()), isDir: e.isDirectory(),
      size: e.isDirectory() ? 0 : st.size, updatedAt: st.mtime.toISOString(),
    };
    if (e.isDirectory()) {
      try { entry.count = (await readdir(full)).filter((x) => !isToolArtifact(`${rel}/${x}`)).length; } catch { entry.count = 0; }
    } else {
      if (entry.kind === "dc") types.dc++;
      else if (entry.kind === "md") types.md++;
      else if (entry.kind === "image") types.image++;
      else types.other++;
      if (entry.kind === "image") Object.assign(entry, await imageSize(full));
      if (isTextual(rel) && entry.kind !== "dc" && st.size <= TEXT_MAX) entry.excerpt = await firstLine(full);
      const snaps = await listSnapshots(p, rel);
      if (snaps.length) entry.snapshot = snaps[snaps.length - 1];
    }
    entries.push(entry);
  }
  entries.sort((a, b) => (a.isDir === b.isDir ? b.updatedAt.localeCompare(a.updatedAt) : a.isDir ? -1 : 1));
  /* 截断**在排序之后** —— 先截再排的话，给出去的 200 条就不是「最该先看的 200 条」，
     而是 readdir 碰巧先读到的那些。 */
  const total = entries.length;
  const page = limit > 0 && total > limit ? entries.slice(0, limit) : entries;
  return { dir: dirRel, entries: page, types, total, truncated: page.length < total };
}

/** 整个项目的类型统计（S1 的 `project.types`）。 */
export async function countTypes(p: Project): Promise<{ dc: number; md: number; image: number; other: number }> {
  const t = { dc: 0, md: 0, image: 0, other: 0 };
  const walk = async (dirRel: string): Promise<void> => {
    for (const e of await readdir(safeJoin(p, dirRel), { withFileTypes: true })) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (isToolArtifact(rel)) continue;
      if (e.isDirectory()) { await walk(rel); continue; }
      const k = kindOf(rel);
      if (k === "dc") t.dc++; else if (k === "md") t.md++; else if (k === "image") t.image++; else t.other++;
    }
  };
  await walk("");
  return t;
}

export interface ReadFileResult {
  path: string; kind: FileKind; size: number; updatedAt: string; sha256: string;
  /** 文本文件的正文；二进制或超限时为 null */
  content: string | null;
  /** 没给正文的原因 */
  why?: string;
  lines?: number;
  snapshot?: string;
  /** 图片：原始尺寸 */
  width?: number; height?: number;
  /** 按哪种编码读出来的（只在不是 utf-8 时给）。
   *  ⚠️ 它是**读法**不是文件属性 —— 盘上那份一个字节都没动。 */
  encoding?: string;
}

/** 允许按哪些编码读。**白名单，不是「随便传什么都试」** ——
 *  `TextDecoder` 认得几十种，而我们只为「中文 CSV 被当成 UTF-8」这一类真实需求开口子。
 *  实测过这几种在 Node 和浏览器里都在（M10-5）。 */
const READ_ENCODINGS = new Set(["utf-8", "gbk", "gb18030", "big5", "shift_jis", "utf-16le", "windows-1252"]);

export async function readAnyFile(p: Project, rel: string, encoding?: string): Promise<ReadFileResult> {
  const abs = mustFile(p, rel);
  const st = statSync(abs);
  const buf = await readFile(abs);
  const out: ReadFileResult = {
    path: rel, kind: kindOf(rel), size: st.size, updatedAt: st.mtime.toISOString(),
    sha256: sha256(buf), content: null,
  };
  const snaps = await listSnapshots(p, rel);
  if (snaps.length) out.snapshot = snaps[snaps.length - 1];
  if (out.kind === "image") Object.assign(out, await imageSize(abs));
  if (!isTextual(rel)) { out.why = "不是文本文件"; return out; }
  if (st.size > TEXT_MAX) { out.why = `文件 ${Math.round(st.size / 1024)} KB，超过 ${TEXT_MAX / 1024 / 1024} MB 上限`; return out; }
  /* ⚠️ **`sha256` 算的是原始字节，不随编码变**（上面 `sha256(buf)`）——
     所以按 GBK 读出来的文本，拿这个 sha 回去做写前校验仍然是对的。
     这一点不成立的话「按别的编码读」就会把写入口的那道闸绕过去。 */
  if (encoding && encoding !== "utf-8") {
    if (!READ_ENCODINGS.has(encoding)) {
      out.why = `不支持按 ${encoding} 读（能用的：${[...READ_ENCODINGS].join(" / ")}）`;
      return out;
    }
    try {
      out.content = new TextDecoder(encoding).decode(buf);
      out.encoding = encoding;
    } catch (e) {
      out.why = `按 ${encoding} 读不出来：${e instanceof Error ? e.message : String(e)}`;
      return out;
    }
  } else {
    out.content = buf.toString("utf8");
  }
  out.lines = out.content.length ? out.content.split("\n").length : 0;
  return out;
}

export interface WriteFileOptions {
  /** 写前校验：盘上现在的 sha256 必须等于它，否则拒绝（Q8）。新建文件传 "0" 或不传 */
  expectSha256?: string;
  /** 记在快照元数据里，给版本历史那一列看 */
  origin?: VersionOrigin;
  note?: string;
}

export interface WriteFileResult {
  path: string; written: boolean; snapshot: string | null; previous: string | null;
  bytes: number; sha256: string; steps: string[];
}

/** 泛型落盘。`.dc.html` 在这里被拒 —— 它要走 `write_draft` 那条路。 */
/** 第二条写入口。
 *
 *  ⚠️ **`content` 可以是字节**（#108，2026-10-07）：图片编辑要把一张 PNG 写回盘。
 *  原来这条路从头到尾按 utf8 走（`writeAtomic` / `byteLength` / `Buffer.from(content,"utf8")` /
 *  末尾的 `sha256`），**二进制进来会被静默损坏** —— 文件还在、还能打开、只是花了。
 *  现在一进来就归一成 Buffer，后面全按字节算；文本那条路**行为一个字没变**
 *  （`Buffer.from(s,"utf8")` 再 `byteLength` 和原来是同一个数）。 */
export async function writeAnyFile(p: Project, rel: string, content: string | Buffer, opts: WriteFileOptions = {}): Promise<WriteFileResult> {
  /** 一进来就归一成字节 —— 后面每一处都用它，免得「有的地方按字符有的地方按字节」 */
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const clean = normalizeRel(p, rel);
  if (kindOf(clean) === "dc") {
    throw new ToolError(err(X.IO, clean, { kind: "file", name: basename(clean) },
      "`.dc.html` 不走这条路",
      { fix: "设计稿用 write_draft：它会归一化、展开 @ds、注入 __resources、打节点地址、存语义快照、写 changelog。这条路一样都不做。" }));
  }
  if (isToolArtifact(clean)) {
    throw new ToolError(err(X.IO, clean, { kind: "file", name: basename(clean) },
      "这是工具自己产的文件，不该手写",
      { fix: "索引页、壳页面、运行时副本由 build_index 生成；改了也会被下一次重建覆盖。" }));
  }
  /* 落盘前先把别处改的那一版留住（M9-7）。**第二条写入口也要有** ——
     `.md` / 代码 / 文本这些文件比设计稿更常在别的编辑器里改，
     只给设计稿装这道保险等于装了一半。 */
  const rescued = await commitExternalChanges(p.dir, clean);
  const abs = join(p.dir, clean.split("/").join(sep));
  const exists = existsSync(abs);
  const steps: string[] = [];

  // ① 写前校验（Q8）：盘上是不是还是调用方看到的那一版
  const before = exists ? await readFile(abs) : null;
  const nowSha = before ? sha256(before) : "0";
  if (opts.expectSha256 !== undefined && opts.expectSha256 !== nowSha) {
    throw new ToolError(err(X.IO, clean, { kind: "file", name: basename(clean) },
      exists ? "这个文件在你读到之后被改过了" : "这个文件已经不在了",
      { fix: `盘上现在是 ${nowSha.slice(0, 12)}…，你带来的是 ${String(opts.expectSha256).slice(0, 12)}…。重新读一次再写，别把别人的改动盖掉。` }));
  }
  steps.push(exists ? `写前校验通过（${nowSha.slice(0, 8)}）` : "新建文件");

  /* ② 存上一版：先留住旧的，再写新的 —— 顺序反了就没得退。
   *
   *  ⚠️ **但盘上这份和我们最近存的那一版一样时就不用再存一遍**（2026-09-30）。
   *  原来无条件存，于是**每次写都产生一个完全重复的快照**：
   *  上一次写的 ③ 已经把这份内容存过了，② 又存一遍。
   *  后果不在磁盘上（gzip 过，很小），在**版本列表上** ——
   *  设计侧第十三轮定了「每行写 `+N −M`」，而一半的行会是 `+0 −0`，
   *  用户看到的是一串没有意义的条目。
   *
   *  这一步**不能删**：盘上内容和我们最近一版**不同**时，它救的正是
   *  「别人在 VS Code 里改的那一版」。而且这条兜底**不受 `.gitignore` 影响**，
   *  比 git 那条可靠（git 那条对被忽略的文件会静默失效，§126.1）。
   *  所以答案是「先比一下」，不是「别存了」。 */
  let previous: string | null = null;
  if (before !== null) {
    const latest = (await listSnapshots(p, clean)).at(-1) ?? null;
    let same = false;
    if (latest) {
      /* ⚠️ **按字节比**（#108）：原来是 `readSnapshotContent(...) === before.toString("utf8")`，
         而二进制经 utf8 往返之后几乎必然不等 —— 于是每写一次图片都多存一版重复快照。
         那不是正确性问题（多一版而已），但版本列表上会多出一串没意义的行，
         和 2026-09-30 那条「每次写都产生一个完全重复的快照」是同一个症状。 */
      try { same = (await readSnapshotBytes(p, clean, latest)).equals(before); }
      catch { same = false; }   // 读不出来就当不一样，宁可多存一版
    }
    if (same) { previous = latest; steps.push(`上一版已经是 ${latest}，没重复存`); }
    else {
      /* ⚠️ **这一版打标「外部改动」，不是调用方的 `origin`。**
         能走到这一支只有两种情况，两种都不是调用方写的：
         ① 我们有快照，但盘上那份和最近一版**不同** → 别人在外面改过
         ② 我们一份快照都没有 → 这份文件的内容我们从来没经手过
         原来这里填 `opts.origin ?? "人手改"` —— 于是版本历史里那一行说「人手改」，
         而它恰恰是**别人改的那一版**。设计侧第十三轮一眼看出来的：
         「『外部改动』这个来源值后端有没有打标？没打的话这一行会显示成『人手改』。」 */
      previous = await saveSnapshot(p, clean, before, "外部改动",
        opts.note ?? "盘上内容和上一版不同，落盘前先存下的");
      steps.push(latest ? `盘上这份不是我们最近存的那版，先存下来 ${previous}` : `存快照 ${previous}`);
    }
  }

  await mkdir(dirname(abs), { recursive: true });
  await writeAtomic(abs, buf);
  steps.push(`写入 ${buf.length} 字节`);

  // ③ 新内容也留一份 —— 「回到这一版」要有得回
  const snapshot = await saveSnapshot(p, clean, buf, opts.origin ?? "人手改", opts.note);
  steps.push(`当前版 ${snapshot}`);
  if (rescued) steps.unshift(`先记下了别处改的内容（git ${rescued}）`);
  void commitAfterWrite(p.dir, clean, snapshot ?? null, null);
  return { path: clean, written: true, snapshot, previous, bytes: buf.length, sha256: sha256(buf), steps };
}

export interface FileSnapshotMeta {
  version: string; src: string; at: string; bytes: number; note?: string;
  /** 和**上一版**比，增了几行 / 删了几行。第一版没有上一版，所以是「全新增」。
   *
   *  三态，**而且三态都有用**（issue #48）：
   *  | 值 | 意思 | 谁会看到 |
   *  | --- | --- | --- |
   *  | `{plus,minus}` | 算好了 | 正常情况（**写快照时就算了**，不是读的时候算） |
   *  | `null` | **算过了但给不出数** —— 文件超过 `DELTA_MAX_LINES`、原文丢了、或者这次补算超了上限 | 界面显示「没算」 |
   *  | `undefined` | **还没算过** —— issue #48 之前写下的旧快照 | `listSnapshotMeta` 会限量补算并回写 |
   *
   *  ⚠️ `null` 和 `undefined` 不能混：混了的话「算不出来的那一版」会被
   *  每次调用都重算一遍，而它每次都算不出来 —— 这正是 #48 那条慢的一半。
   *
   *  ⚠️ **后端算，不让界面算**（设计侧第十三轮问过这一条）：
   *  快照全在我们手里，算一次就够；界面现算的话，5 个版本要拉 6 份原文下来。 */
  delta?: { plus: number; minus: number } | null;
}

/** 两段文本之间增删了几行。**只回个数，不回 diff** —— 下拉里那行 `+3 −1` 要的就是这个。
 *
 *  ⚠️ **有上限**：LCS 是 O(n×m)，两份三万行的文件能把主线程卡死几秒。
 *  超了就回 `null`，让界面说「没算」而不是让人等 —— 给不出数比卡住好。
 *  完整的差异不走这条路（设计侧的裁决是「去编辑区里看那一版」）。 */
const DELTA_MAX_LINES = 4000;
export function lineDelta(from: string, to: string): { plus: number; minus: number } | null {
  const a = from.split("\n"), b = to.split("\n");
  if (a.length > DELTA_MAX_LINES || b.length > DELTA_MAX_LINES) return null;
  /* 掐头去尾：真实的改动多半集中在中间，先把两头相同的行剥掉，LCS 的规模常降一两个数量级 */
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (!x.length || !y.length) return { plus: y.length, minus: x.length };
  /* 滚动一维的 LCS 长度（只要长度，不要回溯路径） */
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  const lcs = prev[y.length]!;
  return { plus: y.length - lcs, minus: x.length - lcs };
}

/** 这个文件的快照号，升序。只认 `s<N>` —— `v<N>` 是稿的语义快照，两套不混。 */
export async function listSnapshots(p: Project, rel: string): Promise<string[]> {
  const dir = snapDir(p, rel);
  if (!existsSync(dir)) return [];
  const ns: number[] = [];
  for (const f of await readdir(dir)) {
    const m = /^s(\d+)\.json$/.exec(f);
    if (m) ns.push(Number(m[1]));
  }
  return ns.sort((a, b) => a - b).map((n) => `s${n}`);
}

export async function listSnapshotMeta(p: Project, rel: string, withDelta = true): Promise<FileSnapshotMeta[]> {
  const dir = snapDir(p, rel);
  const out: FileSnapshotMeta[] = [];
  for (const v of await listSnapshots(p, rel)) {
    try { out.push(JSON.parse(await readFile(join(dir, `${v}.json`), "utf8")) as FileSnapshotMeta); } catch { /* 坏了就跳过 */ }
  }
  if (!withDelta) return out;

  /* ⚠️ **delta 在写快照时就算好存进 `s<N>.json` 了**（issue #48，2026-10-02）。
     原来每次调用都把这个文件的**全部**快照逐个解压、再对相邻两版各跑一次 LCS。
     实测（3000 行的文件、61 版）：
     | 这一趟 | 耗时 |
     | --- | --- |
     | `list_file_versions` 第 1 / 2 / 3 次 | 10473 / 10660 / 10198 ms（**完全没缓存**） |
     | 同一份，不要 delta | **13 ms** |
     而它跑在服务进程主线程上 —— 同一个进程还在接 MCP、WS 和别的 HTTP 请求，
     **那 10 秒整个工作台不响应**。用户每打开一个文件、每按一次 ⌘S 都付一次，
     200 版就是 ~35 秒。随使用时长单调变差，而开发时的测试项目快照少，**撞不上**。

     快照一旦写下就不变，所以这个值**完全可缓存**。现在只有旧快照
     （json 里没有 `delta` 字段）才现算，算完**回写**，下次就不用再算。 */
  const need = out.filter((m) => m.delta === undefined);
  if (!need.length) return out;

  /* ⚠️ 补算要有**总量上限**：一个存了几百版的旧文件第一次打开时，
     不加上限就又回到 10 秒那条路上了。超出的给 `null`（「没算」），
     下一次调用会接着补 —— 几次之后就全齐了。
     `null` 和 `undefined` 的区别是**有意的**：`undefined` = 还没算过（下次补），
     `null` = 算过了但算不出来（上限之外 / 原文丢了），界面显示「没算」。 */
  const BACKFILL_MAX = 20;
  let budget = BACKFILL_MAX;
  let prevSrc: string | null = null;
  let prevVer: string | null = null;
  const dirty: FileSnapshotMeta[] = [];
  for (const m of out) {
    if (m.delta !== undefined) { prevSrc = null; prevVer = m.version; continue; }
    if (budget <= 0) { m.delta = null; continue; }
    budget--;
    /* ⚠️ 一版读不出来不能毁掉整个列表（§九十二 那条「一个坏数据毁掉整个列表」）——
       读不出来就这一行没有 delta，别的照给。 */
    let cur: string | null = null;
    try { cur = await readSnapshotContent(p, rel, m.version); } catch { cur = null; }
    if (prevSrc === null && prevVer !== null) {
      try { prevSrc = await readSnapshotContent(p, rel, prevVer); } catch { prevSrc = null; }
    }
    m.delta = cur === null ? null : prevSrc === null
      ? { plus: cur.split("\n").length, minus: 0 }   // 第一版：全是新增
      : lineDelta(prevSrc, cur);
    dirty.push(m);
    prevSrc = cur ?? prevSrc;
    prevVer = m.version;
  }
  /* 把补算的结果写回去。**写失败不影响这次的返回值** ——
     盘只读、权限不够都不该让版本列表打不开。 */
  for (const m of dirty) {
    try { await writeFile(join(dir, `${m.version}.json`), JSON.stringify(m, null, 1)); }
    catch { /* 回写只是省下次的力气，不是正确性的一部分 */ }
  }
  return out;
}

async function saveSnapshot(p: Project, rel: string, buf: Buffer, src: string, note?: string): Promise<string> {
  const dir = snapDir(p, rel);
  await mkdir(dir, { recursive: true });
  const have = await listSnapshots(p, rel);
  const n = have.length ? Number(have[have.length - 1]!.slice(1)) + 1 : 1;
  const version = `s${n}`;
  /* ⚠️ **delta 在这里算一次，不留给读的时候算**（issue #48）。
     这一刻我们手上已经有新内容（`src` 的原文就是 `buf`），上一版只要解压一次 ——
     和「每次列版本就把全部快照重算一遍」比，这是 O(1) 对 O(版本数)。
     算不出来（第一版 / 上一版原文丢了）就记 `null`（「没算」），
     **不留 `undefined`** —— 那会让读的时候以为「还没算过」又去补算一遍。 */
  let delta: { plus: number; minus: number } | null = null;
  const prevVer = have.length ? have[have.length - 1]! : null;
  const curText = buf.toString("utf8");
  if (prevVer === null) delta = { plus: curText.split("\n").length, minus: 0 };
  else {
    try { delta = lineDelta(await readSnapshotContent(p, rel, prevVer), curText); }
    catch { delta = null; }
  }
  const meta: FileSnapshotMeta = { version, src, at: new Date().toISOString(), bytes: buf.length, delta, ...(note ? { note } : {}) };
  await writeFile(join(dir, `${version}.json`), JSON.stringify(meta, null, 1));
  await writeFile(join(dir, `${version}.src.gz`), gzipSync(buf));
  return version;
}

/** 读回某一版的原文 */
/** 取某一版的**字节**（#108）。
 *
 *  ⚠️ 快照存的一直是完整字节（`saveSnapshot` 收的是 Buffer），**只有读的那一步转了 utf8** ——
 *  于是 `revertFile` 对任何二进制文件都是**静默损坏**：
 *  退回一张图之后文件还在、大小变了、打不开。
 *  这条路在 #108 之前就存在（被「外部改动」兜底存下来的图片也退不回来），
 *  **只是没人退过图片，所以没人发现。** */
export async function readSnapshotBytes(p: Project, rel: string, version: string): Promise<Buffer> {
  const f = join(snapDir(p, rel), `${version}.src.gz`);
  if (!existsSync(f)) {
    const have = await listSnapshots(p, rel);
    throw new ToolError(err(X.SNAPSHOT_MISSING, rel, { kind: "key", name: version },
      `没有 ${version} 的快照`,
      { fix: have.length ? `现有：${have.join(" / ")}` : "这个文件还没有经 write_file 落过盘" }));
  }
  /* ⚠️ **异步解压**（issue #48）：`gunzipSync` 在主线程上解一个几百 KB 的 gz
     会把整个服务停住，而这个进程同时在接 MCP、WS 和别的 HTTP 请求。
     异步版把活交给 zlib 的线程池。 */
  return await gunzip(await readFile(f));
}

/** 取某一版的**文本**。二进制请用 `readSnapshotBytes` —— utf8 往返会毁掉它。 */
export async function readSnapshotContent(p: Project, rel: string, version: string): Promise<string> {
  return (await readSnapshotBytes(p, rel, version)).toString("utf8");
}

/** 回到某一版：把那一版的原文当新内容写一遍（历史不删，回退本身也留一版）。 */
export async function revertFile(p: Project, rel: string, version: string): Promise<WriteFileResult> {
  /* ⚠️ **按字节取**（#108）：原来走 `readSnapshotContent`（utf8），
     于是「退回上一版」对任何二进制文件都是静默损坏 —— 退完文件还在、打不开。
     这是 #108 之前就有的缺陷，只是没人退过图片。 */
  const old = await readSnapshotBytes(p, rel, version);
  const r = await writeAnyFile(p, rel, old, { origin: "人手改", note: `回到 ${version}` });
  r.steps.unshift(`取 ${version} 的原文`);
  return r;
}

/** 删除（回收站语义，和稿一样）：移进 `.umbrastudio/trash/<时间戳>/`，不是真删 */
export async function trashFile(p: Project, rel: string): Promise<{ path: string; trashPath: string }> {
  /* ⚠️ 和 `moveFile` 同一道闸（issue #75）：`trash_file(".git/HEAD")` 原来照做。 */
  if (isToolArtifact(rel)) {
    throw new ToolError(err(X.IO, rel, { kind: "file", name: basename(rel) },
      "这是工具自己的文件或隐藏目录，不能删",
      { fix: "trash_file 只处理项目里用户自己的文件。" }));
  }
  const abs = mustFile(p, rel);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const to = join(p.dir, ".umbrastudio", "trash", stamp, clean(rel));
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, await readFile(abs));
  await rm(abs);
  return { path: rel, trashPath: relative(p.dir, to).split(sep).join("/") };
}

export interface MoveFileResult {
  from: string; to: string;
  /** 一并改写了引用的稿：{ file, count } */
  rewrote: Array<{ file: string; count: number }>;
  steps: string[];
  /** 名字对得上、但路径解不出来所以没动的写法（外链 / 根相对）。**不静默**（issue #76 第 3 点） */
  unresolved?: Array<{ file: string; line: number; value: string }>;
  /** 引用该改而**没改成**的稿（写入口拒了：那份稿本身有 error 级诊断）。issue #92 */
  refused?: Array<{ file: string; reason: string }>;
}

/** 改名 / 移动一个普通文件，并把稿里指向它的 href / src / url() 一起改掉。
 *  S15 对用户的承诺就是这一句「改名或移动会一并改写引用」—— 不做的话那句话是假的。
 *  稿的改写走 `write_draft`（唯一写入口），所以引用改完照样有语义快照可退。 */
export async function moveFile(p: Project, fromRel: string, toRel: string): Promise<MoveFileResult> {
  const from = normalizeRel(p, fromRel), to = normalizeRel(p, toRel);
  if (kindOf(from) === "dc" || kindOf(to) === "dc") {
    throw new ToolError(err(X.IO, from, { kind: "file", name: basename(from) },
      "`.dc.html` 不走这条路", { fix: "稿的改名 / 移动用 rename_draft / move_draft，它们会跟着改 dc-import 的引用。" }));
  }
  /* ⚠️ **两头都查「这是工具自己的东西吗」**（issue #75，2026-10-05）。
     `writeAnyFile` 对 `isToolArtifact` 拒写（`.git/`、`.umbrastudio/`、
     `index-data.js`、壳页…），而 `moveFile` 原来**一头都不查** ——
     于是那道闸换条路两步就绕过去：
       write_file("tmp.txt", …)      → 普通路径，放行
       move_file("tmp.txt", ".gitattributes")  → 没守卫，放行
     单独成立的后果也够重：`move_file(".git/HEAD", "x")` 直接把用户仓库弄坏
     （`.git` 里的文件不进回收站、不留快照），挪走 `comments.json` / 快照目录
     在界面上表现为「评论和版本历史全没了」。
     **一道闸只守住一条路，等于没守。** */
  for (const r of [from, to]) {
    if (isToolArtifact(r)) {
      throw new ToolError(err(X.IO, r, { kind: "file", name: basename(r) },
        "这是工具自己的文件或隐藏目录，不能挪进挪出",
        { fix: "move_file 只处理项目里用户自己的文件。" }));
    }
  }
  const absFrom = mustFile(p, from);
  const absTo = join(p.dir, to.split("/").join(sep));
  if (existsSync(absTo)) {
    throw new ToolError(err(X.IO, to, { kind: "file", name: basename(to) }, `${to} 已经存在`,
      { fix: "换一个名字，或者先把那一个挪开。" }));
  }
  const refs = await referencesOf(p, from);
  const steps: string[] = [];
  await mkdir(dirname(absTo), { recursive: true });
  await writeFile(absTo, await readFile(absFrom));
  await rm(absFrom);
  steps.push(`${from} → ${to}`);

  /* 引用改写：稿里写的是相对它自己的路径，所以按每份稿的位置重算。
     改完经 write_draft 落盘 —— 引用变了也要留快照，和别的改稿一视同仁。 */
  const { writeDraft } = await import("./write.js");
  const { parseDraft, draftKindOf } = await import("./draft.js");
  const byFile = new Map<string, number>();
  for (const r of refs) byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1);
  const rewrote: Array<{ file: string; count: number }> = [];
  /** 解不出来的那些（外链 / 根相对 / 指到项目外）—— **不静默**，列出来让人自己看一眼 */
  const unresolved: Array<{ file: string; line: number; value: string }> = [];
  /** 写入口拒了的那些（稿里有 error 级诊断）—— 引用**没改成**，必须说（issue #92） */
  const refused: Array<{ file: string; reason: string }> = [];
  for (const [draftRel, count] of byFile) {
    const abs = join(p.dir, draftRel.split("/").join(sep));
    let src: string;
    try { src = await readFile(abs, "utf8"); } catch { continue; }
    const { out: next, changed } = mapDraftRefs(src, (value) =>
      resolveRefTarget(draftRel, value) === from ? refValueFor(draftRel, to, value) : null);
    if (changed === 0 || next === src) continue;
    /* ⚠️ **看一眼写入口到底写没写**（issue #92，2026-10-06）。
       原来不看 `outcome` 就 `rewrote.push` —— 而 `writeDraft` 对**改写后仍有
       error 级诊断**的稿返回 `written:false`。文件已经挪走了（上面几行），
       引用没改，而回执说「改写引用 N 处」。
       **假回执比没有回执糟**（#35 那条同一句话）—— 用户按回执相信引用是好的。 */
    const wr = await writeDraft(p, draftRel, next, draftKindOf(parseDraft(next, draftRel)),
      `引用跟着 ${basename(from)} 的移动改了`, { origin: "人手改" });
    if (!wr.outcome.written && !wr.outcome.unchanged) {
      refused.push({ file: draftRel, reason: wr.outcome.refused ?? "写入口拒绝了" });
      steps.push(`⚠️ ${draftRel} 的引用**没改成**：${wr.outcome.refused ?? "写入口拒绝了"}`);
      continue;
    }
    rewrote.push({ file: draftRel, count: changed });
    steps.push(`改写引用 ${draftRel}（${changed} 处）`);
    if (changed !== count) {
      steps.push(`⚠️ ${draftRel} 里还有 ${count - changed} 处提到 ${basename(from)} 但解不出路径，没动`);
    }
  }
  /* 改完再扫一遍：名字对得上、但解不出路径的写法（`https://…/img.png`、`/img.png`），
     以及**正文里提到文件名**的地方。它们本来就不该被改 —— 但也不该一声不吭。 */
  for (const abs of await listDrafts(p)) {
    const draftRel = relative(p.dir, abs).split(sep).join("/");
    if (isToolArtifact(draftRel)) continue;
    let src: string;
    try { src = await readFile(abs, "utf8"); } catch { continue; }
    if (!src.includes(basename(from))) continue;
    mapDraftRefs(src, (value, line) => {
      const t = resolveRefTarget(draftRel, value);
      if (t === null && value.includes(basename(from))) unresolved.push({ file: draftRel, line, value });
      return null;
    });
  }
  return { from, to, rewrote, steps, ...(unresolved.length ? { unresolved } : {}), ...(refused.length ? { refused } : {}) };
}

/* ── 稿里的「引用」是**有结构的东西**，不是一段文字（issue #76，2026-10-05）──
   原来改写引用是 `src.split(oldHref).join(newHref)` —— 对整篇稿做**子串**替换。
   它不知道边界，于是两个方向都错：

   ① **改坏别的引用**：`"data.png".split("a.png")` = `["dat", ""]`，
      `move_file("a.png","b/a.png")` 把 `src="data.png"` 改成 **`datb/a.png`**；
      `icons/logo.png` 变成 `icons/old/logo.png`；连正文里「见 logo.png」这句话也改。
   ② **该改的静默不改**：子目录的稿 `pages/a.dc.html` 按自然写法写 `src="img.png"`，
      而 `oldHref` 算出来是 `../pages/img.png` —— 稿里没这个串，`continue`，
      回执里一个字都不提。而 `referencesOf` 按 basename **算到了**这份稿：
      **找到了却没改，是最差的组合。**

   现在：取出**属性值** → 解成根相对路径 → **等于 from 才换** → 用 `posix.relative` 重算。
   `referencesOf` 用同一个判定（原来它比 basename，于是「找到的」和「改的」对不上）。 */

/** href / src 的值，或 url(…) 里的值。七个捕获组，顺序别动（下面按下标取）。 */
const REF_VALUE_RE = /(\b(?:href|src)\s*=\s*)(["'])([^"']*)\2|(\burl\(\s*)(["']?)([^"')]*)\5(\s*\))/gi;

/** 一处引用解成「相对项目根的路径」；解不出来（外链 / 根相对 / 锚点 / 指到项目外）回 null。 */
function resolveRefTarget(draftRel: string, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) || v.startsWith("//") || v.startsWith("#")) return null;
  if (v.startsWith("/")) return null;                       // 根相对：不是项目内的相对引用
  const pathPart = v.split(/[?#]/)[0] ?? "";
  if (!pathPart) return null;
  const joined = posix.normalize(posix.join(posix.dirname(draftRel), decodeRefPath(pathPart)));
  if (joined === "." || joined.startsWith("../")) return null;   // 指到项目外
  return joined;
}

/** 地址里可能写着 `%E4%B8%AD`。⚠️ 解不开就原样用 —— **别让一个坏编码把整件事炸掉**（#85 同族）。 */
function decodeRefPath(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** 遍历一份稿里所有引用的**值**：回调回新值就替换，回 null 就不动。
 *  ⚠️ 按**匹配到的区间**替换，不是 `split/join` —— 同一个值在正文里出现也不碰。 */
function mapDraftRefs(
  src: string,
  fn: (value: string, line: number) => string | null,
): { out: string; changed: number } {
  let out = "", last = 0, changed = 0, cursor = 0, line = 1;
  for (const m of src.matchAll(REF_VALUE_RE)) {
    const at = m.index ?? 0;
    while (cursor < at) { if (src.charCodeAt(cursor) === 10) line++; cursor++; }
    const isAttr = m[3] !== undefined;
    const value = isAttr ? m[3] : m[6];
    if (value === undefined) continue;
    const vOff = at + (isAttr ? (m[1]?.length ?? 0) + (m[2]?.length ?? 0)
                              : (m[4]?.length ?? 0) + (m[5]?.length ?? 0));
    const next = fn(value, line);
    if (next === null || next === value) continue;
    out += src.slice(last, vOff) + next;
    last = vOff + value.length;
    changed++;
  }
  return { out: out + src.slice(last), changed };
}

/** 稿里该怎么写这个文件的路径：相对稿自己的位置。
 *  保住原来的写法 —— 本来写 `./x.png` 的就还是 `./`，本来带 `?v=2` 的把后缀带回去。 */
function refValueFor(draftRel: string, targetRel: string, oldValue: string): string {
  const suffix = oldValue.match(/[?#].*$/)?.[0] ?? "";
  let next = posix.relative(posix.dirname(draftRel), targetRel);
  if (oldValue.trim().startsWith("./") && !next.startsWith(".")) next = "./" + next;
  return next + suffix;
}

/** 谁引用了这个文件（S15 的 referencedBy）：扫所有稿的 href / src / url()，返回 { file, line }。
 *  ⚠️ **按解出来的路径比，不按 basename**（issue #76）—— 原来 `icons/logo.png` 和
 *  根目录的 `logo.png` 是同一个 basename，于是「谁引用了我」把别人的引用也算进来，
 *  而改写那一步按真实路径算 → **找到的和改的对不上**。两处现在共用 `resolveRefTarget`。 */
export async function referencesOf(p: Project, rel: string): Promise<Array<{ file: string; line: number }>> {
  const target = basename(rel);
  const out: Array<{ file: string; line: number }> = [];
  for (const abs of await listDrafts(p)) {
    const draftRel = relative(p.dir, abs).split(sep).join("/");
    // 工具自己部署进项目的壳页面（S2–S8、index）不算「引用方」——
    // 它们引 support.js 是 build_index 干的，跟用户的文件组织没关系
    if (isToolArtifact(draftRel)) continue;
    let src: string;
    try { src = await readFile(abs, "utf8"); } catch { continue; }
    if (!src.includes(target)) continue;          // 先粗筛，避免每份稿都逐行
    mapDraftRefs(src, (value, line) => {
      if (resolveRefTarget(draftRel, value) === rel) out.push({ file: draftRel, line });
      return null;                                 // 只看不改
    });
  }
  return out;
}

// ──────────────────────── 内部 ────────────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (rel: string) => rel.split(/[\\/]/).filter((x) => x && x !== "." && x !== "..").join("/");

/** 把调用方给的路径规范成「相对项目根的干净路径」。
 *  ⚠️ **导出它是有意的**（M10-2c）：草稿暂存要用**同一套**规范化 ——
 *  两处各写一份的话，同一个文件在快照那边叫 `a/b.ts`、在草稿那边叫 `./a/b.ts`，
 *  于是「有没有草稿」永远查不到。 */
export function normalizeRel(p: Project, rel: string): string {
  const c = clean(rel);
  if (!c) {
    throw new ToolError(err(X.IO, rel, { kind: "path", name: rel }, "路径是空的",
      { fix: "给一个相对项目根的路径，比如 需求.md 或 docs/需求.md" }));
  }
  void p;
  return c;
}

function safeJoin(p: Project, rel: string): string {
  const c = clean(rel);
  const abs = c ? join(p.dir, c.split("/").join(sep)) : p.dir;
  if (!abs.startsWith(p.dir)) {
    throw new ToolError(err(X.IO, rel, { kind: "path", name: rel }, "路径跑到项目外面去了",
      { fix: "只能读写项目目录里的文件。" }));
  }
  return abs;
}

function mustFile(p: Project, rel: string): string {
  const abs = safeJoin(p, rel);
  if (!existsSync(abs) || statSync(abs).isDirectory()) {
    throw new ToolError(err(X.DRAFT_NOT_FOUND, rel, { kind: "file", name: rel },
      `项目里没有文件 ${rel}`, { fix: "先用 list_files 看看这一层有什么" }));
  }
  return abs;
}

async function firstLine(abs: string): Promise<string> {
  try {
    const head = (await readFile(abs, "utf8")).slice(0, 4000);
    const body = head.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");   // 跳过 frontmatter
    const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
    return line ? line.slice(0, 120) : "";
  } catch { return ""; }
}

/** 从文件头读图片尺寸。只认这几种，读不出来就不给 —— 宁可没有，不可以给错的。 */
async function imageSize(abs: string): Promise<{ width?: number; height?: number }> {
  try {
    const ext = extname(abs).toLowerCase();
    if (ext === ".svg") {
      const s = (await readFile(abs, "utf8")).slice(0, 4000);
      const w = /\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/.exec(s), h = /\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/.exec(s);
      if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(s);
      return vb ? { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) } : {};
    }
    const b = await readFile(abs);
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };   // PNG
    if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };   // GIF
    if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const fmt = b.toString("ascii", 12, 16);
      if (fmt === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (fmt === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (fmt === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
      return {};
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {   // JPEG：按段走到 SOFn
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1] as number;
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    return {};
  } catch { return {}; }
}
