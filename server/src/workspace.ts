/** 工作区：最近项目列表。M1-2
 *
 * 存在工具自己的可写目录下（STATE_ROOT/.umbrastudio/workspace.json），
 * 不属于任何设计项目 —— 这是工具行为，不是设计事实。
 *
 * 每条记录：目录绝对路径 + 名称 + 最后打开时间 + 打开次数 + **指纹**（M14-2）。
 * 列表按最后打开时间倒排；目录不存在时标「找不到」。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_ROOT } from "./project.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const UD_DIR = join(STATE_ROOT, ".umbrastudio");
const WORKSPACE_FILE = join(UD_DIR, "workspace.json");

const MAX_RECENT = 20;

interface RecentEntry {
  dir: string;
  name: string;
  title: string;
  lastOpened: string;   // ISO date
  openCount: number;
  /* ── 指纹（M14-2，Q68）。都可缺 —— 2026-10-20 之前的条目一项都没有 ── */
  dev?: number;
  ino?: number;
  birthtimeMs?: number;
  /** 第一次见到**这一个**目录的时间。换了一个之后会重置 —— 它是「这条记录活了多久」 */
  firstSeenAt?: number;
}

/** 一条记录指着的那个目录，**还是当初那一个吗**（M14-2，Q68）。
 *
 *  ⚠️ **目标不是「鉴定」，是「不许静默继承」。** 这个区别决定了全部实现：
 *  一个目录被删掉、又新建了一个同名的，今天三处键都是纯路径
 *  （`records/<sha256(realpath)>` · 兜底仓库的 `<名字>__<路径哈希>` ·
 *  这里的 `r.dir === dir` 字符串相等）—— 于是新目录**静默继承**旧的快照、评论、回收站。
 *  **这比「冲突」糟得多**：冲突会报错，继承不会，而用户在新项目里看到的是别的项目的历史。
 *
 *  四档，**最后两档是这件事的全部分寸所在**：
 *  - `same`     指纹对得上 —— 就是它
 *  - `replaced` 指纹齐、但不对 —— **这个位置换了一个**。不继承，问一句
 *  - `unknown`  **指纹缺一样**（老条目 / 这个平台取不到）—— 当「不知道」，**绝不报警**。
 *               报的话，用户机器上**每一条**老记录都会弹一次窗，而我们什么都没查出来
 *  - `missing`  路径压根不在了 —— 标「已删除」，可清
 *
 *  > ⚠️ **不可靠的信号用来「报警」是安全的，用来「认人」才危险。**
 *  > 所以这四档只用来决定「要不要问一句」，不用来决定「这是谁」。 */
/** ⚠️ `unreachable` 是 2026-10-22 加的第五档（issue #183）。
 *  `missing` 原来的判据只有「`existsSync` 为假」，而那**分不开两件事**：
 *  目录被删了，和**它所在的盘此刻没挂上**（移动硬盘 / NAS / iCloud「仅在线」/
 *  win 的盘符没接上 / 上级目录权限变了 —— `existsSync` 遇 EACCES 也回 false）。
 *  后者说「这个目录已经不在了」是**错误信息**，而据此去清它的历史是**丢数据**。
 *  > **一个判准同时回答两个问题，它必然在其中一个上是错的**（Q77 那条的第 2 次）。 */
export type RecentIdentity = "same" | "replaced" | "unknown" | "missing" | "unreachable";

/** 现在量一次这个目录的指纹。`null` = **量不到**（不在、不是目录、或者这个平台给不出 inode）。
 *
 *  ⚠️ `ino` 必须是正数才算量到：Windows 网络盘的 `st_ino` 不可靠、ReFS 上 64 位 ID 不唯一
 *  （要 128 位 `FILE_ID_INFO`），Node 在拿不到时给 0。**给 0 还当指纹用，等于拿一个常量认人** ——
 *  那样全世界的目录指纹都一样，`replaced` 永远不会触发，而我们以为装了一道闸。 */
