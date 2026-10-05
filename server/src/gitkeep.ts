import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { STATE_ROOT } from "./project.js";

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

/** 关掉自动提交的逃生门。**留一个**：这件事会起 git 子进程、往 `STATE_ROOT`
 *  里写一份历史（#74 之前是往**用户的仓库**里写，这句注释也是那时候的），
 *  出了任何意料之外的情况要能一秒关掉，而不是等我们改代码发版。
 *  ⚠️ 跑 `uitest` 一律 `UMBRASTUDIO_NO_GIT=1`（CLAUDE.md §7 那张表）。 */
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
/** 这个项目的 git 仓库放在**我们自己的状态目录**里（issue #74，2026-10-05）。
 *
 *  ### 为什么要搬出去 —— 前一版那两道闸实测都能绕过
 *  #40 的修法是「HARDEN 黑名单 + `umbrastudio.managed` 标记」，而两道都不成立：
 *
 *  | 闸 | 怎么绕过 | 实测读数 |
 *  | --- | --- | --- |
 *  | `umbrastudio.managed` 标记 | 它读的是**仓库自己的 `.git/config`** —— 而那是**攻击者可控的文件** | `isOurs` 读到 `true` |
 *  | HARDEN 五项黑名单 | 漏了 `filter.<任意名>.clean`（`git add` 必跑）和 `commit.gpgSign` + `gpg.program`（`git commit` 必跑） | `PWNED_FILTER` 真的出现了 |
 *
 *  ⚠️ **黑名单在这里原理上不可能完备**：`filter.<名字>.clean` 的名字由对方取，
 *  而 `-c` 只能覆盖**已知**名字。我实测过所有环境开关
 *  （`GIT_CONFIG_NOSYSTEM` / `GIT_CONFIG_GLOBAL` / `core.attributesFile`）——
 *  **没有任何一个能屏蔽仓库自己的 `.git/config`**。
 *
 *  ⚠️ 而「把信任标记存在被信任方可以改的地方，等于没有标记」。
 *
 *  ### 换的这条路
 *  `GIT_DIR` 指到 `STATE_ROOT/.umbrastudio/git/<项目目录的哈希>`，
 *  `GIT_WORK_TREE` 指到项目 —— 于是 git 读的 config 是**我们自己那份**，
 *  对方的 `.git/config` 根本不在链路上。实测：
 *  filter 没跑 · gpg 没跑 · 提交成功（在我们的 GIT_DIR 里）·
 *  **对方仓库 0 个提交（一点没动）**。
 *
 *  三个顺带的好处：
 *  - 用户自己的 git 历史**我们再也碰不到**（#40 担心的「卷入他的改动」彻底消失）；
 *  - 他有没有 `.git/`、在不在 rebase 中、有没有 hook，都和我们无关了；
 *  - `umbrastudio.managed` 这道闸可以去掉 —— **不需要信任判断了**，
 *    因为我们不再在他的仓库上操作。
 *
 *  ⚠️ 代价要说清：这份历史**在 `STATE_ROOT` 里，不在项目目录里** ——
 *  项目拷到别的机器不会带着它。而 M9-7 要的是「补快照看不见的盲区」，
 *  那是**本机**的事，所以这个代价是可接受的；换来的是「打开别人的项目是安全的」。
 */
function gitDirOf(dir: string): string {
  const key = createHash("sha256").update(resolve(dir)).digest("hex").slice(0, 16);
  const base = (resolve(dir).split(sep).pop() || "proj").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 40);
  return join(STATE_ROOT, ".umbrastudio", "git", `${base}__${key}`);
}

/** 只给判据用：算出某个项目对应的 GIT_DIR。
 *  ⚠️ 判据**必须调这个函数**，不能自己复刻那段哈希 ——
 *  复刻的话算法一改判据就指到一个不存在的目录，而 `rm -rf` 不存在的路径不报错
 *  （§134.6 那条「判据要拼实现的路径，必须调实现那个函数」）。 */
export const gitDirForTest = (dir: string): string => gitDirOf(dir);

/** ⚠️ **HARDEN 留着，但它不再是主闸。**
 *  主闸是「不读对方的 config」（见 `gitDirOf`）。这几项现在的作用是
 *  **万一哪天有人把 `GIT_DIR` 改回项目里**，还有一层兜着 ——
 *  和 #24 那个网络封堵桩同样的定位：**防呆不是边界**。 */
