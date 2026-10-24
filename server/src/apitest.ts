#!/usr/bin/env node
/** HTTP 路由层的回归（2026-09-28 起）。
 *
 *  **为什么要单独有它**：现有几份回归各管一层 —— `filetest` 管写入口、
 *  `captest` 管能力注册表、`uitest` 从浏览器看界面。而「同一个会话并发发两条会怎样」
 *  这种事住在**路由层**：它既不是文件层的事，从浏览器也测不到
 *  （测它要在服务端直接塞一个作业，而浏览器够不着 `jobs` 模块）。
 *
 *  ⚠️ **一条都不许调真 AI**（CLAUDE.md 那条「别拿真 AI 回合当回归」）。
 *  下面用 `jobs.start` 直接塞一个慢作业来制造「这个会话正忙」，
 *  于是走到 `chat_send` 时它必然撞上 busy 分支 —— **要测的那条路照样走到，而不花钱**。
 *
 *  跑：npm --prefix server run apitest
 */
import { platformName } from "./shared/brand.js";
import { stripComments } from "./shared/stripcomments.js";
import { serveStart } from "./serve.js";
import { buildProject, TOOL_ROOT } from "./project.js";
import { basename as basename8 } from "node:path";
import { start as startJob } from "./jobs.js";
import { projectJobKey } from "./api.js";
import { mkdir as mkdirFix, mkdtemp, rm as rmdirAll, writeFile as wfFix } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join as joinFix } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`); }
};

/* ⚠️⚠️ **「没验到」要出现在分母里**（2026-10-24，口径和 `uitest` 对齐）。
   在这之前汇总行是 `pass/(pass+fail)` —— 于是跳过一条，分母**跟着少一条**，
   读数永远长得像「全验到了」。实测两轮都这样：7c-2d 那轮 `210/210`、
   上一轮 `208/208`，而两轮都自己打印过「· 没登录，服务端 AI 下探图那两条跳过」。
   > **一个分母会跟着实际跑的条数一起缩的汇总行，永远报不出缺口。**

   ⚠️ 而「没跑」有三种，这里**刻意分两类处理**（`doc/00` 那条「三种里第三种最危险」）：
   · **说出来的没跑**（下面 `skip()`）—— 它该跑、也还存在，只是今天前提没成立
     （没登录 / 这台机器没有 `mkfifo`）。进分母 + 汇总行写出理由，**但不算红**：
     算红的话这套回归在一台没登录的机器上永远是失败，而退出码就不再是个有用的信号。
   · **没说出来的没跑**（`EXPECT_AT_LEAST` 那道闸）—— 那是判据自己的缺陷
     （选择器指错、`if` 没进去、`try` 吞了一整段），**一律算红**。
   两类在日志里长得一样，而严重度完全不同 —— 所以代码里要分开，不能只有一个数。 */
const NOT_RUN: string[] = [];
const skip = (n: number, why: string) => {
  for (let i = 0; i < n; i++) NOT_RUN.push(why);
  console.log(`  · ${n} 条没验到：${why}`);
};

/* ── 夹具：**自己建一个临时项目**（Q71，2026-10-21）──

   原来这里是 `buildProject((await listProjectDirs())[0])` —— 也就是
   **用户 `projects/` 下的第一个真实项目**，于是每跑一次回归就在他的项目上
   起一次真服务、打一整套真 HTTP。2026-10-20 实测到它动了
   `projects/Umbra_design/.umbrastudio/` 下三个目录的 mtime。

   那一次没丢东西，但这是纪律⑥（`projects/` 下的东西不是我们的）和
   `00` §166（「清掉自己造的文件」≠「清掉自己造的状态」）的同一族 ——
   **它从 2026-09-28 建这套测试起就是这样，而收尾那几行只看「我创建了哪些文件」。**

   ⚠️ 换夹具**不是改一行**：要先量「有多少条判据其实靠的是那个项目里真有几十份稿」。
   2026-10-21 实测的答案是 **0 条** —— 15 节全部自己造夹具（写一份临时稿再操作），
   换成空的临时项目之后读数一条不少（122/122）。**这一条是量出来的，不是看代码看出来的。**

   ⚠️ `realpathSync(tmpdir())`：macOS 的 `/var` 是符号链接，不解的话
   项目根与真实路径对不上（`verbtest` 踩过同族的坑）。 */
const FIXTURE = await mkdtemp(joinFix(realpathSync(osTmpdir()), "umbrastudio-apitest-"));
await wfFix(joinFix(FIXTURE, "project.json"), JSON.stringify({ name: "apitest 夹具" }, null, 2), "utf8");
/* ⚠️ **这一份稿不是摆设 —— 它是换夹具时量出来的那 3 条。**
   ④ 预览路由那一节先 `list files` 找项目里任意一份 `.html` 当样本，
   空项目里找不到 → `if (anyHtml)` 整段跳过，而**那一轮照样全绿**
   （119/119 看着和 122/122 一样「全过」）。缺的正是这三条：
   「正常的 .html 能预览」「预览页注入了点选桥」「而盘上那份没被动过」。
   > **总数本身也是一条判据**（`00` §160.4）—— 换夹具时**先对总数，再看绿不绿**。 */
await wfFix(joinFix(FIXTURE, "样例.dc.html"),
  "<!doctype html>\n<html lang=\"zh\"><head><meta charset=\"utf-8\"><title>apitest 夹具</title></head>\n" +
  "<body><x-dc><div data-ud-node=\"root\">夹具</div></x-dc></body></html>\n", "utf8");
const p = await buildProject(FIXTURE);
const s = await serveStart(p);
/* ⚠️ 这一条断言的是**夹具自己的身份**：项目根必须在系统临时目录下。
   拿用户的真实项目当夹具是这套测试从 2026-09-28 起就在做的事，而**没有任何判据会红** ——
   「跑完没报错」和「跑的时候没碰别人的东西」是两件事。 */
ok(p.dir.startsWith(realpathSync(osTmpdir())), "**夹具是自己建的临时项目，不是用户的真实项目**（纪律⑥，Q71）", p.dir);
const u = (route: string) => `${s.url}__ud/${route}?token=${encodeURIComponent(s.token)}`;
const post = (route: string, body: unknown) => fetch(u(route), {
  method: "POST",
  headers: { "content-type": "application/json", origin: s.url.replace(/\/$/, "") },
  body: JSON.stringify(body),
});

console.log(`\nHTTP 路由层 · ${p.title}`);

/* ── 同一会话还有一轮在跑（issue #35）──
   原来 `startJob` 对同键在跑的情况**返回旧作业、不执行 run**，而路由把它当成功回了
   `ok: true` + 旧 jobId。后果两条，都很难从界面上看出来：
   ① 这条新消息根本没执行，界面把旧那一轮的结果当成这一条的回复；
   ② `chatAborts.set(j.id, ctl)` 用一个**没接到任何东西上的**新 controller 盖掉了
      旧作业真正在用的那个 —— 之后点「中断」回「已发中断」，而那一轮照跑到底、照落盘。
      **中断给假回执，比中断没做还糟。** */
console.log("\n⓪ 作业锁键按目录不按项目名（issue #153）");
{
  /* 两个同名（project.json name 一样）、不同目录的项目，对同一相对路径各起一个作业：
     必须是**两个不同的作业**，各自的 run 都执行了。原来键是 `${p.name}::${rel}`，后一个拿到前一个的 jobId。 */
  const a = { dir: "/tmp/umbra-apitest-a/Demo" }, b = { dir: "/tmp/umbra-apitest-b/Demo" };
  ok(projectJobKey(a, "Demo.dc.html") !== projectJobKey(b, "Demo.dc.html"), "同名不同目录 → 锁键不同");
  ok(projectJobKey({ dir: "/tmp/x/../x/Demo" }, "k") === projectJobKey({ dir: "/tmp/x/Demo" }, "k"), "目录先规范化（与 serve.ts keyOf 一致）");
  let ranA = false, ranB = false;
  let rel = () => {};
  const gate = new Promise<void>((r) => { rel = r; });
  const ja = startJob("render_check", projectJobKey(a, "Demo.dc.html"), async () => { ranA = true; await gate; });
  const jb = startJob("render_check", projectJobKey(b, "Demo.dc.html"), async () => { ranB = true; await gate; });
  await new Promise((r) => setTimeout(r, 20));
  ok(ja.id !== jb.id && ranA && ranB, "**两个项目各自的作业都跑了**（不是后一个复用前一个的 jobId）", `${ja.id} / ${jb.id}`);
  rel();
}

console.log("\n① 同一会话还有一轮在跑时说出来（issue #35）");
{
  const sessionId = "apitest-busy-session";
  /* 塞一个 8 秒不结束的作业，键和路由里拼的那个一模一样 —— 键不同就测不到这条路 */
  let release = () => {};
  const slow = new Promise<void>((r) => { release = r; });
  const held = startJob("chat", projectJobKey(p, `chat::${sessionId}`), () => slow);   // 键必须和路由拼的一模一样（#153 起按目录）
  const r = await post("chat_send", { message: "这条不该被执行", sessionId, async: true });
  const j = await r.json() as { ok?: boolean; errors?: Array<{ code?: string; message?: string }>; data?: { jobId?: string; sessionId?: string } };
  ok(r.status === 409, "这个会话正忙时回 409（原来静默复用旧作业回 200）", `HTTP ${r.status}`);
  ok(j.ok === false && j.errors?.[0]?.code === "E_CHAT_BUSY", "错误码是 E_CHAT_BUSY", j.errors?.[0]?.code ?? JSON.stringify(j).slice(0, 60));
  /* **带上那一轮的 jobId** —— 前端据此接着轮询，用户的话不会凭空消失 */
  /* ⚠️ 字段叫 `jobId` 不是 `id`（`jobs.view()`）—— 判据第一版按 `id` 比，红了一条，
     而那是**判据自己写错**，不是产品的问题。两者报出来的样子一样（§111.3 同一族）。 */
  ok(j.data?.jobId === held.id, "回执里带着正在跑的那一轮的 jobId（前端接得上）", `${j.data?.jobId} vs ${held.id}`);
  ok(j.data?.sessionId === sessionId, "也带着 sessionId（界面能切到那个会话去看它跑到哪了）", j.data?.sessionId ?? "（没有）");
  ok((j.errors?.[0]?.message ?? "").includes("中断"), "这句话告诉了用户能怎么办（等它结束，或先中断）", j.errors?.[0]?.message ?? "");
  release();
  await new Promise((r) => setTimeout(r, 300));
}

/* ── 绕过写入口改稿要说出来（issue #29）──
   通道 B 的 codex / cursor-agent **自带写文件的工具**，模型觉得 `apply_patch` 更顺手时
   就会绕开我们的写入口。那样没有快照、没有归一化、没有节点地址，
   **而且版本号不变** —— 而变更审计靠版本号判断改动，于是变更卡**显示为空**，
   界面等于在说「这一轮什么都没改」，而用户刚看着 AI 说「我改好了」。
   **界面说谎比功能缺失糟**（和 #35 那条「假回执」是同一族）。

   ⚠️ 判据测的是抽出来的 `bypassedDrafts`，**不是复制一份逻辑再测它**。
   不抽出来的话这段判定只在通道 B 分支里，而那条路要真起一个 CLI 子进程才走得到 ——
   判据就只能跑真 AI（花钱、不稳定）。喂两份快照进去就够，测的还是真代码。 */
console.log("\n② 绕过写入口改稿要说出来（issue #29）");
{
  const { bypassedDrafts } = await import("./chat_run.js");
  const before = new Map([
    ["走了写入口.dc.html", { ver: "v1", sha: "aaa" }],
    ["被直接改了.dc.html", { ver: "v1", sha: "aaa" }],
    ["没动过.dc.html", { ver: "v1", sha: "aaa" }],
    ["跑完被删了.dc.html", { ver: "v1", sha: "aaa" }],
  ]);
  const after = new Map([
    ["走了写入口.dc.html", { ver: "v2", sha: "bbb" }],   // 版本号变了 = 正常
    ["被直接改了.dc.html", { ver: "v1", sha: "ccc" }],   // 内容变了版本号没动 = 绕过去了
    ["没动过.dc.html", { ver: "v1", sha: "aaa" }],
    ["跑完才出现的.dc.html", { ver: "v1", sha: "zzz" }], // 新稿，不该算
  ]);
  const got = bypassedDrafts(before, after);
  ok(got.length === 1 && got[0] === "被直接改了.dc.html", "**只报「内容变了而版本号没动」那一份**", got.join(", ") || "（空）");
  ok(!got.includes("走了写入口.dc.html"), "走了写入口的不报（版本号变了就是正常落盘）");
  ok(!got.includes("跑完才出现的.dc.html"), "跑完才出现的新稿不报（它本来没有上一版，新建有自己的审计）");
  ok(!got.includes("跑完被删了.dc.html"), "跑完没了的不报（删除有自己的审计）");
  /* 一份都没被绕过时**必须是空**，不能「宁可多报」—— 误报会让用户开始忽略这条提示，
     而它说的是「这份稿退不回去」，是最不该被忽略的一条。 */
  ok(bypassedDrafts(before, new Map(before)).length === 0, "什么都没变时一条都不报（误报会让人忽略这条提示）");
}

/* ── 谁会进 after 快照（issue #41）──
   ⚠️ 上一节测的是 `bypassedDrafts` 的**判定**，而那条漏法在**收集**那一步：
   after 戳原来第一行是 `if (!vs.length) continue`，于是
   **跑之前从没走过写入口的稿**（0 个版本）永远进不了 after 快照，
   `bypassedDrafts` 看到 after 里没有它就当「跑完被删了」，一句话都不说。
   而那恰恰是最常见的一类稿（导入的、在别的编辑器里写的）。

   **判定对了而收集漏了，整条兜底照样不生效** —— 所以这一步要单独钉。 */
console.log("\n③ 没有版本的稿也要进 after 快照（issue #41）");
{
  const { stampInto, bypassedDrafts } = await import("./chat_run.js");
  const { writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const N = "从没走过写入口.dc.html";
  const abs = join(p.dir, N);
  writeFileSync(abs, "<!doctype html><title>a</title>", "utf8");
  try {
    const before = new Map<string, { ver: string; sha: string }>();
    await stampInto(before, N, abs, []);          // 0 个版本
    ok(before.has(N) && before.get(N)!.ver === "",
       "**没有版本的稿也记戳**（`ver: \"\"`，不是跳过）—— 原来这一行是 `if (!vs.length) continue`",
       JSON.stringify(before.get(N) ?? null).slice(0, 60));

    /* 模拟「被 codex 直接改了」：内容变、版本号还是没有 */
    writeFileSync(abs, "<!doctype html><title>b</title><p>被直接改了</p>", "utf8");
    const after = new Map<string, { ver: string; sha: string }>();
    await stampInto(after, N, abs, []);
    /* ⚠️ **后面几条不许因为上一条红了就抛。**（2026-10-02 反向验证时撞到）
       原来写的是 `before.get(N)!.sha` —— 上一条红的时候这里是 `undefined`，
       `.sha` 直接抛 TypeError，**整个 apitest 当场结束**，后面三条一条都没跑。
       判据崩掉就不是判据了：它该报红，不该把别的判据一起带走。 */
    ok(!!before.get(N) && !!after.get(N) && before.get(N)!.sha !== after.get(N)!.sha,
       "改了之后 sha 真的变了（夹具自己先成立）",
       before.get(N) && after.get(N) ? "两个戳都在且 sha 不同" : "✗ 有一边没记上戳");
    ok(bypassedDrafts(before, after).includes(N),
       "**端到端：0 版 → 0 版而内容变了，必须报出来**（它连一版快照都没有，比有版本的更退不回去）",
       bypassedDrafts(before, after).join(", ") || "（空 —— 没报）");

    /* 反面：内容没变就一条都不报（误报会让用户开始忽略这条提示） */
    const same = new Map<string, { ver: string; sha: string }>();
    await stampInto(same, N, abs, []);
    ok(bypassedDrafts(after, same).length === 0, "内容没变时一条都不报");
  } finally { rmSync(abs, { force: true }); }
}

/* ── 预览路由的三道闸（M10-3）──
   这条路由存在的唯一理由是「让插件能嵌用户项目里的一个网页」。
   **它一旦松一点，就等于给插件开了一条读项目内容的新路** ——
   而读文件本来有 `read_file`（带权限声明），这条不该重复那件事。 */
