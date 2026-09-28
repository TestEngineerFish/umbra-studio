import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TOOL_ROOT } from "./project.js";

/** 项目目录的 git 版本记录（M9-7，用户 2026-09-28 提）。
 *
 *  ### 为什么要它 —— 它补的是一个**我们自己的机制看不见的盲区**
 *  用户的原话：「哪怕限制了 AI 工具的权限，也无法保证相关文件在其他编辑器里没有被修改。」
 *  这一条说到了点上：`.umbrastudio/snapshots/` 的语义快照**只在走写入口时产生**。
 *  别人在 VS Code 里改了一份稿，快照里没有那一版 —— 磁盘监听只会让目录树刷新一下。
 *  **git 能捕获这种改动，快照不能。**
 *
 *  ### 和既有设计的关系：不是新方向，是把空着的那一环补上
 *  `doc/07` §七 早就定了「每个设计项目各自一个 git 仓库，**快照是主路径、git 是兜底**」，
 *  `_模板-租户 .gitignore` 也写好了，按 git ref 取历史的能力（`git show <ref>:<path>`）一直在。
 *  缺的只是**谁来提交** —— 实测两个项目都 `git init` 过但 **0 个提交**，
 *  于是那条兜底路实际上是空的。
 *
 *  ### 两个触发点（缺一个都不够）
 *  ① **走写入口落盘之后**：提交带上版本号和变更摘要，和 changelog 对齐；
 *  ② ⚠️ **发现外部改动时先提交一次**：这才是补盲区的那一半 ——
 *     不先提交的话，别人改的那一版会被我们接下来的落盘盖掉，永远找不回来。
 *
 *  ### 三条纪律
 *  - **只在本地提交，从不 push**（用户明确要求）。远端有没有、叫什么，我们一概不碰。
 *  - **失败不影响落盘**：git 没装、仓库坏了、磁盘满了都不该让用户改不了稿。
 *    所以每个入口都是「尽力而为」，出错只记一行。
 *  - **不碰用户已有的提交历史**：只 `add -A` + `commit`，不 reset、不 rebase、不 amend、不切分支。
 */

/** 关掉自动提交的逃生门。**留一个**：这件事会往用户的仓库里写东西，
 *  出了任何意料之外的情况要能一秒关掉，而不是等我们改代码发版。 */
const OFF = process.env.UMBRASTUDIO_NO_GIT === "1";

/** ⚠️ **按目录串行**。落盘后的提交是异步的（不该让用户等 git），
 *  而下一次落盘前又要问「工作区脏不脏」—— 两件事撞上的话，
 *  上一次还没提交完的改动会被当成「别处改的」，于是多出一个假的外部改动提交。
 *  一条 Promise 链解决，代价只是同一个项目的 git 操作排队（它们本来也不该并行）。 */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(dir) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(dir, next.catch(() => undefined));
  return next;
}

const exec = (args: string[], cwd: string): Promise<string> =>
  new Promise((res, rej) => {
    execFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (e, out) => (e ? rej(e) : res(out)));
  });

/** 这个目录能不能用 git 记版本。`false` = 没装 git，或者 init 失败。 */
export async function ensureRepo(dir: string): Promise<boolean> {
  if (OFF) return false;
  try {
    if (existsSync(join(dir, ".git"))) return true;
    await exec(["init"], dir);
    /* 新建的仓库配一份默认 `.gitignore` —— 不配的话第一次提交会把
       `.umbrastudio/`（快照、缓存、会话、ai_config）全都提进去，
       其中 `ai_config.json` 里有 key。**这一条是安全问题，不是整洁问题。** */
    const gi = join(dir, ".gitignore");
    if (!existsSync(gi)) {
      const tpl = join(TOOL_ROOT, "doc", "_模板-租户 .gitignore");
      if (existsSync(tpl)) await copyFile(tpl, gi);
      else await writeFile(gi, ".umbrastudio/\n", "utf8");
    }
    return true;
  } catch { return false; }
}

/** 有没有未提交的改动（含未跟踪文件）。**这就是「外部改动」的判据** ——
 *  我们自己落盘之后会立刻提交，所以工作区脏了就说明是别处改的。 */
export async function isDirty(dir: string): Promise<boolean> {
  try { return (await exec(["status", "--porcelain"], dir)).trim().length > 0; }
  catch { return false; }
}

/** 提交当前工作区。`null` = 没什么可提交的（或者 git 用不了）。
 *
 *  ⚠️ **不带 `--author`、不改 user.name/email** —— 用哪个身份提交是用户仓库的事，
 *  我们替他配会让他的其它仓库配置看起来莫名其妙地不一致。
 *  仓库还没配 user 时 `git commit` 会失败，那就失败 —— 提示里说清怎么配比替他猜好。 */
export async function commitAll(dir: string, message: string): Promise<string | null> {
  if (OFF) return null;
  try {
    if (!(await isDirty(dir))) return null;
    await exec(["add", "-A"], dir);
    await exec(["commit", "-m", message, "--no-verify"], dir);
    return (await exec(["rev-parse", "--short", "HEAD"], dir)).trim();
  } catch { return null; }
}

/** 落盘之后记一版。消息形状：`写入 <文件> v3 · 一句摘要`。 */
export function commitAfterWrite(dir: string, file: string, version: string | null, summary?: string | null): Promise<string | null> {
  return serial(dir, async () => {
    if (!(await ensureRepo(dir))) return null;
    const head = [`写入 ${file}`, version ?? null].filter(Boolean).join(" ");
    return commitAll(dir, summary ? `${head} · ${summary}` : head);
  });
}

/** ⚠️ **落盘之前**叫一次：工作区脏 = 有人在别处改过，先把那一版留下来。
 *
 *  这是这个模块存在的理由。**顺序不能换** —— 先落盘再提交的话，
 *  别人那一版已经被我们覆盖了，git 里也就没有它。
 *  返回提交号 = 真的救下了一版（调用方可以据此提醒用户）。 */
export function commitExternalChanges(dir: string): Promise<string | null> {
  return serial(dir, async () => {
    if (!(await ensureRepo(dir))) return null;
    if (!(await isDirty(dir))) return null;
    return commitAll(dir, "别处改过的内容（工具在落盘前先记一版）");
  });
}
