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
 *  - **不碰用户已有的提交历史**：只 `add -- <点名的路径>` + `commit -- <同样的路径>`，
 *    不 reset、不 rebase、不 amend、不切分支。⚠️ 这行原来写的是「只 `add -A` + `commit`」——
 *    那是**改之前的**做法，2026-09-28 按用户那句「项目根目录已经有 git 怎么办」改成了点名 add
 *    （见 `commitPaths` 的注释），而这行纪律忘了跟着改。**注释也会变成说谎的状态列。**
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

/** ⚠️ **仓库自带的配置能让 git 执行任意命令，而 `--no-verify` 管不住它们**
 *  （issue #40，2026-10-02）。实测确证过的几条：
 *  - `core.fsmonitor = <命令>` → `git status` / `git add` 时就执行
 *  - `.git/hooks/post-commit` → `--no-verify` 只跳过 pre-commit 和 commit-msg
 *  - 同族还有 `core.hooksPath`、`core.pager`
 *
 *  **M9-7 之前没有这个面**：那时服务端自动跑的 git 只有 `rev-parse` 和按需的
 *  `log` / `show`，不走 fsmonitor 也不触发钩子。M9-7 让「打开别人的项目 + 改一下稿」
 *  变成了「执行那个仓库指定的任意命令」—— 而用户什么都看不到
 *  （这个模块的错误全部吞掉，钩子的输出也没人读）。
 *
 *  设计项目天然会被打包转手（交付、协作、网盘下载），而 git 自己的 `safe.directory`
 *  只拦「属主不是当前用户」—— 解压出来的目录属主就是当前用户，拦不住。
 *  VS Code 为同一件事做了「工作区信任」。
 *
 *  所以**每一条 git 调用都带这组覆盖**。它和下面那道「是不是我们建的仓库」是
 *  **两层独立的闸**：我们自己建的仓库也可能被外部改配置。 */
const HARDEN = [
  "-c", "core.fsmonitor=false",
  "-c", "core.hooksPath=/dev/null",
  "-c", "core.pager=cat",
  "-c", "core.sshCommand=/usr/bin/false",
  "-c", "protocol.ext.allow=never",
];

const exec = (args: string[], cwd: string): Promise<string> =>
  new Promise((res, rej) => {
    /* ⚠️ 继承来的 `GIT_*` 也要清掉 —— `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE`
       会让我们在**另一个仓库**上操作，而 `cwd` 看起来是对的。
       `GIT_CONFIG_NOSYSTEM=1` 把 `/etc/gitconfig` 挡在外面。 */
    const env: Record<string, string | undefined> = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
    for (const k of Object.keys(env)) {
      if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|CONFIG_GLOBAL|CONFIG_SYSTEM|EXTERNAL_DIFF|PAGER|SSH_COMMAND|PROXY_COMMAND|ASKPASS|EDITOR|SEQUENCE_EDITOR|ATTR_FILE|CEILING_DIRECTORIES|COMMON_DIR|NAMESPACE|ALLOW_PROTOCOL)$/.test(k)) delete env[k];
    }
    execFile("git", [...HARDEN, ...args], { cwd, env, maxBuffer: 16 * 1024 * 1024 }, (e, out) => (e ? rej(e) : res(out)));
  });

/** 这个仓库是不是**我们自己建的**（issue #40 的第二道闸）。
 *
 *  判据是 `.git/config` 里一个我们写的标记。**不用「有没有提交历史」之类的启发式** ——
 *  那种判据会在「用户刚 `git init` 过还没提交」时猜错，而猜错的后果是
 *  在别人的仓库上自动跑 git。
 *
 *  ⚠️ **默认不碰别人的仓库，但留一个显式打开的开关**（`umbrastudio.managed=true`）——
 *  M9-7 补的那个盲区（别的编辑器改的那一版）对自己项目仍然有价值，
 *  不该因为这条安全问题整个消失。用户可以在他信任的仓库里手动打开：
 *      git config umbrastudio.managed true
 *  这和 VS Code 的「工作区信任」是同一个形状：**默认不信，信了就记下来。** */
async function isOurs(dir: string): Promise<boolean> {
  try { return (await exec(["config", "--get", "umbrastudio.managed"], dir)).trim() === "true"; }
  catch { return false; }   // 没有这个键时 git 返回码非 0
}

