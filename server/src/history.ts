/** 版本历史与变更清单。doc/07 §五、§六、§七
 *
 * 主路径是 .umbrastudio/snapshots/ 的快照序列；git 是兜底，只在要按任意 ref
 * 取版本时用（07 §七）。实现侧永远不碰 git —— 它读 CHANGELOG-设计侧.md。
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";
import type { Project } from "./project.js";
import { buildSnapshot, type Snapshot } from "./snapshot.js";
import { conclusion, diffSnapshots, toMarkdown, type DiffResult } from "./diff.js";

export const CHANGELOG = "CHANGELOG-设计侧.md";

/** 一版是谁落的。设计侧 §3.2 的版本弹层按它区分「我改的还是模型改的」——三个取值，不加第四个 */
/** 谁改的这一版。⚠️ **「插件」是独立的一类**（Q37）——
 *  买来装上的格式插件也会写盘，把它算进 AI 或人手改，变更清单就会说谎：
 *  用户看到「AI 改的」会去翻会话记录，而那一次根本没有会话。 */
/** 这一版是**谁产生的**。
 *
 *  ⚠️ **不是「谁调的这次写」**（2026-09-30，设计侧一眼看出来的）。
 *  泛型文件层落盘时会先把盘上那份存一版 —— 而那一版多半**不是调用方写的**，
 *  是别人在 VS Code 里改的。原来它按 `opts.origin` 打标，于是
 *  「别人改的那一版」被标成「人手改」，**而救下这一版正是那条兜底存在的全部理由**。
 *  §九十三 那次把写死的 `"人手改"` 改成 `originOf(via)`，修的是「调用方是谁」，
 *  没修「这一版是谁产生的」—— 两个问题长得像，答案不在同一个地方。 */
export type VersionOrigin = "AI" | "人手改" | "新建" | "插件" | "外部改动";
export interface VersionMeta { origin: VersionOrigin; capturedAt: string; summary: string }

function metaFile(p: Project, relPath: string): string {
  return join(snapDir(p, relPath), "meta.json");
}

/** 读一份稿全部版本的元数据。快照本身可能几 MB，弹层只要三个字段，所以单独存一份小表 */
export async function readVersionMeta(p: Project, relPath: string): Promise<Record<string, VersionMeta>> {
  const f = metaFile(p, relPath);
  if (!existsSync(f)) return {};
  try { return JSON.parse(await readFile(f, "utf8")) as Record<string, VersionMeta>; }
  catch { return {}; }
}

/** 落盘后记一条。写在 write_draft 的末尾 —— 唯一写入口，所以每一版都有 */
export async function recordVersionMeta(
  p: Project, relPath: string, version: string, meta: VersionMeta
): Promise<void> {
  const all = await readVersionMeta(p, relPath);
  all[version] = meta;
  await mkdir(snapDir(p, relPath), { recursive: true });
  await writeFile(metaFile(p, relPath), JSON.stringify(all, null, 1) + "\n", "utf8");
}