function fingerprintOf(dir: string): { dev: number; ino: number; birthtimeMs: number } | null {
  try {
    const st = statSync(resolve(dir));
    if (!st.isDirectory()) return null;
    if (!Number.isFinite(st.ino) || st.ino <= 0) return null;
    return { dev: st.dev, ino: st.ino, birthtimeMs: Math.round(st.birthtimeMs) };
  } catch { return null; }
}

/** 比对一条记录和盘上现在那个目录。
 *
 *  ⚠️ **只比 `ino` 和 `birthtimeMs`，`dev` 只记不比。**
 *  理由是「比错的代价不对称」：`dev`（设备号）**跨重启不保证稳定**（Linux 上实测有变），
 *  而同名重建**不会**让 `dev` 变 —— 所以把它算进等号里，只会在用户重启之后
 *  把一堆**本来就是它**的记录判成 `replaced`（白问一句，M14-4 之后还会**不继承**
 *  → 用户的快照历史够不着了），**而一个真的替换它也抓不到**。
 *  一个既帮不上忙、又会误伤的信号，记下来备查就好。 */
/** 够不着，还是真没了（issue #183）。
 *
 *  判准**不猜平台的挂载点长什么样**（`/Volumes`、`/media/<user>`、`/mnt`、
 *  `/run/media`、UNC 共享、win 盘符…… 列举法迟早漏一种），而是问一个更基本的问题：
 *  **从这个路径往上走，第一个还存在的祖先是谁。**
 *
 *  | 第一个存在的祖先 | 说明什么 |
 *  | --- | --- |
 *  | 它的**直接上级**（或更深） | 上级在、它自己不在 → **真被删了 / 移走了** |
 *  | 要走到**文件系统根**才找到 | 中间整段都不在 → 那一整块没挂上 → **够不着** |
 *
 *  ⚠️ 还有一种：`statSync` 抛 `EACCES` / `EPERM`（权限变了）——
 *  那也是「够不着」而不是「没了」，**而 `existsSync` 把它报成 false**。
 *  ⚠️ **默认方向是「够不着」而不是「没了」**，因为两边代价不对称：
 *  判成够不着 → 界面多说一句「盘没接上」，用户插上盘就好了；
 *  判成没了 → 一键清理把他的历史删掉，**没有东西兜**。 */
function reachability(dir: string): "missing" | "unreachable" {
  const abs = resolve(dir);
  /* 权限问题：看得到名字、读不到属性 —— 这不是「没了」 */
  try { statSync(abs); } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "EACCES" || code === "EPERM") return "unreachable";
  }
  let cur = dirname(abs);
  let steps = 0;
  while (true) {
    if (existsSync(cur)) return steps === 0 ? "missing" : "unreachable";
    const up = dirname(cur);
    if (up === cur) return "unreachable";     // 走到根都不在：整块没挂上
    cur = up; steps++;
  }
}

function identityOf(r: RecentEntry): RecentIdentity {
  if (!existsSync(resolve(r.dir))) return reachability(r.dir);
  const now = fingerprintOf(r.dir);
  if (!now) return "unknown";                       // 不是目录 / 平台给不出 inode
  if (typeof r.ino !== "number") return "unknown";  // 老条目
  if (r.ino !== now.ino) return "replaced";
  if (typeof r.birthtimeMs === "number" && r.birthtimeMs !== now.birthtimeMs) return "replaced";
  return "same";
}

/** 同一个目录吗。**只做 `resolve`，不做 `realpath`** ——
 *  `realpath` 对已经不在的目录会抛，而「目录没了」恰好是我们要列出来的那一档。 */
const sameDir = (a: string, b: string): boolean => resolve(a) === resolve(b);

interface Workspace {
  recents: RecentEntry[];
}

async function readWorkspace(): Promise<Workspace> {
  if (!existsSync(WORKSPACE_FILE)) return { recents: [] };
  try {
    const raw = await readFile(WORKSPACE_FILE, "utf8");
    return JSON.parse(raw) as Workspace;
  } catch {
    return { recents: [] };
  }
}

async function writeWorkspace(w: Workspace): Promise<void> {
  await mkdir(UD_DIR, { recursive: true });
  await writeFile(WORKSPACE_FILE, JSON.stringify(w, null, 2) + "\n", "utf8");
}