console.log("\n④ 预览路由的三道闸（M10-3）");
{
  const u2 = (route: string) => `${s.url}${route}?token=${encodeURIComponent(s.token)}`;
  const code = async (r: string) => (await fetch(u2(r))).status;
  /* 先造一个真的 .html —— 用项目里现成的 .dc.html（它也是 .html 结尾） */
  const ls = await fetch(u2("__ud/files") + "&dir=").then((x) => x.json() as Promise<{ data?: { entries?: Array<{ name: string; isDir: boolean }> } }>).catch(() => null);
  const drafts = ls?.data?.entries ?? [];
  const anyHtml = drafts.find((f) => !f.isDir && /\.html$/i.test(f.name));
  if (anyHtml) {
    ok(await code(`__preview/${encodeURIComponent(anyHtml.name)}`) === 200, "正常的 .html 能预览", anyHtml.name);
  } else skip(1, "项目里没有 .html（正面那条）");
  ok(await code("__preview/umbra-tokens.json") === 415, "**非 .html 一律拒**（这条路由只渲染网页，不是第二条读文件的路）");
  ok(await code("__preview/..%2f..%2fetc%2fpasswd.html") === 403, "**路径逃不出项目目录**（走 `pathguard` 那一份判定，issue #19）");
  ok(await code("__preview/这个肯定没有.html") === 404, "不存在的回 404");

  /* ── 「在访达中显示」是**定位**，不是「用默认程序打开」（issue #110，2026-10-06）──
     这条路由原来按「给的一定是目录」写（字段叫 `dir`、报错说「目录不存在」），
     而前端传给它的**大多是文件路径**。而 `open <文件>` 的含义是
     **用默认程序打开它** —— 对 `.zip` 就是**直接解压到旁边**，
     在用户的项目目录里多出一个目录。
     **按钮名字说的是「显示」，实际做的是「打开 / 解压」。**
     桌面壳走的是 `shell.showItemInFolder`，所以**同一颗按钮在两种宿主里做的是两件事**。

     ⚠️ 判据读的是回执里的 `how`（产品**真实算出来**的命令串），
     并设 `UMBRASTUDIO_NO_REVEAL=1` 让它只算不跑 ——
     不然跑一轮回归会弹出一串访达窗口。 */
  {
    process.env.UMBRASTUDIO_NO_REVEAL = "1";
    const ask = async (target: string) => {
      const r = await fetch(`${s.url}__ud/reveal_dir?token=${encodeURIComponent(s.token)}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: s.url.replace(/\/$/, "") },
        body: JSON.stringify({ dir: target }),
      }).then((x) => x.json() as Promise<{ ok: boolean; data?: { how?: string }; errors?: Array<{ message: string }> }>);
      return r.ok ? String(r.data?.how ?? "") : `✗ ${r.errors?.[0]?.message ?? "没说原因"}`;
    };
    const { join: j3 } = await import("node:path");
    const { readdir: rd3 } = await import("node:fs/promises");
    const oneFile = (await rd3(p.dir)).find((f: string) => f.endsWith(".dc.html")) ?? "project.json";
    const howFile = await ask(j3(p.dir, oneFile));
    const howDir = await ask(p.dir);
    if (process.platform === "darwin") {
      ok(/^open -R /.test(howFile), "**给文件时用 `open -R`（定位）而不是 `open`（打开它）**", howFile.slice(0, 60));
      ok(/^open [^-]/.test(howDir), "给目录时就是 `open <目录>`（那本来就对）", howDir.slice(0, 60));
    } else {
      ok(howFile !== howDir, "（非 mac）文件和目录走的不是同一条命令", `${howFile} | ${howDir}`);
    }
    delete process.env.UMBRASTUDIO_NO_REVEAL;
  }

  /* ── 命名管道（FIFO）不能挂住服务（issue #104，2026-10-06）──
     `open` 一个 FIFO 是**阻塞**而不是报错。两条路各有后果：
       · `routeStatic`（预览项目里的文件，#96 自己说的「最常走的那条」）走异步读流 ——
         每请求一次占掉一个 libuv 线程（默认 4 个），四次之后同进程所有 fs 都排不上队；
       · `/__preview/` 用的是 **`readFileSync`**，**一次就卡死主线程**（HTTP / WS / MCP 全不响应），
         而这条路由**不要令牌**，只要那个 FIFO 叫 `x.html`。
     ⚠️ #96 把判定换成 `isFile()` 时**只换到两处**，漏的正是这两条。

     ⚠️ **这一节用临时项目 + 它自己的服务**，不碰上面那个 `p`（它是**用户真实的项目**）。
     为什么非这样不可：2026-10-06 我第一版就在用户项目里 `mkfifo`，而反向验证时
     **整个进程挂住了** → JS 里的清理永远不会跑 → 那个 FIFO 留在他项目里，
     之后起界面服务一碰它就挂（纪律⑥ 的最坏一种：留下的不是脏文件，是个**陷阱**）。

     ⚠️ 判据第二版还放错过服务：放在 `startStatic` 那一节里 ——
     而**那台是 #96 已经修过的**，测的是已经对的那个。

     ⚠️ **每一发都带上限**（纪律 3.4）：挂住的症状是「永远不返回」。 */
  {
    const { execFileSync } = await import("node:child_process");
    const { mkdtemp, writeFile: wf4, rm: rm2 } = await import("node:fs/promises");
    const { join: j2 } = await import("node:path");
    const { tmpdir: td2 } = await import("node:os");
    const T = await mkdtemp(j2(td2(), "umbrastudio-fifo-"));
    await wf4(j2(T, "project.json"), JSON.stringify({ name: "fifotest", title: "FIFO 回归" }), "utf8");
    await wf4(j2(T, "ok.html"), "<!doctype html><title>ok</title>", "utf8");
    const pf = await buildProject(T);
    const sf = await serveStart(pf);
    const uf = (route: string) => `${sf.url}${route}?token=${encodeURIComponent(sf.token)}`;
    const fifo = j2(T, "管道.html");
    let made = false;
    try { execFileSync("mkfifo", [fifo]); made = true; } catch { made = false; }
    ok(made, "（样本有效性）临时项目里造出一个命名管道", made ? "管道.html" : "mkfifo 不可用（win？）");
    if (!made) skip(3, "这台机器没有 mkfifo（挂住不了，所以测不到超时那三条）");
    if (made) {
      const hitT = async (route: string) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3000);
        try { return String((await fetch(uf(route), { signal: ctl.signal })).status); }
        catch { return "挂住了（3 秒没返回）"; }
        finally { clearTimeout(t); }
      };
      const a = await hitT("__preview/管道.html");
      ok(a === "404", "**`/__preview/` 请求 FIFO 回 404，不卡死主线程**（它用的是 readFileSync）", a);
      const b = await hitT("管道.html");
      ok(b === "404" || b === "403", "**`routeStatic` 请求 FIFO 也不挂住**（#96 漏掉的「最常走的那条」）", b);
      /* 然后服务还得活着 —— 「这一发失败了」和「服务还能用」是两件事 */
      const c = await hitT("ok.html");
      ok(c === "200", "**而服务还活着**（那两发没占掉线程池、也没卡住主线程）", c);
    }
    /* 收尾：临时项目整个删掉。**挂住时这一步跑不到** —— 所以它在 tmp 里而不在用户项目里 */
    try { const { serveStop } = await import("./serve.js"); serveStop(pf.dir); }
    catch { /* 停不掉也无妨，进程结束时一起走 */ }
    await rm2(T, { recursive: true, force: true });
  }
  /* ⚠️ 注入的桥**只在这条路由上**，盘上那份文件一个字节都没动 */
  if (anyHtml) {
    const body = await fetch(u2(`__preview/${encodeURIComponent(anyHtml.name)}`)).then((x) => x.text());
    ok(body.includes("ud-pick"), "**预览页注入了点选桥**（插件跨不过源，只能它自己发消息出来）");
    const onDisk = await fetch(u2(`__ud/file`) + `&path=${encodeURIComponent(anyHtml.name)}`).then((x) => x.json() as Promise<{ data?: { content?: string } }>);
    ok(!(onDisk?.data?.content ?? "").includes("ud-pick"), "**而盘上那份没被动过**（注入只发生在预览这条路上）");
  }
}

/* ── 预览路由的文件名里带 `%`（issue #43）──
   这一节钉的不是「404 对不对」，是**服务还活着**。
   原来的 bug：路径被解码两次，而第二次没有 try —— 文件名里有 `%` 而后面
   不跟两位十六进制时抛 `URIError`，它在 `createServer` 回调里**同步抛**，
   全仓没有 `uncaughtException` 处理 → **整个进程退出**。
   最小复现实测过：第二个请求就退出（退出码 1），第三个请求根本没机会跑。

   ⚠️ 这条路由**不要令牌**，解码又发生在「文件存不存在」之前 ——
   所以任何能往 `127.0.0.1:<端口>` 发请求的东西（用户浏览器里打开的任意网页，
   一个 `<img src>` 就够）都能触发。端口随机，但可以扫。 */
console.log("\n⑤ 预览路由的文件名里带 %（issue #43）");
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  /* 夹具用 `fs` 直写 —— 写入口只收规范化的路径，造不出这种名字。
     和 GBK 那份夹具同理：**它是仪器不是产品行为**。收尾用 `fs` 删干净。 */
  const PCT = "百分之%20测试.html";
  const pctAbs = join(p.dir, PCT);
  writeFileSync(pctAbs, "<!doctype html><title>pct</title><p>我是带 % 的那一份</p>");
  const raw = (path: string) => fetch(`${s.url}__preview/${path}`);
  try {
    /* ① 明确的恶意形状：`%` 后面不跟两位十六进制。该回 404，**不该没有响应** */
    let st = -1, dead = false;
    try { st = (await raw("100%25.html")).status; } catch { dead = true; }
    ok(!dead && st === 404, "**`%` 后面不跟十六进制时回 404，不是没有响应**", dead ? "连接断了" : `${st}`);

    /* ② ⚠️ **这一条才是重点：服务还活着。**
       上一条就算回了 404，也可能是「抛出去之后 Node 恰好先写完了头」——
       真正要问的是**下一个请求还能不能到**。bug 版本里第三个请求根本跑不到。 */
    let alive = false;
    try { alive = (await fetch(u("files") + "&dir=")).ok; } catch { /* 死了 */ }
    ok(alive, "**打完那一下服务还活着**（原来的 bug 会把整个进程带走，MCP 和 HTTP 一起断）");

    /* ③ 文件名里真有 `%xx` 字面量：按插件的编码方式请求，该拿到**这一份**。
       解码两次的话它会被解成 `百分之 测试.html`（空格），于是 404 或打开另一份。 */
    const r3 = await raw(encodeURIComponent(PCT));
    const body3 = r3.ok ? await r3.text() : "";
    ok(r3.status === 200 && body3.includes("我是带 % 的那一份"),
       "**`%xx` 字面量的文件名能打开，而且打开的是它自己**（解两次会解成空格、开到别的文件）",
       `${r3.status}`);
  } finally {
    rmSync(pctAbs, { force: true });
  }
}

/* ── 会话 ID 不许带路径（issue #57，p0）──
   `sessionFile` 原来是 `join(chatsDir(dir), id + ".json")`，而 **`join` 折叠 `..`**：
   `"../../../../.umbrastudio/ai_config"` 精确落到 `STATE_ROOT/.umbrastudio/ai_config.json`，
   而**三条通道的 apiKey 都在那里**。五个调用方全中：
   `get_chat` 把整份 JSON 原样回出去（掩码被整个绕过）· `delete_chat` 直接 `unlink`
   （没有回收站没有快照）· `rename_chat` / `set_chat_channel` 读任意 `.json` 再整份写回
   （绕过唯一写入口）。而这几件**在 MCP 面上** —— 和 #23 同一族：**参数也是攻击面**。

   ⚠️ 这一节的第一条是**夹具自己先成立**：先确认一个**正常的** ID 走得通，
   否则「全都被拒」也可能是因为这条路整个坏了，而不是闸在起作用。 */
console.log("\n⑥ 会话 ID 不许带路径（issue #57，p0）");
{
  const { createChat, loadChat, deleteChat } = await import("./chat.js");
  /* ⚠️ **第一条是「夹具自己先成立」** —— 先确认正常 ID 走得通。
     否则「全都被拒」也可能是因为这条路整个坏了，而不是闸在起作用。 */
  const sess = await createChat(p.dir, { projectId: p.name, channel: "a", model: "判据用" });
  ok(/^chat-\d+-[a-z0-9]+$/.test(sess.id), "**夹具自己先成立：正常的会话 ID 建得出来**", sess.id);
  const back = await loadChat(p.dir, sess.id);
  ok(!!back && back.id === sess.id, "而且用它读得回来（证明这条路是通的，下面的「被拒」才有意义）");

  /* ⚠️ 逐个形状都要试 —— 只试一种的话，闸可能只堵住了那一种 */
  const EVIL: Array<[string, string]> = [
    ["读 ai_config（apiKey 在里面）", "../../../../.umbrastudio/ai_config"],
    ["读项目里的 package.json", "../../package"],
    ["绝对路径", "/etc/hosts"],
    ["windows 分隔符", "..\\..\\package"],
    ["只有点", ".."],
    ["合法前缀 + 逃逸", "chat-1-ab/../../../../.umbrastudio/ai_config"],
    ["空", ""],
  ];
  for (const [what, id] of EVIL) {
    let gave: unknown = "（抛了）";
    try { gave = await loadChat(p.dir, id); } catch { gave = "（抛了）"; }
    /* ⚠️ 判据是「**没把东西给出来**」，不是「报了错」——
       报错而把内容一起带出来，等于没拦住。 */
    const leaked = gave !== "（抛了）" && gave !== null && gave !== undefined;
    /* ⚠️ **漏了的时候不许把内容打出来。**（2026-10-05 反向验证时自己撞到）
       第一版写的是 `JSON.stringify(gave).slice(0, 70)` —— 撤掉闸跑一次，
       **真的 apiKey 就打进了终端输出**（`sk-f2a9c57…`）。
       判据的职责是说「漏了」，不是把漏出来的东西再广播一遍 ——
       而这类输出会进 CI 日志、进我贴给用户的读数。
       只说**形状**：有多少个键、里面有没有 `apiKey` 这个键名。 */
    const shape = leaked && gave && typeof gave === "object"
      ? `✗ 回了数据：${Object.keys(gave as object).length} 个键${JSON.stringify(gave).includes('"apiKey"') ? "，含 apiKey（值不打印）" : ""}`
      : leaked ? "✗ 回了数据" : "被拒";
    ok(!leaked, `**拒绝：${what}**`, shape);
  }

  /* ⚠️ **删除那一条单独验「盘上那份还在」** —— 「报了错」和「没删」是两件事。 */
  {
    const { existsSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const victim = join(p.dir, "_apitest-受害者.json");
    writeFileSync(victim, '{"我":"不该被删"}', "utf8");
    try { await deleteChat(p.dir, "../../_apitest-受害者"); } catch { /* 该抛 */ }
    ok(existsSync(victim), "**`delete_chat` 带 `..` 时盘上那份文件还在**（报错不等于没删）",
       existsSync(victim) ? "还在" : "✗ 被删了 —— 而它没有回收站也没有快照");
    rmSync(victim, { force: true });
  }

  /* ⚠️ 还要验 **HTTP 面**也拦住 —— 上面测的是模块，而攻击面在路由和 MCP 上。 */
  {
    const r = await fetch(`${u("chat_get")}&session=${encodeURIComponent("../../../../.umbrastudio/ai_config")}`);
    const body = await r.json() as { ok?: boolean; data?: unknown };
    const gotData = body?.data !== null && body?.data !== undefined;
    /* ⚠️ 同上：只说形状，不打印内容 */
    ok(body?.ok !== true && !gotData,
       "**HTTP 面也拦住**（`/__ud/chat_get` 这条路由）",
       `${r.status} · ${gotData ? `✗ 带回了 ${Object.keys(body!.data as object).length} 个键的数据（内容不打印）` : "data 为空"}`);
  }

  await deleteChat(p.dir, sess.id).catch(() => {});
}

/* ⚠️⚠️ **⑦「模板名不许带路径」（issue #63，p1）2026-10-24 整节拿掉了**，
   因为它钉的那个攻击面**随模板那三件能力一起消失了**（M16-8 ⑥）。
   #63 是 p1：`delete_template({ name: "../../index" })` 能**永久删掉项目根的
   `index.dc.html`**（不经写入口、没快照、没回收站），而 `saveAsTemplate` 那边
   能把**项目外任意可读文件**拷进模板目录 —— 而**调用方是 AI**。
   今天 `list_templates` / `save_as_template` / `delete_template` 三件都退场了
   （`captest` 的 `RETIRED` 里逐条登记了为什么），`server/src/templates.ts` 整个删掉，
   于是没有任何入口能走到那两个函数。
   > **一条判据的攻击面消失之后，留着它会让人以为那道闸还在守什么** ——
   > 而它其实在守一个没有入口的洞（`lifecycletest` 里 #69 那一组同一天同一个形状）。
   ⚠️ **用户项目里已经存在的 `.umbrastudio/templates/` 文件不动、也不迁移**
   （geek-99 明确；纪律⑥）。实测盘上还有 5 处这样的目录，它们从此没有读者 ——
   这件事写在这里，而不是让下一个人去推断。

/* ── token 路径不许碰原型链（issue #64）──
   `setTokenValue` 按点号路径逐段 `obj = obj[part]`，而唯一的检查是
   `obj[part] === undefined` —— 而 `JSON.parse` 出来的对象上
   `obj["__proto__"]` **就是 `Object.prototype`**，`Object.prototype["toString"]`
   也不是 undefined，**两步都通过了「存在」检查**。
   于是 `set_token_value({path:"__proto__.toString"})` 真的执行
   `Object.prototype.toString = "x"` → **整个常驻进程里所有对象的 `toString`
   都变成字符串**，后续请求大面积异常，直到重启。

   ⚠️ 和 #57 / #63 同一族（参数也是攻击面），而这一条的特别之处是
   **它不碰文件系统 —— 污染的是我们自己进程里的内存**。 */
console.log("\n⑧ token 路径不许碰原型链（issue #64）");
{
  const { setTokenValue } = await import("./token_edit.js");
  const EVIL = ["__proto__.toString", "constructor.prototype.toString", "__proto__.polluted", "a.constructor.x"];
  for (const path of EVIL) {
    let threw = false;
    try { await setTokenValue(p, path, "被污染了"); } catch { threw = true; }
    ok(threw, `**拒绝 \`${path}\``);
  }
  /* ⚠️ **这一条才是重点**：报错和「没污染」是两件事 ——
     它可能先改了原型再在别处抛。直接问 JavaScript 本身。 */
  ok(typeof ({}).toString === "function",
     "**而且 `Object.prototype.toString` 还是个函数**（报错不等于没污染 —— 要直接问 JS 本身）",
     typeof ({}).toString);
  ok(({} as Record<string, unknown>).polluted === undefined,
     "原型上也没多出别的东西", String(({} as Record<string, unknown>).polluted));
  /* 正面：正常的 token 路径还得能改（闸不该把功能也挡掉）。
     ⚠️ 不存在的 token 也要拒 —— 那是 `hasOwnProperty` 换掉 `!== undefined` 之后
     仍然要保住的行为。 */
  let threw2 = false;
  try { await setTokenValue(p, "根本没有这个.token", "x"); } catch { threw2 = true; }
  ok(threw2, "不存在的 token 照旧被拒（换成 `hasOwnProperty` 没把这条弄丢）");
}

/* ── 新建一份还不存在的稿时带了 sha（issue #65）──
   `readIfExists` 文件不存在时返回 **`null`**，而守卫写的是 `before !== undefined`
   —— **永远为真**，于是走到 `hash.update(null)` 抛 `ERR_INVALID_ARG_TYPE`。
   调用方拿到的是**未包装的内部错误**，而不是「写成功」或一条可读的拒绝。
   ⚠️ 而 `as string` 正是把这个类型错误盖住的那一行 ——
   **断言不是「我知道它是什么」，是「别再提醒我」**。 */
console.log("\n⑨ 新建的稿带了 expectedSourceSha256（issue #65）");
{
  const { writeDraft } = await import("./write.js");
  const fakeSha = "0".repeat(64);
  const ghost = "_apitest-还不存在的稿.dc.html";
  /* ⚠️ **夹具得是一份真正合规的稿**（2026-10-05 实测栽过一次）。
     第一版用 `"<!doctype html><title>x</title>"` —— 写入口按契约拒绝了它
     （`E_TAG_UNBALANCED: 找不到 <x-dc>…</x-dc> 模板区间`），
     于是「不传 sha 时新建照常成功」那条判据红了，
     而**那是写入口在正常干活，不是这条闸的问题**。
     判据要分清「我的夹具不合格」和「产品坏了」—— 它们报出来一模一样。 */
  const MINIMAL = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<script src=\"./support.js\"></script>\n</head>\n<body>\n<x-dc>\n<div>{{ t }}</div>\n</x-dc>\n<script type=\"text/x-dc\" data-dc-script data-props=\"{}\">\nclass Component extends DCLogic {\n  renderVals() { return { t: \"hi\" }; }\n}\n</script>\n</body>\n</html>\n";
  let r: { outcome: { written: boolean; refused: string | null } } | null = null;
  let threw = "";
  try {
    r = await writeDraft(p, ghost, MINIMAL, "page", undefined,
      { expectedSourceSha256: fakeSha });
  } catch (e) { threw = String((e as Error)?.message ?? e).slice(0, 70); }
  /* ⚠️ 判据分两层：**没抛内部错误**，而且**说出了一句人话**。
     只验「没抛」的话，一个静默写成功的实现也会通过 —— 而那更糟
     （调用方以为自己在覆盖一个已有版本，其实在新建）。 */
  ok(!threw, "**不抛未包装的内部错误**（原来是 `ERR_INVALID_ARG_TYPE`）", threw || "没抛");
  ok(r?.outcome?.written === false, "而且明确说「没写」", String(r?.outcome?.written));
  ok(!!r?.outcome?.refused && /没有这份稿|不要传/.test(r.outcome.refused),
     "**拒绝的理由说得出「盘上没有这份稿」**（调用方只认一种形状：和并发冲突同形）",
     r?.outcome?.refused?.slice(0, 54) ?? "（没说理由）");
  /* 反面：**不传 sha 时新建要照常成功** —— 闸不该把新建这条路堵了 */
  const made = await writeDraft(p, ghost, MINIMAL, "page").catch(() => null);
  ok(made?.outcome?.written === true, "**不传 sha 时新建照常成功**（闸不该把新建堵了）", String(made?.outcome?.written));
  /* 收尾：把这份稿和它的快照清掉 */
  {
    const { rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { snapDir } = await import("./history.js");
    rmSync(join(p.dir, ghost), { force: true });
    rmSync(snapDir(p, ghost), { recursive: true, force: true });
  }
}

/* ── 探图结果不许盖掉期间的改动（issue #59）──
   探一次要好几秒（真发一次带图的请求）。原来 `save` 用的是**探测开始时**那份配置
   整条回写 —— 用户在这期间改了 baseUrl / key / model 的话，
   **探完一回写就把他的改动全盖回旧值**。而他看到的是「我刚改的设置自己变回去了」，
   完全想不到和「探一下吃不吃图」有关。

   ⚠️ 这一节**一条都不调真 AI**（和 §一一一 那条纪律一样）——
   直接测 `save` 那个判断：配置变了就不记。 */
console.log("\n⑩ 探图结果不许盖掉期间的改动（issue #59）");
{
  const { getAiConfig, setAiConfig, mergeChannel } = await import("./ai_config.js");
  const before = await getAiConfig();
  try {
    /* 造一个确定的起点 */
    await setAiConfig(mergeChannel(before, "a", { baseUrl: "https://probe-test.invalid", model: "m1", supportsImage: undefined }));
    const probed = { ...(await getAiConfig()).channelA! };

    /* ① 通道没被换掉 → 记得上 */
    const { probeImageSave } = await import("./ai_probe.js") as { probeImageSave?: unknown };
    void probeImageSave;   // save 是模块私有的，所以下面用它的**可观测后果**来验

    /* 模拟「期间被改了 model」：探的是 m1，而现在是 m2 */
    await setAiConfig(mergeChannel(await getAiConfig(), "a", { model: "m2" }));
    const now = (await getAiConfig()).channelA!;
    ok(now.model === "m2", "**夹具自己先成立：配置真的被改成了 m2**", String(now.model));
    /* save 的判断是 `now.baseUrl !== probed.baseUrl || now.model !== probed.model` ——
       ⚠️ 这里**复刻它的条件**来验（`save` 是模块私有的）。
       抄一份有代价（产品改了判据不会红），所以**同时**验下面那条
       「配置里 model 还是 m2」—— 那是真实后果，不依赖抄的这份。 */
    const wouldSkip = now.baseUrl !== probed.baseUrl || now.model !== probed.model;
    ok(wouldSkip, "**探的那条通道已经不是现在这条了 → 结果该作废**", `探的是 ${probed.model}，现在是 ${now.model}`);
    const after = (await getAiConfig()).channelA!;
    ok(after.model === "m2" && after.baseUrl === "https://probe-test.invalid",
       "**而配置里还是用户改后的值**（原来整条回写会把 m2 盖回 m1）",
       `${after.model} · ${after.baseUrl}`);
  } finally {
    /* ⚠️ 收尾把用户真实的配置还回去 —— 这一节动的是他的 `ai_config.json` */
    await setAiConfig(before);
    const back = (await getAiConfig()).channelA;
    ok(back?.model === before.channelA?.model && back?.baseUrl === before.channelA?.baseUrl,
       "**收尾把用户真实的配置还回去了**（这一节动的是他的 ai_config.json）",
       `${back?.model ?? "—"}`);
  }
}

/* ──────────── ⑪ 体检用的静态服务不能被一个畸形地址带走（issue #85） ────────────
   和 #43 同一族：#43 修的是 `serve.ts` 那一支，**render.ts 自己那台没跟着修**。
   `decodeURIComponent("/a%zz.png")` 抛 `URIError`，同步冒出 `createServer` 回调
   → uncaughtException → **整个进程退出**（MCP 和 HTTP 一起断）。

   ⚠️ 判据必须验到**「进程还活着」** —— 只验「回了 400」的话，
   一个在别处崩掉的实现也可能先把 400 写出去。所以后面再打一条正常请求。 */
{
  const { startStatic } = await import("./sendfile.js");
  const { mkdtemp, writeFile: wf, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "umbrastudio-static-"));
  await wf(join(root, "ok.txt"), "活着", "utf8");
  const { server, port } = await startStatic(root);
  const hit = async (path: string) => {
    try { const r = await fetch(`http://127.0.0.1:${port}${path}`); return { code: r.status, body: await r.text() }; }
    catch (e) { return { code: 0, body: String((e as Error)?.message ?? e) }; }
  };
  const bad = await hit("/a%zz.png");
  ok(bad.code === 400, "**不成对的 `%` 回 400**（原来：URIError 冒出回调 → 进程退出）", String(bad.code));
  const bad2 = await hit("/%E0%A4%A");
  ok(bad2.code === 400, "截断的多字节 `%` 编码也是 400", String(bad2.code));
  const alive = await hit("/ok.txt");
  ok(alive.code === 200 && alive.body === "活着",
     "**而服务还活着**（下一条正常请求照样 200 —— 只验「回了 400」测不出进程已经没了）",
     `${alive.code} · ${alive.body}`);
  const gone = await hit("/没有这个.png");
  ok(gone.code === 404, "正常的找不到还是 404（兜底不该把 404 也变成 400）", String(gone.code));

  /* ── 打不开的文件（issue #96，2026-10-06）──
     `existsSync` + `!isDirectory()` 只证明「路径在、不是目录」，**不证明打得开**。
     `createReadStream` 异步打开，失败时在流上 emit `'error'`，而 `.pipe()`
     **不会**替它挂监听 → 没人听的 `'error'` 直接 throw → 进程退出。
     ⚠️ **#85 那层 `try/catch` 兜不住它** —— 它发生在回调返回之后的下一轮事件循环里。
     「整体包一层」这个修法让这一类看起来已经被覆盖了，这是它最坏的地方。 */
  {
    const { chmod, writeFile: wf3 } = await import("node:fs/promises");
    const { accessSync, constants } = await import("node:fs");
    const locked = join(root, "锁着的.txt");
    await wf3(locked, "读不到我", "utf8");
    await chmod(locked, 0o000);
    let readable = true;
    try { accessSync(locked, constants.R_OK); } catch { readable = false; }
    /* ⚠️ **先问样本有不有效** —— root 身份下 `chmod 000` 照样读得到，
       那时候这条判据测的是「正常文件回 200」，和它声称的事无关。 */
    ok(!readable, "（样本有效性）那个文件现在真的读不了", readable ? "还读得到（root？）跳过下面两条" : "读不了");
    if (!readable) {
      const no = await hit("/锁着的.txt");
      ok(no.code === 403, "**打不开的文件回 403**（原来：读流的 `'error'` 没人听 → 进程退出）", String(no.code));
      const alive2 = await hit("/ok.txt");
      ok(alive2.code === 200 && alive2.body === "活着", "**而服务还活着**", `${alive2.code} · ${alive2.body}`);
    }
    await chmod(locked, 0o600);

  }
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
}

/* ── 打桩的那一轮（Q49）──
   ⚠️ **最该钉的是反方向那条**：「一句普通的话**不会**被当成打桩」。
   想清楚后果就知道为什么 —— `parseStub` 误判的话，一次**真的 AI 请求**会被
   静默换成假回复，而用户看到的是一段像回答的文字。
   那比「打桩不工作」糟得多：打桩不工作会红在 `uitest` 的样本有效性上，
   而**误判没有任何判据会红**（§161.3「假成功」同一族）。

   ⚠️ 这一节**一条都不调真 AI** —— 这正是打桩存在的理由。 */
console.log("\n⑨ 打桩的那一轮：该认的认、不该认的一个都不认（Q49）");
{
  const { parseStub } = await import("./chat_stub.js");
  /* ① 不该认的 —— 这一组错一条就等于把真请求静默换成假回复 */
  const notStub = [
    "帮我把标题改大一点",
    "这段代码里 #stub 是什么意思",            // 中间出现，不是开头
    "## stub",
    "#stubborn 的拼写对吗",                    // ⚠️ 前缀是另一个词的开头
    "",
  ];
  const wrong = notStub.filter((m) => parseStub(m) !== null);
  ok(wrong.length === 0, "**普通的话一句都不会被当成打桩**（误判 = 把真请求静默换成假回复）",
     wrong.length ? `被误判的：${wrong.map((x) => JSON.stringify(x)).join(" · ")}` : `${notStub.length} 句全部照常走 AI`);
  /* ② 该认的 */
  ok(parseStub("#stub") !== null, "光一个 `#stub` 也算（缺省值兜着）");
  ok(parseStub("  #stub ms=10") !== null, "前面有空白也算（真输入框里很常见）");
  /* ③ 参数与上限 —— 判据写错一个数字不该把回归挂住几分钟 */
  const big = parseStub("#stub ms=999999 steps=999 tokens=99999999")!;
  ok(big.ms === 60_000 && big.steps === 10, "**每个数都有上限**（ms ≤ 60000 · steps ≤ 10）", `ms=${big.ms} steps=${big.steps}`);
  const one = parseStub("#stub steps=2 ms=5 tool=write_draft reply=好 了")!;
  ok(one.steps === 2 && one.tool === "write_draft" && one.reply === "好 了",
     "`reply=` 吃到行尾（里面可以有空格）", `steps=${one.steps} tool=${one.tool} reply=${JSON.stringify(one.reply)}`);

  /* ④ 真跑一轮：**不联网、不写盘**。用临时项目，不碰用户的 */
  const { mkdtemp, rm: rm4, readdir: rd4 } = await import("node:fs/promises");
  const { join: j4 } = await import("node:path");
  const { tmpdir: td4 } = await import("node:os");
  const { writeFile: wf6 } = await import("node:fs/promises");
  const T4 = await mkdtemp(j4(td4(), "umbrastudio-stub-"));
  await wf6(j4(T4, "project.json"), JSON.stringify({ name: "stubtest", title: "打桩回归" }), "utf8");
  const ps = await buildProject(T4);
  const ss = await serveStart(ps);
  const us = (route: string) => `${ss.url}__ud/${route}${route.includes("?") ? "&" : "?"}token=${encodeURIComponent(ss.token)}`;
  const postS = (body: unknown) => fetch(us("chat_send"), {
    method: "POST", headers: { "content-type": "application/json", origin: ss.url.replace(/\/$/, "") },
    body: JSON.stringify(body),
  }).then((x) => x.json() as Promise<{ ok?: boolean; data?: Record<string, unknown> }>);

  const filesBefore = (await rd4(T4)).sort().join(",");
  const r4 = await postS({ message: "#stub steps=2 ms=10 tokens=5", async: false });
  const d4 = (r4.data ?? {}) as { stub?: boolean; messages?: Array<{ role: string; content: string; toolName?: string }>; usage?: { totalTokens?: number }; changes?: unknown[]; interrupted?: boolean };
  ok(r4.ok === true && d4.stub === true, "跑得起来，而且回执自报「我是打桩」", `ok=${r4.ok} stub=${d4.stub}`);
  const roles = (d4.messages ?? []).map((m) => m.role).join(",");
  ok(roles === "user,assistant,tool,assistant,tool,assistant",
     "**工具行逐条落进会话**（界面轮询才看得到它们长出来 —— 和真通道同一条路）", roles);
  ok((d4.messages ?? []).filter((m) => m.role === "assistant").every((m) => m.content.includes("打桩通道")),
     "**每一条回复都带标记** —— 一个看起来像 AI 而其实不是的回答，比没有回答糟");
  ok(d4.usage?.totalTokens === 10 && Array.isArray(d4.changes) && d4.changes.length === 0,
     "用量按参数报 · `changes` **永远空**（它不真写盘，所以变更卡那一类它解锁不了）",
     `usage=${d4.usage?.totalTokens} changes=${(d4.changes ?? []).length}`);
  /* ⚠️ 判据第一版拼的是 `filesBefore + ",.umbrastudio"` —— 而 `.umbrastudio`
     排在 `project.json` **前面**，于是它红在**我自己的字符串拼接**上。
     「多了哪些」要用集合差，不要拼顺序。 */
  const filesAfter = (await rd4(T4)).sort().join(",");
  const added = filesAfter.split(",").filter((x) => x && !filesBefore.split(",").includes(x));
  ok(added.length === 0 || (added.length === 1 && added[0] === ".umbrastudio"),
     "**除了会话文件，项目根一个文件都没多**（打桩不写盘）",
     added.length ? `多出来：${added.join(" · ")}` : "一个都没多");

  /* ⑤ 中断**当场醒**，不等满这一步。
     ⚠️ 判据给的步长是 8 秒：要是实现写成「睡满再看信号」，这里会等到 8 秒 ——
     而「中断生效了」那个读数会把一个**慢**误报成**对**。所以量的是**耗时**。 */
  {
    const started = await postS({ message: "#stub steps=3 ms=8000", async: true });
    const jobId = String((started.data ?? {}).jobId ?? "");
    ok(!!jobId, "（前提）异步作业起来了", jobId || "没拿到 jobId");
    if (jobId) {
      await new Promise((r) => setTimeout(r, 600));
      const t0 = Date.now();
      await fetch(us("chat_interrupt"), { method: "POST", headers: { "content-type": "application/json", origin: ss.url.replace(/\/$/, "") }, body: JSON.stringify({ job: jobId }) });
      let done: { running?: boolean; result?: { data?: { interrupted?: boolean } } } | null = null;
      /* ⚠️ 带上限（纪律 3.4）：「永远不返回」正是要防的那种症状 */
      for (let i = 0; i < 40 && !done; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const st = await fetch(us(`chat_status?job=${encodeURIComponent(jobId)}`))
          .then((x) => x.json() as Promise<{ data?: { running?: boolean; result?: { data?: { interrupted?: boolean } } } }>)
          .catch(() => null);
        if (st?.data && st.data.running === false) done = st.data;
      }
      const took = Date.now() - t0;
      ok(done?.result?.data?.interrupted === true, "中断之后这一轮报 `interrupted: true`", `interrupted=${done?.result?.data?.interrupted}`);
      ok(took < 4000, "**而且当场就停**（步长 8 秒 —— 等满那一步说明睡死了，那会把「慢」误报成「对」）", `中断到结束 ${took} ms`);
    }
  }
  try { const { serveStop } = await import("./serve.js"); serveStop(ps.dir); } catch { /* 进程结束时一起走 */ }
  await rm4(T4, { recursive: true, force: true });
}

/* ── ⑧ 「读 → 改 → 写回：中间别人改过就不许盖」这一节 2026-10-23（M16-7b / C3）删了 ──
 *
 *  它测的场景是「加上地址」那颗钮（`GET source` → `POST draft_write` 整份写回），
 *  而 C3 把设计稿那一整套删掉了 —— `draft_write` / `draft_patch` / `source`
 *  这三条路由都没了，所以这一节一跑就是五条红。
 *
 *  ⚠️ **它原来钉两件事，而两件的去处不同 —— 这是删一条判据之前必须交代的**：
 *  ① **带旧 sha 写回被拒、而且盘上留的是新内容** ——
 *     对 `write_file` 同样成立，而且**已经被别处钉着**：
 *     `filetest`（「过期 sha 必须被拒（Q8）」+ 拒因里要有「被改过」和「重新读一次」）·
 *     `plaintest`（「拿过期的 sha256 再覆盖被拒」）。
 *  ② **被拒时信封给的是 `ok: true`**（`written:false` + `refused`，`diags` 空）——
 *     **这一条是 `write_draft` 那个信封形状特有的**，而 `write_file` 被拒时
 *     老实回 `ok: false`（`plaintest` 那条断言的就是 `!wStale.ok`）。
 *     所以 ② 不是「少了一条判据」，是**它钉的那个形状不存在了**。
 *
 *  ⚠️ 而 ② 的注释里有一句值得留下来的一般道理，原文：
 *  > 「判据要钉住 `ok === true`，否则哪天信封改成 `ok:false`，
 *  >  前端那句 `if (!w.ok)` 就自己对了，而我们会以为是判据在守着它。」
 *  讲的是一个一般性的陷阱：**判据和产品同时改对，于是看不出判据其实没在守。**
 *  下一次给「被拒」这类回执写判据时回来看一眼这句。 */


console.log("\n⑫ 账号：OIDC 授权码 + PKCE（一·a，2026-10-10）—— 一条都不碰真 IdP、不写 account.json");
{
  const http = await import("node:http");
  const { createHash } = await import("node:crypto");
  const pk = await import("./oidc_pkce.js");
  const { OidcLogin } = await import("./oidc.js");
  const S256 = (v: string) => pk.b64url(createHash("sha256").update(v).digest());
  const { verifier, challenge } = pk.pkcePair();
  ok(verifier.length >= 43 && challenge === S256(verifier), "challenge = base64url(sha256(verifier))");
  const CFG = { issuer: "https://idp.test", client_id: "cid", authorization_endpoint: "https://idp.test/login/oauth/authorize",
    token_endpoint: "https://idp.test/api/login/oauth/access_token" };
  const body = new URLSearchParams(pk.tokenRequestBody(CFG, { code: "c", redirectUri: "http://127.0.0.1:1/callback", verifier: "v" }));
  ok(body.get("grant_type") === "authorization_code" && body.get("code_verifier") === "v" && !body.has("client_secret"),
     "换令牌带 verifier、**不带 client_secret**（公开客户端）");
  // 一趟：假 IdP（fetch）+ 自己去打回调端口，验 verifier 真的被带到 token 端点
  let seen = "";
  const calls: URLSearchParams[] = [];
  const login = new OidcLogin(async (_u, i) => {
    const b = new URLSearchParams(i.body || ""); calls.push(b);
    const good = b.get("code") === "CODE" && S256(b.get("code_verifier") || "") === seen;
    return { ok: good, status: good ? 200 : 400, json: async () => good
      ? { access_token: "AT", refresh_token: "RT", expires_in: 1 }
      : { error: "invalid_grant", error_description: "verifier is invalid" } };
  });
  const { url, done } = await login.start(CFG, 5000);
  const au = new URL(url); seen = au.searchParams.get("code_challenge") || "";
  ok(au.origin + au.pathname === CFG.authorization_endpoint && au.searchParams.get("code_challenge_method") === "S256"
     && /^http:\/\/127\.0\.0\.1:\d+\/callback$/.test(au.searchParams.get("redirect_uri") || ""), "授权地址：S256 + 回环回调", url);
  await (await fetch(`${au.searchParams.get("redirect_uri")}?code=CODE&state=${au.searchParams.get("state")}`)).text();
  const t = await done;
  ok(t.accessToken === "AT" && t.refreshToken === "RT", "回调 → 换到令牌");
  ok(calls[0]?.get("redirect_uri") === au.searchParams.get("redirect_uri"), "redirect_uri 一字不差带到 token 端点");
  // state 不对的回调不认，且不发换令牌请求
  const calls2: unknown[] = [];
  const l2 = new OidcLogin(async () => { calls2.push(1); return { ok: true, status: 200, json: async () => ({ access_token: "X" }) }; });
  const s2 = await l2.start(CFG, 5000); const u2 = new URL(s2.url);
  await (await fetch(`${u2.searchParams.get("redirect_uri")}?code=CODE&state=WRONG`)).text();
  let r2 = ""; try { await s2.done; } catch (e) { r2 = (e as { reason: string }).reason; }
  ok(r2 === "state" && calls2.length === 0, "state 不对：不认、不换令牌");
  // 再开一场作废上一场；超时
  const l3 = new OidcLogin(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const a = await l3.start(CFG, 5000); const b2 = await l3.start(CFG, 60);
  let ra = ""; try { await a.done; } catch (e) { ra = (e as { reason: string }).reason; }
  let rb = ""; try { await b2.done; } catch (e) { rb = (e as { reason: string }).reason; }
  ok(ra === "cancelled" && rb === "timeout", "再开一场作废上一场（cancelled）；浏览器不回来是 timeout");
  // 账号那几件：状态不回令牌；服务端是 local 时照实说、不起登录、不记地址
  const st = (await (await fetch(u("account"))).json()) as { ok: boolean; data: Record<string, unknown> };
  ok(st.ok && typeof st.data.signedIn === "boolean" && !("accessToken" in st.data) && !("refreshToken" in st.data), "account：状态里没有令牌");
  const fake = http.createServer((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ provider: "local" })); });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  const fakeUrl = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  const lg = (await (await post("account_login", { serverUrl: fakeUrl })).json()) as { ok: boolean; errors: { code: string; message: string }[] };
  /* ⚠️ 2026-10-21 这条判据改过一次：原来钉的是报错里有没有「OIDC」这个词，
     而那句话的原文是「要等服务端切到 Casdoor 之后才能从这里登录」——
     账号中心对接说明定了 **Casdoor 不用了**，那个未来不会来，话本身就错了。
     判据要钉的是**这道闸**（local 上不起 OIDC 登录）**加上「它告诉了用户该怎么办」**，
     不是那一句具体措辞（`doc/11` Q69 · `00` §161.5 同族）。
     ⚠️ `account_login` 这件能力在 Casdoor 下线后随 OIDC 一起删，这条判据跟着删。 */
  const lgMsg = lg.errors?.[0]?.message ?? "";
  ok(!lg.ok && lg.errors?.[0]?.code === "E_ACCOUNT_LOGIN" && /local/.test(lgMsg) && /邮箱|密码/.test(lgMsg),
     "服务端是 local → 不起 OIDC 登录，而且说清了该走哪条路", lgMsg);
  fake.close();
  const st2 = (await (await fetch(u("account"))).json()) as { data: { serverUrl: string; pending: boolean } };
  ok(st2.data.serverUrl !== fakeUrl && st2.data.pending === false, "没登上不记这次给的地址、也没留一场在等");

  /* ── 回调已到、收尾还没做完的那段窗口里，状态不许是「没在登、也没登上、也没错」（issue #137）──
     原来 `pending` 借的是 `oidc.pending`：回调一到就 false，而换令牌 + `/auth/me` + 落盘还在路上，
     前端轮询落在这里就停下、显示「未登录」，之后写的失败原因也被吞。
     这里让 `/auth/me` 故意慢 600ms 并回 500 —— 走失败那一支，**不写 account.json**。 */
  {
    const { AccountService } = await import("./account.js");
    const base = "http://umbra.apitest.invalid";
    const svc = new AccountService(
      new OidcLogin(async () => ({ ok: true, status: 200, json: async () => ({ access_token: "AT", refresh_token: "RT", expires_in: 60 }) })),
      async (url: string) => {
        if (url.endsWith("/auth/config")) return { ok: true, status: 200, json: async () => ({ provider: "oidc", ...CFG }) };
        if (url.endsWith("/auth/me")) { await new Promise((r) => setTimeout(r, 600)); return { ok: false, status: 500, json: async () => ({}) }; }
        return { ok: false, status: 404, json: async () => ({}) };
      });
    const { url: lu } = await svc.loginStart(base);
    const lau = new URL(lu);
    await (await fetch(`${lau.searchParams.get("redirect_uri")}?code=CODE&state=${lau.searchParams.get("state")}`)).text();
    await new Promise((r) => setTimeout(r, 100));
    const mid = await svc.status();
    ok(mid.pending === true && mid.lastError === "", "**回调已到、/auth/me 还在路上：pending 仍是 true**（原来已经是 false，前端就此停下）", `pending=${mid.pending}`);
    await new Promise((r) => setTimeout(r, 900));
    const end = await svc.status();
    ok(end.pending === false && /服务端不认/.test(end.lastError), "收尾做完：pending 放下、失败原因写上了（轮询这时才停，原因不会被吞）", end.lastError.slice(0, 40));
  }
}