/** 给人看的相对时间：今天 08:31 · 昨天 23:50 · 09-20 14:02 */
export function humanTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p2 = (n: number) => String(n).padStart(2, "0");
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(now)) return `今天 ${hm}`;
  if (day(d) === day(y)) return `昨天 ${hm}`;
  return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hm}`;
}

/** 一个相对路径 → 一个**唯一且可读**的状态目录名（issue #47，2026-10-02）。
 *
 *  ### 原来错在哪
 *  原来是 `rel.replace(/[\\/]/g, "__")`，而 **`/` → `__` 不可逆**：
 *  `docs/x.md` 和 `docs__x.md` 编成**同一个名字**。同一个项目里同时有这两份文件时：
 *  - 草稿互相覆盖（后改的那份把前一份的草稿冲掉，刷新就找不回来 ——
 *    而「刷新不丢」正是 M10-2c 存在的理由）
 *  - 打开 B 时读到 A 的草稿，点「用草稿覆盖」会把**另一个文件的内容**写进 B
 *  - 两份文件的 `s<N>` 在同一个目录里连号 → 版本列表混在一起、
 *    「和最近一版一样就不存」比的是另一个文件、回退可能拿到另一个文件的内容
 *
 *  `staged.ts` 的注释里**写明了这个不可逆**，但只在 `listStagedDrafts` 里绕开了 ——
 *  **知道根因而只补了一处**，存 / 取 / 清三条路和快照目录都没管。
 *
 *  ### 为什么是「可读前缀 + 哈希」而不是纯哈希或可逆转义
 *  | 方案 | 问题 |
 *  | --- | --- |
 *  | 可逆转义（`_`→`_u`、`/`→`_s`） | 双射，撞号解决了，但**更长** —— 而编码后是**一个**文件名，路径深一点就撞 APFS/NTFS 的 255 字节上限（中文每字 3 字节，约 80 字就到） |
 *  | 纯 `sha256(rel)` | 唯一且定长，但 `.umbrastudio/snapshots/` 变成一堆哈希，**用户和我们都看不出哪个是哪个** |
 *  | **basename + 短哈希** | 唯一（哈希来自完整路径）· 可读（看得出是哪个文件）· 定长上限 54 字节 |
 *
 *  ⚠️ **只有这一个函数能把路径变成目录名** —— `stagedPath` 也用它。
 *  两处各写一份就是这条 bug 的来源。
 */
export function pathKey(relPath: string): string {
  /* 基名截到 40 字节（按**字节**截，不按字符 —— 文件名上限是字节数），
     非法字符一律换 `_`。哈希取完整相对路径，所以截断不会造成撞号。 */
  const base = relPath.split(/[\\/]/).pop() || "file";
  const safe = base.replace(/[^\p{L}\p{N}._-]/gu, "_");
  const buf = Buffer.from(safe, "utf8");
  const head = buf.length <= 40 ? safe : buf.subarray(0, 40).toString("utf8").replace(/\uFFFD+$/, "");
  return `${head}__${createHash("sha256").update(relPath).digest("hex").slice(0, 12)}`;
}

/** 旧编码（`/` → `__`）。**只用来读** —— 迁移期找得到以前的快照。 */
const legacyKey = (relPath: string): string => relPath.replace(/[\\/]/g, "__");

export function snapDir(p: Project, relPath: string): string {
  const root = join(p.dir, ".umbrastudio", "snapshots");
  const now = join(root, pathKey(relPath));
  /* ⚠️ **新名字没有而旧名字有时，用旧的**（只读兼容，不改名）。
     不这么做的话升级之后用户的版本历史**整段消失** —— 而他可能正靠它回退。
     不自动 rename：旧名字可能本来就对应两份文件（这正是这条 bug），
     搬错比看不到更糟。新的落盘一律写新名字，所以旧目录会自然停止增长。 */
  if (!existsSync(now) && existsSync(join(root, legacyKey(relPath)))) return join(root, legacyKey(relPath));
  return now;
}

/** 这份稿有哪些快照版本，升序 */
export async function listVersions(p: Project, relPath: string): Promise<string[]> {
  const dir = snapDir(p, relPath);
  if (!existsSync(dir)) return [];
  const ns: number[] = [];
  for (const f of await readdir(dir)) {
    const m = /^v(\d+)\.json$/.exec(f);
    if (m) ns.push(Number(m[1]));
  }
  return ns.sort((a, b) => a - b).map((n) => `v${n}`);
}

export async function readSnapshot(p: Project, relPath: string, version: string): Promise<Snapshot> {
  const f = join(snapDir(p, relPath), `${version}.json`);
  if (!existsSync(f)) {
    const have = await listVersions(p, relPath);
    throw new ToolError(err(X.SNAPSHOT_MISSING, relPath, { kind: "key", name: version },
      `没有 ${version} 的快照`,
      { fix: have.length ? `现有：${have.join(" / ")}` : "这份稿还没有经 write_draft 落过盘，所以没有快照" }));
  }
  return JSON.parse(await readFile(f, "utf8")) as Snapshot;
}

/* ⚠️ **本地那个 `git()` 删了**（issue #86 + #87，2026-10-06）。
   它是 `execFile("git", ["-C", p.dir, ...args])` —— 没有 HARDEN、没清 `GIT_*`、
   读的就是项目里那份**对方可控的** `.git/config`，而 `ref` 原样拼进第一个参数。
   现在走 `gitkeep.gitShow()`：同一个 GIT_DIR、同一套加固、ref 先解成 sha。
   **「同一件事两套实现」是这一批五条缺陷里四条的共同形状**（§一四三）。 */

/** 把一个"版本说明"解析成快照。支持 v<N>、git ref、以及 "工作区"（当前盘上的内容）。 */
export async function resolveSnapshot(p: Project, relPath: string, ref: string): Promise<Snapshot> {
  if (/^v\d+$/.test(ref)) return await readSnapshot(p, relPath, ref);

  if (ref === "工作区" || ref === "worktree" || ref === "HEAD~0") {
    const src = await readFile(join(p.dir, relPath), "utf8");
    return buildSnapshot(p, relPath, src, { version: "工作区" });
  }

  /* ⚠️ 形状先判（issue #86）—— 在起进程**之前**，而且回的是 `BAD_INPUT` 不是
     「取不到」：`--output=…` 这种输入的问题不是「那一版不存在」。 */
  const { refProblem, gitShow, hasRepo } = await import("./gitkeep.js");
  const bad = refProblem(ref);
  if (bad) {
    throw new ToolError(err(X.BAD_INPUT, relPath, { kind: "key", name: ref },
      `版本号不合法：${bad}`,
      { fix: "版本号要么是 v<N>、要么是「工作区」、要么是一个 git ref（提交 sha / 分支名）。" }));
  }
  if (!hasRepo(p.dir)) {
    throw new ToolError(err(X.GIT_DISABLED, relPath, { kind: "key", name: ref },
      `这份稿还没有被兜底记过，取不了 "${ref}"`,
      { fix: "只支持 v<N> 与「工作区」。兜底记录是在「别的编辑器改过这份稿」时自动产生的（doc/00 §一一一）" }));
  }
  let src: string;
  try {
    src = await gitShow(p.dir, ref, relPath);
  } catch (e) {
    throw new ToolError(err(X.SNAPSHOT_MISSING, relPath, { kind: "key", name: ref },
      `兜底记录里取不到 ${ref}:${relPath}`,
      { fix: `确认这个版本存在，且那一版里有这份稿。git 的话：${(e as Error).message.split("\n")[0]}` }));
  }
  return buildSnapshot(p, relPath, src, { version: ref });
}

export interface DiffRequest { from: string; to?: string }

export async function diffDrafts(p: Project, relPath: string, req: DiffRequest): Promise<DiffResult> {
  const a = await resolveSnapshot(p, relPath, req.from);
  const toRef = req.to ?? (await pickLatest(p, relPath));
  const b = await resolveSnapshot(p, relPath, toRef);
  return diffSnapshots(a, b);
}

async function pickLatest(p: Project, relPath: string): Promise<string> {
  const vs = await listVersions(p, relPath);
  return vs.length ? (vs[vs.length - 1] as string) : "工作区";
}

/** 跨版本净变更：把 since 之后每一版的 diff 合并成一份（07 §六） */
export async function changesSince(p: Project, relPath: string, since: string): Promise<DiffResult> {
  const vs = await listVersions(p, relPath);
  const i = vs.indexOf(since);
  if (i < 0) {
    throw new ToolError(err(X.SNAPSHOT_MISSING, relPath, { kind: "key", name: since },
      `"${since}" 不在这份稿的版本序列里`,
      { fix: vs.length ? `现有：${vs.join(" / ")}` : "这份稿还没有快照" }));
  }
  const tail = vs.slice(i);
  if (tail.length < 2) {
    const only = await resolveSnapshot(p, relPath, since);
    return { file: relPath, from: since, to: since, counts: { L1: 0, L2: 0, L3: 0, L4: 0 }, changes: [], spans: [only.version] };
  }
  /* ⚠️ **净变更 = 首尾直接对比**（issue #91，2026-10-06）。
     `doc/07` §六 开头那句写得很清楚：「**不是把四份 diff 拼起来**」——
     而原来的实现正是拼起来的（逐对 diff 再 `mergeDiffs` 按标签合并）。

     `mergeDiffs` 的分组键是 `nodeLabel(y)` —— **给人看的标签，不是节点身份**：
     - 有文字的节点标签带着文案 → **文案一改，标签就变**（同一个节点被拆成两条）；
     - 没文字的节点标签是 `<div> (第一个 style 键)` → **大量不同节点共用一个标签**
       （两个不同的 div 被并成一条，值恰好一来一回时还会被「改回原值」整条吞掉）。

     于是契约表里五条规则两头都破。实测（issue 里给的例子，现在钉在 `difftest` 里）：
       节点 A padding 4px→8px、节点 B padding 8px→4px  → 原来回「没有变化」
       同一节点文案 A→B→A                               → 原来报 2 条

     改成首尾对比之后，那五条规则**由构造成立**：
     「加了又删」= 首尾都没有它 · 「改回原值」= 首尾相等 · 「多次变化」= 首尾之差。
     不需要任何合并规则，也就不需要节点身份 —— **本来就不该有这个中间层**。

     代价：每条变化后面那句「（中间改过 N 次）」没了。它不在契约里
     （`doc/07` §六 只承诺五条规则 + `spans`），而 `spans` 还在，
     `toMarkdown` 照样打「（跨 N 版）」。 */
  const a = await readSnapshot(p, relPath, since);
  const b = await readSnapshot(p, relPath, tail[tail.length - 1] as string);
  return { ...diffSnapshots(a, b), spans: tail.slice(1) };
}

/** 工作区和最新快照对不对得上。
 *
 *  为什么要单开一个：`changesSince` 比的是**快照与快照**，看不见工作区。
 *  而 S3 顶栏那个版本位要回答的恰恰是「我现在看的是不是磁盘上那一版」
 *  （设计侧 §五 第 9 项）—— 工具自己写的每一次都会打快照，所以两者不一致
 *  只有一个来源：这份稿在工具之外被改过。那正是最该说出来的一种。
 *
 *  dirty 给 null 表示**没法判断**（一版快照都没有），不猜成 false。
 */
export async function workspaceState(
  p: Project, relPath: string, src: string
): Promise<{ version: string | null; dirty: boolean | null; changed: number }> {
  const vs = await listVersions(p, relPath);
  const latest = vs.length ? (vs[vs.length - 1] as string) : null;
  if (!latest) return { version: null, dirty: null, changed: 0 };
  const a = await readSnapshot(p, relPath, latest);
  const b = buildSnapshot(p, relPath, src, { version: "工作区" });
  const d = diffSnapshots(a, b);
  return { version: latest, dirty: d.changes.length > 0, changed: d.changes.length };
}

/** 整个项目的变更汇总：每份稿从 since 之后的净变更 */
export async function projectChangesSince(p: Project, drafts: string[], since: string | null) {
  const rows: Array<{ path: string; diff: DiffResult | null; note?: string }> = [];
  for (const rel of drafts) {
    const vs = await listVersions(p, rel);
    if (vs.length < 2) { rows.push({ path: rel, diff: null, note: vs.length ? "只有一版，没有可比的" : "没有快照" }); continue; }
    const from = since && vs.includes(since) ? since : (vs[0] as string);
    try { rows.push({ path: rel, diff: await changesSince(p, rel, from) }); }
    catch (e) { rows.push({ path: rel, diff: null, note: (e as Error).message }); }
  }
  return rows;
}

// ───────────────────── CHANGELOG-设计侧.md ─────────────────────

const HEADER = [
  `# 设计侧变更`,
  ``,
  `> 实现侧只读这一份。级别含义：`,
  `> [契约] 要改代码 · [取值] 照抄新值 · [文案] 改字符串 · [等价] 无需处理`,
  ``,
].join("\n");

