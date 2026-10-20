/** 清缓存 / 清失效记录 / 忘掉一个项目 —— 「清除缓存」三档（M14-3，`doc/24` §8.7）。
 *
 *  用户 2026-10-20 的原话：「**清除缓存这个功能目前应该没有，可以补充一个**」。
 *  实测确实没有 —— 只有 `purge_trash`（倒回收站里的一项）、`clear_staged_draft`、
 *  `clear_recent_projects`（**清列表不清缓存**）。
 *
 *  ### 三档，而且**默认那一档碰不到任何算不出来的东西**
 *
 *  | 档 | 删什么 | 代价 |
 *  | --- | --- | --- |
 *  | ① 清缓存 | 体检报告 `checks/` · 缩略图 `shots/` · 索引 `index-data.json` + 项目根 `index-data.js` | **下次打开自己长回来** |
 *  | ② 清掉已失效的记录 | 「最近打开」里目标已经不在的那几条 + 它们的 git 兜底仓库 | 那些目录本来就没了 |
 *  | ③ 忘掉这一个 | 一条记录 + 它的 git 兜底仓库（**要 `confirm`**） | **历史真的没了** |
 *
 *  ### ⚠️ 安全线是**白名单**，不是黑名单
 *  这个模块只删 `CACHE_ENTRIES` 里**点名的那几样**。
 *  写成「删 `.umbrastudio/` 下除了快照以外的东西」的话，**以后新加一种资产就会被它删掉** ——
 *  而那一天没有任何判据会红（判据只认得当时存在的那几种）。
 *  `ASSET_ENTRIES` 不是实现用的，它有两个用处：给判据一人一条，和下面那道**防呆**。
 *
 *  ⚠️ 那道防呆**不是边界**（和 #24 的 `net-block.cjs` 同一个定位）：
 *  真正的边界是白名单。它拦的是「以后有人往白名单里手抖加了一个 `snapshots`」。
 *
 *  ### 为什么不在这一期就删项目目录里的 `.umbrastudio/`
 *  今天快照 / 评论 / 回收站**还在用户的目录里**（M14-4 才搬进 `records/`）。
 *  「从我的列表里忘掉这个项目」**不该有删用户目录里东西的权力** ——
 *  所以 ③ 这一期只删我们自己那一侧（STATE_ROOT 的兜底仓库），
 *  并在回执里**照实说**项目目录里那一份还在。M14-4 之后历史全在我们这边，它才真的全删。
 */
import { readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { STATE_ROOT, UD_DIRNAME } from "./project.js";
import { gitDirOfProject } from "./gitkeep.js";
import { listRecentProjects, removeRecentProject } from "./workspace.js";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";

/** ⓑ **可重算的缓存**，都在 `<项目>/.umbrastudio/` 下。删了下次打开 / 下次体检自己长回来。
 *  ⚠️ `select-bridge.js` 和壳页面（`index.dc.html` / S2 / S6 / S8）**不在这里**：
 *  它们也是 `buildIndex` 生成的，但删掉之后**在下一次打开之前预览和点选是坏的** ——
 *  「清一下缓存」不该让人的预览当场瞎掉。 */
const CACHE_ENTRIES = ["checks", "shots", "index-data.json"];
/** 项目根那一份（同一份数据挂成 `window.__UD_INDEX`，给别的页用） */
const ROOT_CACHE_ENTRIES = ["index-data.js"];

/** ⓐ **算不出来的用户资产**。这个清单只有两个用处：给判据，和给下面那道防呆。
 *  ⚠️ 实现**不读它**（实现读的是白名单）—— 一个安全线有两处定义，迟早分叉。 */
export const ASSET_ENTRIES = ["snapshots", "comments.json", "trash", "templates", "staged", "chats"];

const bad = (name: string, message: string, fix?: string) =>
  new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name }, message, fix ? { fix } : undefined));

/** 一个路径占多少字节。目录就递归加。拿不到就算 0 —— 这是**读数**，不是判据。 */
async function sizeOf(p: string): Promise<number> {
  try {
    const st = await stat(p);
    if (!st.isDirectory()) return st.size;
    let n = 0;
    for (const e of await readdir(p, { withFileTypes: true })) n += await sizeOf(join(p, e.name));
    return n;
  } catch { return 0; }
}

/** ⚠️ **防呆**：要删的东西不许是资产、必须落在我们认得的两个地方之一。
 *  真正的边界是调用处的白名单（见文件头）—— 这一道防的是「以后有人往白名单里加错一项」。
 *  **导出是给判据用的**：这道闸平时一条路都走不到（白名单里没有资产），
 *  所以**只有直接打它才量得到它在不在** —— 不导出的话它是一段
 *  「看起来在、而没有任何读数」的代码，和没有一样（纪律②）。 */