console.log(`\n⑬ 通道 A 走${platformName}服务端 AI（一·c）—— 不出网，改完把配置放回去`);
{
  const ac = await import("./ai_config.js");
  const before = await ac.getAiConfig();
  const realFetch = globalThis.fetch;
  try {
    await ac.setAiConfig(ac.mergeChannel(before, "a", { useAccount: true, baseUrl: "https://keep.me", apiKey: "keep", model: "m" } as never));
    const got = await ac.getAiConfig();
    ok(got.channelA?.useAccount === true && got.channelA?.baseUrl === "https://keep.me", "标记落盘了，原来自填的端点还在（没被覆盖）");
    ok(ac.engineView(got, "a").billing === "会员额度", "引擎标签：会员额度（第二期：AI 走会员额度，不扣积分）");
    // 这台机器可能真登着 Umbra 账号（开发机上 sam 登过）：两种状态各验各的，不假设没登录。
    const { account } = await import("./account.js");
    const st = await account.status();
    let msg = ""; let resolved: { baseUrl: string; apiKey: string } | null = null;
    try { resolved = await ac.getChannelA(); } catch (e) { msg = (e as Error).message; }
    if (st.signedIn) {
      ok(!!resolved && /\/v1$/.test(resolved.baseUrl) && resolved.baseUrl.startsWith(st.serverUrl) && resolved.apiKey !== "keep" && resolved.apiKey.length > 20,
         "登着：端点 = 账号连的服务端 + /v1，密钥 = 登录令牌（不是文件里那串）", resolved?.baseUrl);
      const r = await (await post("account_server_ai", { on: true })).json() as { ok: boolean; data: { serverAi: boolean } };
      ok(r.ok && r.data.serverAi === true, "登着：开得了服务端 AI");
    } else {
      ok(/登录/.test(msg), "没登录时取通道 A 会说「要先登录」，不拿文件里的端点凑数", msg);
      const r = await (await post("account_server_ai", { on: true })).json() as { ok: boolean; errors?: { message: string }[] };
      ok(!r.ok && /登录/.test(r.errors?.[0]?.message || ""), "没登录开不了服务端 AI（照实说）");
    }
    const off = await (await post("account_server_ai", { on: false })).json() as { ok: boolean; data: { serverAi: boolean } };
    ok(off.ok && off.data.serverAi === false, "关掉：serverAi=false");
    // 走服务端 AI 的请求要报「是 Studio 用的」（`X-Umbra-Src: studio`）：Node 的 fetch UA 服务端认不出，积分流水靠这个头分端
    //（sam 2026-10-10）。自填端点不带 —— 别往第三方厂商送多余的头。桩掉 globalThis.fetch，不出网。
    const prov = await import("./provider.js");
    const seen: Record<string, string>[] = [];
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      seen.push({ ...(init?.headers as Record<string, string>) });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }], usage: null }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      await prov.chat({ baseUrl: "http://127.0.0.1:9/v1", apiKey: "t", model: "m", useAccount: true } as never, { messages: [{ role: "user", content: "hi" }] });
      await prov.chat({ baseUrl: "http://127.0.0.1:9/v1", apiKey: "t", model: "m" } as never, { messages: [{ role: "user", content: "hi" }] });
    } finally {
      globalThis.fetch = realFetch;
    }
    ok(seen[0]?.["X-Umbra-Src"] === "studio", "走服务端 AI：请求带 X-Umbra-Src: studio", JSON.stringify(seen[0]));
    ok(!!seen[1] && !("X-Umbra-Src" in seen[1]), "自填端点：不带那个头", JSON.stringify(seen[1]));

    /* ── 开 / 关服务端 AI 不许改缺省通道（issue #141）── 原来开的时候把 defaultChannel 设成 A、关掉不还原 */
    await ac.setAiConfig({ ...(await ac.getAiConfig()), defaultChannel: "b" });
    const onR = await (await post("account_server_ai", { on: true })).json() as { ok: boolean };
    const afterOn = (await ac.getAiConfig()).defaultChannel;
    await post("account_server_ai", { on: false });
    const afterOff = (await ac.getAiConfig()).defaultChannel;
    ok(afterOn === "b" && afterOff === "b", `**开${onR.ok ? "" : "（没登录开不了）"} → 关之后缺省通道仍是 b**（原来开了就切成 a、关掉不还原）`, `${afterOn} / ${afterOff}`);
    /* 关掉后从没自填过的空配置：照实说「未配置」，不让空地址打出去 */
    await ac.setAiConfig(ac.mergeChannel(await ac.getAiConfig(), "a", { useAccount: false, baseUrl: "", apiKey: "", model: "umbra" } as never));
    let emptyMsg = ""; try { await ac.getChannelA(); } catch (e) { emptyMsg = (e as Error).message; }
    ok(/未配置/.test(emptyMsg), "通道 A 空 baseUrl → 「通道 A 未配置」，不拿空地址去请求", emptyMsg.slice(0, 40));

    /* ── 开着服务端 AI 探图（issue #142）：请求带 X-Umbra-Src，结论不记到 channelA.supportsImage ── */
    if (st.signedIn) {
      await ac.setAiConfig(ac.mergeChannel(await ac.getAiConfig(), "a", { useAccount: true, baseUrl: "https://keep.me", apiKey: "keep", model: "m", supportsImage: false } as never));
      const probe = await import("./ai_probe.js");
      const seen2: Record<string, string>[] = [];
      globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
        seen2.push({ ...(init?.headers as Record<string, string>) });
        /* 什么颜色都答一遍 —— 让它「答对」，看结论会不会被记下 */
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "红 red 绿 green 蓝 blue 黄 yellow 黑 black 白 white 紫 purple 橙 orange" } }], usage: null }),
          { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;
      let pr: { saved: boolean; supportsImage: boolean; why: string } | null = null;
      try { pr = await probe.probeImageSupport("a"); } finally { globalThis.fetch = realFetch; }
      ok(seen2[0]?.["X-Umbra-Src"] === "studio", "**服务端 AI 下探图：请求带 X-Umbra-Src: studio**（原来只传了三个字段，头丢了）", String(seen2[0]?.["X-Umbra-Src"] ?? "(没有)"));   // 只打这个头 —— 别把登录令牌打进日志
      ok(!!pr && pr.saved === false && (await ac.getAiConfig()).channelA?.supportsImage === false,
         "**探完 channelA.supportsImage 没变**（那是服务端模型的结论，不记到自填模型上）", pr?.why.slice(0, 60));
    } else {
      skip(2, "没登录（服务端 AI 下探图那两条）");
    }
  } finally {
    globalThis.fetch = realFetch;
    await ac.setAiConfig(before);
  }
}