const HARDEN = [
  "-c", "core.fsmonitor=false",
  "-c", "core.hooksPath=/dev/null",
  "-c", "core.pager=cat",
  "-c", "core.sshCommand=/usr/bin/false",
  "-c", "protocol.ext.allow=never",
];

/** 不带 `GIT_DIR` / `GIT_WORK_TREE` 的那一种 —— 只给 `init --bare <目标>` 用。
 *  ⚠️ `init` 的目标是参数给的，这时候再设 `GIT_DIR` 会让它去初始化**那一个**，
 *  而我们要初始化的恰好就是它 —— 冲突。 */
const execRaw = (args: string[]): Promise<string> =>
  new Promise((res, rej) => {
    const env: Record<string, string | undefined> = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
    for (const k of Object.keys(env)) {
      if (/^GIT_(DIR|WORK_TREE|INDEX_FILE)$/.test(k)) delete env[k];
    }
    execFile("git", [...HARDEN, ...args], { env, maxBuffer: 4 * 1024 * 1024 }, (e, out) => (e ? rej(e) : res(out)));
  });

const exec = (args: string[], cwd: string): Promise<string> =>
  new Promise((res, rej) => {
    /* ⚠️ 继承来的 `GIT_*` 也要清掉 —— `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE`
       会让我们在**另一个仓库**上操作，而 `cwd` 看起来是对的。
       `GIT_CONFIG_NOSYSTEM=1` 把 `/etc/gitconfig` 挡在外面。 */
    const env: Record<string, string | undefined> = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
    /* 先把继承来的 `GIT_*` 全清掉 —— 它们会让我们在**另一个仓库**上操作，
       而 `cwd` 看起来是对的。 */
    for (const k of Object.keys(env)) {
      if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|CONFIG_GLOBAL|CONFIG_SYSTEM|EXTERNAL_DIFF|PAGER|SSH_COMMAND|PROXY_COMMAND|ASKPASS|EDITOR|SEQUENCE_EDITOR|ATTR_FILE|CEILING_DIRECTORIES|COMMON_DIR|NAMESPACE|ALLOW_PROTOCOL)$/.test(k)) delete env[k];
    }
    /* ⚠️ **然后指到我们自己那一份**（issue #74）——
       这是真正的那道闸：git 读的 config 是我们的，对方的 `.git/config`
       根本不在链路上。`GIT_CONFIG_GLOBAL=/dev/null` 顺带把用户的
       `~/.gitconfig` 也挡掉（他的 `filter` / `gpg` 配置不该影响我们的兜底提交）。 */
    env.GIT_DIR = gitDirOf(cwd);
    env.GIT_WORK_TREE = resolve(cwd);
    env.GIT_CONFIG_GLOBAL = "/dev/null";
    execFile("git", [...HARDEN, ...args], { cwd, env, maxBuffer: 16 * 1024 * 1024 }, (e, out) => (e ? rej(e) : res(out)));
  });

/* ⚠️ **`isOurs` 删掉了**（issue #74，2026-10-05）。
   它读的是**仓库自己的 `.git/config`** —— 而那是攻击者可控的文件，
   实测对方自写一行 `[umbrastudio] managed = true` 就让它放行了。
   **把信任标记存在被信任方可以改的地方，等于没有标记。**

   而现在不需要这个判断了：`GIT_DIR` 指到我们自己的状态目录，
   我们**根本不在他的仓库上操作** —— 没有「信不信这个仓库」这回事。
   他有没有 `.git/`、在不在 rebase 中、有没有 hook，都和我们无关。
   （`umbrastudio.managed` 那个开关也随之作废，不用再让用户手动打开。） */

/** 这个目录的兜底仓库在不在（#87：`p.gitEnabled` 原来看的是**项目里**那个 `.git`，
 *  而 #74 之后我们提交到的是 `STATE_ROOT`，两个是不同的东西）。
 *  ⚠️ **不起进程、不写盘** —— 它在 `loadProject` 这种热路径上。 */
export function hasRepo(dir: string): boolean {
  return existsSync(join(gitDirOf(dir), "HEAD"));
}

/** 兜底仓库当前的 HEAD（短 sha）。没有仓库或还没有提交就回 `null`。 */
export async function gitHeadOf(dir: string): Promise<string | null> {
  if (OFF || !hasRepo(dir)) return null;
  try { return (await exec(["rev-parse", "--short", "HEAD"], dir)).trim() || null; }
  catch { return null; }
}