/** 同一分钟内同一份稿的多次落盘合并成一节（07 §五）。节标题里带时间戳做判据。 */
function sectionKey(version: string, minute: string, file: string): string {
  return `## ${version} · ${minute} · ${file}`;
}

function nowMinute(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 写入纪律：只有 L1/L2/L3 至少一条非空才写。纯 L4 不写，否则清单很快没人看。 */
export async function appendChangelog(
  p: Project, relPath: string, d: DiffResult, note?: string
): Promise<{ written: boolean; reason?: string; section?: string }> {
  const { L1, L2, L3 } = d.counts;
  if (L1 + L2 + L3 === 0) {
    return { written: false, reason: "只有等价级变更（或无变更），按纪律不写 changelog" };
  }
  const file = join(p.dir, CHANGELOG);
  const old = existsSync(file) ? await readFile(file, "utf8") : "";
  const body = old.startsWith("# ") ? old.slice(old.indexOf("\n## ") < 0 ? old.length : old.indexOf("\n## ") + 1) : old;

  const minute = nowMinute();
  const head = sectionKey(d.to, minute, relPath);   // 顺序照 doc/07 §五：版本 · 时间 · 稿名
  // 备注紧跟标题 —— 回退、批量改这类「这次改动是怎么来的」必须写在清单里，
  // 否则实现侧看「有人把 padding 改回去了」和「这是退回 v1」是两回事（doc/00 §18.4）
  const section = `${head}\n\n${note ? `> ${note}\n\n` : ""}${toMarkdown(d)}\n`;

  // 同一分钟、同一份稿、同一版本 → 覆盖那一节，而不是再加一节
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^## ${esc(d.to)} · ${esc(minute)} · ${esc(relPath)}[\\s\\S]*?(?=\\n## |$)`, "m");
  const merged = re.test(body) ? body.replace(re, section.trimEnd()) : section + "\n" + body;

  await mkdir(p.dir, { recursive: true });
  const body2 = merged.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n*$/, "\n");
  await writeFile(file, HEADER + body2, "utf8");
  return { written: true, section: head };
}

/** write_draft 落盘之后调：跟上一版比，产变更清单并追加 changelog。 */
export async function recordChange(
  p: Project, relPath: string, version: string, note?: string
): Promise<{ diff: DiffResult | null; changelog: { written: boolean; reason?: string; section?: string } }> {
  const vs = await listVersions(p, relPath);
  const i = vs.indexOf(version);
  if (i <= 0) {
    return { diff: null, changelog: { written: false, reason: "这是第一版，没有可比的上一版" } };
  }
  const a = await readSnapshot(p, relPath, vs[i - 1] as string);
  const b = await readSnapshot(p, relPath, version);
  const d = diffSnapshots(a, b);
  const cl = await appendChangelog(p, relPath, d, note);
  return { diff: d, changelog: cl };
}

export { conclusion, toMarkdown };