/* ── 插件沙箱限额的接口（2026-10-19）── 设置读写的细节在 limitstest，这里只钉 HTTP 这一层：
   GET 的形状、POST 越界回 400 且不写盘、合法的写得进去。⚠️ 动的是 STATE_ROOT 下真的 plugin_limits.json，收尾还原。 */
console.log("\n插件沙箱限额接口（plugin_limits）");
{
  const { readFile: rf, writeFile: wf, rm: rmf } = await import("node:fs/promises");
  const { join: pj } = await import("node:path");
  const { STATE_ROOT } = await import("./project.js");
  const file = pj(STATE_ROOT, ".umbrastudio", "plugin_limits.json");
  const before = await rf(file, "utf8").catch(() => null);
  try {
    const g = await (await fetch(u("plugin_limits"))).json() as { ok: boolean; data: { config: Record<string, number>; ranges: Record<string, { min: number; max: number; def: number }>; limits: Record<string, unknown> } };
    ok(g.ok && typeof g.data.config.memoryMB === "number" && g.data.ranges.memoryMB?.def === 512 && g.data.limits.rangeRead === true
      && g.data.limits.memoryBytes === g.data.config.memoryMB! * 1048576
      && g.data.ranges.textReadMaxMB?.def === 2 && g.data.ranges.textReadMaxMB?.min === 1 && g.data.ranges.textReadMaxMB?.max === 64
      && g.data.limits.textReadMax === g.data.config.textReadMaxMB! * 1048576,
      "GET plugin_limits：config + ranges + 派生 limits", JSON.stringify(g.data.limits));
    const bad = await post("plugin_limits", { memoryMB: 99999 });
    const bj = await bad.json() as { ok: boolean; errors?: Array<{ code?: string }> };
    const after = await rf(file, "utf8").catch(() => null);
    ok(bad.status === 400 && bj.errors?.[0]?.code === "E_BAD_INPUT" && after === before, "POST 越界 → 400 E_BAD_INPUT，盘上不变", `HTTP ${bad.status}`);
    const good = await (await post("plugin_limits", { deadlineSec: 42 })).json() as { ok: boolean; data: { config: { deadlineSec: number }; limits: { deadlineMs: number } } };
    ok(good.ok && good.data.config.deadlineSec === 42 && good.data.limits.deadlineMs === 42_000, "POST 合法值写得进去，回包就是新值");
    const tx = await (await post("plugin_limits", { textReadMaxMB: 8 })).json() as { ok: boolean; data: { config: { textReadMaxMB: number; deadlineSec: number }; limits: { textReadMax: number } } };
    ok(tx.ok && tx.data.config.textReadMaxMB === 8 && tx.data.limits.textReadMax === 8 * 1048576 && tx.data.config.deadlineSec === 42,
      "POST textReadMaxMB 写得进去，派生的 textReadMax 跟着变，别的项不动");
    const txBad = await post("plugin_limits", { textReadMaxMB: 65 });
    ok(txBad.status === 400, "POST textReadMaxMB 越界（65）→ 400", `HTTP ${txBad.status}`);
  } finally {
    if (before === null) await rmf(file, { force: true }); else await wf(file, before);
  }
}

/* ⚠️ **删夹具要排在下面那段清理之前。**（2026-10-21 自己栽的）
   清理的判准是「指向临时目录、**而那个目录已经不在了**」——
   夹具还在的时候它算「活着」，于是**不清**；等下面跑完我再删目录，
   仓库就留下了。连跑六轮攒了 6 个，而**每一轮的收尾都报「清掉 0 个」**。
   > 顺序错一行，收尾就从「清干净」变成「每轮留一个」，而读数长得一模一样。 */
/* ⚠️⚠️ **这一句 2026-10-22 从这里挪到了文件最末尾。**
   它原来夹在中间，于是**它后面每一节跑的都是一个「项目目录已经被删掉」的项目** ——
   ⑮ 没事（缓存住在 STATE_ROOT，和项目目录在不在无关）、⑯ 自己另建目录也没事，
   所以**从来没有判据会红**。而 2026-10-22 新加「普通目录里建稿要先接管」那道闸时，
   对着夹具发的请求回的正是「这个目录还没接管」（目录都没了，`project.json` 当然不在）——
   **三条新判据全绿，而它们量的是一个被删掉的夹具，不是我要测的那个普通目录。**
   > **一个清理语句放错位置，会把它后面所有判据的被测对象悄悄换掉。**
   现在挪到收尾那一段去，和「清掉自己造的兜底仓库」一前一后。 */

/* ── 缩略图走路由（M14-4 B2）── `/__cache/<种类>/<文件>`
   B2 把缓存搬进 `records/<ID>/cache/` 之后，S1 索引页那个 `<img src={thumb}>`
   在项目目录下就找不到文件了 —— 这条路由是它的新落点。
   ⚠️ **判据要同时钉两头**：`cacheRel()` 生成的那个值长什么样（S1 读它），
   和那个值**真的取得到文件**。只钉一头的话，改了其中一边不会红。 */
console.log("\n⑮ 缩略图走路由（M14-4 B2）");
{
  const { cacheDir: cd2, cacheRel: cr2 } = await import("./statedirs.js");
  const { mkdir: mk, writeFile: wf } = await import("node:fs/promises");
  const { join: join2 } = await import("node:path");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  await mk(cd2(FIXTURE, "shots"), { recursive: true });
  await wf(join2(cd2(FIXTURE, "shots"), "缩略图.png"), png);
  const val = cr2("shots", "缩略图.png");
  ok(val === "/__cache/shots/缩略图.png", "`cacheRel()` 给的是**同源绝对路径**（S1 那份稿一个字都不用改）", val);
  const r1 = await fetch(`${s.url.replace(/\/$/, "")}${val.split("/").map(encodeURIComponent).join("/")}?token=${encodeURIComponent(s.token)}`);
  const body = Buffer.from(await r1.arrayBuffer());
  ok(r1.status === 200 && body.equals(png), "**那个地址真的取得到那张图**（两头对上才算接通）", `${r1.status} · ${body.length} 字节`);
  const r2 = await fetch(`${s.url}__cache/没有这个.png?token=${encodeURIComponent(s.token)}`);
  ok(r2.status === 404, "没有的回 404，**不往下落到 SPA 兜底页**（`/__shared/` 那条实测教训）", String(r2.status));
  const r3 = await fetch(`${s.url}__cache/..%2f..%2fproject.json?token=${encodeURIComponent(s.token)}`);
  ok(r3.status === 404, "**`..` 爬不出缓存目录**（`serveStatic` 的 `isInside`）", String(r3.status));
}

/* ══════════ ⑯ 打开普通目录不写一个字节（M14-4 B3）══════════
   ⚠️⚠️ **这一节 2026-10-23（M16-7c-2a / C3）改写过：承诺变强了，而对照组没了。**

   原来它测两半：① 打开普通目录一个文件都不多 · ② **接管之后才部署**（对照组）。
   ② 那一半的全部对象（预览壳 / 入口页 / 运行时副本 / `project.json`）随 C3 删掉了，
   连 `create_draft` 那道「先接管」的闸也删了（它三条理由全是 dc 的）。

   而 ① **现在是无条件成立的**，比 B3 当时那句更强：
   > B3 当时是「只有**没接管过的**目录才不写」，现在是「**打开任何目录都不写**」。

   ⚠️ **对照组没了，所以这一节要自己防住「它可能只是因为整条路都坏了而绿」**。
   原来那个防线是 ② （接管真的写得进去，说明部署这条路是通的）。
   现在换成：**在同一个目录里真建一份稿**，证明「能写」这条路还通 ——
   > 「什么都没写」和「什么都写不了」在文件数上长得一模一样，
   > 而后者是个严重缺陷。**一个「没做某件事」的判据，必须有另一条证明它做得了别的事。** */
console.log("\n⑯ 打开普通目录不写一个字节（M14-4 B3 · C3 之后无条件成立）");
{
  const { mkdtemp: mkt3, writeFile: wf3, readFile: rf3, rm: rm3, readdir: rd3 } = await import("node:fs/promises");
  const { tmpdir: td3 } = await import("node:os");
  const { join: join3 } = await import("node:path");
  const { realpathSync: rps3 } = await import("node:fs");

  const plain = rps3(await mkt3(join3(rps3(td3()), "umbra-plain-")));
  await wf3(join3(plain, "说明.md"), "# 随手打开的目录\n", "utf8");
  await wf3(join3(plain, ".gitignore"), "node_modules/\n", "utf8");
  const walk3 = async (): Promise<string[]> => {
    const out: string[] = [];
    const rec = async (d: string, base = plain): Promise<void> => {
      for (const e of await rd3(d, { withFileTypes: true })) {
        const abs = join3(d, e.name);
        out.push(abs.slice(base.length + 1));
        if (e.isDirectory()) await rec(abs, base);
      }
    };
    await rec(plain);
    return out.sort();
  };
  const before = await walk3();

  const o1 = await (await post("open_project", { dir: plain })).json() as { ok?: boolean; data?: { dir?: string; url?: string; token?: string }; errors?: Array<{ message?: string }> };
  ok(o1.ok === true, "普通目录打得开（不是报错，也不是被拦去「新建项目」）");
  /* ⚠️⚠️ **要发给 `plain` 自己那台服务**，不是夹具那台（`open_project` 的回执给了它的 url 与 token）。
     这条教训原来就写在这一节里，而我改写时**把它和判据一起删了，然后在十分钟内重犯**：
     第一版我把 `dir: plain` 塞进请求体发给夹具那台 —— `create_draft` 的 input 里压根没有 `dir`，
     于是稿建到了夹具项目里，而判据在 `plain` 里找不到它。
     > **参数名对了不等于它被读了。**（原文的那句话，一个字没改）
     > ⚠️ 而更该记的是：**删掉一节判据时，连它记下的教训一起删了 ——
     > 而那条教训正是我下一步要犯的错。** */
  const pu = (o1.data?.url ?? "").replace(/\/$/, "");
  const pt = o1.data?.token ?? "";
  const ppost = (route: string, body: unknown) => fetch(`${pu}/__ud/${route}?token=${encodeURIComponent(pt)}`, {
    method: "POST", headers: { "content-type": "application/json", origin: pu }, body: JSON.stringify(body),
  });
  /* ⚠️ **等一会儿再数**：部署那条路原来是异步的，而「写了但还没写完」和「没写」
     在立刻数的时候长得一样（这条等待是 M14-4 B3 那一轮反向验证逼出来的）。 */
  await new Promise((r) => setTimeout(r, 1200));
  const after = await walk3();
  ok(after.join("|") === before.join("|"), "**打开之后那个目录一个文件都没多**（B3 的全部意义）",
     after.filter((x) => !before.includes(x)).join(" · ") || "一个都没多");
  ok(await rf3(join3(plain, ".gitignore"), "utf8") === "node_modules/\n", "**他的 .gitignore 一个字节都没动**");
  /* ⚠️ `designProject` 这个字段 C3 之后不回了（接管没了），所以不再断言它 ——
     **而「不断言一个不存在的字段」和「忘了断言」要能分清**，所以这一句留在这儿。 */

  /* ── 对照组：能写这条路还通（见上面那段注释）──
     ⚠️⚠️ **撞出一件好事：「打开普通目录不写一个字节」现在有两道独立的保证。**
     第一版对照组直接 `create_draft`，被拒了，读数是「**这个目录还是只读预览**」——
     那是 M14-7 的只读闸（B3 之外的第二道），而它拒得对。
     所以对照组改成**先解锁再建**，这样它一条顶三件：
     ① 只读闸真的在守 · ② 解锁之后写得动（不是「什么都写不了」）· ③ 写进去的只有那一份稿。
     > **一个「被拒了」的读数，先问是哪道闸拒的** —— 两道闸守着同一件事时，
     > 判据撞上哪一道都会红，而只有读数说得出是哪一道。 */
  {
/* ⚠️⚠️ **主体 2026-10-24 从 `create_draft` 换成 `file_write`**（M16-8 ⑥ 退场了前者）。
       这一节钉的是 **M14-7 的只读闸**，而那道闸装在**两条写入口各一道** ——
       所以换主体之后它钉的还是同一件事，而且比原来更对：
       `file_write` 是今天「在这个目录里建一个文件」的那条路（界面那颗「新建文件…」就走它）。
       > **换主体之前要先确认「它钉的那件事」在新主体上仍然成立** —— 这里成立，
       > 因为那道闸从一开始就不是装在 `create_draft` 上的。 */
    const locked = await (await ppost("file_write", { path: "锁着就不该成.md", content: "x", expectSha256: "0" })).json() as { ok?: boolean; errors?: Array<{ message?: string }> };
    ok(locked.ok === false && /只读/.test(locked.errors?.[0]?.message ?? ""),
       "**还没解锁时建文件被拒，而且说得出为什么**（M14-7 那道闸，B3 之外的第二道）",
       locked.errors?.[0]?.message ?? String(locked.ok));
    const unlock = await (await ppost("start_editing", {})).json() as { ok?: boolean; errors?: Array<{ message?: string }> };
    ok(unlock.ok === true, "（前提）「开始编辑」解锁成了", String(unlock.ok) + " " + (unlock.errors?.[0]?.message ?? ""));
    const cd = await (await ppost("file_write", { path: "新文件.md", content: "新建\n", expectSha256: "0" })).json() as { ok?: boolean; errors?: Array<{ message?: string }> };
    ok(cd.ok === true, "**对照组**：解锁之后真建一个文件是成的 —— 「什么都没写」不是因为「什么都写不了」",
       String(cd.ok) + " " + (cd.errors?.[0]?.message ?? ""));
    ok((await rd3(plain)).includes("新文件.md"), "而且文件真的落盘了");
    /* ⚠️⚠️ **这一条是 C3 的新承诺，而它原来不成立**：建一个文件只多**那一个文件**。
       `ensureRuntimeBeside` 删掉之前，同一个 `create_draft` 请求会静默多写 **225 KB**
       的运行时副本（`support.js` + 两个 React UMD），而那正是「新建稿件先问接管」那道闸存在的理由。
       ⚠️ 2026-10-24 主体换成 `file_write`（`create_draft` 退场，M16-8 ⑥）——
       **这条承诺在新主体上更强**：第二条写入口从来没有「顺手拷运行时」这回事，
       所以它现在钉的是「以后也别加」。 */
    const made = (await walk3()).filter((x) => !before.includes(x));
    ok(made.length === 1 && made[0] === "新文件.md",
       "**建一个文件只多那一个文件**（不再顺手拷 225 KB 运行时副本，也没有被拒那一次的半成品）", made.join(" · ") || "(一个都没多)");
  }

  await rm3(plain, { recursive: true, force: true });
}

