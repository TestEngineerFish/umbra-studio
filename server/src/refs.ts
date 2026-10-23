/** 引用图谱。M1-0：回答「谁引用了我 / 我引用了谁」。
 *
 * dc-import 是按文件名解析的（doc/01 H4）：name 相对于引用方文件所在目录做路径解析。
 * 改名 / 移动 / 删除任何被引用的稿都会静默打断引用，而校验要等下一次才报。
 * 所以生命周期操作必须先能回答「谁引用了我」。
 */
import { readFile, rename } from "node:fs/promises";
import { isInside } from "./pathguard.js";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseDraft } from "./draft.js";
import type { Project } from "./project.js";
import { assetDir } from "./statedirs.js";

/** 项目内一份稿的引用关系 */
interface FileRefs {
  /** 相对项目根的路径，如 "PC 端/Pages/任务.dc.html" */
  rel: string;
  /** 我引用了谁 —— {目标稿相对路径, props 键, 在源码的行号} */
  imports: Array<{ rel: string; name: string; props: string[]; at: string }>;
  /** 谁引用了我 —— {引用方相对路径, name, at} */
  importedBy: Array<{ rel: string; name: string; at: string }>;
}

/** 项目的完整引用图谱 */
export interface RefGraph {
  /** 每份稿的引用关系 */
  files: Map<string, FileRefs>;
}

/**
 * 构建项目的完整引用图谱。
 * 扫描所有 .dc.html，解析 dc-import，建立双向引用关系。
 */
export async function buildRefGraph(p: Project): Promise<RefGraph> {
  const { listDrafts } = await import("./project.js");
  const drafts = await listDrafts(p);

  // 第一步：解析每份稿的 import 声明，建立「我引用了谁」
  const forward = new Map<string, Array<{ relTarget: string | null; name: string; props: string[]; at: string }>>();

  for (const abs of drafts) {
    const relPath = abs.slice(p.dir.length + 1).split(sep).join("/");
    const src = await readFile(abs, "utf8");
    const d = parseDraft(src, relPath);

    const imports: Array<{ relTarget: string | null; name: string; props: string[]; at: string }> = [];
    for (const im of d.imports) {
      if (!im.name) continue;
      // dc-import name 的路径解析：相对于引用方文件所在目录
      const baseDir = dirname(abs);
      const targetAbs = resolve(baseDir, im.name + ".dc.html");
      // 算出相对于项目根的路径
      /* issue #19：这一处算的是「引用指向的稿在项目里的相对路径」。
         判错的后果是把**项目外**一份同前缀目录里的稿当成项目内的引用，
         引用图谱和改名时的引用改写都会跟着指到别处去。 */
      const relTarget = isInside(p.dir, targetAbs)
        ? targetAbs.slice(p.dir.length + 1).split(sep).join("/")
        : null;
      imports.push({
        relTarget,
        name: im.name,
        props: im.props,
        at: `L${im.pos.line}`,
      });
    }
    forward.set(relPath, imports);
  }

  // 第二步：建立反向映射「谁引用了我」
  const files = new Map<string, FileRefs>();

  // 先初始化所有文件
  for (const relPath of forward.keys()) {
    files.set(relPath, { rel: relPath, imports: [], importedBy: [] });
  }

  // 填充正向和反向
  for (const [relSource, imports] of forward) {
    for (const im of imports) {
      // 正向：我引用了谁
      if (im.relTarget && files.has(im.relTarget)) {
        files.get(im.relTarget)!.importedBy.push({
          rel: relSource,
          name: im.name,
          at: im.at,
        });
        files.get(relSource)!.imports.push({
          rel: im.relTarget,
          name: im.name,
          props: im.props,
          at: im.at,
        });
      }
    }
  }

  return { files };
}

/**
 * 查询一份稿的引用关系。
 * file 不给时返回整个项目的引用图谱概览。
 */