/* ── 按 git ref 取一份稿的原文（issue #86 + #87，2026-10-06）──

   ⚠️ **两条缺陷在同一行代码上**，而它们是相反的方向：

   #86（**ref 当成选项**）：`history.ts` 原来是
     `execFile("git", ["-C", p.dir, "show", `${ref}:${relPath}`])`，
   `ref` 是 `z.string()` 从 MCP / HTTP / AI 工具原样进来的。
   以 `-` 开头时 git 把它当**选项**，而 `git show` 吃 diff 选项：
     version = "--output=/任意目录/O"
       → 真的在那儿建了一个 `/任意目录/O:<稿路径>` 文件（实测 rc=0）
   更重的是这条命令因为没给对象而去展示 HEAD 的 diff，**diff 默认启用 textconv** ——
   仓库 `.git/config` 里的 `diff.x.textconv` 于是**真的被执行**（实测标记文件出现）。
   那正是 #40 / #74 那一族（「打开别人给的项目 = 执行它指定的命令」），
   而**这条路从来不在 gitkeep 的加固范围里** ——
   #74 把兜底搬走之后，它成了唯一还在用户仓库上跑 git 的入口。

   #87（**读错了仓库**）：#74 把提交搬到 `STATE_ROOT` 之后，
   `write.ts` 的 steps 里报的 `先记下了别处改的内容（git abc123）` 是**兜底仓库**的 sha，
   而 `resolveSnapshot` 去**项目里的 `.git`** 找它 —— 永远取不到。
   **工具告诉用户「你在别处改的那一版没丢」，却没有任何入口能拿到它。**

   修法：ref 先过形状闸、再 `rev-parse --verify --end-of-options` 解成 40 位 sha
   （**不是拼字符串给 show，而是先把它变成一个对象名**），
   然后在**兜底仓库**上 `show`，并显式 `--no-textconv --no-ext-diff`。 */

/** ref 的形状：git 自己允许的字符集，且**不许以 `-` 开头**（那就是选项了）。 */
const REF_SHAPE = /^[A-Za-z0-9._/~^@{}-]{1,200}$/;

export function refProblem(ref: string): string | null {
  if (!ref) return "空的";
  if (ref.startsWith("-")) return "不能以 `-` 开头（那会被 git 当成选项）";
  if (!REF_SHAPE.test(ref)) return "只能用字母、数字和 `._/~^@{}-`";
  return null;
}

/** 在兜底仓库里按 ref 取一份文件的原文。ref 不合法或取不到都抛。 */
export async function gitShow(dir: string, ref: string, relPath: string): Promise<string> {
  const bad = refProblem(ref);
  if (bad) throw new Error(`版本号不合法：${bad}`);
  if (!hasRepo(dir)) throw new Error("这个目录还没有兜底仓库");
  /* `--end-of-options` 之后 git 不再把参数当选项 —— **两道闸**：
     形状那道按我想到的写，这道不依赖我想得全不全。 */
  const sha = (await exec(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], dir)).trim();
  if (!/^[0-9a-f]{7,64}$/.test(sha)) throw new Error(`解不出这个版本：${ref}`);
  /* ⚠️ `--no-textconv` / `--no-ext-diff` 显式写上 —— 现在 config 读的是我们自己那份
     （所以本来就没有 textconv 可读），但**这一行是防呆**：
     万一哪天 `GIT_DIR` 被改回项目里，少了它就又能执行对方指定的命令。 */
  return await exec(["show", "--no-textconv", "--no-ext-diff", `${sha}:${relPath}`], dir);
}