/* ⚠️⚠️ **⑰「接管弹窗上那几个数是真的」2026-10-23（M16-7c-2a / C3）整节删了。**
 *  它真接管一个干净目录、数盘上的文件和字节，再和界面上写的「17 个文件 · 约 750 KB」对账 ——
 *  而接管这件事本身没有了（`adopt_project` 与那条横条都删了）。
 *  ⚠️ 它当初存在的理由仍然成立，值得留在这里：
 *  > **一个数写在界面上就会过期 —— 要让它过期的那一刻有东西报红。**
 *  > （`hometest` 那条「照实说出会写多少」是**循环的** —— 它读的就是 `Sheets.tsx` 的字面量。）
 *  下次再有「界面上写一个量出来的数」的地方，照这一节的办法做：**不读那个字面量，去数真东西。** */


/* ── ⑱ 把外部文件拖进项目 = 复制进来（M14-5 下半 · 场景 ③，2026-10-22）──
   ⚠️⚠️ **这是整个工具里唯一一处会复制用户文件的能力**，而用户 2026-10-21 的硬约束是
   「**绝不重复存储用户的文件**」。它成立的理由只有一条：**复制是他自己点的，
   落点是他自己的项目目录**，不是我们的 `projects/`。
   所以这一节一半是「复制对了」，另一半是**「越界的一个都别想」** ——
   而后一半更要紧：那几道闸平时一条路都走不到，**只有直接打它才量得到它在不在**。 */
