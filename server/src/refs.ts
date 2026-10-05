/** 引用图谱。M1-0：回答「谁引用了我 / 我引用了谁」。
 *
 * dc-import 是按文件名解析的（doc/01 H4）：name 相对于引用方文件所在目录做路径解析。
 * 改名 / 移动 / 删除任何被引用的稿都会静默打断引用，而校验要等下一次才报。
 * 所以生命周期操作必须先能回答「谁引用了我」。
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import { isInside, plainNameProblem } from "./pathguard.js";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseDraft } from "./draft.js";
import type { Project } from "./project.js";

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

// ──────────────────────── M1-4: rename_draft ───────────────────────

export interface RenameDraftResult {
  oldPath: string;
  newPath: string;
  /** 更新了多少个引用方的 dc-import name */
  referencesUpdated: number;
  /** 哪些稿被更新了 */
  updatedFiles: Array<{ rel: string; oldName: string; newName: string }>;
}

/**
 * 重命名一份稿，并连带更新所有引用它的 dc-import name。
 *
 * 改名只是改基名，不跨目录（跨目录是 move_draft 的事）。
 * dc-import name 的解析：同层引用写基名，跨层引用写相对路径。
 * 改名时需要更新引用方中的 name，但只更新指向这份稿的 name 的基名部分。
 */
export async function renameDraft(
  p: Project,
  oldPath: string,
  newBaseName: string,
): Promise<RenameDraftResult> {
  const { listDrafts, draftPath } = await import("./project.js");
  const { writeAtomic } = await import("./normalize.js");

  // 验证源文件存在
  const oldAbs = draftPath(p, oldPath);

  /* ⚠️ **新基名是一个名字，不是一段路径**（issue #80，2026-10-05）。
     原来 `newBaseName` 原样进 `resolve` —— `rename_draft({ newName: "../../x" })`
     把稿 `rename` 到**项目外**，而引用方的 `dc-import name` 已经先被改写成 `../../x`。
     同文件的 `moveDraft` 走了 `isInside`（#19 那一轮），**这里没跟上**。
     「改名不跨目录」本来就是这个函数自己的契约，所以形状那一道也该在。
     判定走 `plainNameProblem()` —— 和 #23 / #57 / #63 / #70 同一份。 */
  const nameBad = plainNameProblem(newBaseName.replace(/\.dc\.html$/i, ""));
  if (nameBad) throw new Error(`新名字不合法：${nameBad}`);

  // 计算新路径（同一目录，只改基名）
  const oldDir = dirname(oldAbs);
  const newFileName = newBaseName.endsWith(".dc.html") ? newBaseName : newBaseName + ".dc.html";
  const newAbs = resolve(oldDir, newFileName);
  /* 第二道：算出来的路径还得在项目里 —— 不依赖我对形状想得全不全。 */
  if (!isInside(p.dir, newAbs)) throw new Error("改名后的路径跨出了项目目录");

  if (newAbs === oldAbs) {
    throw new Error("新旧文件名相同");
  }

  // 验证目标文件不存在
  const { existsSync } = await import("node:fs");
  if (existsSync(newAbs)) {
    const newRel = newAbs.slice(p.dir.length + 1).split(sep).join("/");
    throw new Error(`目标文件 "${newRel}" 已经存在`);
  }

  // 获取引用图谱，找到所有引用了这份稿的稿
  const graph = await buildRefGraph(p);
  const oldEntry = graph.files.get(oldPath);
  if (!oldEntry) {
    throw new Error(`找不到稿 "${oldPath}"`);
  }

  // 需要更新的引用方：那些 import 了我们这份稿的
  const importedBy = oldEntry.importedBy;

  // 算出新的 name（相对于引用方的路径）
  // 因为改名不改路径，只改基名，所以 name 的目录部分不变，只改基名
  const updatedFiles: Array<{ rel: string; oldName: string; newName: string }> = [];

  /* ⚠️ **先动文件、再改引用**（issue #80 第 3 点，2026-10-05）。
     原来顺序是反的：先把所有引用方落盘改好，最后才 `rename`。
     `newName` 指向一个不存在的子目录时 `rename` 抛 ENOENT ——
     **引用方已经改完了，文件没改名，所有引用当场断掉，而且没有回滚。**
     现在：改名成功才动引用；改引用中途炸了，把改过的稿和文件名一起退回去。
     （形状那道闸已经让 ENOENT 这一种不可能发生了，但**闸是按我想到的情况写的，
     回滚是按"我没想到"写的** —— 两个都要。） */
  await rename(oldAbs, newAbs);
  const touched: Array<{ abs: string; before: string }> = [];
  try {
  for (const ref of importedBy) {
    // ref.rel 是引用方的相对路径
    // ref.name 是引用方中使用的 name（可能是基名或带路径的）
    const refAbs = resolve(p.dir, ref.rel);
    const refSrc = await readFile(refAbs, "utf8");

    // 算出旧 name 解析到的目标文件
    const refDir = dirname(refAbs);
    const oldTargetAbs = resolve(refDir, ref.name + ".dc.html");

    // 确认这个目标文件确实是我们要改的这份稿
    if (oldTargetAbs !== oldAbs) {
      // 可能是不同路径但指向同一文件（符号链接等），用 realpath 比较
      try {
        const { realpath } = await import("node:fs/promises");
        const [a, b] = await Promise.all([realpath(oldTargetAbs), realpath(oldAbs)]);
        if (a !== b) continue; // 不是我们这份稿，跳过
      } catch {
        continue; // 解析不到，跳过
      }
    }

    // 算出新的 name：保持引用方的相对路径结构，只改基名
    // 旧 name 可能是 "Component" 或 "../Components/Component"
    // 新 name 应该是同样的目录前缀 + 新基名
    const oldNameParts = ref.name.split("/");
    oldNameParts[oldNameParts.length - 1] = newBaseName;
    const newName = oldNameParts.join("/");

    // 替换引用方中的 dc-import name
    // 用正则匹配 <dc-import name="旧名"> 并替换成 <dc-import name="新名">
    const nameRe = new RegExp(
      `(<dc-import\\b[^>]*name\\s*=\\s*["'])${escapeRegex(ref.name)}(["'])`,
      "gi"
    );
    const newSrc = refSrc.replace(nameRe, `$1${newName}$2`);

    if (newSrc !== refSrc) {
      touched.push({ abs: refAbs, before: refSrc });
      await writeAtomic(refAbs, newSrc);
      updatedFiles.push({ rel: ref.rel, oldName: ref.name, newName });
    }
  }
  } catch (e) {
    for (const t of touched.reverse()) await writeAtomic(t.abs, t.before).catch(() => { /* 尽力 */ });
    await rename(newAbs, oldAbs).catch(() => { /* 尽力 */ });
    throw e;
  }

  const newRel = newAbs.slice(p.dir.length + 1).split(sep).join("/");
  return {
    oldPath,
    newPath: newRel,
    referencesUpdated: updatedFiles.length,
    updatedFiles,
  };
}

