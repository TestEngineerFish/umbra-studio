/** 把我们生成的那些文件**排除在用户的 git 之外，而不碰他的 `.gitignore`**
 *  （B3，geek-99 2026-10-22 拍板；起因见 `doc/24` §24.1）。
 *
 *  ### 为什么需要第三条路
 *  接管一个目录会往里放 **17 个生成物**（预览壳、运行时副本、入口页…）。
 *  两条显而易见的做法都有问题：
 *
 *  | | 做法 | 问题 |
 *  | --- | --- | --- |
 *  | 原来 | 往他项目里的 `.gitignore` **追加一段** | **我们在改他的文件**，而这一批的起因之一正是这件事 |
 *  | 设计侧提的 | 什么都不写 | 他的 `git status` 里多 17 个未跟踪文件，一屏红 |
 *
 *  B3：写进**那个仓库的 `.git/info/exclude`**。它
 *  **只在本机生效、不进版本、不是用户的文件** ——
 *  和 M14-6 我们在兜底仓库里用的是同一招（`gitkeep.ts` 那段注释的理由逐字适用）。
 *  > **「不要改用户的文件」和「不要让他的 git 变脏」不是一对矛盾** ——
 *  > git 自己就留了一个本机专用的排除位置。
 *
 *  ### 三条边界（拿不准就不写）
 *  ① 不在 git 仓库里 → **什么都不写**；
 *  ② `.git` 是**文件**而不是目录（worktree / submodule）→ 问 git 要
 *     **common dir**（见下面那段⚠️⚠️）；问不出来 → **不写**；
 *  ③ 写不下去（只读、权限） → **不写，并照实回**。
 *  > 这三条的共同形状：**它是一件「顺手帮个忙」的事，所以失败一律是「没帮」，
 *  > 不是「报错」** —— 排除规则写不进去不该让接管失败。
 *
 *  ### ⚠️⚠️ 为什么是 `--git-common-dir` 而不是自己解析 `gitdir:`
 *  **第一版自己解析，而它在真 worktree 上不生效 —— 判据照样绿。**
 *  2026-10-22 在**真的** `git worktree add` 和**真的**子模块上各接管一次，读数：
 *
 *  | | 自己解析出来的 gitdir | 写进它的 `info/exclude` 之后 `git status` |
 *  | --- | --- | --- |
 *  | 真子模块 | `parent/.git/modules/sub` | **0 行生成物（干净）** ✓ |
 *  | 真 worktree | `main/.git/worktrees/wt` | **✗ 16 行全冒出来了** |
 *
 *  病根：**git 读 `info/exclude` 用的是 common dir，不是 per-worktree 那个 GIT_DIR。**
 *  worktree 的 `.git` 文件指向 `…/worktrees/<名>`，而排除规则必须写进 `main/.git/info/exclude`。
 *  > **「写对了地方」和「生效了」是两件事，而只有真问 git 才分得开。**
 *  > 原来那条判据断言的是「文件写进了我算出来的那个路径」—— 那确实成功了，所以它绿。
 *
 *  改成问 `git rev-parse --git-common-dir`：它对普通仓库回 `.git`、
 *  对 worktree 回 common dir、对子模块回它自己那个 modules 目录 —— **三种都对**。
 *  ⚠️ **这件事 git 自己知道，我们不该再推一遍** ——
 *  自己解析 `gitdir:` 是在复刻一个它已经给出答案的问题，而复刻品会在边角上和本尊分叉。
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { writeAtomic } from "./normalize.js";

/** 整段的起止标记。**带标记才认得出、才撤得掉**（geek-99 的要求）。 */
/* ⚠️⚠️ **这两个标记 export 出去了（2026-10-23）**，而理由不是「判据要用」，
   是「**判据不许手抄它**」：`dropExcluded` 靠 `indexOf(OPEN)` 定位存量块，
   手抄一个差一个字的标记，判据就变成「撤掉我自己编的一个块」—— 而它会绿。
   我在改写 `apitest` ⑳ 时**先写下了这条担心，然后在三行之后手抄了一个短版**，
   当场红在「撤不掉」上。
   > **让「一字不差」由编译器保证，而不是由我记得。**
   ⚠️ 顺带：**这两个字符串不该再改** —— 用户机器上已经写进 `.git/info/exclude`
   的那些块用的是这一版标记，改了就撤不掉存量。 */
export const EXCLUDE_OPEN = "# <umbra-studio> 这一段由 Umbra Studio 维护（接管那个目录时写的），别手改";
export const EXCLUDE_CLOSE = "# </umbra-studio>";
const OPEN = EXCLUDE_OPEN;
const CLOSE = EXCLUDE_CLOSE;

