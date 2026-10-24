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

/* ⚠️ 这里原来有 `udDirOf(projectDir)`（项目里那个旁数据根目录），注释写着
   「**只有迁移和清理该直接用它**」。2026-10-24 删掉，因为**那两件都没了**：
   Q72 砍掉了存量迁移，而「清理」走的是 `purge.ts` 自己那一套。 */

/** ⓐ 资产目录。**B1 之后它不在用户的目录里了** —— `STATE_ROOT/.umbrastudio/records/<随机 ID>/<kind>`。
 *
 *  ⚠️ 这一行就是 A 段存在的理由：A 段把十来处裸拼收口到这里（**零行为变化**），
 *  B1 只改这一行，十来处跟着搬。原来那种「十几处各改一遍」的搬迁，
 *  **漏一处就是「一类历史静默读不到」**，而「读不到」和「本来就没有」在界面上长得一模一样。
 *
 *  ⚠️ 仍然是**同步**的，所以 20 多个调用点一个字都不用改（`records.ts` 文件头解释了为什么）。 */
export const assetDir = (projectDir: string, what: AssetKind): string => join(recordDirOf(projectDir), what);

/** ⓑ 缓存根。**B2 之后也在记录里**：`records/<ID>/cache/`。
 *  单独一层 `cache/` 不是整洁，是**安全线**：「清缓存」现在可以整层删，
 *  而资产在它的**兄弟**目录里 —— 结构上就不可能被带走。
 *  （白名单那道闸留着不动，两层防线。） */
export const cacheRoot = (projectDir: string): string => join(recordDirOf(projectDir), "cache");

/* ⚠️⚠️ **这里原来有四个 `legacy*`（`legacyAssetDir` / `legacyCacheDir` / `legacyCommentsFile` /
   `legacyIndexDataFile`），注释都写着「只给「看看旧的那份还在不在」用」——
   而**没有任何人看过**。2026-10-24 四个一起删（geek-99 定）。

   ⚠️ **而那个事实要留下来**：B1/B2 之前的旁数据**真的还躺在用户项目的
   `<项目>/.umbrastudio/` 下**（Q72 定了「不迁也不删」，2026-10-21 实测这台机器
   四个项目共 547 KB）。删掉的只是「读它的函数」，不是那些文件。
   > **「我们不管它」和「它不存在」是两件事** —— 而把读它的函数删掉之后，
   > 代码里再没有任何东西提醒下一个人那些文件还在。这段注释就是那个提醒。 */

/** ⓑ 缓存目录。 */
export const cacheDir = (projectDir: string, what: CacheKind): string => join(cacheRoot(projectDir), what);

/** 评论是**一个文件**不是目录（所以单列，不塞进 `AssetKind` 里假装它是目录）。
 *  它也是 ⓐ 资产，B1 跟着搬进记录目录。 */
export const commentsFile = (projectDir: string): string => join(recordDirOf(projectDir), "comments.json");

/** 索引数据（ⓑ）。 */
export const indexDataFile = (projectDir: string): string => join(cacheRoot(projectDir), "index-data.json");

/** 缓存文件**当 URL 用**的那个形式（`render.ts` 回的 `shot` 会进 `index-data.json`
 *  的 `thumb`，而 **S1 索引页把它直接 `<img src>`**）。
 *
 *  ⚠️ **B2 把它从「项目内相对路径」换成「同源绝对路径」**（`doc/24` §19.3）。
 *  这是 A 段把它单列出来的理由 —— 「那天能一眼找到它」的那天就是今天。
 *
 *  > 当时列了三条路，核清之后发现**不用选**：S1 读的是 `thumb` 的**值**，
 *  > 而那个值是**我们生成的**。从 `.umbrastudio/shots/x.png` 换成 `/__cache/shots/x.png`，
 *  > 那份稿**一个字都不用改** —— 它在项目自己那个服务下打开，绝对路径解析到同一个核心。
 *  >
 *  > **一个看起来「要改契约」的问题，核清之后只是「换一个我们自己生成的值」。
 *  > 这种便宜要先找一遍，再去问人。**
 *
 *  ⚠️ 服务端要把这个值**换回盘上的路径**时走 `cacheAbsOf`，别自己拼 —— 
 *  首页缩略图就是那样的消费方（它读盘转 base64）。 */
export const cacheRel = (what: CacheKind, name?: string): string =>
  "/" + [CACHE_URL_SEG, what, ...(name ? [name] : [])].join("/");

/** `cacheRel()` 那个 URL 的路由前缀（`serve.ts` 认它）。一处定义，两边用。 */
export const CACHE_URL_SEG = "__cache";

/** 把 `cacheRel()` 生成的那个 URL 换回盘上的绝对路径。认不出就 `null`。
 *  ⚠️ **也认老值**（`.umbrastudio/shots/x.png`）：用户机器上 B2 之前生成的
 *  `index-data.json` 里存的是旧形式，不认的话首页缩略图会**静默变空**。 */
export function cacheAbsOf(projectDir: string, value: string): string | null {
  const v = value.split(sep).join("/");
  if (v.startsWith(`/${CACHE_URL_SEG}/`)) return join(cacheRoot(projectDir), ...v.slice(CACHE_URL_SEG.length + 2).split("/"));
  if (v.startsWith(`${UD_DIRNAME}/`)) return join(projectDir, ...v.split("/"));   // B2 之前的老值
  return null;
}