/** 记录一次项目打开。添加到最近列表或更新已有条目的时间。 */
export async function touchProject(dir: string, name: string, title?: string): Promise<{ identity: RecentIdentity }> {
  const w = await readWorkspace();
  const existing = w.recents.findIndex((r) => sameDir(r.dir, dir));
  const fp = fingerprintOf(dir);
  const now = Date.now();
  const entry: RecentEntry = {
    dir,
    name,
    title: title ?? name,
    lastOpened: new Date(now).toISOString(),
    openCount: 1,
    ...(fp ?? {}),
    firstSeenAt: now,
  };

  /* 这一次打开，这个位置还是原来那个目录吗 */
  let identity: RecentIdentity = existing >= 0 ? identityOf(w.recents[existing] as RecentEntry) : "same";

  if (existing >= 0) {
    const old = w.recents[existing] as RecentEntry;
    if (identity === "replaced") {
      /* ⚠️ **换了一个就从头算**：次数归 1、首见时间是现在。
         继承的话用户会看到「打开过 37 次」而他昨天才新建这个目录 ——
         而真正的危害在 M14-4：那条记录指着的 `records/<key>` 里是**别人的**快照与评论。
         这里不删旧记录的资产（那是「清除缓存」第③档的事，要确认过才删），
         只是**不再认为它们是同一个**。 */
    } else {
      entry.openCount = old.openCount + 1;
      /* 首见时间保留 —— 它是「这条记录活了多久」，不是「最后一次打开」 */
      entry.firstSeenAt = old.firstSeenAt ?? now;
      /* ⚠️ **老条目在这里补上指纹**（和兜底仓库那边同一个做法）：
         不补的话新代码只管新记录，而用户机器上的 20 条全是老的 ——
         `replaced` 这道闸对他**永远**不起作用。
         补的那一下按「现在这个就是对的」算，这是唯一诚实的起点：
         我们没有过去的指纹，**假装有一个会把判断建在编出来的数据上**。 */
    }
    w.recents.splice(existing, 1);
  }

  w.recents.unshift(entry);
  // 只保留最近的 MAX_RECENT 条
  if (w.recents.length > MAX_RECENT) w.recents.length = MAX_RECENT;
  await writeWorkspace(w);
  return { identity };
}

/** 列出最近打开过的项目。
 *  @param limit 最多返回几条，默认全部
 */
export async function listRecentProjects(limit?: number): Promise<{
  recents: Array<RecentEntry & { exists: boolean; identity: RecentIdentity }>;
  total: number;
}> {
  const w = await readWorkspace();
  const recents = w.recents
    .slice(0, limit ?? w.recents.length)
    /* ⚠️ **`exists` 判的是目录本身，不是 `project.json`**（M14-2 修，`doc/24` §8.5①）。
       原来判的是 `join(r.dir, "project.json")` —— 而 `buildProject` **不要求**这个文件
       （`readConfig(dir) ?? { name: 目录名 }`），任意目录都能当项目打开。
       于是「打开过一个随手的目录」= 这条记录**永远显示「不存在」**，而它好好地在那儿。
       ⚠️ 这条缺陷按新架构会**从个别变成全部**：Q62 之后我们不再往用户目录写
       `project.json`，于是**每一条**记录都会显示成不存在。 */
    .map((r) => ({ ...r, exists: existsSync(resolve(r.dir)), identity: identityOf(r) }));
  return { recents, total: w.recents.length };
}

/** 从最近列表移除一个项目。不影响项目目录本身。 */
export async function removeRecentProject(dir: string): Promise<{ removed: boolean }> {
  const w = await readWorkspace();
  const before = w.recents.length;
  w.recents = w.recents.filter((r) => !sameDir(r.dir, dir));
  if (w.recents.length < before) {
    await writeWorkspace(w);
    return { removed: true };
  }
  return { removed: false };
}

/** 清空最近项目列表。 */
export async function clearRecentProjects(): Promise<void> {
  await writeWorkspace({ recents: [] });
}
