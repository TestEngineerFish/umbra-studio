/** **一个项目的「旁数据」住在哪 —— 唯一出处**（M14-4 A 段，`doc/24` §17.1）。
 *
 *  ### 为什么要有它
 *  这件事今天散在**十来处**各拼一次 `join(p.dir, ".umbrastudio", …)`：
 *  `history.ts`（快照）· `comments.ts`（评论）· `refs.ts` 四处 + `files.ts`（回收站）·
 *  `project.ts` + `cap/drafts.ts`（模板）· `staged.ts` 四处（草稿）· `chat.ts`（会话）·
 *  `check.ts`（体检）· `render.ts`（缩略图）· `indexpage.ts` + `cap/history.ts` + `cap/projects.ts`（索引）。
 *
 *  Q62 定了「旁数据一律进我们自己的目录」（用户 2026-10-20 的更正）。
 *  **十几处各改一遍的那种搬迁，漏一处就是「一类历史静默读不到」** ——
 *  而「读不到」和「本来就没有」在界面上长得一模一样。
 *  所以先把出处收成一个（**这一步零行为变化**，验收是全套回归一条不变），
 *  B 段再在这一处翻到 `STATE_ROOT/.umbrastudio/records/<key>/`。
 *
 *  ### ⓐ 和 ⓑ 分开列，因为它们的**可丢性**不同
 *  - **ⓐ 资产**：快照 / 评论 / 回收站 / 模板 / 草稿 / 会话 —— **算不回来**。搬错就是用户的东西没了。
 *  - **ⓑ 缓存**：体检 / 缩略图 / 索引 —— 下次打开自己长回来。「清除缓存」只许碰这一类（`purge.ts`）。
 *
 *  这个区分不是整洁，是**安全线**：`purge.ts` 的白名单、M14-3 那道防呆、
 *  以及 B 段「哪些搬进 `records/` 哪些搬进 `cache/`」都从这里读。
 */
import { join, sep } from "node:path";
import { recordDirOf } from "./records.js";

/** 项目 / 工具自己的配置目录名（M7-1 改名，`11` Q28）。
 *  ⚠️ **定义在这里而不是 `project.ts`**：`project.ts` 自己要用下面的 `assetDir`（模板那一处），
 *  定义留在它那边就成环（`project → statedirs → project`）。
 *  `project.ts` 把它再导出，所以所有 `import { UD_DIRNAME } from "./project.js"` 照旧能用。 */
export const UD_DIRNAME = ".umbrastudio";

/** ⓐ **算不回来的用户资产**。名字就是今天盘上的目录名。
 *  ⚠️ **类型从这个数组派生，不是另写一个联合** —— `purge.ts` 的资产清单（它那道
 *  安全线的全部依据）也从这里取。一个清单两处定义，迟早分叉，而分叉的那天
 *  「新加的那种资产」会被「清缓存」删掉，**且没有任何判据会红**。 */
export const ASSET_KINDS = ["snapshots", "trash", "templates", "staged", "chats"] as const;
export type AssetKind = typeof ASSET_KINDS[number];
/** ⓑ **算得回来的缓存**。「清除缓存」只许碰这一类。 */
export const CACHE_KINDS = ["checks", "shots"] as const;
export type CacheKind = typeof CACHE_KINDS[number];

/** 这个项目的旁数据根目录。**只有迁移和清理该直接用它** ——
 *  别处一律用下面带 kind 的那几个，否则 B 段又变成「十几处各拼一次」。 */
export const udDirOf = (projectDir: string): string => join(projectDir, UD_DIRNAME);

/** ⓐ 资产目录。**B1 之后它不在用户的目录里了** —— `STATE_ROOT/.umbrastudio/records/<随机 ID>/<kind>`。
 *
 *  ⚠️ 这一行就是 A 段存在的理由：A 段把十来处裸拼收口到这里（**零行为变化**），
 *  B1 只改这一行，十来处跟着搬。原来那种「十几处各改一遍」的搬迁，
 *  **漏一处就是「一类历史静默读不到」**，而「读不到」和「本来就没有」在界面上长得一模一样。
 *
 *  ⚠️ 仍然是**同步**的，所以 20 多个调用点一个字都不用改（`records.ts` 文件头解释了为什么）。 */
export const assetDir = (projectDir: string, what: AssetKind): string => join(recordDirOf(projectDir), what);

/** B1 之前资产在哪。**只给「看看旧的那份还在不在」用**（旧目录不迁也不删，Q72）。 */
export const legacyAssetDir = (projectDir: string, what: AssetKind): string => join(projectDir, UD_DIRNAME, what);

/** ⓑ 缓存目录。 */
export const cacheDir = (projectDir: string, what: CacheKind): string => join(projectDir, UD_DIRNAME, what);

/** 评论是**一个文件**不是目录（所以单列，不塞进 `AssetKind` 里假装它是目录）。
 *  它也是 ⓐ 资产，B1 跟着搬进记录目录。 */
export const commentsFile = (projectDir: string): string => join(recordDirOf(projectDir), "comments.json");
/** B1 之前评论在哪。只给「看看旧的那份还在不在」用。 */
export const legacyCommentsFile = (projectDir: string): string => join(projectDir, UD_DIRNAME, "comments.json");

/** 索引数据（ⓑ）。 */
export const indexDataFile = (projectDir: string): string => join(projectDir, UD_DIRNAME, "index-data.json");

/** ⚠️ **项目内的相对形式**，给「要当 URL 用」的那几处（`render.ts` 回的 `shot`
 *  会进 `index-data.json` 的 `thumb`，而 **S1 索引页把它当相对 URL** 直接 `<img src>`）。
 *  B 段把缓存搬出项目之后**这一条会断** —— 它是 `doc/24` §17.2 那两处耦合的第一处，
 *  单列出来就是为了那天能一眼找到它。 */
export const cacheRel = (what: CacheKind, name?: string): string =>
  [UD_DIRNAME, what, ...(name ? [name] : [])].join("/").split(sep).join("/");