/** 这个目录能不能用 git 记版本。`false` = 没装 git，或者 init 失败。 */
export async function ensureRepo(dir: string): Promise<boolean> {
  if (OFF) return false;
  try {
    if (existsSync(join(dir, ".git"))) return true;
    await exec(["init"], dir);
    /* 打上「这是我们建的」标记 —— 下面所有自动提交都查它（issue #40）。
       ⚠️ 要在 `git init` **之后**、第一次提交**之前**写，否则第一次提交那一下还没有标记。 */
    await exec(["config", "umbrastudio.managed", "true"], dir);
    /* 新建的仓库配一份默认 `.gitignore` —— 不配的话第一次提交会把
       `.umbrastudio/`（快照、缓存、会话、ai_config）全都提进去，
       其中 `ai_config.json` 里有 key。**这一条是安全问题，不是整洁问题。** */
    const gi = join(dir, ".gitignore");
    if (!existsSync(gi)) {
      const tpl = join(TOOL_ROOT, "doc", "_模板-租户 .gitignore");
      if (existsSync(tpl)) await copyFile(tpl, gi);
      else await writeFile(gi, ".umbrastudio/\n", "utf8");
      /* 顺手把它提交掉。`.gitignore` 不提交也生效，但**不提交就会永远挂在
         用户的 `git status` 里**，看着像我们留下的垃圾。
         只在**我们刚建的**仓库里做这一下 —— 上面 `existsSync(.git)` 已经把
         「用户已有的仓库」挡在外面了，不会去碰他的工作区。 */
      await commitPaths(dir, [".gitignore"], "记版本：忽略工具自己的产物（.umbrastudio/）");
    }
    return true;
  } catch { return false; }
}

/** ⚠️ **正在 merge / rebase / cherry-pick / 二分查找中，一律不动这个仓库**。
 *
 *  用户问「如果项目根目录已经有了 git 该怎么处理」时，我先想到的是「别卷入他的改动」，
 *  但还有更糟的一种：**他正在 rebase**。那时候 `git commit` 会把提交落在一个临时状态上，
 *  轻则打乱他的 rebase，重则让他丢掉正在整理的历史。
 *  **有疑问就什么都不做** —— 这个模块的价值是兜底，而兜底不该有破坏力。 */
async function inMiddleOfSomething(dir: string): Promise<boolean> {
  try {
    const gitDir = (await exec(["rev-parse", "--git-dir"], dir)).trim();
    const abs = gitDir.startsWith("/") ? gitDir : join(dir, gitDir);
    for (const f of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply"]) {
      if (existsSync(join(abs, f))) return true;
    }
    return false;
  } catch { return true; }   // 问不出来就当「正在做什么」，宁可不提交
}

/** 有没有未提交的改动。**给了 `file` 就只看那一个文件** ——
 *  「整个工作区脏不脏」和「我要覆盖的那份稿被改过没」是两件事：
 *  前者会把用户正在改的别的文件也算进来（见 `commitPaths` 的注释）。 */
export async function isDirty(dir: string, file?: string): Promise<boolean> {
  try {
    const args = file ? ["status", "--porcelain", "--", file] : ["status", "--porcelain"];
    return (await exec(args, dir)).trim().length > 0;
  } catch { return false; }
}

/** 提交**点名的那几个文件**。`null` = 没什么可提交的（或者 git 用不了）。
 *
 *  ⚠️ **只 add 点名的文件，绝不 `add -A`** —— 这是用户 2026-09-28 问
 *  「如果项目根目录已经有了 git 该如何处理」时点出来的那个问题。
 *  `add -A` 在一个**用户正在工作**的仓库里是破坏性的：他可能正改着十个文件
 *  准备一起提交，而我们落盘一次就把那十个未完成的改动全提交了 ——
 *  提交消息还写着「写入 X.dc.html v3」，完全描述不了那十个文件，
 *  他的工作流被打乱，而且这种提交很难拆开。
 *
 *  只提交我们自己碰的那一个文件，上面那些情况**一次全消掉**：
 *  已有历史、有 remote、工作区脏着、有 pre-commit hook，都不再是问题。
 *
 *  ⚠️ **不带 `--author`、不改 user.name/email** —— 用哪个身份提交是用户仓库的事。
 *  `--no-verify` 是有意的：我们提交的是单个文件的机械改动，不该被他的 lint hook 拦下来
 *  （拦下来的后果是「工具落盘成功但版本没记上」，而用户什么都看不到）。 */
export async function commitPaths(dir: string, paths: string[], message: string): Promise<string | null> {
  if (OFF || !paths.length) return null;
  try {
    /* ⚠️ **不是我们建的仓库就什么都不做**（issue #40）。
       在别人给的项目里自动跑 `git add` / `git commit` 等于让那个仓库的配置
       在我们的进程里执行任意命令。想要这份兜底的话，在那个仓库里
       `git config umbrastudio.managed true` 显式打开。 */
    if (!(await isOurs(dir))) return null;
    if (await inMiddleOfSomething(dir)) return null;
    /* `--` 之后才是路径 —— 不加的话 `-` 开头或与分支同名的文件会被当成 ref */
    await exec(["add", "--", ...paths], dir);
    /* ⚠️ `git commit -- <paths>` 只提交这几个路径，**忽略其它已暂存的东西** ——
       用户自己 `git add` 过的别的文件因此不会被我们带进这个提交。 */
    await exec(["commit", "-m", message, "--no-verify", "--", ...paths], dir);
    return (await exec(["rev-parse", "--short", "HEAD"], dir)).trim();
  } catch { return null; }
}

