/** 项目导出与导入：打包成可移植的 .tar.gz，含快照与 changelog。
 *
 * 用系统 `tar` 命令打包，不需要额外依赖。
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { isInside } from "./pathguard.js";

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
   更紧的那一档（只许导入到 `projectsRoot()` 下的新目录、只许导出到 `outgoing/`）
   是个产品决定，登记成 `doc/11` Q47 等拍板。
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

  // 用系统 tar 打包
  await new Promise<void>((res, rej) => {
    execFile("tar", ["-czf", out, "-C", projectDir, "."], (err) => (err ? rej(err) : res()));
  });

  const sizeStat = await stat(out);
  const projectName = basename(projectDir);

  /* ⚠️ 这一段原来是 `readdirSync` / `statSync`（issue #93 第 3 点，#48 同族）——
     大项目的快照目录有几千个文件，同步读会把整个服务停住，
     而这个进程同时在接 MCP、WS 和别的 HTTP 请求。 */
  const drafts = (await readdir(projectDir)).filter((f) => f.endsWith(".dc.html"));
  const snapRoot = join(projectDir, ".umbrastudio/snapshots");
  let versionCount = 0;
  if (existsSync(snapRoot)) {
    for (const sub of await readdir(snapRoot, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      versionCount += (await readdir(join(snapRoot, sub.name))).filter((f) => f.endsWith(".json")).length;
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
): Promise<{ imported: boolean; projectName: string; draftCount: number }> {
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

  const projectName = basename(target);
  const drafts = (await readdir(target)).filter((f) => f.endsWith(".dc.html"));

  return {
    imported: true,
    projectName,
    draftCount: drafts.length,
  };
}