export function refuseIfDangerous(target: string, allowRoots: string[]): void {
  const abs = resolve(target);
  if (ASSET_ENTRIES.includes(basename(abs))) throw new Error(`拒绝删除用户资产：${abs}`);
  if (!allowRoots.some((r) => abs === resolve(r) || abs.startsWith(resolve(r) + sep))) {
    throw new Error(`拒绝删除界外的路径：${abs}`);
  }
}

export interface CacheCleared {
  /** 删掉了哪几样（相对项目目录） */
  removed: string[];
  /** 腾出多少字节 */
  freedBytes: number;
  /** **一个字节都没动的那几样** —— 回执里要说出来，不然用户不知道他的历史还在不在 */
  kept: string[];
}

/** ① 清缓存。**只删点名的那几样**，算不出来的一个都不碰。 */
export async function clearProjectCache(dir: string): Promise<CacheCleared> {
  const root = resolve(dir);
  const ud = join(root, UD_DIRNAME);
  const removed: string[] = [];
  let freedBytes = 0;
  for (const name of CACHE_ENTRIES) {
    const t = join(ud, name);
    if (!existsSync(t)) continue;
    refuseIfDangerous(t, [ud]);
    freedBytes += await sizeOf(t);
    await rm(t, { recursive: true, force: true });
    removed.push(`${UD_DIRNAME}/${name}`);
  }
  for (const name of ROOT_CACHE_ENTRIES) {
    const t = join(root, name);
    if (!existsSync(t)) continue;
    refuseIfDangerous(t, [root]);
    freedBytes += await sizeOf(t);
    await rm(t, { recursive: true, force: true });
    removed.push(name);
  }
  const kept = ASSET_ENTRIES.filter((n) => existsSync(join(ud, n)));
  return { removed, freedBytes, kept };
}

/** 删掉一个项目的 git 兜底仓库。回腾出的字节数。
 *  ⚠️ 路径**一定要调 `gitDirOfProject`**（§134.6）：自己复刻那段哈希的话，算法一改
 *  就指到一个不存在的目录，而 `rm -rf` 一个不存在的路径**不报错** —— 于是
 *  「清掉了」会是一句假话，而没有任何东西会告诉你。 */
async function dropFallbackRepo(dir: string): Promise<number> {
  const gd = gitDirOfProject(dir);
  if (!existsSync(gd)) return 0;
  /* 防呆：只许删 `STATE_ROOT/.umbrastudio/git/` 下面的东西 */
  refuseIfDangerous(gd, [join(STATE_ROOT, UD_DIRNAME, "git")]);
  const n = await sizeOf(gd);
  await rm(gd, { recursive: true, force: true });
  return n;
}

/** ② 清掉已失效的记录：目标目录已经不在的那几条。
 *  ⚠️ 只认 `identity === "missing"`（路径压根不在）。
 *  **`replaced` 不在这一档里** —— 那个位置有东西，只是换了一个，
 *  删它的历史得走 ③（要确认）。 */
export async function clearStaleRecords(): Promise<{ removed: Array<{ dir: string; name: string }>; freedBytes: number; left: number }> {
  const { recents } = await listRecentProjects();
  const stale = recents.filter((r) => r.identity === "missing");
  let freedBytes = 0;
  const removed: Array<{ dir: string; name: string }> = [];
  for (const r of stale) {
    freedBytes += await dropFallbackRepo(r.dir);
    await removeRecentProject(r.dir);
    removed.push({ dir: r.dir, name: r.name });
  }
  return { removed, freedBytes, left: (await listRecentProjects()).recents.length };
}

/** ③ 忘掉这一个：一条记录 + 它的 git 兜底仓库。**历史真的没了，所以要 `confirm`**。
 *
 *  ⚠️ 「从最近列表去掉」（`remove_recent_project`）和这一件是**两回事**，
 *  故意分成两个能力：前者只是「别在首页列它了」，历史一个字节都不动；
 *  这一件是「把我为它存的东西删掉」。
 *  **把两件事做成一个按钮，等于让「整理列表」这个动作带上破坏力。** */
export async function forgetProject(dir: string, confirm: boolean): Promise<{
  forgot: boolean; freedBytes: number; removedRecord: boolean; stillOnDisk: string | null;
}> {
  if (confirm !== true) {
    throw bad("confirm", "这一件会把我们为这个项目存的历史删掉，退不回来", "确认之后再调一次：confirm: true");
  }
  const freedBytes = await dropFallbackRepo(dir);
  const { removed } = await removeRecentProject(dir);
  /* ⚠️ **照实说还有什么没删**：今天快照 / 评论 / 回收站还在用户的项目目录里
     （M14-4 才搬过来），而这一件**没有权力**删用户目录里的东西。
     不说的话用户会以为「忘掉」= 全删干净了。 */
  const ud = join(resolve(dir), UD_DIRNAME);
  const stillOnDisk = existsSync(ud) && ASSET_ENTRIES.some((n) => existsSync(join(ud, n))) ? ud : null;
  return { forgot: true, freedBytes, removedRecord: removed, stillOnDisk };
}
