/** 项目导出与导入：打包成可移植的 .tar.gz，含快照与 changelog。
 *
 * 用系统 `tar` 命令打包，不需要额外依赖。
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { isInside } from "./pathguard.js";
import { assetDir } from "./statedirs.js";
import { adoptRecordDir, existingRecordIdFor, recordsRoot } from "./records.js";

/** 包里装这个项目**旁数据**的那一层的名字（M14-4 B1）。
 *
 *  ⚠️ **搬迁和导出必须同一次做完**（`doc/24` §19.1）：B1 把快照 / 评论 / 回收站 /
 *  模板 / 草稿 / 会话搬进 `STATE_ROOT/.umbrastudio/records/<ID>/` 之后，
 *  `tar -C projectDir .` **一版快照都打不到**，而回执照样报 `versionCount: N` ——
 *  **假回执，而且要到「在另一台机器上导入、发现历史全没了」那一刻才暴露**。
 *  （issue #35 / #111 同族：假回执比没有回执糟。）
 *
 *  所以包里多一层。名字以 `.umbrastudio-` 开头、不是项目里会有的东西；
 *  **老包里没有这一层，照样导得进来**（那时历史本来就在项目目录里）。 */
const RECORD_IN_TAR = ".umbrastudio-record";

export interface ExportResult {
  exportPath: string;
  projectName: string;
  draftCount: number;
  versionCount: number;
  sizeBytes: number;
}

/* ── 两件工具，三道闸（issue #93，2026-10-06）──
   这两件在 **MCP 面**上，参数是任意绝对路径，**由模型自己拼** ——
   「把备份导回当前项目」「导出到项目根」都是模型很可能给出的参数。
   而原来一道检查都没有：

   `import_project({ tarPath: 旧备份, targetDir: 当前正在用的项目 })`
     → `tar -x` 默认**覆盖**同名文件 → 用户当前的稿被旧版本整份盖掉，
       **不经写入口、不留快照**（`.umbrastudio/snapshots` 也被包里的旧快照覆盖），
       变更清单上**什么都看不到**。这是真正的数据丢失。
   `export_project({ outputPath: 某个已存在的文件 })` → 那个文件直接被 tarball 覆盖。
   `outputPath` 落在项目目录里 → tar 还会把**正在写的自己**打进去。

   ⚠️ 这里按「**目标非空 / 已存在就拒**」做，**不限定路径白名单** ——
   更紧的那一档（只许导入到 `projectsRoot()` 下的新目录、只许导出到某个固定目录）
   是个产品决定，`doc/11` Q47 已结案：**不限位置**（2026-10-21 用户定）。
   ⚠️ 原文这里举的例子是「只许导出到 `outgoing/`」—— 那个目录 C3（M16-7c-2b）删了，
   所以把例子换成了中性说法。**一条注释里举的例子也会过期。**
   **数据丢失现在就得堵上，而「能导到哪」可以慢慢定。** */