/** 这个目录能不能用 git 记版本。`false` = 没装 git，或者 init 失败。 */
export async function ensureRepo(dir: string): Promise<boolean> {
  if (OFF) return false;
  try {
    const gd = gitDirOf(dir);
    if (existsSync(join(gd, "HEAD"))) return true;        // 已经建过
    await mkdir(gd, { recursive: true });
    /* ⚠️ **`init --bare` 建在我们自己的目录里，不碰项目里的 `.git`**（issue #74）。
       `--bare` 是因为工作区由 `GIT_WORK_TREE` 指定 —— 这个 GIT_DIR 自己不需要工作区。
       ⚠️ 用户项目里有没有 `.git/` 我们不再关心，也不再往里写任何东西。 */
    await execRaw(["init", "-q", "--bare", gd]);
    /* 排除我们自己的状态目录 —— 不排的话第一次提交会把 `.umbrastudio/` 整个提进去，
       里面有快照、会话、以及 **`ai_config.json`（含明文 key）**。
       **这一条是安全问题，不是整洁问题。**
       ⚠️ 写在 `<GIT_DIR>/info/exclude` 而不是项目里的 `.gitignore` ——
       **不往用户的项目里塞文件**（原来那份 `.gitignore` 是我们建的，现在不需要了）。 */
    await mkdir(join(gd, "info"), { recursive: true });
    await writeFile(join(gd, "info", "exclude"), [
      "# Umbra Studio 的版本兜底：这几样不记",
      ".umbrastudio/", ".umbradesign/", "node_modules/", ".DS_Store", "",
    ].join("\n"), "utf8");
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
 *  ⚠️ 身份是**我们自己的**（`-c user.name=Umbra Studio`）—— 这句话原来写的是
 *  「不带 `--author`、不改 user.name/email，用哪个身份提交是用户仓库的事」，
 *  那是 #74 **之前**的做法（当时提交进的是用户的仓库）。#74 把仓库搬到
 *  `STATE_ROOT` 之后身份就该是我们的，而**注释没跟着改**。
 *  （上面第 33 行那条教训「注释也会变成说谎的状态列」—— 同一天又犯了一次，
 *  这一次是由 issue #87 的审查指出来的。）
 *  `--no-verify` 是有意的：我们提交的是单个文件的机械改动，不该被他的 lint hook 拦下来
 *  （拦下来的后果是「工具落盘成功但版本没记上」，而用户什么都看不到）。 */
export async function commitPaths(dir: string, paths: string[], message: string): Promise<string | null> {
  if (OFF || !paths.length) return null;
  try {
    /* ⚠️ 原来这里有一道 `isOurs(dir)` —— 已删（issue #74）：
       它读对方可控的 `.git/config`，等于没有。现在 `GIT_DIR` 是我们自己的，
       **不存在「这是谁的仓库」这个问题**。
       ⚠️ 顺带：`inMiddleOfSomething` 现在查的也是**我们自己**那个 GIT_DIR ——
       用户在他的仓库里 rebase 不再影响我们（原来那是个真实的顾虑）。 */
    if (!(await ensureRepo(dir))) return null;
    if (await inMiddleOfSomething(dir)) return null;
    /* 身份：我们自己提交，用一个明确的作者名 —— `GIT_CONFIG_GLOBAL=/dev/null`
       之后 git 不认识任何 user.name，不给就会报 "Author identity unknown"。
       ⚠️ 不用用户的身份 —— 这不是他写的提交，是工具的兜底记录。 */
    const ident = ["-c", "user.name=Umbra Studio", "-c", "user.email=umbra@localhost"];
    /* `--` 之后才是路径 —— 不加的话 `-` 开头或与分支同名的文件会被当成 ref */
    await exec(["add", "--", ...paths], dir);
    /* ⚠️ `git commit -- <paths>` 只提交这几个路径，**忽略其它已暂存的东西**。
       （在我们自己的 GIT_DIR 里，索引也是我们自己的，所以这一条现在更像是保险。） */
    await exec([...ident, "commit", "-m", message, "--no-verify", "--", ...paths], dir);
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
    /* ⚠️ **查我们自己那个 GIT_DIR，不是项目里的 `.git`**（issue #74，2026-10-05）。
       仓库搬到状态目录之后，「项目里有没有 `.git`」和「兜底在不在」**彻底无关了** ——
       用户有他自己的 git（我们不碰），我们有我们的。 */
    const gd = gitDirOf(dir);
    if (!existsSync(join(gd, "HEAD"))) return "off";
    /* ⚠️ **「有 .git」不等于「现在真能提交」**（2026-09-30 在用户自己的项目上实测抓到）。
       他那个项目 `.git/index.lock` 残留着（某次 git 操作被中断留下的），
       于是每一次 `git add` 都失败 → `commitPaths` 的 `catch` 吃掉 → 返回 null →
       **24 次落盘、0 个 git 提交，而界面一个字都没说。**

       而这个函数的第一版**照样回 `on`** —— 它只看 `.git` 在不在、文件有没有被忽略。
       那是在拿一个看起来合理的检查冒充答案：**要回答的是「兜底在不在」，
       不是「git 目录在不在」。** 所以这里真的去问一句能不能提交。 */
    if (existsSync(join(gd, "index.lock"))) return "broken";
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