/* ⚠️⚠️ **`EXCLUDE_LINES` 与 `ensureExcluded` 2026-10-23（M16-7c-2a / C3）删了，
   而 `dropExcluded` 留着 —— 这一对的去留不同，理由不同。**

   那张清单列的是「接管真的会往项目里放的东西」（预览壳 · 入口页 · 运行时副本 ·
   `.umbradesign/`），而 C3 之后**没有东西再往用户的项目里放了**，
   所以「把它们加进 `.git/info/exclude`」这件事没有对象。
   ⚠️ 核的时候量到一件事：`ensureExcluded` **在产品代码里已经零调用** ——
   它原来住在 `buildIndex` 里，而唯一还在调它的是 `apitest` 自己。
   > **一个只剩判据在调的函数，判据测的是它自己还在。**

   而 `dropExcluded`（**撤**掉那个块）**必须留着**：用户机器上**已经写进去**的那个块
   还在他的 `.git/info/exclude` 里，「清除缓存」要能把它撤掉（`purge.ts`）。
   它只靠 OPEN / CLOSE 两个标记定位，不依赖上面那张清单 —— 所以删清单不影响它。
   > **「以后不再做这件事」和「把以前做过的撤干净」是两件事，
   > 而后者要的代码比前者久。** */


export interface ExcludeResult {
  /** 写到哪个 `info/exclude`（相对或绝对，给回执看）。`null` = 没写 */
  file: string | null;
  /** 没写的原因。**写了也给，便于回执照实说** */
  why?: string;
}

/** 这个目录属于哪个 git 仓库的 **`info/exclude` 所在的那个目录**。
 *
 *  ⚠️ 名字是 `gitDirFor`，但它回的是 **common dir** 而不是 GIT_DIR ——
 *  对普通仓库两者一样，对 worktree 不一样，而 `info/exclude` 认的是前者
 *  （理由全文在文件头那段⚠️⚠️）。
 *
 *  ⚠️ **问 git，不自己走目录树**：`git rev-parse --git-common-dir` 一句话答完
 *  「在不在仓库里」「是不是 worktree」「子模块指到哪」三个问题。
 *  自己走的话要处理：`.git` 是目录 / 是文件 · `gitdir:` 是绝对还是相对 ·
 *  worktree 还要再跳一次 common dir —— **而这些 git 全知道**。
 *  ⚠️ 代价照实说：**它依赖机器上有 `git`**。没有 git 的机器上这件事回 `null` ——
 *  而那恰好是对的：**没有 git 就没有 `git status` 要安抚**。 */
export function gitDirFor(dir: string): { gitDir: string | null; why?: string } {
  const abs = resolve(dir);
  if (!existsSync(abs)) return { gitDir: null, why: `${abs} 不在` };
  let out: string;
  try {
    out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: abs, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* 不在仓库里（git 回非零）、或者这台机器上没有 git —— 两种都是「不写」 */
    return { gitDir: null, why: "这个目录不在任何 git 仓库里（或这台机器上没有 git）—— 什么都不写" };
  }
  if (!out) return { gitDir: null, why: "git 没给出 common dir —— 认不出来，不写" };
  /* ⚠️ 普通仓库里 git 回的是**相对路径** `.git`（实测），所以要按 cwd 解一次 */
  const gd = isAbsolute(out) ? out : resolve(abs, out);
  if (!existsSync(gd)) return { gitDir: null, why: `git 说 common dir 是 ${gd}，而那个路径不在 —— 认不出来，不写` };
  return { gitDir: gd };
}


/** 把那一段撤掉（「忘掉这个项目」时顺手清）。回有没有真撤掉。
 *
 *  ⚠️ **只删我们标记的那一段**，`info/exclude` 里别人写的东西一个字不动。 */
export async function dropExcluded(projectDir: string): Promise<{ file: string | null; removed: boolean }> {
  const { gitDir } = gitDirFor(projectDir);
  if (!gitDir) return { file: null, removed: false };
  const file = join(gitDir, "info", "exclude");
  if (!existsSync(file)) return { file, removed: false };
  try {
    const cur = await readFile(file, "utf8");
    const a = cur.indexOf(OPEN);
    const z = cur.indexOf(CLOSE);
    if (a < 0 || z <= a) return { file, removed: false };
    const next = (cur.slice(0, a) + cur.slice(z + CLOSE.length)).replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
    await writeAtomic(file, next);
    return { file, removed: true };
  } catch { return { file, removed: false }; }
}
