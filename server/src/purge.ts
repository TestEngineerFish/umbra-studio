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
import { existsSync, realpathSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { STATE_ROOT } from "./project.js";
import { ASSET_KINDS, CACHE_KINDS, UD_DIRNAME, cacheRoot } from "./statedirs.js";
import { sweepTmpUnder } from "./tmpfiles.js";
import { gitDirOfProject } from "./gitkeep.js";
import { listRecentProjects, removeRecentProject } from "./workspace.js";
import { recordDirOf } from "./records.js";
import { deadRecordsUnder, dropOrphanRecords, dropRecord, dropRecordsUnder, existingRecordIdFor, recordsRoot } from "./records.js";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";

/** ⓑ **可重算的缓存**，都在 `<项目>/.umbrastudio/` 下。删了下次打开 / 下次体检自己长回来。
 *  ⚠️ `select-bridge.js` 和壳页面（`index.dc.html` / S2 / S6 / S8）**不在这里**：
 *  它们也是 `buildIndex` 生成的，但删掉之后**在下一次打开之前预览和点选是坏的** ——
 *  「清一下缓存」不该让人的预览当场瞎掉。 */
const CACHE_ENTRIES: string[] = [...CACHE_KINDS, "index-data.json"];
/** 项目根那一份（同一份数据挂成 `window.__UD_INDEX`，给别的页用） */
const ROOT_CACHE_ENTRIES = ["index-data.js"];

/** ⓐ **算不出来的用户资产**。这个清单只有两个用处：给判据，和给下面那道防呆。
 *  ⚠️ 实现**不读它**（实现读的是白名单）—— 一个安全线有两处定义，迟早分叉。 */
export const ASSET_ENTRIES: string[] = [...ASSET_KINDS, "comments.json"];

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
  /** 顺手清掉的原子写孤儿（`*.umbrastudio.tmp`），几个（M14-9）。
   *  ⚠️ **它不在 `removed` 里，故意的**：`removed` 那一列是「你点名要清的缓存」，
   *  而这个是「我们自己留下的垃圾」—— 混进去会让「清缓存删了 5 样」这种读数
   *  变得说不清是删了什么。 */
  tmpOrphans: number;
}