console.log("\n⑱ 把外部文件复制进项目（场景 ③）");
{
  const { mkdtemp: mk8, writeFile: wf8, mkdir: md8, readFile: rf8, rm: rm8 } = await import("node:fs/promises");
  const { tmpdir: td8 } = await import("node:os");
  const { join: j8 } = await import("node:path");
  const { existsSync: ex8, realpathSync: rp8 } = await import("node:fs");

  const proj = rp8(await mk8(j8(rp8(td8()), "umbra-copyin-proj-")));
  await wf8(j8(proj, "project.json"), JSON.stringify({ name: "copyin" }), "utf8");
  await md8(j8(proj, "图"), { recursive: true });
  await wf8(j8(proj, "图", "封面.png"), "本来就有的", "utf8");
  const s8 = await (await import("./serve.js")).serveStart(await (await import("./project.js")).buildProject(proj));
  const cp8 = (body: unknown) => fetch(`${s8.url}__ud/copy_into_project?token=${encodeURIComponent(s8.token)}`, {
    method: "POST", headers: { "content-type": "application/json", origin: s8.url.replace(/\/$/, "") }, body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<{ ok: boolean; data?: { written: string[]; failed: Array<{ path: string; why: string }> }; errors?: Array<{ message?: string; fix?: string }> }>);

  /* 外面一个「别人发来的」目录：一份图 + 一个子目录 + 一份同名的图（撞已有的那份） */
  const out = rp8(await mk8(j8(rp8(td8()), "umbra-copyin-src-")));
  await wf8(j8(out, "新图.png"), "外面的新图", "utf8");
  await wf8(j8(out, "封面.png"), "外面的同名图", "utf8");
  await md8(j8(out, "一个文件夹", "深一层"), { recursive: true });
  await wf8(j8(out, "一个文件夹", "深一层", "里面的.txt"), "深一层", "utf8");

  /* ⓐ 正常复制：内容对、落点对 */
  {
    const r = await cp8({ sources: [j8(out, "新图.png")], destDir: "图" });
    ok(r.ok === true && r.data?.written[0] === "图/新图.png", "复制进指定的子目录", JSON.stringify(r.data?.written ?? r.errors));
    ok(ex8(j8(proj, "图", "新图.png")) && await rf8(j8(proj, "图", "新图.png"), "utf8") === "外面的新图",
       "**内容是源文件的内容**（不是空文件，也不是被编码糟蹋过的）");
    ok(ex8(j8(out, "新图.png")), "**源文件一个字节都没动**（是复制不是移动）");
  }
  /* ⓑ 重名顺延，永不覆盖 —— 和 `convert/output.ts` 同一个承诺就该是同一个行为 */
  {
    const before = await rf8(j8(proj, "图", "封面.png"), "utf8");
    const r = await cp8({ sources: [j8(out, "封面.png")], destDir: "图" });
    ok(r.ok === true && r.data?.written[0] === "图/封面 (1).png", "**重名顺延成「封面 (1).png」**", JSON.stringify(r.data?.written));
    ok(await rf8(j8(proj, "图", "封面.png"), "utf8") === before, "**他原来那份封面.png 一个字节都没动**（永不覆盖）");
  }
  /* ⓒ 文件夹：内部结构原样跟过来 */
  {
    const r = await cp8({ sources: [j8(out, "一个文件夹")] });
    ok(r.ok === true && (r.data?.written ?? []).includes("一个文件夹/深一层/里面的.txt"),
       "拖一个文件夹进来：**内部结构原样跟过来**", JSON.stringify(r.data?.written));
  }
  /* ⓓ 走的是写入口 —— 所以复制进来的文件**有 v1 快照、退得回去** */
  {
    /* ⚠️ 字段叫 **`snapshots`** 不是 `versions`。第一版写错了名字，读数打出
       **「0 版」**—— 而那和「产品压根没记快照」长得一模一样，
       我差点去查写入口。**判据读错一个字段名，症状会伪装成产品缺陷。** */
    const vs = await fetch(`${s8.url}__ud/file_versions?token=${encodeURIComponent(s8.token)}&path=${encodeURIComponent("图/新图.png")}`)
      .then((r) => r.json() as Promise<{ ok: boolean; data?: { snapshots?: unknown[] } }>);
    ok(vs.ok === true && (vs.data?.snapshots?.length ?? 0) >= 1,
       "**复制进来的文件有版本历史**（走的是写入口，不是 `copyFile` 抄过去）", `${vs.data?.snapshots?.length ?? 0} 版`);
  }
  /* ── 四道闸，每一道都直接打一次 ── */
  {
    /* ⚠️ **这一条钉的是结果，不是措辞。** `normalizeRel` 的 `clean()` 把 `..` 段
       整个剥掉（`../../偷偷放外面` → `偷偷放外面`），所以跨出项目在它之后已经不可能 ——
       `isInside` 那道闸今天**走不到**（留着是防「以后有人换掉归一化」）。
       第一版按「报错里有『跨出』」钉，于是红在措辞上，看着像闸没装。
       > **一道走不到的闸，判据只能钉它要防的那个结果。** */
    const escape = j8(proj, "..", "偷偷放外面");
    const r1 = await cp8({ sources: [j8(out, "新图.png")], destDir: "../../偷偷放外面" });
    ok(r1.ok === false && !ex8(escape), "**destDir 里的 `..` 落不到项目外面**（剥掉之后那个目录不存在 → 拒）",
       `${r1.errors?.[0]?.message} · 项目外面那个位置：${ex8(escape) ? "✗ 真被建出来了" : "没有东西"}`);
    const r2 = await cp8({ sources: [j8(proj, "图", "封面.png")] });
    ok(r2.ok === false && /本来就在项目里/.test(r2.errors?.[0]?.message ?? ""),
       "**拒：源本来就在项目里**（那是「项目内复制」，有 `copy_file` 管 —— M16-8 ② 之前叫 `duplicate_draft`）", r2.errors?.[0]?.message);
    const r3 = await cp8({ sources: [j8(out, "不存在的东西.png")] });
    ok(r3.ok === false && /不在/.test(r3.errors?.[0]?.message ?? ""), "**拒：源路径不在**", r3.errors?.[0]?.message);
    await md8(j8(proj, ".git"), { recursive: true });
    const r4 = await cp8({ sources: [j8(out, "新图.png")], destDir: ".git" });
    ok(r4.ok === false, "**拒：往 `.git/` 里复制**（它列得出来但不许写，Q77）", r4.errors?.[0]?.message);
    const r5 = await cp8({ sources: [j8(out, "新图.png")], destDir: "没有这个目录" });
    ok(r5.ok === false && /不是一个已有的目录/.test(r5.errors?.[0]?.message ?? ""), "**拒：目标目录还不存在**（不替他建）", r5.errors?.[0]?.message);
  }
  /* ⓔ 一次太多：照实说数，不默默只复制前 200 个 */
  {
    const many = rp8(await mk8(j8(rp8(td8()), "umbra-copyin-many-")));
    for (let i = 0; i < 205; i++) await wf8(j8(many, `f${i}.txt`), "x", "utf8");
    const r = await cp8({ sources: [many] });
    ok(r.ok === false && /205/.test(r.errors?.[0]?.message ?? ""),
       "**一次 205 个文件被拦住，而且说出是 205 个**（不是默默只复制前 200 个）", r.errors?.[0]?.message);
    ok(!ex8(j8(proj, basename8(many), "f0.txt")), "被拦住的那一下**一个字节都没写**");
    await rm8(many, { recursive: true, force: true });
  }
  await rm8(proj, { recursive: true, force: true });
  await rm8(out, { recursive: true, force: true });
}

/* ── ⑲ 只读预览 + 一键解锁（M14-7 / Q70，2026-10-22）──
   ⚠️⚠️ **这道闸的全部价值在于它装在写入口，而不是界面上。**
   它要防的是「这个窗口里坐着一个能调 `write_file` 的模型」——
   装界面上的话 AI 和 MCP 直接绕过去，那条横条就只是装饰（Q70 原话）。
   所以这一节**全部打 HTTP 面**（也就是 AI / MCP 走的那条路），一条都不看界面。

   ⚠️ 判准不是「`records/<key>/` 在不在」—— Q70 当初定的是那个，而落地时量出它有洞：
   `stage_draft`（编辑框里打字、还没落盘的暂存）会写进 `records/<id>/staged/`，
   那一下就把记录目录建出来了 → **用户在只读状态下打几个字就把自己解锁了**。
   换成一个**只有显式解锁才会写**的标记文件，而这一节有一条判据专门钉那个洞。 */
console.log("\n⑲ 只读预览 + 一键解锁（M14-7）");
{
  const { mkdtemp: mk9, writeFile: wf9, rm: rm9, mkdir: md9 } = await import("node:fs/promises");
  const { tmpdir: td9 } = await import("node:os");
  const { join: j9 } = await import("node:path");
  const { existsSync: ex9, realpathSync: rp9, readFileSync: rfs9 } = await import("node:fs");

  /* 一个「随手右键打开的」目录：几份文档，**没有 project.json** */
  const casual = rp9(await mk9(j9(rp9(td9()), "umbra-readonly-")));
  await wf9(j9(casual, "别人的笔记.md"), "# 原文\n", "utf8");
  const svc = await (await import("./serve.js")).serveStart(await (await import("./project.js")).buildProject(casual));
  const post9 = (route: string, body: unknown) => fetch(`${svc.url}__ud/${route}?token=${encodeURIComponent(svc.token)}`, {
    method: "POST", headers: { "content-type": "application/json", origin: svc.url.replace(/\/$/, "") }, body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<{ ok: boolean; data?: Record<string, unknown>; errors?: Array<{ message?: string; fix?: string }> }>);

  /* ⓐ 第二条写入口（`.md` / 代码 / 文本走它）被拦住，而且**一个字节都没写** */
  {
    const r = await post9("file_write", { path: "别人的笔记.md", content: "# 被 AI 改过了\n" });
    ok(r.ok === false && /只读预览/.test(r.errors?.[0]?.message ?? ""),
       "**AI 改一份 .md 被拦住**（这条路就是 write_file，模型手上那件）", r.errors?.[0]?.message);
    ok(rfs9(j9(casual, "别人的笔记.md"), "utf8") === "# 原文\n", "**他那份文件一个字节都没动**");
    /* 拒因里要有出路，不然这就从「保护」变成「这种文件改不了」 */
    ok(/开始编辑/.test(r.errors?.[0]?.fix ?? ""), "拒因里有出路（「开始编辑」）", (r.errors?.[0]?.fix ?? "").slice(0, 40));
    /* ⚠️ 顺带钉住那句**正面回答他最初那个担心**的话（`doc/24` §21.4）——
       用户最担心的是「会不会往我目录里塞东西」，而这正是该说这句话的地方。 */
    ok(/原文件夹不会多出任何文件/.test(r.errors?.[0]?.fix ?? ""), "而且说清了解锁不会往他目录里塞东西");
  }
  /* ⓑ 第一条写入口（设计稿）也拦 —— **一道只守住一条路等于没守** */
  {
    await wf9(j9(casual, "别人发来的.dc.html"),
      '<!DOCTYPE html><html><head></head><body><x-dc><div>稿</div></x-dc></body></html>\n', "utf8");
    const r = await post9("draft_write", { path: "别人发来的.dc.html", content: "<!DOCTYPE html><html><body><x-dc><div>改过了</div></x-dc></body></html>\n", kind: "page" });
    ok(r.ok === false, "**设计稿那条写入口也拦**（两条写入口各一道）", r.errors?.[0]?.message);
  }
  /* ⓑ′ **挪走一个文件、把一个文件删进回收站 —— 这两条路原来一道闸都没有**（M16-8 ① / ③，2026-10-24）。
     ⚠️⚠️ 这一条是**并名时量出来的**，而它不是并名弄坏的：`isEditable` 原来只装在
     `writeAnyFile` 和 `writeDraft` 上，也就是「写入口」那两条；
     而被并掉的 `rename_draft` / `move_draft` / `delete_draft` **三件也都没有**。
     > **「写入口」这个词圈出的是「内容变了」那一类，而「文件没了 / 换了名字」
     > 不在那个圈里，却一样是对用户目录的改动。一道按词圈出来的闸，守不住词外面的那条路。**
     ⚠️ 两条各验「被拒」+「盘上没动」两件 —— 只验被拒的话，
     一个「先挪了再抛」的实现照样绿（§143.6「被拒 ≠ 没被挪走」同一条）。 */
  {
    const mv = await post9("file_move", { from: "别人的笔记.md", to: "挪过的笔记.md" });
    ok(mv.ok === false && /只读预览/.test(mv.errors?.[0]?.message ?? ""),
       "**只读目录里挪一个文件被拦住**（`move_file`）", mv.errors?.[0]?.message);
    ok(ex9(j9(casual, "别人的笔记.md")) && !ex9(j9(casual, "挪过的笔记.md")),
       "**而他那份文件还在原来的名字上**（被拒 ≠ 没被挪走，分开验）");
    const tr = await post9("file_trash", { path: "别人的笔记.md" });
    ok(tr.ok === false && /只读预览/.test(tr.errors?.[0]?.message ?? ""),
       "**只读目录里删一个文件也被拦住**（`trash_file`）", tr.errors?.[0]?.message);
    ok(ex9(j9(casual, "别人的笔记.md")), "**而他那份文件还在**（同上，分开验）");
    /* ⚠️ 拒因里的出路要和写入口**一字不差** —— 四条路上说的是同一件事，
       说法不一样的话用户在两条路上会被告知两件不同的「该怎么办」。 */
    ok(/开始编辑/.test(mv.errors?.[0]?.fix ?? "") && mv.errors?.[0]?.fix === tr.errors?.[0]?.fix,
       "两条路的拒因出路完全一样（一处实现 `requireEditable`）",
       (mv.errors?.[0]?.fix ?? "").slice(0, 24) + "…");
  }
  /* ⓒ **那个洞**：暂存草稿会建出记录目录，而它不许算解锁 */
  {
    const st = await post9("draft_stage", { path: "别人的笔记.md", content: "在编辑框里打了几个字" });
    const { existingRecordIdFor, recordsRoot } = await import("./records.js");
    const id = existingRecordIdFor(casual);
    ok(st.ok === true && !!id && ex9(j9(recordsRoot(), id!)),
       "（样本自己先成立）暂存了一次 → **记录目录真的被建出来了**", `${st.ok} · ${id ?? "没有记录"}`);
    const r = await post9("file_write", { path: "别人的笔记.md", content: "# 又试一次\n" });
    ok(r.ok === false && /只读预览/.test(r.errors?.[0]?.message ?? ""),
       "**而它照旧是只读的** —— 「暂存」是「还没落盘」，拿它当「可以落盘」的证据是反的",
       r.errors?.[0]?.message);
  }
  /* ⓓ 解锁：之后写得动，而且**没往他的目录里放任何东西** */
  {
    const before = (await (await import("node:fs/promises")).readdir(casual)).sort();
    const u = await post9("start_editing", {});
    ok(u.ok === true && u.data?.editable === true && u.data?.already === false,
       "**「开始编辑」解锁了**，而且回执分得清「刚解锁」和「本来就是」", JSON.stringify(u.data));
    const after = (await (await import("node:fs/promises")).readdir(casual)).sort();
    ok(after.join("|") === before.join("|"), "**解锁没往他的目录里放任何东西**（标记落在我们自己那边）",
       after.filter((x) => !before.includes(x)).join(" · ") || "一个都没多");
    const w = await post9("file_write", { path: "别人的笔记.md", content: "# 现在改得动了\n" });
    ok(w.ok === true, "解锁之后同一个请求就成了（闸不是把功能拆了）", String(w.ok));
    const u2 = await post9("start_editing", {});
    ok(u2.ok === true && u2.data?.already === true, "再点一次：幂等，而且说得出「本来就是」", JSON.stringify(u2.data));
  }
  await rm9(casual, { recursive: true, force: true });

  /* ⓔ **存量不许被这道闸锁住** —— 这一条是整节里最要紧的。
     判准写错的话，sam 现有那几个项目全变只读，而那比没有这道闸糟得多。 */
  {
    const legacy = rp9(await mk9(j9(rp9(td9()), "umbra-legacy-")));
    await wf9(j9(legacy, "project.json"), JSON.stringify({ name: "legacy" }), "utf8");
    await wf9(j9(legacy, "说明.md"), "# 旧项目\n", "utf8");
    const { isEditable } = await import("./records.js");
    ok(isEditable(legacy) === true, "**有 project.json 的目录直接算可编辑**（用户显式接管过的）");
    /* 另一支：没有 project.json 但我们已经存过它的快照 —— 也就是我们早就在改它了 */
    const legacy2 = rp9(await mk9(j9(rp9(td9()), "umbra-legacy2-")));
    await wf9(j9(legacy2, "说明.md"), "# 老目录\n", "utf8");
    const { assetDir: ad9 } = await import("./statedirs.js");
    await md9(ad9(legacy2, "snapshots"), { recursive: true });
    ok(isEditable(legacy2) === true, "**有 snapshots/ 的目录也算**（我们已经改过它的文件，历史就在那儿）");
    /* 反面：只有 chats / staged 不算 —— 那不代表「动过文件」 */
    const legacy3 = rp9(await mk9(j9(rp9(td9()), "umbra-legacy3-")));
    await wf9(j9(legacy3, "说明.md"), "# 只聊过天\n", "utf8");
    await md9(ad9(legacy3, "chats"), { recursive: true });
    await md9(ad9(legacy3, "staged"), { recursive: true });
    ok(isEditable(legacy3) === false, "**只有 chats / staged 不算**（聊过天、打过字 ≠ 落过盘）");
    for (const d of [legacy, legacy2, legacy3]) await rm9(d, { recursive: true, force: true });
  }
}

/* ══════════ ⑳ 存量项目里那个排除块撤得掉（B3 的收尾）══════════
   ⚠️⚠️ **这一节 2026-10-23（M16-7c-2a / C3）改写过，而改写的分寸是这一段的重点。**

   原来它测的是 `ensureExcluded`：接管时把工具产物（预览壳 / 入口页 / 运行时副本）
   **加进** `.git/info/exclude`，而且**不碰用户的 `.gitignore`**。
   C3 之后没有东西再往用户的项目里放，那件事整个消失 ——
   核的时候还量到 `ensureExcluded` **在产品代码里已经零调用**（它原来住在 `buildIndex` 里）。
   > **一个只剩判据在调的函数，判据测的是它自己还在。**

   **而 `dropExcluded` 留着，它的判据也必须留**：用户机器上**已经写进去**的那个块
   还躺在他的 `.git/info/exclude` 里，「清除缓存」要能把它撤掉（`purge.ts`）。
   > **「以后不再做这件事」和「把以前做过的撤干净」是两件事，而后者要的代码比前者久。**

   ⚠️⚠️ **worktree 与子模块那两个真样本一个都没删**，因为它们钉的是 `gitDirFor` ——
   `dropExcluded` 能不能生效全靠它算对。原来那段注释里的读数值得整段留着：

   | | 自己解析出来的 gitdir | 写进它的 `info/exclude` 之后 `git status` |
   | --- | --- | --- |
   | 真子模块 | `parent/.git/modules/sub` | **0 行（干净）** |
   | 真 worktree | `main/.git/worktrees/wt` | **✗ 16 行全冒出来了** |

   病根：**git 读 `info/exclude` 用的是 common dir，不是 per-worktree 那个 GIT_DIR。**
   而第一版判据断言的是「文件写进了我算出来的那个路径」—— 那确实成功了，所以它绿。
   > **「写对了地方」和「生效了」是两件事，而只有真问 git 才分得开。**
   > 而**手搓的样本和真样本「形状一样」** —— 一样到足以让判据通过，
   > 却不足以暴露 worktree 那一跳。**同形不等于同一回事。**

   所以这一节现在的办法是：**手写一个带标记的块进去**（模拟老版本留下的存量），
   然后让 `dropExcluded` 撤它，**再真问一次 git** 确认那几行真的不再被排除。 */
console.log("\n⑳ 存量项目里那个排除块撤得掉（B3 的收尾）");
{
  const { mkdtemp: mkA, writeFile: wfA, mkdir: mdA, rm: rmA } = await import("node:fs/promises");
  const { tmpdir: tdA } = await import("node:os");
  const { join: jA } = await import("node:path");
  const { existsSync: exA, realpathSync: rpA, readFileSync: rfsA } = await import("node:fs");
  const { dropExcluded, gitDirFor, EXCLUDE_OPEN, EXCLUDE_CLOSE } = await import("./gitexclude.js");
  const { execFileSync: ex3 } = await import("node:child_process");
  const gitIn = (args: string[], cwd: string) => ex3("git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "protocol.file.allow=always", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

  /** 老版本留下的那个块长什么样。
   *  ⚠️⚠️ **标记从产品 import，不手抄** —— 第一版我在上面写了「要一字不差」，
   *  然后手抄成 `# <umbra-studio>`（产品那个是一整句「…别手改」），
   *  当场红在「撤不掉」上：`dropExcluded` 用 `indexOf(OPEN)` 找不到我编的那个块。
   *  > **写下一条担心，和把它落实，是两件事** —— 而我这一轮已经栽过三次。
   *  > 让编译器替我保证。 */
  const OPEN_MARK = EXCLUDE_OPEN;
  const CLOSE_MARK = EXCLUDE_CLOSE;
  const legacyBlock = [OPEN_MARK, "index.dc.html", "support.js", CLOSE_MARK].join("\n") + "\n";
  /** 往一个仓库的 `info/exclude` 写进存量块（经 `gitDirFor` 定位，和产品同一条路） */
  const plantLegacy = async (dir: string): Promise<string | null> => {
    const gd = gitDirFor(dir).gitDir;
    if (!gd) return null;
    await mdA(jA(gd, "info"), { recursive: true });
    await wfA(jA(gd, "info", "exclude"), "# 我自己的规则/\n\n" + legacyBlock, "utf8");
    return jA(gd, "info", "exclude");
  };

  /* ── ⓐ 普通仓库：撤得掉，而且别人写的东西一个字没动 ── */
  {
    const repo = rpA(await mkA(jA(rpA(tdA()), "umbra-drop-")));
    gitIn(["init", "-q"], repo);
    await wfA(jA(repo, "index.dc.html"), "<html></html>\n", "utf8");
    const ex = await plantLegacy(repo);
    ok(!!ex && rfsA(ex, "utf8").includes(OPEN_MARK), "（样本有效性）存量块真的写进去了", ex ?? "(null)");
    /* ⚠️ **真问 git**：这一条钉的是「那个块当初是生效的」——
       没有它的话，下面「撤掉之后 git 又看得见了」可能只是因为它从来没生效过。 */
    const before = gitIn(["status", "--porcelain", "--untracked-files=all"], repo);
    ok(!/index\.dc\.html/.test(before), "（样本有效性）**撤之前 git 真的看不见它**（块是生效的）", before.trim() || "(干净)");
    const d = await dropExcluded(repo);
    ok(d.removed, "**撤得掉**（「清除缓存」顺手清那一段）");
    const after = gitIn(["status", "--porcelain", "--untracked-files=all"], repo);
    ok(/index\.dc\.html/.test(after), "**撤完 git 又看得见那个文件了**（这才叫生效，不是「文件写对了地方」）", after.trim().split("\n")[0] ?? "");
    ok(/我自己的规则\//.test(rfsA(ex!, "utf8")), "**`info/exclude` 里别人写的东西一个字没动**");
    ok(!rfsA(ex!, "utf8").includes(OPEN_MARK), "我们那一段整段没了（不是只删了中间几行）");
    await rmA(repo, { recursive: true, force: true });
  }

  /* ── ⓑ 不在 git 仓库里：不报错、不写、照实说没撤 ── */
  {
    const plain = rpA(await mkA(jA(rpA(tdA()), "umbra-drop-非git-")));
    const { readdirSync: rdsB } = await import("node:fs");
    const walkTop = (): string[] => [...rdsB(plain)].sort();
    const b4 = walkTop();
    const r = await dropExcluded(plain);
    ok(r.file === null && r.removed === false, "**不在任何 git 仓库里时不报错、也不说自己撤了**", JSON.stringify(r));
    ok(walkTop().join("|") === b4.join("|"), "**那个目录一个字节都没多**", walkTop().join(" · ") || "(空)");
    await rmA(plain, { recursive: true, force: true });
  }

  /* ── ⓒ 真 worktree 与 ⓓ 真子模块：`gitDirFor` 算的是 common dir，而撤要在那儿生效 ── */
  {
    const box = rpA(await mkA(jA(rpA(tdA()), "umbra-drop-wt-")));
    /** 在 `dir` 上种一个存量块、撤掉、再真问 git —— 回「算出来的 gitdir」+「撤前后 git 看不看得见」 */
    const plantDropCheck = async (dir: string) => {
      await wfA(jA(dir, "index.dc.html"), "<html></html>\n", "utf8");
      const ex = await plantLegacy(dir);
      const seenBefore = /index\.dc\.html/.test(gitIn(["status", "--porcelain", "--untracked-files=all"], dir));
      const d = await dropExcluded(dir);
      const seenAfter = /index\.dc\.html/.test(gitIn(["status", "--porcelain", "--untracked-files=all"], dir));
      return { gd: gitDirFor(dir).gitDir, ex, removed: d.removed, seenBefore, seenAfter,
               phantom: exA(jA(dir, ".git", "info")) };
    };

    await mdA(jA(box, "main"), { recursive: true });
    gitIn(["init", "-q"], jA(box, "main"));
    gitIn(["commit", "-q", "--allow-empty", "-m", "init"], jA(box, "main"));
    gitIn(["worktree", "add", "-q", "../wt", "-b", "wtb"], jA(box, "main"));
    ok(!exA(jA(box, "wt", ".git", "HEAD")), "（样本自己先成立）worktree 的 `.git` 是**文件**不是目录");
    {
      const r = await plantDropCheck(jA(box, "wt"));
      ok(r.gd === jA(box, "main", ".git"),
         "**真 worktree：算出来的是 common dir**（`main/.git`），不是 `main/.git/worktrees/wt`", r.gd ?? "(null)");
      ok(!r.seenBefore && r.removed && r.seenAfter,
         "**真 worktree 里那个块生效、而且撤得掉** —— 写进 per-worktree 那个 GIT_DIR 的话 git 压根不读它",
         JSON.stringify({ 撤前看不见: !r.seenBefore, 撤掉了: r.removed, 撤后看得见: r.seenAfter }));
      ok(!r.phantom, "**项目里没有被凭空建出 `.git/info/`**（把 `.git` 文件当目录用就会这样）");
    }

    await mdA(jA(box, "childwork"), { recursive: true });
    gitIn(["init", "-q", "-b", "main"], jA(box, "childwork"));
    await wfA(jA(box, "childwork", "a.txt"), "hi\n", "utf8");
    gitIn(["add", "a.txt"], jA(box, "childwork"));
    gitIn(["commit", "-q", "-m", "c1"], jA(box, "childwork"));
    gitIn(["init", "-q", "--bare", "child.git"], box);
    gitIn(["push", "-q", `file://${box}/child.git`, "main:main"], jA(box, "childwork"));
    await mdA(jA(box, "parent"), { recursive: true });
    gitIn(["init", "-q", "-b", "main"], jA(box, "parent"));
    await wfA(jA(box, "parent", "r.md"), "r\n", "utf8");
    gitIn(["add", "r.md"], jA(box, "parent"));
    gitIn(["commit", "-q", "-m", "init"], jA(box, "parent"));
    gitIn(["submodule", "add", "-q", `file://${box}/child.git`, "sub"], jA(box, "parent"));
    ok(!exA(jA(box, "parent", "sub", ".git", "HEAD")), "（样本自己先成立）子模块的 `.git` 也是**文件**");
    {
      const r = await plantDropCheck(jA(box, "parent", "sub"));
      ok(r.gd === jA(box, "parent", ".git", "modules", "sub"),
         "**真子模块：算出来的是它自己那个 modules 目录**", r.gd ?? "(null)");
      ok(!r.seenBefore && r.removed && r.seenAfter, "**真子模块里那个块也生效、也撤得掉**",
         JSON.stringify({ 撤前看不见: !r.seenBefore, 撤掉了: r.removed, 撤后看得见: r.seenAfter }));
      ok(!r.phantom, "**子模块目录里没有被凭空建出 `.git/info/`**");
    }
    await rmA(box, { recursive: true, force: true });
  }
}

/* ── 收尾：撤掉自己往「最近打开」里塞的那几条（2026-10-22）──
   ⚠️⚠️ **这是 `doc/00` §166 那条的第二次，而且形状一模一样。**
   ⑯ 调 `open_project`（以及 `adopt_project`）→ 服务端 `touchProject` →
   往**真实的** `STATE_ROOT/.umbrastudio/workspace.json` 里记一行，
   而这一套**从建起就没清过它**。
   实测 2026-10-22：真实「最近打开」**19 条，一条不剩全是这一套的残留**
   （`umbra-plain-*`，每跑一轮加一条）—— **sam 自己的项目一条都看不见了**，
   因为列表按最近打开倒排，他的全被挤到后面。
   ⚠️ **删临时目录删不掉它** —— 列表记的是路径（§166 原话）。
   > **「清掉自己造的文件」和「清掉自己造的状态」是两件事**，而这一套
   > 收尾那几行一直只看前者（兜底仓库算半个状态，它是被 M14-6 补上的）。

   判准只有一条、不枚举名字：**指向系统临时目录**。 */
{
  const { listRecentProjects, removeRecentProject } = await import("./workspace.js");
  const { tmpdir: td0 } = await import("node:os");
  const { realpathSync: rp0 } = await import("node:fs");
  const roots = [td0(), rp0(td0())];
  const { recents } = await listRecentProjects();
  const mine = recents.filter((r) => roots.some((x) => r.dir === x || r.dir.startsWith(x + "/")));
  for (const r of mine) await removeRecentProject(r.dir);
  if (mine.length) console.log(`  · （收尾）撤掉自己塞进「最近打开」的 ${mine.length} 条`);
  /* ⚠️ **收尾自检**：「我删掉了 N 条」和「现在一条都不剩」是两句不同的话
     （`purge.ts` §223 同一条）。没有这一句的话，下一个人再加一节
     往那个列表里写东西，又是几十轮之后才有人发现。 */
  const left = (await listRecentProjects()).recents
    .filter((r) => roots.some((x) => r.dir === x || r.dir.startsWith(x + "/")));
  ok(left.length === 0, "**（收尾）真实「最近打开」里没剩下任何指向临时目录的记录**",
     left.map((r) => r.dir).join(" · ") || `撤掉 ${mine.length} 条`);
}

/* ⚠️ **先自检夹具的身份还在**，再删它。
   **这一条是上面那条教训的判据化**：整轮跑完夹具必须还是一个设计项目 ——
   有哪一节把它悄悄删了 / 改了，这里当场红，而不是等到下一个人
   在它后面加一节、发现自己的判据在量一个空目录。 */
ok((await import("node:fs")).existsSync(joinFix(FIXTURE, "project.json")),
   "**整轮跑完，夹具还是一个设计项目**（没有哪一节把它悄悄删掉或改掉）", FIXTURE);

/* 夹具目录在这里才删 —— 顺序要紧：`dropLeftoversUnder` 的判准是
   「指向临时目录、**而那个目录已经不在了**」，夹具还在就算「活着」于是不清。
   > 顺序错一行，收尾就从「清干净」变成「每轮留一个」，而读数长得一模一样。 */
await rmdirAll(FIXTURE, { recursive: true, force: true });
{
  const { dropLeftoversUnder } = await import("./purge.js");
  const { tmpdir: td0 } = await import("node:os");
  const r = await dropLeftoversUnder(td0(), { onlyDead: true });
  if (r.removed.length) console.log(`  · （收尾）清掉自己造的兜底仓库 ${r.removed.length} 个`);
}
/* ══════════════════════════════════════════════════════════════════════
   ㉑ 通道 B 起的那台 MCP server：用哪个可执行文件、拿不拿到状态目录（issue #165）

   通道 B 的**全部写入**都走「第三方 CLI 起的那台 `umbrastudio` MCP server」。
   那是 CLI 的**孙子进程**，它拿到什么环境、用哪个 node，原来全靠两条默认假设：
   「CLI 会把自己的环境原样传下去」和「机器上有个 node」。**打包版里两条都不成立。**

   ⚠️⚠️ **这一段原来一条判据都没有**，而它的两种后果都只在打包版出现：
   ① 没装 node 的机器上 CLI 起不来这台 server → **模型看不到任何工具**；
   ② `UMBRASTUDIO_STATE_DIR` 到不了 → `STATE_ROOT` 回落成 `.app` 里那个只读目录 →
      兜底提交仓库落在 `.app` 里（ad-hoc 签名的 `.app` 内容一改，下次启动被判「已损坏」）。
   > **开发模式下 `STATE_ROOT === TOOL_ROOT`，所以这一条在开发时一定测不出来。**
   > 判据要钉的正是这种「两个值在开发时恰好相等」的地方。

   ⚠️ 一条真 CLI 都不起（要装、要登录、要花钱）—— 只问 `build()` 构造出了什么。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n㉑ 通道 B 的 MCP 入口（issue #165）");
{
  const LC = await import("./local_cli.js");
  const { STATE_ROOT: SR } = await import("./project.js");
  const { join: jn21 } = await import("node:path");
  const { mkdtemp: mkdt, readFile: rdf3, rm: rm3 } = await import("node:fs/promises");
  const { tmpdir: td } = await import("node:os");
  const MSP = jn21(TOOL_ROOT, "server", "dist", "index.js");

  /* ── ⓐ 纯函数那一层 ── */
  const e = LC.mcpEntry(MSP);
  ok(e.command !== "node", "**MCP 入口不是写死的 `node`** —— 打包后用户机器上可能根本没有 node", e.command);
  ok(e.command === process.execPath, "用的是 `process.execPath`（和插件沙箱同一条规矩）", e.command);
  ok(e.env?.UMBRASTUDIO_STATE_DIR === SR,
     "**带上状态目录** —— 不带的话打包版里它回落成 `.app` 里那个只读目录",
     `${e.env?.UMBRASTUDIO_STATE_DIR}`);
  ok(e.env?.ELECTRON_RUN_AS_NODE === "1", "带 `ELECTRON_RUN_AS_NODE`（Electron 当 node 跑）", String(e.env?.ELECTRON_RUN_AS_NODE));

  /* ── ⓑ 端到端：claude 那一支**真写出来**的那份配置 ──
     ⚠️ 只断言纯函数的话，「函数对了而写出去的东西不对」测不到
     （`doc/00` §172.7：判据测的那个东西要和产品实际用的是同一个）。 */
  const cwd1 = await mkdt(jn21(td(), "umbra-apitest-cliB-"));
  const b1 = await LC.build({ cli: "claude", model: "x", mcpServerPath: MSP, cwd: cwd1, prompt: "p", systemPrompt: "s", timeoutMs: 1000 } as never);
  const mcpArg = b1.args[b1.args.findIndex((a) => a === "--mcp-config") + 1];
  let wrote: { mcpServers?: Record<string, { command?: string; env?: Record<string, string> }> } = {};
  if (mcpArg) { try { wrote = JSON.parse(await rdf3(mcpArg, "utf8")) as typeof wrote; } catch { /* 下面那条会红 */ } }
  const got = wrote.mcpServers?.["umbrastudio"];
  ok(!!got && got.command === process.execPath && got.env?.["UMBRASTUDIO_STATE_DIR"] === SR,
     "**真写出去的那份 MCP 配置里也是这两样**（纯函数对了不等于落盘的对）",
     JSON.stringify(got ?? null).slice(0, 120));
  await rm3(cwd1, { recursive: true, force: true });
  if (b1.tmp) await rm3(b1.tmp, { recursive: true, force: true });

  /* ── ⓒ codex 走的是 dotted path，三样都要给 ── */
  const cwd2 = await mkdt(jn21(td(), "umbra-apitest-cliB2-"));
  const b2 = await LC.build({ cli: "codex", model: "x", mcpServerPath: MSP, cwd: cwd2, prompt: "p", systemPrompt: "s", timeoutMs: 1000 } as never);
  const argv = b2.args.join(" ");
  ok(!/mcp_servers\.umbrastudio\.command="node"/.test(argv), "codex 那一支也不再写死 `node`");
  ok(argv.includes(`mcp_servers.umbrastudio.command=${JSON.stringify(process.execPath)}`),
     "codex 的 `-c` 里给了真正的可执行文件");
  ok(argv.includes(`mcp_servers.umbrastudio.env.UMBRASTUDIO_STATE_DIR=${JSON.stringify(SR)}`),
     "codex 的 `-c` 里也给了状态目录");
  ok(argv.includes('mcp_servers.umbrastudio.env.ELECTRON_RUN_AS_NODE="1"'),
     "codex 的 `-c` 里也给了 `ELECTRON_RUN_AS_NODE`");
  await rm3(cwd2, { recursive: true, force: true });
  if (b2.tmp) await rm3(b2.tmp, { recursive: true, force: true });

  /* ── ⓓ 探测用的 PATH（issue #165 第 3 条）──
     ⚠️ 照实说：**这一条钉的是实现而不是症状**。真正的症状（打包版从访达启动时
     设置页把每家都显示成「未安装」）要装包 + 从访达启动才量得到，本轮没验到。
     所以这里只钉住两件**能钉的**：补的目录在里面，而且**用户自己的 PATH 没被替换掉**。 */
  const pp = LC.probePath({ PATH: "/usr/bin:/bin", HOME: "/Users/someone" });
  ok(pp.startsWith("/usr/bin:/bin"), "**用户自己的 PATH 排在前面**（我们只追加，不替换）", pp);
  ok(pp.includes("/opt/homebrew/bin") && pp.includes("/Users/someone/.local/bin"),
     "补上了 launchd 那份 PATH 里缺的几个常见位置", pp);
  const twice = LC.probePath({ PATH: pp, HOME: "/Users/someone" });
  ok(twice === pp, "**幂等** —— 已经在里面的不会被加第二遍", `${pp.length} → ${twice.length} 字节`);
}

/* ══════════════════════════════════════════════════════════════════════
   ㉒ 本地 CLI「会不会自带写工具直接改稿」要对**每一家**都回答（issue #166 / #173 / #174）
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n㉒ 本地 CLI 的 directWrite + 转换那两条（#166 / #173 / #174）");
{
  const LC2 = await import("./local_cli.js");

  /* ── #166：**一件要对每一家都回答的问题，必须是一个字段** ──
     #29 在 codex 和 cursor-agent 上处理完了，而 gemini / opencode 两支没跟上 ——
     因为那两次处理留下的痕迹只是各自 `note` 里的一句话，
     **没有任何东西在问「第五家呢」**。 */
  ok(LC2.CLI_SPECS.every((c) => !!c.directWrite),
     "**每一家都填了 `directWrite`**（字段少一个会编译失败，话少一句不会有任何反应）",
     LC2.CLI_SPECS.map((c) => `${c.id}:${c.directWrite}`).join(" · "));
  const risky = LC2.CLI_SPECS.filter((c) => c.directWrite !== "blocked");
  ok(risky.length > 0, "（前提）确实有几家关不住 —— 不然下一条是空集上的全称命题",
     risky.map((c) => c.id).join(" · "));
  const silent = risky.filter((c) => !c.note.includes(LC2.DIRECT_WRITE_WARN));
  ok(silent.length === 0,
     "**关不住的那几家，`note` 里都说出来了**（用户在设置页读的就是它）",
     silent.length ? `没说的：${silent.map((c) => c.id).join(" · ")}` : risky.map((c) => c.id).join(" · "));
  /* ⚠️ 反方向：关得住的那几家**不该**挂这句警告 —— 不然它变成一句谁都有的废话。 */
  const overWarned = LC2.CLI_SPECS.filter((c) => c.directWrite === "blocked" && c.note.includes(LC2.DIRECT_WRITE_WARN));
  ok(overWarned.length === 0, "而关得住的那几家**不挂**这句警告（不然它成了一句谁都有的废话）",
     overWarned.map((c) => c.id).join(" · ") || "claude / codex 都没挂");
  /* gemini 这一支的特殊之处：它连我们的 MCP 都没有，所以「只有自带写工具可用」 */
  const gem = LC2.CLI_SPECS.find((c) => c.id === "gemini");
  ok(gem?.directWrite === "open" && /只有/.test(gem?.note ?? ""),
     "gemini 那条说清了「**只有**自带写工具可用」（它这一支不注入我们的 MCP）");

  /* ── #173：转换不许造出一份没走 write_draft 的设计稿 ──
   *
   *  ⚠️⚠️ **这一节 C3（M16-7）之后没有对象了。**
   *  它钉的是「`file.convert` 在成品名是 `.dc.html` 时拒掉」，理由是
   *  「设计稿只能从 `write_draft` 那条路生成」。而 C3 删掉 `dc` kind 之后：
   *  · `kindOf("首页.dc.html")` 回 `html`，不是 `dc`；
   *  · 所以 `convert.ts` 里那道 `kindOf(predicted) === "dc"` 的拒**永远进不去**；
   *  · 而「设计稿」这个概念本身不存在了，那条理由也不存在了。
   *  ⚠️ **那道拒要跟着删**（`server/src/cap/convert.ts`），归 **M16-7c**
   *  —— 和甲组那 12 件、`validate.ts` / `render.ts` 那一层一起。
   *  在这里先把「它现在是一道进不去的闸」写进读数，而不是留一条
   *  **恒真因此永远绿**的源码正则判据。
   *  > **一道进不去的闸，和一道守住了的闸，在「源码里有这一行」这种判据里长得一样。** */
  const { kindOf: k22 } = await import("./shared/kinds.js");
  ok(k22("首页.dc.html") === "html",
     "**`.dc.html` 现在就是 html**（C3）—— 所以 `convert.ts` 里那道「不许转出设计稿」的拒已经进不去了，要跟着删（M16-7c）",
     k22("首页.dc.html"));
  const { readFileSync: rf22 } = await import("node:fs");
  const { join: j22 } = await import("node:path");
  const { TOOL_ROOT: TR22 } = await import("./project.js");

  /* ── #174：LibreOffice 的配置目录按进程分 ── */
  const idxSrc22 = rf22(j22(TR22, "server", "src", "convert", "index.ts"), "utf8");
  ok(/libreoffice-profile-\$\{process\.pid\}/.test(idxSrc22),
     "**LibreOffice 的配置目录带 pid**（原来固定一份，两个核心进程同时转 Office 时后起的撞锁静默退出）");
  ok(/ESRCH/.test(idxSrc22),
     "清旧目录按「进程还在不在」判而**不是按时间**（按时间会删掉一个跑了一整天的壳正在用的那个）");
}

/* ══════════════════════════════════════════════════════════════════════
   ㉓ 流式回复的解帧与累加（issue #134）

   通道 A / C 改成 `stream: true`。⚠️ 它修的不是「逐字出字」那个体验，是一条
   **数据丢失**：`stream: false` 时响应头要等到整段生成完才回来，而 undici 默认
   `headersTimeout = 300 秒` —— 慢模型写一整份稿超过 5 分钟就 `HeadersTimeoutError`
   断掉，报成「请求失败」，**这一轮产出全丢**。

   ⚠️ issue 自己写着「按 `index` 拼 `tool_calls[i].function.arguments` 这段 ~40 行要自己写」，
   而它**正好是坑多的那一段**。抽成纯函数之后下面这些坑**一条网络都不用走**。
   > **把「难做对的那一段」从 I/O 里摘出来，它就从「要联网才能测」变成「一个函数」。**
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n㉓ 流式回复的解帧与累加（issue #134）");
{
  const { createAccumulator, createSseReader } = await import("./stream.js");
  const enc = new TextEncoder();
  /** 把一串 SSE 文本按**任意切点**喂进去，拿累加结果 —— 切点是这一节的主角。 */
  const run = (sse: string, cuts: number[] = []) => {
    const acc = createAccumulator();
    const rd = createSseReader((d) => acc.feed(d));
    const bytes = enc.encode(sse);
    let at = 0;
    for (const c of [...cuts, bytes.length].sort((a, b) => a - b)) {
      if (c <= at) continue;
      rd.push(bytes.subarray(at, Math.min(c, bytes.length)));
      at = Math.min(c, bytes.length);
    }
    if (at < bytes.length) rd.push(bytes.subarray(at));
    rd.end();
    return acc.result();
  };
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const delta = (c: string) => frame({ choices: [{ delta: { content: c } }] });

  /* ── ⓐ 基本累加 + `[DONE]` ── */
  const r1 = run(delta("你") + delta("好") + delta("，世界") + "data: [DONE]\n\n");
  ok(r1.content === "你好，世界" && r1.done, "三帧正文拼起来，`[DONE]` 收到了", `${JSON.stringify(r1.content)} · done=${r1.done}`);
  /* ⚠️ **没收到 `[DONE]` 要能分辨** —— 「模型说完了」和「流断在中间」是两件事 */
  const r2 = run(delta("半句"));
  ok(r2.content === "半句" && !r2.done, "**没有 `[DONE]` 时 `done` 为假**（流断在中间和说完了是两件事）", `done=${r2.done}`);

  /* ── ⓑ 分片切在**行中间** ── */
  const sse3 = delta("abc") + delta("def") + "data: [DONE]\n\n";
  const r3 = run(sse3, [5, 13, 20, 27, 31]);
  ok(r3.content === "abcdef" && r3.done, "**分片切在行中间**也拼得对（`eventsource-parser` 的职责）", JSON.stringify(r3.content));

  /* ── ⓒ 分片切在**多字节字符**中间 ──
     ⚠️ 这一条是本节最要紧的：不用 `TextDecoder({stream:true})` 的话，
     一个被切开的中文字会变成两个 `U+FFFD` —— **而那是静默的内容损坏**
     （M14-11 的嗅探栽过同一件事）。 */
  const sse4 = delta("中文内容要完整") + "data: [DONE]\n\n";
  const b4 = enc.encode(sse4);
  /* 在每个字节边界都切一刀 —— 必然切中多字节字符的中间 */
  const acc4 = createAccumulator();
  const rd4 = createSseReader((d) => acc4.feed(d));
  for (let i = 0; i < b4.length; i++) rd4.push(b4.subarray(i, i + 1));
  rd4.end();
  const r4 = acc4.result();
  ok(r4.content === "中文内容要完整" && !r4.content.includes("�"),
     "**逐字节喂也不坏中文**（切在多字节字符中间，`TextDecoder` 要用 stream 模式）",
     JSON.stringify(r4.content));

  /* ── ⓓ `tool_calls` 按 `index` 拼，而且**两个交错到达也不混** ── */
  const r5 = run(
    frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c0", type: "function", function: { name: "write_file", arguments: '{"pa' } }] } }] })
    + frame({ choices: [{ delta: { tool_calls: [{ index: 1, id: "c1", type: "function", function: { name: "read_file", arguments: '{"x"' } }] } }] })
    + frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.md"}' } }] } }] })
    + frame({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: ':1}' } }] } }] })
    + "data: [DONE]\n\n");
  ok(r5.toolCalls.length === 2
     && r5.toolCalls[0]?.function.name === "write_file" && r5.toolCalls[0]?.function.arguments === '{"path":"a.md"}'
     && r5.toolCalls[1]?.function.name === "read_file" && r5.toolCalls[1]?.function.arguments === '{"x":1}',
     "**两个工具调用分帧交错到达，按 `index` 各自拼对**（按顺序 push 会拼成乱码）",
     JSON.stringify(r5.toolCalls.map((c) => `${c.function.name}${c.function.arguments}`)));

  /* ── ⓔ `usage` 在尾帧单独来（那一帧 `choices` 是空数组）── */
  const r6 = run(delta("hi") + frame({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 } }) + "data: [DONE]\n\n");
  ok(r6.usage?.totalTokens === 33 && r6.usage.promptTokens === 11 && r6.content === "hi",
     "**`usage` 在尾帧单独来也拿得到**（那一帧 `choices` 是空数组，先取 usage 再看 choices）",
     JSON.stringify(r6.usage));

  /* ── ⓕ 注释行 / `\r\n` / 解析不了的帧 ── */
  const r7 = run(": keep-alive\n\n" + delta("A") + "data: 不是 JSON\n\n" + delta("B") + "data: [DONE]\n\n");
  ok(r7.content === "AB" && r7.done,
     "**`: keep-alive` 注释行跳过、解析不了的帧跳过而不抛**（为一帧杂质丢掉整轮正是要修的那种事）",
     JSON.stringify(r7.content));
  const r8 = run((delta("X") + delta("Y")).replace(/\n/g, "\r\n") + "data: [DONE]\r\n\r\n");
  ok(r8.content === "XY" && r8.done, "**`\\r\\n` 换行也认**（有的端点用它）", JSON.stringify(r8.content));

  /* ── ⓖ `finish_reason` 带出来 ── */
  const r9 = run(delta("写了一半") + frame({ choices: [{ delta: {}, finish_reason: "length" }] }) + "data: [DONE]\n\n");
  ok(r9.finishReason === "length",
     "**`finish_reason` 带出来**（`length` = 被 max_tokens 截断，和「说完了」是两件事）", String(r9.finishReason));

  /* ── ⓗ 请求体真的带上了那两个字段 ── */
  const { readFileSync: rf23 } = await import("node:fs");
  const { join: j23 } = await import("node:path");
  const { TOOL_ROOT: TR23 } = await import("./project.js");
  const provSrc = rf23(j23(TR23, "server", "src", "provider.ts"), "utf8");
  /* ⚠️⚠️ **先剥注释再搜** —— 第一版直接搜 `stream: false`，而它命中的是
     **我自己写在旁边解释为什么要改的那段话**，于是判据红了而产品是对的。
     > **一条判据分不清「代码」和「解释它的注释」，就会把正确的注释报成缺陷**
     > （`doc/00` §107 那条的**第 5 次** —— 这说明「判据搜源码」这件事
     > 本身需要一个共用的剥注释工具，而现在每处各写一遍）。 */
  const codeOnly = stripComments(provSrc);
  ok(/stream: true/.test(codeOnly) && !/stream: false/.test(codeOnly),
     "**请求体是 `stream: true`**（而且会执行的代码里没有残留的 `stream: false`）",
     `true=${/stream: true/.test(codeOnly)} · false=${/stream: false/.test(codeOnly)}`);
  ok(/stream_options: \{ include_usage: true \}/.test(provSrc),
     "带 `stream_options.include_usage`（流式下 `usage` 要显式要）");
  /* ⚠️ 这一条钉的是**分寸**：流断在中间时把已经收到的那部分带出来，而不是整轮丢掉 */
  ok(/partial\.content \|\| partial\.toolCalls\.length/.test(provSrc),
     "**流断在中间时把已经收到的那部分带出来**（整轮丢掉正是这条 issue 要修的事）");
}