export async function listReferences(
  p: Project,
  file?: string,
): Promise<{
  file?: string;
  imports: Array<{ rel: string; name: string; props: string[]; at: string }>;
  importedBy: Array<{ rel: string; name: string; at: string }>;
  /** file 不给时：整个项目的引用概览 {file: importsCount, importedByCount} */
  overview?: Array<{ rel: string; importsCount: number; importedByCount: number }>;
}> {
  const graph = await buildRefGraph(p);

  if (file) {
    const entry = graph.files.get(file);
    if (!entry) {
      // 文件不存在，列出已有的
      const available = [...graph.files.keys()].sort();
      throw new Error(
        `找不到稿 "${file}"。可用：${available.length ? available.join(" / ") : "（项目里还没有稿）"}`
      );
    }
    return {
      file: entry.rel,
      imports: entry.imports,
      importedBy: entry.importedBy,
    };
  }

  // 没给 file：返回整个项目的引用图谱概览
  const overview = [...graph.files.values()]
    .map((f) => ({
      rel: f.rel,
      importsCount: f.imports.length,
      importedByCount: f.importedBy.length,
    }))
    .sort((a, b) => b.importedByCount - a.importedByCount || b.importsCount - a.importsCount);

  return { imports: [], importedBy: [], overview };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 这是一份设计稿（`.dc.html`）吗 —— **一处判定**。
 *
 *  ⚠️⚠️ 它和 `kindOf(rel) === "dc"` **不是同一个判准**，而这件事坑过两道闸：
 *  后者查的是 `FileKind` 表，而 C3（M16-7）把 `dc` 那一条删了 ——
 *  于是写成 `kindOf(...) === "dc"` 的判断**一夜之间全部恒假**，
 *  包括 `write_file` 和 `move_file` 里那两道「`.dc.html` 不走这条路」的拒。
 *  > **一道拒和它指向的那条出路，是同一件事的两半。** 删掉 kind 条目等于两道一起撤，
 *  > 而被指向的那条路（`move_draft`）还在原地等着 —— 实测前端改名走的已经是
 *  > `file_move`，于是「改名跟着改 `<dc-import>` 引用」这件事**产品里没有人做了**
 *  > （探针读数：`delete_impact` 说 1 处引用它，改完名引用方仍写着旧名，`rewrote: []`）。 */
export const isDcPath = (rel: string): boolean => /\.dc\.html$/i.test(rel);

/** 移动 / 改名**之前**，把这份稿在 `<dc-import>` 图里的位置取下来。
 *  回 `null` = 它不在图里（不是 `.dc.html`，或者压根不在项目里）。
 *
 *  ⚠️ **必须在动文件之前取** —— 图的 key 是旧路径，文件挪走之后就查不到了。 */
export async function dcImportsOf(
  p: Project,
  rel: string,
): Promise<{ importedBy: Array<{ rel: string; name: string }>; imports: Array<{ rel: string; name: string }> } | null> {
  if (!isDcPath(rel)) return null;
  const graph = await buildRefGraph(p);
  const entry = graph.files.get(rel);
  if (!entry) return null;
  /* ⚠️ `entry.imports` 只装**解析得到的**引用（`buildRefGraph` 第二步那个
     `im.relTarget && files.has(...)`）—— 移动前就断掉的那几条不在里面，
     所以「不瞎改」是数据结构自带的，不靠这里再判一次。 */
  return {
    importedBy: entry.importedBy.map(({ rel: r, name }) => ({ rel: r, name })),
    imports: entry.imports.map(({ rel: r, name }) => ({ rel: r, name })),
  };
}

export interface DcImportsFollowed {
  /** 引用方被改对的那几处 */
  updatedFiles: Array<{ rel: string; oldName: string; newName: string }>;
  /** 这份稿**自己**的 `<dc-import>` 改了哪几条（跨目录移动时相对基准变了，issue #82）*/
  ownUpdated: Array<{ oldName: string; newName: string }>;
  /** 该改而**没改成**的（写入口拒了）—— 不静默（issue #92 同一条口径）*/
  refused: Array<{ file: string; reason: string }>;
}

/** 一份 `.dc.html` 已经挪好了，把 `<dc-import name=…>` 那一种引用跟着改对。
 *
 *  ⚠️⚠️ **「谁引用了它」是两种关系，这件只管其中一种**（M16-8 ⑤ 定的那条口径）：
 *  这里改的是**按组件名**的 `<dc-import name=…>`；按路径的 `href` / `src` / `url()`
 *  由 `moveFile` 自己那一段改。**两段都要跑** —— 实测同一份组件稿前者 4 处、后者 0 处，
 *  只跑一段就是「一个更弱的答案冒用了一个更强的名字」。
 *
 *  ⚠️ **落盘走传进来的 `write`，而不是 `writeAtomic`。**
 *  `rename_draft` / `move_draft` 原来直接 `writeAtomic` —— 绕过写入口，
 *  于是被它改过的稿**没有快照、没有并发闸、也不受只读闸约束**。
 *  并进 `move_file` 之后由调用方给第二条写入口，这三样一起有了（纪律①）。
 *
 *  ⚠️ **不回滚，照实报**。`rename_draft` 原来是「改引用中途炸了就把文件名退回去」；
 *  `moveFile` 的口径是「文件已经挪了，哪几处引用没跟上就说出来」（`refused`）。
 *  两种都成立，而**在一个函数里同时承诺两种做不到** —— 这里跟并进去的那一边。
 *
 *  ⚠️ **按引用方分组，一个文件只写一次**（原来是每一条 import 写一次）：
 *  同一份稿里两条 import 都指向我们时，第二次写要带着第一次的结果，
 *  否则并发闸会拿着过期的 sha 把自己拒掉。 */
export async function dcImportsFollow(
  p: Project,
  before: { importedBy: Array<{ rel: string; name: string }>; imports: Array<{ rel: string; name: string }> },
  oldRel: string,
  newRel: string,
  write: (rel: string, next: string, prevText: string) => Promise<void>,
): Promise<DcImportsFollowed> {
  const oldAbs = resolve(p.dir, oldRel);
  const newAbs = resolve(p.dir, newRel);
  const updatedFiles: Array<{ rel: string; oldName: string; newName: string }> = [];
  const ownUpdated: Array<{ oldName: string; newName: string }> = [];
  const refused: Array<{ file: string; reason: string }> = [];
  /** `<dc-import name="旧">` → `<dc-import name="新">`，只换 name 的值 */
  const swap = (src: string, oldName: string, newName: string): string =>
    src.replace(new RegExp(`(<dc-import\\b[^>]*name\\s*=\\s*["'])${escapeRegex(oldName)}(["'])`, "gi"), `$1${newName}$2`);
  /** 从 `fromDir` 看过去，`targetAbs` 该写成什么 name（无扩展名、posix 分隔符）*/
  const nameFrom = (fromDir: string, targetAbs: string): string =>
    relative(fromDir, targetAbs).replace(/\.dc\.html$/i, "").split(sep).join("/");

  /* ── ① 这份稿自己引用的组件（issue #82）──
     `dc-import name` 相对**引用方所在目录**解析（`doc/01` H4），稿换了目录基准就变了：
       登录页.dc.html        name="主按钮"  → 主按钮.dc.html         ✓
       挪进 Pages/ 之后      name="主按钮"  → Pages/主按钮.dc.html   ✗
     ⚠️ 纯改名（没换目录）时这一段什么都不会改 —— 基准没变。*/
  if (before.imports.length) {
    let own = "";
    try { own = await readFile(newAbs, "utf8"); } catch { own = ""; }
    if (own) {
      let next = own;
      for (const im of before.imports) {
        const newName = nameFrom(dirname(newAbs), resolve(p.dir, im.rel));
        if (newName === im.name) continue;
        const after = swap(next, im.name, newName);
        if (after !== next) { next = after; ownUpdated.push({ oldName: im.name, newName }); }
      }
      if (next !== own) {
        try { await write(newRel, next, own); }
        catch (e) { ownUpdated.length = 0; refused.push({ file: newRel, reason: (e as Error)?.message ?? String(e) }); }
      }
    }
  }

  /* ── ② 引用它的那几份稿 ── */
  const byFile = new Map<string, Array<{ name: string }>>();
  for (const ref of before.importedBy) {
    /* 自引用（这份稿自己 import 自己）：它已经挪走了，按新路径找 */
    const key = ref.rel === oldRel ? newRel : ref.rel;
    (byFile.get(key) ?? byFile.set(key, []).get(key)!).push({ name: ref.name });
  }
  for (const [refRel, names] of byFile) {
    const refAbs = resolve(p.dir, refRel);
    let src = "";
    try { src = await readFile(refAbs, "utf8"); } catch { continue; }
    let next = src;
    const done: Array<{ oldName: string; newName: string }> = [];
    for (const { name } of names) {
      /* ⚠️ **纯改名时保留引用方自己写的目录前缀**（`rename_draft` 原来的行为）：
         它写 `../Components/组件B` 就还写 `../Components/组件C`，而不是被我们
         重算成一个等价但不一样的写法。跨目录移动时基准真的变了，才整条重算
         （`move_draft` 原来的行为）。**两种旧行为都保住，因为它们各自是对的。** */
      let newName: string;
      if (dirname(oldRel) === dirname(newRel)) {
        const parts = name.split("/");
        parts[parts.length - 1] = basename(newRel).replace(/\.dc\.html$/i, "");
        newName = parts.join("/");
      } else {
        newName = nameFrom(dirname(refAbs), newAbs);
      }
      if (newName === name) continue;
      const after = swap(next, name, newName);
      if (after !== next) { next = after; done.push({ oldName: name, newName }); }
    }
    if (next === src || !done.length) continue;
    try {
      await write(refRel, next, src);
      for (const d of done) updatedFiles.push({ rel: refRel, ...d });
    } catch (e) {
      refused.push({ file: refRel, reason: (e as Error)?.message ?? String(e) });
    }
  }
  return { updatedFiles, ownUpdated, refused };
}

// ──────────────────────── M1-7: delete_draft + restore ───────────────────────

export interface DeleteDraftImpact {
  /** 哪些稿引用了它 */
  importedBy: Array<{ rel: string; name: string }>;
  /** 删除后这些引用方都会报 E_IMPORT_MISSING */
  affectedCount: number;
}

export interface DeleteDraftResult {
  path: string;
  trashPath: string;
  impact: DeleteDraftImpact;
}

export interface RestoreDraftResult {
  originalPath: string;
  trashPath: string;
  /** 恢复了之后多少引用方不再报 E_IMPORT_MISSING */
  referencesRestored: number;
}

/** 查询删除影响面（不实际删除） */
export async function deleteDraftImpact(
  p: Project,
  path: string,
): Promise<DeleteDraftImpact> {
  const graph = await buildRefGraph(p);
  const entry = graph.files.get(path);
  if (!entry) {
    throw new Error(`找不到稿 "${path}"`);
  }

  const importedBy = entry.importedBy.map(({ rel, name }) => ({ rel, name }));
  return {
    importedBy,
    affectedCount: importedBy.length,
  };
}

/**
 * 删除稿到回收站。
 *
 * 回收站路径 `.umbrastudio/trash/<时间戳>/<原文件名>.dc.html`。
 * 删除前检查影响面，如果有关联引用方，返回里会带有警告信息。
 * 调用方应该先看影响面，确认后再调这个。
 */
export async function deleteDraft(
  p: Project,
  path: string,
): Promise<DeleteDraftResult> {
  const { draftPath } = await import("./project.js");
  const { mkdir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");

  const abs = draftPath(p, path);
  const impact = await deleteDraftImpact(p, path);

  // 回收站路径：.umbrastudio/trash/<ISO时间戳>/<原文件名>
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trashDir = join(assetDir(p.dir, "trash"), timestamp);
  await mkdir(trashDir, { recursive: true });

  /* ⚠️ **回收站里留的是原相对路径，不是基名**（issue #81，2026-10-05）。
     原来 `join(trashDir, basename(path))` —— 原目录丢了，也没有 meta 记下来，
     于是 `restoreDraft` 只能「恢复到项目根」，而 `list_trash` / `restore_trashed`
     的说明都在承诺「原路径」「原位置」。**契约承诺了一件实现做不到的事。**
     同一个项目里 `files.ts` 的 `trashFile` 用的是 `<stamp>/<原相对路径>` ——
     **两条删除路径的回收站布局原来不一样**，而 `listTrash` 只按其中一种读。 */
  const trashPath = join(trashDir, ...path.split("/"));
  await mkdir(dirname(trashPath), { recursive: true });
  await rename(abs, trashPath);

  /* ⚠️ **`trashPath` 现在相对「回收站根」，不相对项目根**（M14-4 B1）。
     B1 之后回收站住在 `STATE_ROOT/.umbrastudio/records/<ID>/trash/`，
     原来那句 `abs.slice(p.dir.length + 1)` 会算出
     `../../../../Users/…/records/…` 这种**从项目里往外数**的路径 ——
     既没法看，`restoreDraft` 的 `resolve(p.dir, …)` 也解不回来。
     换成相对回收站根之后，值就是 `<时间戳>/<原相对路径>`：**比原来短、而且稳定**，
     并且 `restoreDraft` / `purgeTrash` 那道「必须在回收站里」的闸从
     `resolve(项目根, …)` 变成 `resolve(回收站根, …)` —— **闸口更小了，不是更松**。 */
  const trashRel = relative(assetDir(p.dir, "trash"), trashPath).split(sep).join("/");
  return {
    path,
    trashPath: trashRel,
    impact,
  };
}

/** 列出回收站中的稿件。
 *  ⚠️ **递归**（issue #81）：回收站布局是 `<stamp>/<原相对路径>`，
 *  原来只往下读一层、把那一层的每一项都当成一份稿 ——
 *  于是 `trash_file("assets/img/a.png")` 在列表里显示成一个**目录** `assets`，
 *  对它「恢复」会把整个 `assets` 目录 `rename` 到项目根，
 *  项目根已有 `assets` 时目标变成 `assets 2.dc.html`（一个目录）。 */
/** 回收站那个时间戳目录名 → 真 ISO。还原不出来回 `null`。
 *
 *  ⚠️⚠️ **2026-10-23（M16-7c-2c）加的，而它修的是一处「前端在替服务端补救」。**
 *  目录名是 `new Date().toISOString().replace(/[:.]/g, "-")`（`files.ts` 的 `trashFile`），
 *  例如 `2026-10-23T19-08-12-345Z` —— 而 `listTrash` 原来把**目录名**直接当
 *  `deletedAt` 给出去，于是 `Sheets.tsx` 里有一个 `trashTimeIso()` 在把它还原回来。
 *  > **一个在前端补救服务端格式的函数，意味着那个格式本来就该在服务端修。**
 *
 *  ⚠️ **还原不出来回 `null`，不回一个坏 ISO**：存量目录名可能是老版本的别的格式，
 *  硬塞进去前端会显示 `Invalid Date`（`doc/00` §170 那条 `[object Object]` 同一族）。
 *  > **拿不准的时候给 `null`，让界面照实说「时间不详」** —— 比给一个看起来像时间的垃圾好。
 *
 *  ⚠️ 只还原 `T` 之后那三个 `-`：**日期部分的 `-` 不能动**。 */
export function trashStampToIso(stamp: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(stamp);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
  /* ⚠️ 还要**真的解得出来**才算 —— 正则形状对而日期非法（`2026-13-45`）时
     `new Date()` 回 Invalid Date，而那又是一个「看起来像时间的垃圾」。 */
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export async function listTrash(
  p: Project,
): Promise<Array<{ trashPath: string; originalPath: string; originalName: string; deletedAt: string; deletedAtIso: string | null }>> {
  const { readdir } = await import("node:fs/promises");
  const trashRoot = assetDir(p.dir, "trash");
  if (!existsSync(trashRoot)) return [];

  const items: Array<{ trashPath: string; originalPath: string; originalName: string; deletedAt: string; deletedAtIso: string | null }> = [];
  const timestamps = await readdir(trashRoot, { withFileTypes: true });
  for (const ts of timestamps) {
    if (!ts.isDirectory()) continue;
    const tsDir = join(trashRoot, ts.name);
    const walk = async (dir: string): Promise<void> => {
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        const abs = join(dir, ent.name);
        if (ent.isDirectory()) { await walk(abs); continue; }
        const originalPath = relative(tsDir, abs).split(sep).join("/");
        items.push({
          trashPath: relative(trashRoot, abs).split(sep).join("/"),
          originalPath,
          originalName: basename(originalPath),
          /* `deletedAt` 仍是**目录名** —— 它是 `trashPath` 的一部分，恢复那条路要用它。
             时间另给一个字段，语义就分开了（一个是地址，一个是时刻）。 */
          deletedAt: ts.name,
          deletedAtIso: trashStampToIso(ts.name),
        });
      }
    };
    await walk(tsDir);
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * 从回收站恢复。
 *
 * 恢复到原始位置（根据 trash 中的文件名推断）。
 * 如果目标位置已有同名文件，加序号。
 */
export async function restoreDraft(
  p: Project,
  trashPath: string,
): Promise<RestoreDraftResult> {
  const { existsSync } = await import("node:fs");
  const { mkdir } = await import("node:fs/promises");

  /* ⚠️ **只能恢复回收站里的条目**（issue #80，p1，2026-10-05）。
     原来只检查 `existsSync`，然后 `rename(trashAbs, <项目根>/<basename>)` ——
     `trashPath` 是 `z.string()` 原样透传的，于是：
       restore_trashed({ trashPath: "../别的项目" })
         → `rename` 把**整个兄弟项目目录**搬进当前项目（`rename` 对目录同样生效）
       restore_trashed({ trashPath: "../../../../Users/<用户>/.ssh/id_rsa" })
         → 用户文件被挪走，原位置消失
       restore_trashed({ trashPath: "Pages/任务.dc.html" })（项目内正常的稿）
         → 被静默挪到项目根，而返回值还说「恢复了」
     同文件的 `purgeTrash` 有这道判定，**这里漏了**。
     和 #57 / #63 / #69 / #70 / #23 同一族：外部给的路径段没过
     「必须在某棵子树里」就进了 `resolve` + 写操作。 */
  const trashRoot = assetDir(p.dir, "trash");
  const trashRel = trashPath.split("\\").join("/");
  const trashAbs = resolve(trashRoot, trashRel);
  if (!isInside(trashRoot, trashAbs) || trashAbs === trashRoot) {
    throw new Error(`只能恢复回收站里的条目：${trashRel}`);
  }
  if (!existsSync(trashAbs)) {
    throw new Error(`回收站文件 "${trashPath}" 不存在`);
  }

  /* ── 恢复到**原位置**（issue #81）──
     回收站路径是 `.umbrastudio/trash/<stamp>/<原相对路径>`，
     去掉 `<stamp>/` 就是原相对路径。旧布局的条目（只有基名）这一步算出来
     也就是基名 —— **和原来的「回项目根」兜底自然一致**，不用分支。 */
  const underTrash = relative(trashRoot, trashAbs).split(sep).join("/");
  const originalRel = underTrash.split("/").slice(1).join("/");
  if (!originalRel) throw new Error(`回收站路径里没有原文件：${trashRel}`);
  let restoreAbs = resolve(p.dir, originalRel);
  if (!isInside(p.dir, restoreAbs)) throw new Error("恢复目标跨出了项目目录");

  /* 如果已有同名文件，**在同目录**加序号。
     ⚠️ 后缀按真实的来 —— 原来一律补 `.dc.html`，于是从文件面删的
     `a.png` 会被恢复成 `a 2.dc.html`。 */
  if (existsSync(restoreAbs)) {
    const name = basename(originalRel);
    const ext = name.endsWith(".dc.html") ? ".dc.html" : (name.match(/\.[^.]*$/)?.[0] ?? "");
    const stem = ext ? name.slice(0, -ext.length) : name;
    let i = 2;
    do {
      restoreAbs = resolve(dirname(resolve(p.dir, originalRel)), `${stem} ${i}${ext}`);
      i++;
    } while (existsSync(restoreAbs) && i < 100);
  }

  // 确保目标目录存在
  await mkdir(dirname(restoreAbs), { recursive: true });

  await rename(trashAbs, restoreAbs);

  /* 清理空回收站目录 —— **一层层往上收**（issue #81：现在条目可能嵌在
     `<stamp>/sub/深/a.png` 里，只收它的直接父目录会留下一串空壳）。
     收到 `trashRoot` 就停。 */
  try {
    const { readdir, rmdir } = await import("node:fs/promises");
    let dir = dirname(trashAbs);
    while (isInside(trashRoot, dir) && dir !== trashRoot) {
      if ((await readdir(dir)).length > 0) break;
      await rmdir(dir);
      dir = dirname(dir);
    }
  } catch { /* 清理失败不影响恢复 */ }

  const originalPath = restoreAbs.slice(p.dir.length + 1).split(sep).join("/");

  // 计算有多少引用方不再报 E_IMPORT_MISSING
  const { listDrafts } = await import("./project.js");
  const { readFile } = await import("node:fs/promises");
  const { validateDraft } = await import("./validate.js");

  let restoredCount = 0;
  const drafts = await listDrafts(p);
  for (const draftAbs of drafts) {
    const rel = draftAbs.slice(p.dir.length + 1).split(sep).join("/");
    // 检查这份稿是否引用了恢复的稿
    const src = await readFile(draftAbs, "utf8");
    const d = parseDraft(src, rel);
    const refersToRestored = d.imports.some((im) => {
      const baseDir = dirname(draftAbs);
      const target = resolve(baseDir, im.name + ".dc.html");
      return target === restoreAbs;
    });
    if (refersToRestored) {
      const v = validateDraft(p, rel, src, rel);
      const hasMissing = v.diags.some(d => d.code === "E_IMPORT_MISSING");
      if (!hasMissing) restoredCount++;
    }
  }

  return {
    originalPath,
    trashPath,
    referencesRestored: restoredCount,
  };
}

/** 彻底删除回收站里的一项（S8 回收站的「彻底删除」）。trashPath 必须在 .umbrastudio/trash/ 下 —— 别的路径一律拒绝。 */
export async function purgeTrash(p: Project, trashPath: string): Promise<{ removed: string }> {
  const { rm } = await import("node:fs/promises");
  /* ⚠️ 判定换成 `isInside(trashRoot, …)`（issue #80）—— 和 `restoreDraft` 同一份。
     原来是 `startsWith + includes("..")`：形状上够用，但**和隔壁那个函数
     不是同一份判定**，于是「哪个函数守了、哪个没守」要逐个去看。 */
  const rel = trashPath.split("\\").join("/");
  const trashRoot = assetDir(p.dir, "trash");
  const abs = resolve(trashRoot, rel);
  if (!isInside(trashRoot, abs) || abs === trashRoot) {
    throw new Error(`只能彻底删除回收站里的条目：${rel}`);
  }
  if (!existsSync(abs)) throw new Error(`回收站里没有 ${rel}`);
  await rm(abs, { recursive: true, force: true });
  // 时间戳目录空了就一起收掉
  const tsDir = join(abs, "..");
  try { const { readdir, rmdir } = await import("node:fs/promises"); if ((await readdir(tsDir)).length === 0) await rmdir(tsDir); } catch { /* 留着也无妨 */ }
  return { removed: rel };
}

/** 清空回收站 —— 二次确认由界面做（S8 行内确认），这里不问 */
export async function emptyTrash(p: Project): Promise<{ removed: number }> {
  const items = await listTrash(p);
  for (const it of items) await purgeTrash(p, it.trashPath);
  return { removed: items.length };
}