/** ① 清缓存。**只删点名的那几样**，算不出来的一个都不碰。 */
export async function clearProjectCache(dir: string): Promise<CacheCleared> {
  const root = resolve(dir);
  /* ⚠️ **缓存和资产现在是兄弟目录**（M14-4 B2）：
     缓存在 `records/<ID>/cache/`，资产在 `records/<ID>/{snapshots,trash,…}`。
     白名单那道闸留着不动 —— 两层防线：**结构上删不到资产，名单上也不许删**。 */
  const cRoot = cacheRoot(root);
  const removed: string[] = [];
  let freedBytes = 0;
  for (const name of CACHE_ENTRIES) {
    const t = join(cRoot, name);
    if (!existsSync(t)) continue;
    refuseIfDangerous(t, [cRoot]);
    freedBytes += await sizeOf(t);
    await rm(t, { recursive: true, force: true });
    removed.push(`cache/${name}`);
  }
  for (const name of ROOT_CACHE_ENTRIES) {
    const t = join(root, name);
    if (!existsSync(t)) continue;
    refuseIfDangerous(t, [root]);
    freedBytes += await sizeOf(t);
    await rm(t, { recursive: true, force: true });
    removed.push(name);
  }
  /* ── 顺手清掉原子写留下的孤儿（M14-9，2026-10-22）──
     ⚠️ 这是**用户主动要求清理**时才走的那条路，所以这里敢做一次递归扫描；
     写那一层（`writeAtomic`）只扫它自己正在写的那个目录，不走全量 walk。
     ⚠️ **判准是「我们自己造的那个后缀」**，不是 `.tmp` ——
     用户目录里的 `.tmp` 可能是别人的东西，而这是在**他的项目目录**里删文件。
     ⚠️ 不进 `removed`：那一列是「你点名要清的缓存」。 */
  const tmpProject = await sweepTmpUnder(root);
  const tmpRecord = await sweepTmpUnder(recordDirOf(root));
  const tmpOrphans = tmpProject.removed + tmpRecord.removed;

  /* 「一个字节都没碰」那一列：资产现在在记录目录下，不在项目里 */
  const aRoot = recordDirOf(root);
  const kept = ASSET_ENTRIES.filter((n) => existsSync(join(aRoot, n)));
  return { removed, freedBytes, kept, tmpOrphans };
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
export async function clearStaleRecords(): Promise<{ removed: Array<{ dir: string; name: string }>; freedBytes: number; orphanRecords: number; left: number }> {
  const { recents } = await listRecentProjects();
  const stale = recents.filter((r) => r.identity === "missing");
  let freedBytes = 0;
  const removed: Array<{ dir: string; name: string }> = [];
  for (const r of stale) {
    freedBytes += await dropFallbackRepo(r.dir);
    freedBytes += await sizeOf(join(recordsRoot(), existingRecordIdFor(r.dir) ?? "\u0000"));
    await removeRecentProject(r.dir);
    removed.push({ dir: r.dir, name: r.name });
  }
  /* ⚠️ 记录目录**也要跟着清**（B1）：快照 / 评论 / 回收站从 2026-10-21 起住在
     `records/<ID>/`，不清的话「清掉已失效的记录」会**只清掉名字、留下几十 MB 的历史**，
     而回执报的 `freedBytes` 只算了兜底仓库 —— 又一次「数对不上事实」。
     `dropOrphanRecords` 按「它指着的目录还在不在」判，所以它也会顺手清掉
     更早以前留下的孤儿（没有对应「最近打开」条目的那些）。 */
  const orphans = dropOrphanRecords();
  return { removed, freedBytes, orphanRecords: orphans.ids.length + orphans.unindexed.length, left: (await listRecentProjects()).recents.length };
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
  let freedBytes = await dropFallbackRepo(dir);
  /* B1 之后历史全在我们这边 —— **这一件现在才真的把它删掉**。
     ⚠️ 用 `existingRecordIdFor`（只查不建）：对一个从没写过东西的项目调「忘掉」，
     不该顺手给它造一条记录再删掉。 */
  const recId = existingRecordIdFor(dir);
  if (recId) {
    freedBytes += await sizeOf(join(recordsRoot(), recId));
    dropRecord(recId);
  }
  const { removed } = await removeRecentProject(dir);
  /* ⚠️ **照实说还有什么没删**：B1 之前写下的那一份旁数据还在用户的项目目录里
     （Q72 拍板不做存量迁移 —— 旧目录留在原地，**不迁也不删**），
     而这一件**没有权力**删用户目录里的东西。
     不说的话用户会以为「忘掉」= 全删干净了。 */
  const ud = join(resolve(dir), UD_DIRNAME);
  const stillOnDisk = existsSync(ud) && ASSET_ENTRIES.some((n) => existsSync(join(ud, n))) ? ud : null;
  return { forgot: true, freedBytes, removedRecord: removed, stillOnDisk };
}

/** 清掉**指向某个目录树下**的全部 git 兜底仓库（M14-6）。
 *
 *  ⚠️ 这件事在 2026-10-20 之前**做不到**：目录名是 `<目录名>__<路径 sha256 前 16 位>`，
 *  **哈希不可逆**，而 `config` 里只有 `bare = true` 一行 —— 问不出它对应哪个目录。
 *  M14-1 给每个仓库写了 `[umbra] worktree` 之后它才成立。
 *
 *  **给回归自己收尾用的**：`filetest` / `lifecycletest` 的样本项目在系统临时目录下，
 *  而它们每轮都是新路径（`Date.now()` / `mkdtemp`）→ **每轮都是一个新仓库**。
 *  实测：跑 5 轮 `filetest` + 1 轮 `lifecycletest` 多出 **65 个**仓库。
 *  按路径前缀清，连它们**嵌套建出来的**项目（`新项目` / `evil` 那些）一起清掉 ——
 *  一个个记下来再删的话，漏一个就静默复发，而症状和没修一模一样。
 *
 *  ⚠️ `unidentifiable` 要**照实回**：2026-10-20 之前建的仓库一条 `[umbra]` 都没有，
 *  **我们就是认不出来**。把它算进「清掉了」会让读数说谎。 */
/** `root` 的**两种写法**：原样，和解完符号链接的那个。
 *
 *  ⚠️ **macOS 上 `/var` 是指向 `/private/var` 的符号链接**，于是同一个临时目录有两个名字：
 *  `os.tmpdir()` 给的是 `/var/folders/…`，而 `mkdtemp(realpathSync(tmpdir()))` 建出来的项目
 *  自报的 `[umbra] worktree` 是 `/private/var/folders/…`。
 *  只按一种写法比的话 **`isInside` 判不出来 → 那个仓库不被清、也不被报告**，
 *  而读数会说「清掉 0 个」—— 看上去和「本来就没有」一模一样（纪律④）。
 *
 *  **这条是 2026-10-21 实测撞到的**：`apitest` 换成 realpath 的临时夹具之后，
 *  连跑六轮攒下 6 个仓库，而每一轮的收尾都报「清掉 0 个」。
 *  （`verbtest` 的沙箱放行、Q62 的 `records/<key>` 都踩过同一个坑，这是第三次。） */
function rootForms(root: string): string[] {
  const a = resolve(root);
  let b = a;
  try { b = realpathSync(a); } catch { /* 不在就只用原样 */ }
  return a === b ? [a] : [a, b];
}

/** 一个 worktree 路径在不在这些 root 之一下面 */
const underAny = (wt: string, roots: string[]): boolean =>
  roots.some((u) => wt === u || wt.startsWith(u + sep));

/** **只查不删**：`root` 下面有多少个「指向一个已经不在的目录」的兜底仓库。
 *
 *  给回归的收尾**当判据**用：清理跑完之后这个数必须是 0。
 *  ⚠️ 为什么不能用 `dropFallbackReposUnder` 的 `removed.length === 0` 代替 ——
 *  **匹配不上的那些它既不删也不报**，于是两次都是 0。
 *  **「清掉 0 个」有两种可能：本来就没有，或者我们压根没认出来。** */
export async function deadLeftoversUnder(root: string): Promise<string[]> {
  return [...await deadFallbackReposUnder(root), ...deadRecordsUnder(root).map((id) => `record:${id}`)];
}

export async function deadFallbackReposUnder(root: string): Promise<string[]> {
  const { repoMetaOfGitDir } = await import("./gitkeep.js");
  const gitRoot = join(STATE_ROOT, UD_DIRNAME, "git");
  const roots = rootForms(root);
  const dead: string[] = [];
  let names: string[] = [];
  try { names = await readdir(gitRoot); } catch { return dead; }
  for (const name of names) {
    const meta = await repoMetaOfGitDir(join(gitRoot, name));
    if (!meta.worktree) continue;                       // 认不出来的不算（照实说，见下）
    const wt = resolve(meta.worktree);
    if (underAny(wt, roots) && !existsSync(wt)) dead.push(name);
  }
  return dead;
}

/** 清掉**我们为这个目录树下的项目存的东西**：git 兜底仓库 + 记录目录（M14-4 B1 起）。
 *
 *  ⚠️ **2026-10-21 从 `dropFallbackReposUnder` 改名成这个**，而改名本身是这次修法的一半：
 *  B1 把快照 / 评论 / 回收站搬进 `records/<ID>/` 之后，**十几套跑在真 `STATE_ROOT`
 *  上的回归每轮都会多攒一条记录**（样本项目在临时目录、每轮新路径）——
 *  正是 M14-6 那条「595 个仓库 / 94 MB」的重演。
 *
 *  做法上有两条路：在 8 个收尾点各加一行，或者**把它并进这一个函数**。
 *  选后者，理由是失败模式不对称：
 *  - 各加一行 → **漏一个就静默复发**，而症状（状态目录慢慢变大）要几周才看得出来；
 *  - 并进来 + 改名 → 8 个调用点**编译期就必须跟着改**，漏不掉。
 *
 *  > **让「漏掉」变成编译错误，比让「漏掉」变成一条要人记得的纪律可靠。** */
export async function dropLeftoversUnder(root: string, opts?: { onlyDead?: boolean }): Promise<{
  removed: string[]; freedBytes: number; unidentifiable: number; keptAlive: number; records: string[];
}> {
  const { repoMetaOfGitDir } = await import("./gitkeep.js");
  const gitRoot = join(STATE_ROOT, UD_DIRNAME, "git");
  const out = { removed: [] as string[], freedBytes: 0, unidentifiable: 0, keptAlive: 0, records: [] as string[] };
  /* 记录目录跟着清。`onlyDead: false` 时连「目录还在」的记录一起清 —— 和仓库那边同一个口径 */
  for (const id of dropRecordsUnder(root, opts).removed) out.records.push(id);
  const roots = rootForms(root);
  let names: string[] = [];
  try { names = await readdir(gitRoot); } catch { return out; }
  for (const name of names) {
    const gd = join(gitRoot, name);
    const meta = await repoMetaOfGitDir(gd);
    if (!meta.worktree) { out.unidentifiable++; continue; }
    const wt = resolve(meta.worktree);
    if (!underAny(wt, roots)) continue;
    /* `onlyDead`：**目录还在的就不动**。回归收尾按这一档扫整个系统临时目录 ——
       「指向临时目录、而那个目录已经不在了」是一条**不用枚举**的判准，
       所以嵌套建出来的项目（`evil` / `新项目` / `设计稿`）和 `mkdtemp` 的随机名
       全都自动落网。按名字前缀列清单的话，漏一个就静默复发。 */
    if (opts?.onlyDead && existsSync(wt)) { out.keptAlive++; continue; }
    out.freedBytes += await sizeOf(gd);
    await rm(gd, { recursive: true, force: true });
    out.removed.push(name);
  }
  return out;
}