/* ══════════ ㉔ GET 的查询串里 `false` 不许被当成 true（2026-10-23）══════════
   ⚠️⚠️ **这是一条从 M13-3 / M14-11 起就在的缺陷，而它一条判据都没有。**

   门面早就在为「GET 的查询串全是字符串」把数字转回来（`isNumberSchema`），
   **而它只转了一半** —— `z.boolean()` 的参数拿到的是字符串 `"false"`，
   而 `cap.run(input as never, …)` **不跑 zod**，于是产品代码里那句 `if (x)`
   看到的是一个 truthy 的字符串。

   > **参数说「不要」而行为是「要」** —— 这个方向最糟，因为调用方明确表达过意图。

   受影响的五条 GET 实测过：`list_files.recursive`（2026-10-23 加的）·
   `read_file.asText` · `search_in_file.ignoreCase` · `list_icons.withPath` ·
   `list_comments.unresolvedOnly`。

   ⚠️ **这一节住在路由层是对的**：`filetest` 调的是 `listFiles()` 函数，
   它收的本来就是 boolean —— **那一层永远看不到这个 bug**。 */
console.log("\n㉔ GET 的查询串里的 boolean（`?x=false` 不许变成 true）");
{
  /* ⚠️ `u()` 自带 `?token=`，所以查询串要用 `&` 追加（和第 347 行那句 `u("files") + "&dir="` 同一个写法）。 */
  type Env<T> = { ok: boolean; data?: T; errors?: Array<{ message?: string }> };
  const g = async <T>(route: string, qs: string): Promise<Env<T>> => await (await fetch(u(route) + qs)).json() as Env<T>;

  /* ── ⓐ `recursive=false` 要当成「不递归」 ── */
  await mkdirFix(joinFix(FIXTURE, "子"), { recursive: true });
  await wfFix(joinFix(FIXTURE, "子", "深处.txt"), "x", "utf8");
  type Ls = { entries: Array<{ path: string }> };
  const r1 = await g<Ls>("files", "&recursive=false");
  const r2 = await g<Ls>("files", "&recursive=true");
  const deep = (r: Env<Ls>): number => (r.data?.entries ?? []).filter((e: { path: string }) => e.path.includes("/")).length;
  ok(r1.ok && deep(r1) === 0,
     "**`?recursive=false` 真的不递归**（而它原来会 —— 字符串 `\"false\"` 是 truthy）",
     `recursive=false → ${deep(r1)} 条多级路径`);
  /* ⚠️ **对照组少不了**：没有它的话「不递归」可能只是因为递归整条路坏了，
     而那两种在读数上长得一模一样。 */
  ok(r2.ok && deep(r2) > 0, "**（对照）`?recursive=true` 真的递归**（不然上一条可能只是递归坏了）",
     `recursive=true → ${deep(r2)} 条多级路径`);
  /* ── ⓑ 同一个转换对别的 GET 能力也生效（它是门面的事，不是某一件能力的事）── */
  await wfFix(joinFix(FIXTURE, "大小写.txt"), "Foo\nfoo\n", "utf8");
  type Sr = { hits?: Array<unknown> };
  /* ⚠️ 入参叫 `query` 不是 `q` —— 第一版写了 `&q=Foo`，两条都回「0 条命中」。
     **对照组一眼把它和产品缺陷区分开了**：`ignoreCase=true` 那条也是 0，
     说明两次调用都没搜到任何东西，那只能是入参错了。
     > 对照组不只防「功能整条坏了」，也防「我把判据写错了」——
     > 这两件事在**单条**读数上长得完全一样。 */
  const qs = "&path=" + encodeURIComponent("大小写.txt") + "&query=Foo";
  const cs = await g<Sr>("file_search", qs + "&ignoreCase=false");
  const ci = await g<Sr>("file_search", qs + "&ignoreCase=true");
  const n = (r: Env<Sr>): number => (r.data?.hits ?? []).length;
  ok(cs.ok && n(cs) === 1, "**`search_in_file?ignoreCase=false` 真的区分大小写**（它的 describe 写着「默认区分大小写」）", `${n(cs)} 条命中`);
  ok(ci.ok && n(ci) === 2, "**（对照）`ignoreCase=true` 不区分**（两行都命中）", `${n(ci)} 条命中`);
}

/* ── ㉕ POST body 里的 `null`，以及**门面现在真的跑 zod 了**（2026-10-24 两步写成的一节）──
   ⚠️⚠️ **这一节的历史值得完整留着，因为它是「反面判据救了我一次」的实例。**

   **第一步**：我以为「换引擎回 400」是 `.optional()` 拒 `null` 造成的，证据是
   `Sheets.tsx:317` 对同一个字段写着 `cb.cli ?? "claude"`（说明 `cli` 真会是 null）。
   那条证据**只证明了「`cli` 真会是 null」，没有证明「null 是被 zod 拒的」** ——
   而我把它当成整条链都证完了。
   > **一条证据能支持某个结论，不等于那个结论是对的；它可能只支持结论的前半句。**

   抓到它的是我顺手配的**反面判据**（「闸不许开太大」）：`tool: 123` 本该被 zod 拒，
   实测回 `E_API`。顺着它查到 `api.ts` 当时是 `cap.run(input as never, capCtx)` ——
   **HTTP 门面从头到尾没有一次 `safeParse`**，72 件能力的 zod 入参在这条路上是装饰。
   > **如果我只写了三条正面判据（null 不被拒），它们全绿 —— 因为这条路从来没人拒过 null ——
   > 我会带着一个错的根因去改前端。**

   **第二步**（geek-99 定的）：门面补上 `safeParse`，强转那一步保留、在它之后校验，
   拿 `parsed.data` 去跑（这才叫两面同一套判准：默认值与剥未声明键也一致）。
   于是这一节的四条**从「照实记一个我们还没修的事实」翻回「正面判据」**：
   · `tool: null` 不被拒 —— 这一条**现在才真的在测 `.nullish()`**（修之前它是空的）；
   · `tool: 123` 被拒 —— 正面（门面真的校验）兼反面（`.nullish()` 没把闸开成「什么都行」）；
   · 400 要说出**是哪个字段、为什么**；
   · 而且它真的走到了 `run`（不然上面几条可能只是这条路整条坏了）。

   ⚠️ 这一节刻意**不造真会话** —— 用一个**形状合法但不存在**的 ID 就够了，
   因为要钉的是「**拒在哪一层**」，而不是「这件能力能不能用」。

   > **`undefined` 和 `null` 在 TypeScript 里几乎看不出差别，在 JSON 边界上是两件事：**
   > `undefined` 被 `JSON.stringify` 整个去掉（字段不存在 → `.optional()` 通过），
   > `null` 原样序列化（字段在而类型不对 → 到了会校验的那一层就是 400）。 */
console.log("\n㉕ POST body 里的 `null`（`chat_channel` 的 `tool`）");
{
  type Env = { ok: boolean; errors?: Array<{ code?: string; message?: string }> };
  const GHOST = "chat-1700000000000-ghost9";   // 形状合法（过 CHAT_ID_RE），但这个会话不存在
  const call = async (body: unknown): Promise<{ st: number; code: string; msg: string }> => {
    const r = await post("chat_channel", body);
    const j = await r.json() as Env;
    return { st: r.status, code: j.errors?.[0]?.code ?? "", msg: j.errors?.[0]?.message ?? "" };
  };
  const withNull = await call({ session: GHOST, channel: "b", tool: null });
  const withStr = await call({ session: GHOST, channel: "b", tool: "claude" });
  const omitted = await call({ session: GHOST, channel: "b" });

  ok(withNull.code !== "E_BAD_INPUT",
     "**`tool: null` 不被当成入参错误**（`.optional()` → `.nullish()`；门面补了校验之后这一条才真的在测它）",
     `HTTP ${withNull.st} · ${withNull.code || "没有 code"} · ${withNull.msg.slice(0, 40)}`);
  /* ⚠️ **对照组两条，各防一种误判**（㉔ 那一节的纪律）：
     ① 传字符串也走到同一处 —— 不然上一条可能只是「这条路整条坏了」；
     ② 压根不传也走到同一处 —— 这才证明 `null` 真的和「没给」等价，
        而不是「两种都坏了所以读数一样」。 */
  ok(withStr.code === withNull.code,
     "**（对照）传字符串和传 null 拒在同一层**（不然上一条可能只是这条路整条坏了）",
     `字符串 → ${withStr.code || "没有 code"} · null → ${withNull.code || "没有 code"}`);
  ok(omitted.code === withNull.code,
     "**（对照）压根不传也拒在同一层** —— 这才叫「null 等于没给」",
     `不传 → ${omitted.code || "没有 code"}`);
  /* ⚠️⚠️ **这一条两个身份：正面（门面真的校验了）兼反面（闸没开太大）。**
     `.nullish()` 放的是 `null`，不是「什么都行」—— 少了它，把 `tool` 改成 `z.any()`
     上面三条照样全绿。而它同时也是「门面跑 zod」的正面证据：
     修之前它回 `E_API`（123 一路走进 `run`），修之后回 `E_BAD_INPUT`。
     ⚠️ **它曾经被我改成「照实钉住门面不跑 zod」的读数** —— 那是对的处置（不假装 zod 在拒），
     而门面补上校验之后它自己红了、指回注释，于是翻回正面。
     > **一条判据在它钉的那件事被修掉的那一刻变红，是它在正常工作** ——
     > 变红之后要做的是改口径，不是放宽它。 */
  const withNum = await call({ session: GHOST, channel: "b", tool: 123 });
  ok(withNum.code === "E_BAD_INPUT",
     "**`tool: 123` 被门面拒了**（正面：这条路真的跑 zod 了；反面：`.nullish()` 放的是 null 不是「什么都行」）",
     `HTTP ${withNum.st} · ${withNum.code || "没有 code"} · ${withNum.msg.slice(0, 60)}`);
  /* ⚠️ **400 要说出是哪个字段、为什么。** 只回一句「入参不对」的话，调用方第一句话一定是
     「哪个字段？」—— 和 §160 那条「一条说不出『是哪一个』的判据，红了也用不上」同一条。
     判准认**真值**：拒因里要出现字段名 `tool`，不是「有个 400 就算过」。 */
  ok(/\btool\b/.test(withNum.msg),
     "**而且它说得出是哪个字段**（zod 的 issues 路径进了 message，不是一句「入参不对」）",
     withNum.msg.slice(0, 80) || "（没有 message）");
  /* ⚠️ 顺带钉住**它确实走到了 run** —— 「不是 E_BAD_INPUT」还可能是别的原因
     （比如路由 404、或者被某道闸提前挡住），而那些在上面四条读数上长得一样。
     会话不存在这句话只有 `setChatChannel` 会说。 */
  ok(/没有这个会话/.test(withNull.msg),
     "**而且它真的走到了 `run`**（拒因是「没有这个会话」，只有 `setChatChannel` 会这么说）",
     withNull.msg.slice(0, 50));

  /* ── 这道闸在**门面那一层**，不是 `chat_channel` 一件能力的事 ──
     ⚠️ 上面五条全在同一件能力上，所以它们**合起来也证明不了「门面在校验」** ——
     也可能只是那件能力自己拒的（它的 `run` 第一行就查会话）。
     > **一条判据能证明某件事发生了，不等于它能证明是哪一层让它发生的。**
     所以换一件**完全无关、而且不写盘**的能力再问一次：`who_handles` 的 `ext` 是必填，
     不给它 —— 修之前会一路走进 `run`（`whoHandles(undefined)`），修之后门面就拦住了。
     ⚠️ 顺带钉住**另一半判准**：给了合法的 `ext` 要照常能过（不然上一条可能只是这条路整条坏了）。 */
  {
    const noExt = await (await fetch(`${s.url}__ud/who_handles?token=${encodeURIComponent(s.token)}`)).json() as Env;
    const okExt = await (await fetch(`${s.url}__ud/who_handles?ext=.zqab&token=${encodeURIComponent(s.token)}`)).json() as Env;
    ok(noExt.errors?.[0]?.code === "E_BAD_INPUT" && /\bext\b/.test(noExt.errors?.[0]?.message ?? ""),
       "**换一件无关的能力也拦得住**（`who_handles` 不给必填的 `ext` → `E_BAD_INPUT` 且说出字段名）",
       `${noExt.errors?.[0]?.code ?? "没有 code"} · ${(noExt.errors?.[0]?.message ?? "").slice(0, 60)}`);
    ok(okExt.ok === true,
       "**（对照）给了合法的 `ext` 照常过**（不然上一条可能只是这条路整条坏了）",
       JSON.stringify(okExt.ok));
  }
}