/** 导出项目为 .tar.gz */
export async function exportProject(
  projectDir: string,
  outputPath: string,
): Promise<ExportResult> {
  if (!existsSync(projectDir)) {
    throw new Error(`项目目录不存在：${projectDir}`);
  }
  const out = resolve(outputPath);
  if (existsSync(out)) {
    throw new Error(`"${outputPath}" 已经存在 —— 换一个名字，或者先把那一个挪开（导出不覆盖任何已有文件）`);
  }
  /* ⚠️ 导出目标不能在项目里 —— 不然 tar 会把**正在写的自己**打进去
     （包的大小取决于写到哪一步，结果是不可重现的）。 */
  if (isInside(resolve(projectDir), out)) {
    throw new Error("导出目标不能落在项目目录里面（tar 会把正在写的包自己打进去）");
  }
  if (!/\.(tar\.gz|tgz)$/i.test(out)) {
    throw new Error("导出文件名要以 .tar.gz 或 .tgz 结尾");
  }
  if (!existsSync(dirname(out))) {
    throw new Error(`"${dirname(outputPath)}" 这个目录不存在`);
  }

  /* 旁数据在我们自己的目录里（B1），要**一起打进包**，否则导出的是一个没有历史的壳。
     ⚠️ 这里**只查不建**（`existingRecordIdFor`）—— 导出一个从没写过东西的项目，
     不该顺手给它造一条记录。 */
  const recId = existingRecordIdFor(projectDir);
  const recDir = recId ? join(recordsRoot(), recId) : null;
  const hasRecord = !!recDir && existsSync(recDir);
  /* ⚠️ 为什么要先拷一份而不是直接 `-C <records> <id>`：包里那一层得叫 `RECORD_IN_TAR`，
     而 `<id>` 是随机的 —— 导入方要认得出它。`tar` 的改名选项 GNU 和 BSD 不是同一个
     （`--transform` / `-s`），**拷一份是两边都成立的那条路**。记录目录很小。 */
  const stage = hasRecord ? await mkdtemp(join(tmpdir(), "umbra-export-")) : null;
  try {
    if (stage && recDir) await cp(recDir, join(stage, RECORD_IN_TAR), { recursive: true });
    const args = ["-czf", out, "-C", projectDir, "."];
    if (stage) args.push("-C", stage, RECORD_IN_TAR);
    await new Promise<void>((res, rej) => {
      execFile("tar", args, (err) => (err ? rej(err) : res()));
    });
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
  }

  const sizeStat = await stat(out);
  const projectName = basename(projectDir);

  /* ⚠️ 这一段原来是 `readdirSync` / `statSync`（issue #93 第 3 点，#48 同族）——
     大项目的快照目录有几千个文件，同步读会把整个服务停住，
     而这个进程同时在接 MCP、WS 和别的 HTTP 请求。 */
  const drafts = (await readdir(projectDir)).filter((f) => f.endsWith(".dc.html"));
  const snapRoot = assetDir(projectDir, "snapshots");
  let versionCount = 0;
  if (existsSync(snapRoot)) {
    for (const sub of await readdir(snapRoot, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      /* ⚠️ **只数 `v<N>.json`**（2026-10-21 改，判据当场抓到）：
         每个快照目录里还有一份 `meta.json`，原来 `.endsWith(".json")` 把它也算成一版 ——
         于是 3 版的项目回执报「6 版」，**整整翻倍**。
         这条和 B1 无关，是导出回执**本来就在说谎**的另一半：
         判据第一次跑就是「包里 3 版 · 回执说 6 版」。
         > 数一个数的时候，先问「我数的这些，是不是都是我要数的那种东西」。 */
      versionCount += (await readdir(join(snapRoot, sub.name))).filter((f) => /^v\d+\.json$/.test(f)).length;
    }
  }

  return {
    exportPath: out,
    projectName,
    draftCount: drafts.length,
    versionCount,
    sizeBytes: sizeStat.size,
  };
}

/** 导入项目：从 .tar.gz 解压到目标目录。**只往空目录里导。** */
export async function importProject(
  tarPath: string,
  targetDir: string,
): Promise<{ imported: boolean; projectName: string; draftCount: number; restoredRecord: boolean }> {
  /* ⚠️ `tar -xzf -` 是**读 stdin** —— 以 `-` 开头的路径会被当成选项
     （和 #86 的 `--output=` 同一族：**任何原样拼进命令行的外部字符串**）。 */
  if (tarPath.startsWith("-")) {
    throw new Error("导出文件路径不能以 `-` 开头（那会被 tar 当成选项）");
  }
  if (!existsSync(tarPath)) {
    throw new Error(`导出文件不存在：${tarPath}`);
  }
  const target = resolve(targetDir);
  if (existsSync(target) && (await readdir(target)).length > 0) {
    throw new Error(`"${targetDir}" 不是空目录 —— 导入会覆盖里面同名的稿与快照，而那不经写入口、不留快照`);
  }

  /* ⚠️ **先解到临时目录，成功了再整体搬过去**。
     直接解到目标的话，`tar` 中途失败会留下**半个项目**（一部分稿是新的、
     一部分是旧的），而那种状态没有任何办法分辨。 */
  await mkdir(dirname(target), { recursive: true });
  const stage = await mkdtemp(join(dirname(target), ".import-"));
  try {
    await new Promise<void>((res, rej) => {
      execFile("tar", ["-xzf", tarPath, "-C", stage], (err) => (err ? rej(err) : res()));
    });
    if (existsSync(target)) await rm(target, { recursive: true, force: true });   // 空目录才走到这
    await rename(stage, target);
  } catch (e) {
    await rm(stage, { recursive: true, force: true });
    throw e;
  }

  /* 包里那一层旁数据收编成**这个目录**的记录（B1）。
     ⚠️ 收编之后它就**不在项目目录里**了（`adoptRecordDir` 是 rename 不是 copy）——
     不搬走的话，导入会在用户的目录里留下一个 `.umbrastudio-record/`，
     那正是 Q62 要消除的那件事。
     ⚠️ 老包里没有这一层 → `restoredRecord` 为 false，照实回。 */
  const fromTar = join(target, RECORD_IN_TAR);
  let restoredRecord = false;
  if (existsSync(fromTar)) { adoptRecordDir(target, fromTar); restoredRecord = true; }

  const projectName = basename(target);
  const drafts = (await readdir(target)).filter((f) => f.endsWith(".dc.html"));

  return {
    imported: true,
    projectName,
    draftCount: drafts.length,
    restoredRecord,
  };
}