/** 这个文件的 git 兜底到底在不在（M10-2b，设计侧第十三轮要那句话）。
 *
 *  三态，因为**后两种对用户的后果一样（没有兜底）而出路不同**：
 *  - `on`      有 git，这个文件也没被忽略 —— 什么都不用说
 *  - `ignored` 有 git，但这个文件被 `.gitignore` 忽略了 —— 他可以去改 `.gitignore`
 *  - `off`     这个目录没在用 git 记版本 —— 他可以 `git init`（正常情况下 `ensureRepo`
 *              会自动 init，所以这一种少见；`UMBRASTUDIO_NO_GIT=1` 或者没装 git 时会出现）
 *  - `broken`  有 git，但**现在提交不了**：`index.lock` 残留，或者正在 merge / rebase。
 *              ⚠️ 这一态是 2026-09-30 在用户自己的项目上实测抓到的，不是想出来的 ——
 *              他那个仓库 24 份快照、0 个 git 提交，根因就是一个残留的 `index.lock`，
 *              而**我们从来没说过一个字**。他能做的事很具体（删掉那个锁文件），
 *              所以这一态值得和 `off` 分开。
 *
 *  ⚠️ **快照不受这件事影响**（它在 `.umbrastudio/snapshots/` 里），
 *  所以界面的口气是「少了一道兜底」而不是报错 —— 这是设计侧定的。
 *  失效的只是「别人在别的编辑器里改的那一版」这条兜底（§126.1 实测过）。 */
export type GitFallback = "on" | "ignored" | "off" | "broken";

export async function gitFallbackOf(dir: string, file: string): Promise<GitFallback> {
  if (OFF) return "off";
  try {
    if (!existsSync(join(dir, ".git"))) return "off";
    /* ⚠️ **「有 .git」不等于「现在真能提交」**（2026-09-30 在用户自己的项目上实测抓到）。
       他那个项目 `.git/index.lock` 残留着（某次 git 操作被中断留下的），
       于是每一次 `git add` 都失败 → `commitPaths` 的 `catch` 吃掉 → 返回 null →
       **24 次落盘、0 个 git 提交，而界面一个字都没说。**

       而这个函数的第一版**照样回 `on`** —— 它只看 `.git` 在不在、文件有没有被忽略。
       那是在拿一个看起来合理的检查冒充答案：**要回答的是「兜底在不在」，
       不是「git 目录在不在」。** 所以这里真的去问一句能不能提交。 */
    if (existsSync(join(dir, ".git", "index.lock"))) return "broken";
    if (await inMiddleOfSomething(dir)) return "broken";
    /* `check-ignore` 的退出码就是答案：0 = 被忽略，1 = 没被忽略。
       ⚠️ 用它而不是 `status --porcelain` —— 后者对被忽略的文件**什么都不输出**，
       和「干净」长得一模一样，正是 §126.1 那个洞的成因。 */
    await exec(["check-ignore", "-q", "--", file], dir);
    return "ignored";
  } catch (e) {
    /* 退出码 1 = 没被忽略（正常）；别的退出码 = 仓库有问题，当没有兜底更诚实 */
    const code = (e as { code?: number }).code;
    return code === 1 ? "on" : "off";
  }
}

/** 落盘之后记一版。消息形状：`写入 <文件> v3 · 一句摘要`。 */
export function commitAfterWrite(dir: string, file: string, version: string | null, summary?: string | null): Promise<string | null> {
  return serial(dir, async () => {
    if (!(await ensureRepo(dir))) return null;
    const head = [`写入 ${file}`, version ?? null].filter(Boolean).join(" ");
    return commitPaths(dir, [file], summary ? `${head} · ${summary}` : head);
  });
}

/** ⚠️ **落盘之前**叫一次：工作区脏 = 有人在别处改过，先把那一版留下来。
 *
 *  这是这个模块存在的理由。**顺序不能换** —— 先落盘再提交的话，
 *  别人那一版已经被我们覆盖了，git 里也就没有它。
 *  返回提交号 = 真的救下了一版（调用方可以据此提醒用户）。 */
export function commitExternalChanges(dir: string, file: string): Promise<string | null> {
  return serial(dir, async () => {
    if (!(await ensureRepo(dir))) return null;
    /* ⚠️ **只看我们要覆盖的那一个文件**。语义也更清楚：
       「我要覆盖 X，先把 X 现在的样子存一版」——
       而不是「工作区脏了，把用户手上的活儿一起提交掉」。 */
    if (!(await isDirty(dir, file))) return null;
    return commitPaths(dir, [file], `${file} 在别处被改过（工具在落盘前先记一版）`);
  });
}