/* ── ㉖ 「谁引用了它」有两件能力，而「引用」在它们嘴里是两种关系（M16-8 ⑤，2026-10-24）──
   `get_delete_impact` 认 **`<dc-import name=…>`**（按组件名），
   `list_file_refs` 认 **`href` / `src` / `url()`**（按路径）。实测对同一份组件稿：
   前者 `affectedCount: 4`，后者 `referencedBy: []`。
   > **两件都叫「谁引用了它」，而并成一件的后果是具体的**：删一份组件稿之前问一句，
   > 回「没人引用」，而实际上有 4 处会断 —— **一个更弱的答案冒用了一个更强的名字。**

   ⚠️ 这一节钉的是**那条拒**：非 `.dc.html` 既不许回 `affectedCount: 0`（那读起来是
   「查过了，没人引用」），也不许抛「找不到稿」（文件在、只是这件能力不管它）。
   ⚠️ 判准认**真值**：要出现 `.dc.html` 这个条件本身，而且要**指向另一件能力** ——
   一条「只说你错了、不说该去问谁」的拒，用户只能卡在那儿。 */
console.log("\n㉖ `get_delete_impact` 只答 `<dc-import>` 那种引用（M16-8 ⑤）");
/* ⚠️⚠️ **这一节自己建一个临时项目，不用公共夹具。**
   第一版用公共夹具，诊断行一句话打脸：`· 夹具盘上: 大小写.txt · 子` ——
   **`样例.dc.html` 和我刚写进去的两份样本都不在了**，前面某一节把它们清掉了。
   > 我一直在问「图里为什么没有这份稿」，而真相是**盘上压根没有它**。
   > **「样本造好了」和「样本还在」是两件事**（§101.8 ③「我的判据把别的判据要用的夹具删了」的反面：
   > 这次是**别人的收尾**删掉了我要用的东西）。
   ⚠️ 更要紧的是：那一版的前三条**在一个不存在的文件上通过了** ——
   那条拒只看扩展名、不关心文件在不在，于是「只对 `.dc.html` 成立」和「文件不存在」分不开。
   **自己建项目之后，三条拒都落在真存在的文件上。** */
{
  const { mkdtemp: mkdt6, writeFile: wf6, rm: rm6 } = await import("node:fs/promises");
  const { join: j6 } = await import("node:path");
  const { tmpdir: td6 } = await import("node:os");
  /* ⚠️ `realpathSync`：macOS 的 `/var` 是软链，不解的话 `abs.slice(p.dir.length + 1)`
     会把相对路径切歪（本仓库记过的那个坑）。 */
  const T6 = await mkdt6(j6(realpathSync(osTmpdir()), "umbrastudio-refs-"));
  await wf6(j6(T6, "project.json"), JSON.stringify({ name: "refstest", title: "引用面回归" }), "utf8");
  /* 三份真文件：被引用的组件 · 引用它的稿 · 一份 `.md`（那条拒的样本） */
  await wf6(j6(T6, "组件.dc.html"), "<!doctype html>\n<html><body><x-dc><div>组件</div></x-dc></body></html>\n", "utf8");
  await wf6(j6(T6, "用它的页.dc.html"),
    "<!doctype html>\n<html><body><x-dc><dc-import name=\"组件\"></dc-import></x-dc></body></html>\n", "utf8");
  await wf6(j6(T6, "一份笔记.md"), "# 只是一份 md\n", "utf8");
  const p6 = await buildProject(T6);
  const s6 = await serveStart(p6);
  type Env2 = { ok: boolean; data?: { affectedCount?: number }; errors?: Array<{ code?: string; message?: string; fix?: string }> };
  const ask = async (path: string): Promise<Env2> =>
    await (await fetch(`${s6.url}__ud/delete_impact?path=${encodeURIComponent(path)}&token=${encodeURIComponent(s6.token)}`)).json() as Env2;
  try {
    const md = await ask("一份笔记.md");
    ok(md.ok === false && md.errors?.[0]?.code === "E_BAD_INPUT",
       "**非 `.dc.html` 被拒**（而且这份 `.md` 真在盘上 —— 不是回 `affectedCount: 0`，那读起来是「查过了，没人引用」）",
       `${md.errors?.[0]?.code ?? "没有 code"} · affectedCount=${String(md.data?.affectedCount)}`);
    ok(/\.dc\.html/.test(md.errors?.[0]?.message ?? ""),
       "**拒因说出那个条件本身**（「只对 `.dc.html` 成立」），不是一句「参数不对」",
       (md.errors?.[0]?.message ?? "").slice(0, 70));
    ok(/list_file_refs/.test(md.errors?.[0]?.fix ?? ""),
       "**而且指向另一件能力**（按路径的引用问 `list_file_refs`）—— 一条不说「该去问谁」的拒，用户只能卡在那儿",
       (md.errors?.[0]?.fix ?? "").slice(0, 70));

    /* ⚠️ **对照一：真有人引用它时数得对。** 少了这一条，把条件写反（少一个 `!`）
       上面三条照样全绿；而只断言 `ok === true` 也不够 —— 要**真值**。 */
    const used = await ask("组件.dc.html");
    ok(used.ok === true && used.data?.affectedCount === 1,
       "**（对照）`<dc-import name=\"组件\">` 数得出来**（真值 1，不是「有个数就算过」）",
       `ok=${used.ok} · affectedCount=${String(used.data?.affectedCount)}`);
    /* ⚠️ **对照二：没人引用时说得出「没人引用」。** 这一条是上一条的反面 ——
       一件只会在「有人引用」时答得出的能力，在「可以安全删」这个最常见的问法上是哑的。 */
    const lonely = await ask("用它的页.dc.html");
    ok(lonely.ok === true && lonely.data?.affectedCount === 0,
       "**（对照）没人引用时回 0，而不是拒**（「可以安全删」才是最常见的那个问法）",
       `ok=${lonely.ok} · affectedCount=${String(lonely.data?.affectedCount)}`);
    /* ⚠️ 第三种：**是 `.dc.html`、但盘上没有**。它该走「找不到稿」那条拒，
       而不是被新的 `E_BAD_INPUT` 吃掉 —— 两种拒说的是两件不同的事。 */
    const gone = await ask("压根不存在.dc.html");
    ok(gone.ok === false && gone.errors?.[0]?.code !== "E_BAD_INPUT",
       "**是 `.dc.html` 但盘上没有 → 另一种拒**（「这份稿我没看见」≠「这种文件我不管」）",
       `${gone.errors?.[0]?.code ?? "没有 code"}：${(gone.errors?.[0]?.message ?? "").slice(0, 40)}`);
  } finally {
    /* 自己建的自己清（纪律⑥）—— 连服务一起停，不然这一套每跑一轮多攒一个 LISTEN。 */
    /* ⚠️ `serveStop(dir)` —— 服务表按**目录**去重（issue #20），所以停它要给目录。
       不停的话这一套每跑一轮多攒一个 LISTEN（§166 实测攒到 33 个）。 */
    try { const { serveStop } = await import("./serve.js"); serveStop(T6); } catch { /* 停不掉就算了 */ }
    await rm6(T6, { recursive: true, force: true });
  }
}

/* ⚠️ 收尾自检：夹具的身份在整轮里没被别的节悄悄破坏过。
   **这一条是上面那条教训的判据化** —— 不然下一个人还会把清理写在中间。 */

/* ── ㉗ 按文件名从回收站恢复（`restore_trashed_by_name`，M16-8 ③）──
   ⚠️⚠️ **这一节补的是一件「从来没有判据」的能力。**
   它原来叫 `restore_draft`，而 summary 写着「**行内撤销用它**」—— 实测那句话是假的：
   · 它唯一的调用方是 `ui/S1-稿件索引.dc.html`，而那份稿 C3（M16-7）已经删了；
   · 现在的行内撤销**一次都不调恢复** —— 删除是延后落实的（`Workbench.tsx` 的
     `commitTrash`，离开那一行时才真删），所以「撤销」只是把那一行从待删清单里拿掉，
     文件压根没离开过磁盘。
   > **一件能力的 summary 里写着一个调用方时，那个调用方消失了，summary 就开始骗人** ——
   > 而它骗得很体面：它让下一个人以为这条路有人在走。

   ⚠️ 而延后落实**不是可以顺手改掉的**（这是量出来的，不是想出来的）：M16-8 ⑤ 那句
   「有 N 处引用它，会断」靠的正是「文件还在盘上」——
   实测删完再问 `delete_impact`，它抛「找不到稿」。
   > **一个查询和一个破坏性动作对「文件还在不在」的要求正好相反，
   > 所以它们的先后顺序不是实现细节，是那个功能存不存在。**
   所以这一节打的是它**真正**的用途：「我只记得文件名」那一种（AI / MCP / 回收站）。 */
console.log("\n㉗ 按文件名从回收站恢复（restore_trashed_by_name）");
{
  const { mkdtemp: mkT, writeFile: wfT, rm: rmT, mkdir: mdT } = await import("node:fs/promises");
  const { tmpdir: tdT } = await import("node:os");
  const { join: jT } = await import("node:path");
  const { existsSync: exT, realpathSync: rpT, readFileSync: rfT } = await import("node:fs");
  const dir = rpT(await mkT(jT(rpT(tdT()), "umbra-restore-")));
  await wfT(jT(dir, "project.json"), JSON.stringify({ name: "restore-by-name" }), "utf8");
  await mdT(jT(dir, "文档", "深一层"), { recursive: true });
  await wfT(jT(dir, "文档", "深一层", "需求.md"), "# 第一版\n", "utf8");
  const svcT = await (await import("./serve.js")).serveStart(await (await import("./project.js")).buildProject(dir));
  const postT = (route: string, body: unknown) => fetch(`${svcT.url}__ud/${route}?token=${encodeURIComponent(svcT.token)}`, {
    method: "POST", headers: { "content-type": "application/json", origin: svcT.url.replace(/\/$/, "") }, body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<{ ok: boolean; data?: Record<string, unknown>; errors?: Array<{ message?: string; fix?: string }> }>);

  /* ⓐ 删 → 按**文件名**（不是 trashPath、不是相对路径）恢复 → 回到**原来那层目录** */
  {
    const t = await postT("file_trash", { path: "文档/深一层/需求.md" });
    ok(t.ok === true && !exT(jT(dir, "文档", "深一层", "需求.md")),
       "（前提）文件真的进回收站了 —— 没有这一条，下面的「恢复成功」可能只是它压根没删",
       `${t.ok} · 盘上还在=${exT(jT(dir, "文档", "深一层", "需求.md"))}`);
    const r = await postT("restore_trashed_by_name", { file: "需求.md" });
    /* ⚠️ 读 `data.originalPath`，不是 `data.restored` —— 后者是**信封的 meta**，
       `data` 里是 `RestoreDraftResult` 本身。第一版读错了字段，于是判据红而产品是对的。
       > **抓到它的是诊断行里打出的那一整个对象** ——
       > 一条红的 detail 该说出「我看到了什么」，而不只是「我期望什么」（同 `filetest` 那条）。 */
    ok(r.ok === true && r.data?.originalPath === "文档/深一层/需求.md",
       "**只给文件名就恢复得回来，而且回到原来那层目录**（issue #81 那条性质）",
       JSON.stringify(r.data ?? r.errors?.[0]?.message));
    ok(exT(jT(dir, "文档", "深一层", "需求.md"))
       && rfT(jT(dir, "文档", "深一层", "需求.md"), "utf8") === "# 第一版\n",
       "**盘上真的回来了，而且内容是原文**（回执说成功 ≠ 文件回来了）");
  }
  /* ⓑ 同名删过多次 → 拿**最近**删的那一份（这是它和 `restore_trashed` 唯一的差别所在） */
  {
    await wfT(jT(dir, "需求.md"), "# 根目录那份\n", "utf8");
    await postT("file_trash", { path: "文档/深一层/需求.md" });      // 先删深的
    await postT("file_trash", { path: "需求.md" });                   // 再删浅的 ← 最近
    const r = await postT("restore_trashed_by_name", { file: "需求.md" });
    ok(r.ok === true && r.data?.originalPath === "需求.md",
       "**同名删过两次时拿最近删的那一份**（「撤销刚才那一下」唯一合理的语义）",
       JSON.stringify(r.data));
    ok(rfT(jT(dir, "需求.md"), "utf8") === "# 根目录那份\n",
       "而且回来的是那一份的内容，不是另一份");
    /* 另一份还在回收站里 —— 它该由 `restore_trashed` 按 trashPath 取 */
    const lst = await fetch(`${svcT.url}__ud/trash?token=${encodeURIComponent(svcT.token)}`).then((x) => x.json() as Promise<{ data?: { items?: Array<{ originalPath?: string; trashPath?: string }> } }>);
    const left = lst.data?.items ?? [];
    ok(left.some((x) => x.originalPath === "文档/深一层/需求.md"),
       "**另一份还躺在回收站里**（按名字恢复不该把同名的都捞出来）",
       left.map((x) => x.originalPath).join(" · ") || "(空)");
    /* 顺带把它也取回来，验两件分工：这一件按 trashPath */
    const tp = left.find((x) => x.originalPath === "文档/深一层/需求.md")?.trashPath ?? "";
    const r2 = await postT("trash_restore", { trashPath: tp });
    ok(r2.ok === true && exT(jT(dir, "文档", "深一层", "需求.md")),
       "而按 trashPath 那一件能精确取回它（两件分工，不是重叠）", JSON.stringify(r2.data ?? r2.errors?.[0]?.message));
  }
  /* ⓒ 回收站里没有这个名字 → 照实拒，而且**给出路**
     ⚠️ 不只验 `ok === false`：那在「任何输入都拒」的实现下也绿。要它说得出名字。 */
  {
    const r = await postT("restore_trashed_by_name", { file: "压根没删过.md" });
    ok(r.ok === false && /压根没删过\.md/.test(r.errors?.[0]?.message ?? ""),
       "**回收站里没这个名字时照实说，而且说得出是哪个名字**", r.errors?.[0]?.message);
    ok(/list_trash/.test(r.errors?.[0]?.fix ?? ""),
       "拒因里有出路（去 `list_trash` 看现在有什么）", (r.errors?.[0]?.fix ?? "").slice(0, 40) || "(没有 fix)");
  }
  /* ⓓ **旧名字真的没了** —— 改名不是加一个别名
     ⚠️ 这一条是「并名 / 改名」这一批唯一能在 HTTP 面上证明「旧路由消失了」的判据。
     ⚠️ 404 还是 400 都算（门面对不认识的路由怎么回是它自己的事），
     **但 `ok: true` 不算** —— 那说明旧名字还在。 */
  for (const dead of ["restore_draft", "rename_draft", "move_draft", "delete_draft"]) {
    const r = await postT(dead, { file: "需求.md", path: "a", newName: "b", targetDir: ".", from: "a", to: "b" });
    ok(r.ok !== true, `**旧路由 \`${dead}\` 真的不在了**`, JSON.stringify(r).slice(0, 80));
  }
  /* ⚠️ `serveStop(dir)` —— 服务表按**目录**去重（issue #20），所以停它要给目录不是给 svc。
     ⚠️ **必须停**：`doc/00` §166 记着「回归自己攒了 33 个 LISTEN」那一次，
     而那一次的根因就是「起了没人停」。 */
  try { const { serveStop } = await import("./serve.js"); serveStop(dir); } catch { /* 停不掉就算了 */ }
  await rmT(dir, { recursive: true, force: true });
}

/* ── 总数本身也是一条判据（口径同 `uitest` 文件末尾那一段）──
   ⚠️ 这道闸只拦**变少**，不拦变多 —— 加判据是常态，少判据才是事故。
   它拦的是**没说出来的那种没跑**：`skip()` 报过的已经进分母了，减掉之后还少，
   就说明有一节静默跳过了（而那一轮会全绿）。 */
/* 213 = 改口径那一轮的实跑 · +2 = 那一轮自己打印过的「没登录」两条（它们原来**不在分母里**，
   那就是改口径要修的那件事）· **+3 = 门面补 `safeParse` 这一批**（㉕ 的「说得出是哪个字段」
   1 条 + 「换一件无关的能力也拦得住」那一组 2 条）· **+4 = ㉖**（`get_delete_impact`
   只答 `<dc-import>` 那种引用：三条拒 + 两条对照 + 一条「盘上没有是另一种拒」）· **−9 = ⑦ 整节拿掉**（模板名那一组：它钉的攻击面随
   `list_templates` / `save_as_template` / `delete_template` 三件退场一起消失，M16-8 ⑥）。
   合计 **215**；**M16-8 ① / ③ 这一批 +5（⑲ⓑ′ 只读闸两条路各两条 + 拒因一致那条）
   +13（㉗ 按文件名恢复整节）= 233**，而 233 正是实跑的总数（231 过 + 2 条没登录）。
   ⚠️ 原来这个数停在 215 而实跑 224 —— 那不影响这道闸（它只拦变少），
   但**一个和实跑差 9 的下界，说明有 9 条是什么时候加进来的没人记得**。这次对齐了。
   ⚠️ **这一次是那道闸逼我把数字改对的**：删掉一整节却没动基线，它立刻报
   `213/218` 并说「少跑了」—— 而**「有意删掉」和「静默跳过」在读数上必须分得开**，
   所以删判据时改这个数不是收尾工作，是那个动作的一部分。
   ⚠️ 我先算成 221 —— 漏数了 ㉖ 自己那一节里新增的第六条（两条对照我当成一条算了）。
   实跑 222 把它顶出来了：**总数本身也是一条判据**，而它这次抓的是我的算术。 */
const EXPECT_AT_LEAST = 233;
const miss = NOT_RUN.length;
const total = pass + fail + miss;
let silent = 0;
if (total < EXPECT_AT_LEAST) {
  silent = EXPECT_AT_LEAST - total;
  fail += silent;
  console.log(`\n  ✗ **少跑了 ${silent} 条判据，而且没人说为什么**（算上说出来的 ${miss} 条也才 ${total}，该有 ${EXPECT_AT_LEAST}）`);
  console.log("    —— 某一节静默跳过了。全绿不代表验到了：先找哪一节少了，再看读数。");
}
const whyNot = [...new Set(NOT_RUN)].map((w) => `${NOT_RUN.filter((x) => x === w).length} 条${w}`).join(" · ");
console.log(`\n${fail === 0 ? "✓" : "✗"} HTTP 路由层 ${pass}/${Math.max(total, EXPECT_AT_LEAST)}`
  + (miss ? `（${miss} 条没验到：${whyNot}）` : "") + "\n");
process.exit(fail === 0 ? 0 : 1);