// ──────────────────────── M1-6: move_draft ───────────────────────

export interface MoveDraftResult {
  oldPath: string;
  newPath: string;
  /** 更新了多少个引用方的 dc-import name（路径变了要重新算） */
  referencesUpdated: number;
  updatedFiles: Array<{ rel: string; oldName: string; newName: string }>;
  /** 这份稿**自己**的 dc-import 改了哪几条（issue #82 —— 原来一条都没改） */
  ownImportsUpdated: Array<{ oldName: string; newName: string }>;
}

/**
 * 移动稿到目标目录。跨目录移动时引用路径要跟着修（相对路径基准变了）。
 *
 * targetDir 是目标目录的相对路径（相对项目根），如 "Components" 或 "Pages"。
 * 移动到 targetDir 下，新文件名是 `<原名>.dc.html`（除非目标已有同名）。
 */
export async function moveDraft(
  p: Project,
  path: string,
  targetDir: string,
): Promise<MoveDraftResult> {
  const { listDrafts, draftPath } = await import("./project.js");
  const { writeAtomic } = await import("./normalize.js");
  const { existsSync } = await import("node:fs");
  const { mkdir } = await import("node:fs/promises");

  // 验证源文件存在
  const oldAbs = draftPath(p, path);
  const oldDir = dirname(oldAbs);
  const oldBase = basename(path);

  // 计算目标路径
  const targetAbs = resolve(p.dir, targetDir);
  if (!isInside(p.dir, targetAbs)) {                // issue #19
    throw new Error("目标目录跨出了项目目录");
  }

  // 目标目录不存在就创建
  await mkdir(targetAbs, { recursive: true });

  let newAbs = resolve(targetAbs, oldBase);
  if (newAbs === oldAbs) {
    throw new Error("目标位置和当前位置相同");
  }

  // 如果目标文件已存在，加序号
  if (existsSync(newAbs)) {
    const baseWithoutExt = oldBase.replace(/\.dc\.html$/, "");
    let i = 2;
    do {
      newAbs = resolve(targetAbs, `${baseWithoutExt} ${i}.dc.html`);
      i++;
    } while (existsSync(newAbs) && i < 100);
  }

  // 获取引用图谱
  const graph = await buildRefGraph(p);
  const oldEntry = graph.files.get(path);
  if (!oldEntry) {
    throw new Error(`找不到稿 "${path}"`);
  }

  // 需要更新的引用方
  const importedBy = oldEntry.importedBy;
  const updatedFiles: Array<{ rel: string; oldName: string; newName: string }> = [];

  /* ⚠️ 和 `renameDraft` 同一个顺序（issue #80 第 3 点）：先动文件、后改引用。 */
  await rename(oldAbs, newAbs);
  const touched: Array<{ abs: string; before: string }> = [];
  const ownUpdated: Array<{ oldName: string; newName: string }> = [];
  try {
  /* ── 这份稿**自己**引用的组件也得跟着改（issue #82，2026-10-05）──
     `dc-import name` 是相对**引用方所在目录**解析的（`doc/01` H4）。
     稿换了目录，它自己的相对基准就变了：

       登录页.dc.html        <dc-import name="主按钮">  → 主按钮.dc.html        ✓
       move_draft(…, "Pages")
       Pages/登录页.dc.html  <dc-import name="主按钮">  → Pages/主按钮.dc.html  ✗

     而原来这个函数只遍历 `importedBy`（谁引用了我），`imports`（我引用了谁）
     **一行都没动** —— 函数头注释自己写着「跨目录移动时引用路径要跟着修
     （相对路径基准变了）」，工具说明写「移动并把引用它的稿一起改写」。
     **两句话都对，而实现只做了一半** —— 页面稿几乎都引用组件，
     所以「把页面挪进 Pages/」这个最常见的整理动作，挪完那页的组件全缺失。

     ⚠️ 回归盲区在这里：`lifecycletest` 步骤 5 移动的是**组件**稿（它自己没有
     任何 `dc-import`），所以 `checkNoMissingImports` 一直全绿。
     **从没移动过一份「自己有引用」的页面稿。**

     `oldEntry.imports` 只装**解析得到的**引用（`buildRefGraph` 第二步的
     `im.relTarget && files.has(...)`）—— 移动前就断掉的那几条不在里面，
     所以「不瞎改」是数据结构自带的。 */
  {
    const own = await readFile(newAbs, "utf8");
    let next = own;
    for (const im of oldEntry.imports) {
      const targetAbs = resolve(p.dir, im.rel);
      const newName = relative(dirname(newAbs), targetAbs).replace(/\.dc\.html$/, "").split(sep).join("/");
      if (newName === im.name) continue;
      const re = new RegExp(`(<dc-import\\b[^>]*name\\s*=\\s*["'])${escapeRegex(im.name)}(["'])`, "gi");
      const after = next.replace(re, `$1${newName}$2`);
      if (after !== next) { next = after; ownUpdated.push({ oldName: im.name, newName }); }
    }
    if (next !== own) {
      touched.push({ abs: newAbs, before: own });
      await writeAtomic(newAbs, next);
    }
  }

  for (const ref of importedBy) {
    const refAbs = resolve(p.dir, ref.rel);
    const refDir = dirname(refAbs);

    // 旧 name 解析到的目标
    const oldTargetAbs = resolve(refDir, ref.name + ".dc.html");
    const isOurFile = oldTargetAbs === oldAbs || (async () => {
      try {
        const { realpath } = await import("node:fs/promises");
        return (await realpath(oldTargetAbs)) === (await realpath(oldAbs));
      } catch { return false; }
    })();
    const resolved = typeof isOurFile === "boolean" ? isOurFile : await isOurFile;
    if (!resolved) continue;

    // 计算新的 name：从引用方到新位置的相对路径（无扩展名）
    const newRelFromRef = relative(refDir, newAbs).replace(/\.dc\.html$/, "");
    // 用相对路径作为 name
    const newName = newRelFromRef.split(sep).join("/");

    // 替换 dc-import name
    const nameRe = new RegExp(
      `(<dc-import\\b[^>]*name\\s*=\\s*["'])${escapeRegex(ref.name)}(["'])`,
      "gi"
    );
    const refSrc = await readFile(refAbs, "utf8");
    const newSrc = refSrc.replace(nameRe, `$1${newName}$2`);

    if (newSrc !== refSrc) {
      touched.push({ abs: refAbs, before: refSrc });
      await writeAtomic(refAbs, newSrc);
      updatedFiles.push({ rel: ref.rel, oldName: ref.name, newName });
    }
  }
  } catch (e) {
    for (const t of touched.reverse()) await writeAtomic(t.abs, t.before).catch(() => { /* 尽力 */ });
    await rename(newAbs, oldAbs).catch(() => { /* 尽力 */ });
    throw e;
  }

  const newRel = newAbs.slice(p.dir.length + 1).split(sep).join("/");
  return {
    oldPath: path,
    newPath: newRel,
    referencesUpdated: updatedFiles.length,
    updatedFiles,
    ownImportsUpdated: ownUpdated,
  };
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
  const trashDir = join(p.dir, ".umbrastudio", "trash", timestamp);
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

  const trashRel = trashPath.slice(p.dir.length + 1).split(sep).join("/");
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
export async function listTrash(
  p: Project,
): Promise<Array<{ trashPath: string; originalPath: string; originalName: string; deletedAt: string }>> {
  const { readdir } = await import("node:fs/promises");
  const trashRoot = join(p.dir, ".umbrastudio", "trash");
  if (!existsSync(trashRoot)) return [];

  const items: Array<{ trashPath: string; originalPath: string; originalName: string; deletedAt: string }> = [];
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
          trashPath: abs.slice(p.dir.length + 1).split(sep).join("/"),
          originalPath,
          originalName: basename(originalPath),
          deletedAt: ts.name,
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
  const trashRoot = join(p.dir, ".umbrastudio", "trash");
  const trashRel = trashPath.split("\\").join("/");
  const trashAbs = resolve(p.dir, trashRel);
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
  const trashRoot = join(p.dir, ".umbrastudio", "trash");
  const abs = resolve(p.dir, rel);
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

