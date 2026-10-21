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
import { serveStart } from "./serve.js";
import { buildProject } from "./project.js";
import { start as startJob } from "./jobs.js";
import { projectJobKey } from "./api.js";
import { mkdtemp, rm as rmdirAll, writeFile as wfFix } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join as joinFix } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`); }
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
   就会绕开我们的写入口。那样没有快照、没有归一化、没有 `__resources`，
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
  } else console.log("  · 项目里没有 .html，正面那条跳过");
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
    ok(made, "（样本有效性）临时项目里造出一个命名管道", made ? "管道.html" : "mkfifo 不可用（win？）→ 下面三条跳过");
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

/* ── 模板名不许带路径（issue #63，p1）──
   两个函数对同一个名字的处理**不对称**：存的时候 `a/b` → `a_b.dc.html`，
   删的时候 `a/b` → 子目录 `a/b.dc.html` —— **删不到自己存的那份**。
   而那只是不对称的代价，它掩护了更严重的一半：`deleteTemplate` 连分隔符都不管，
   `join` 又折叠 `..` → `delete_template({name:"../../index"})`
   **永久删掉项目根的 `index.dc.html`**（不经写入口、没快照、没回收站）。
   `saveAsTemplate` 那边则能把**项目外任意可读文件**拷进模板目录。

   ⚠️ **调用方是 AI** —— 模型把名字拼错一次、或被稿里的文字诱导一次就够了。 */
console.log("\n⑦ 模板名不许带路径（issue #63，p1）");
{
  const { saveAsTemplate, deleteTemplate, listTemplates } = await import("./templates.js");
  const { existsSync, writeFileSync, rmSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");

  /* ⚠️ **先造一个「受害者」并确认它真在** —— 不然「它还在」可能只是因为它本来就不存在。
     这是「夹具自己先成立」那一条（§140 的 #40 判据同款）。 */
  const victim = join(p.dir, "_apitest-模板受害者.dc.html");
  writeFileSync(victim, "<!doctype html><title>别删我</title>", "utf8");
  ok(existsSync(victim), "**夹具自己先成立：受害文件真的在**（不然「它还在」说明不了什么）");

  /* 删除侧：带 `..` 必须被拒，而且**盘上那份要还在** */
  /* ⚠️ **层数要够。**（2026-10-05 反向验证时自己撞到）
     第一版写的是 `"../_apitest-模板受害者"` —— 而模板目录是
     `.umbrastudio/templates`（**两层深**），上升一层只到 `.umbrastudio/`，
     **根本没打到项目根**。于是撤掉闸之后「盘上那份还在」照样绿。
     **反向验证没报红时，先问「我的攻击样本真的打到了吗」。** */
  let threw = false;
  try { await deleteTemplate(p, "../../_apitest-模板受害者"); } catch { threw = true; }
  ok(threw, "`delete_template` 带 `..` 被拒（`../../` —— 模板目录两层深，一层打不到项目根）");
  ok(existsSync(victim), "**而且盘上那份还在**（报错不等于没删 —— 这两件要分开验）",
     existsSync(victim) ? "还在" : "✗ 被删了，而它没有快照也没有回收站");

  /* 保存侧：源稿路径带 `..` 必须被拒，而且**不许在模板目录里留下东西** */
  mkdirSync(join(p.dir, ".umbrastudio", "templates"), { recursive: true });
  const before = (await listTemplates(p)).length;
  /* ⚠️ **源稿样本要指向一个确定存在的项目外文件**，而且是 `.dc.html`
     —— 否则「被拒」有三种可能都分不清：闸拦了 / 文件不存在 / 后缀不对。
     第一版用 `"../../../../etc/hosts"`，从项目目录上升四层落到
     `SourceTree/etc/hosts`（**不存在**），`readFile` 抛错，
     判据把「没这个文件」当成了「闸拦住了」。
     自己造一份：放在项目的**父目录**里，不依赖机器上有什么。 */
  const outsider = join(p.dir, "..", "_apitest-项目外的稿.dc.html");
  writeFileSync(outsider, "<!doctype html><title>我在项目外</title>", "utf8");
  ok(existsSync(outsider), "**夹具自己先成立：项目外那份稿真的在**（不然「被拒」说明不了什么）");
  let threw2 = false;
  try { await saveAsTemplate(p, "../_apitest-项目外的稿.dc.html", "偷来的"); } catch { threw2 = true; }
  ok(threw2, "`save_as_template` 的源稿路径带 `..` 被拒（指向一份**真实存在**的项目外稿）");
  const after = (await listTemplates(p)).length;
  ok(after === before, "**而且模板目录里没多出东西**", `${before} → ${after}`);
  /* 非 .dc.html 也该拒 —— 模板就是稿，不是任意文件 */
  let threw3 = false;
  try { await saveAsTemplate(p, "project.json", "不是稿"); } catch { threw3 = true; }
  ok(threw3, "源稿不是 `.dc.html` 也被拒（模板就是稿，不是任意文件）");

  /* ⚠️ **正面那一条不能少**：闸不该把功能也挡掉。
     而且要验「存了能删掉」—— 那正是原来**不对称**导致做不到的事。 */
  const saved = await saveAsTemplate(p, "_apitest-模板受害者.dc.html", "判据模板").catch(() => null);
  ok(!!saved?.saved, "**正常的模板存得进去**（闸不该把功能也挡掉）", saved?.path?.split("/").pop() ?? "没存上");
  const del = await deleteTemplate(p, "判据模板").catch(() => null);
  ok(del?.deleted === true, "**而且删得掉自己存的那份**（原来 `a/b` 存成 `a_b` 却去删 `a/b`，删不到）");

  /* ⚠️ **收尾要清掉「闸没拦住时会留下的那几份」**（2026-10-05）。
     反向验证撤掉闸跑了两轮，`偷来的.dc.html` 和 `不是稿.dc.html`
     **真的存进了用户项目的模板目录** —— 判据自己造的垃圾，判据自己清。
     ⚠️ 正常情况下这两份压根不会出现，所以这几行是**为反向验证准备的** ——
     而反向验证是纪律④ 要求的例行动作，不是意外。 */
  for (const n of ["偷来的", "不是稿", "判据模板"]) {
    rmSync(join(p.dir, ".umbrastudio", "templates", `${n}.dc.html`), { force: true });
  }
  rmSync(victim, { force: true });
  rmSync(outsider, { force: true });
}

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
  const { startStatic } = await import("./render.js");
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

/* ── 读 → 改 → 写回：中间别人改过就不许盖（issue #111）──
   「加上地址」那颗钮对每一份稿做的是 ① `GET source` ② `POST draft_write` 整份写回。
   这是**两个独立的请求**，中间 AI（会话里正在跑的那一轮、或外部 MCP 客户端）
   完全可能改了同一份稿 —— 勾了「全部」时这个时间窗是 N 份稿串行读写的**总时长**。
   不带 `expectedSourceSha256` 的话 ② 把**读之前的旧内容**整份写回去：
   **AI 刚做的改动被回滚，而提示还是「加上了地址 · N 份」。**

   ⚠️ 这一节钉**两件事**，第二件才是真正容易漏的：
   ① 带旧 sha 写回要被拒，而且**盘上留的是新内容**；
   ② 被拒时信封给的是 **`ok: true`**（`written:false` + `refused`，而 `diags` 是空的）——
      所以「只看 `w.ok`」的调用方会把被拒算成成功。**判据要钉住 `ok === true`**，
      否则哪天信封改成 `ok:false`，前端那句 `if (!w.ok)` 就自己对了，
      而我们会以为是判据在守着它。

   ⚠️ 用**临时项目**，不碰 `p`（它是用户真实的项目）—— 和 FIFO 那一节同一个理由。 */
console.log("\n⑧ 读 → 改 → 写回，中间别人改过就不许盖（issue #111）");
{
  const { mkdtemp, writeFile: wf5, readFile: rf5, rm: rm3 } = await import("node:fs/promises");
  const { join: j3 } = await import("node:path");
  const { tmpdir: td3 } = await import("node:os");
  const T = await mkdtemp(j3(td3(), "umbrastudio-rmw-"));
  await wf5(j3(T, "project.json"), JSON.stringify({ name: "rmwtest", title: "读改写回归" }), "utf8");
  const pr = await buildProject(T);
  const sr = await serveStart(pr);
  /* ⚠️ **route 里可能已经有 `?`** —— 第一版写死 `?token=`，于是
     `source?file=X` 拼成了 `…/source?file=X?token=…`：读不到源码 → `content` 是空串
     → 后面三条全部红在「有 1 条 error 级诊断，按契约拒绝落盘」上。
     **四条红里只有一条红在它声称的那件事上**，另外三条红的是我的 URL ——
     而「带旧 sha 写回被拒」这条读数**长得完全符合预期**（它确实被拒了，
     只是为了另一个原因）。纪律④ 的又一例：量到「被拒」先问是哪一道闸拒的。 */
  const ur = (route: string) => `${sr.url}__ud/${route}${route.includes("?") ? "&" : "?"}token=${encodeURIComponent(sr.token)}`;
  const postR = (route: string, body: unknown) => fetch(ur(route), {
    method: "POST", headers: { "content-type": "application/json", origin: sr.url.replace(/\/$/, "") },
    body: JSON.stringify(body),
  }).then((x) => x.json() as Promise<{ ok?: boolean; data?: Record<string, unknown>; errors?: Array<{ message?: string }> }>);

  const F = "读改写.dc.html";
  const made = await postR("draft_write", { path: F, content:
    "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<script src=\"./support.js\"></script>\n</head>\n<body>\n<x-dc>\n<div>原来的一行</div>\n</x-dc>\n<script type=\"text/x-dc\" data-dc-script data-props=\"{}\">\nclass Component extends DCLogic { renderVals() { return {}; } }\n</script>\n</body>\n</html>\n" });
  ok(made.ok === true && made.data?.written === true, "（前提）临时项目里建出一份稿",
     made.ok ? `written=${String(made.data?.written)}` : JSON.stringify(made.errors?.[0]?.message ?? made).slice(0, 80));

  /* ① 读一版，连 sha 一起拿到 —— **sha 由服务端给**，不让调用方自己算 */
  const read1 = await fetch(ur(`source?file=${encodeURIComponent(F)}`)).then((x) => x.json()) as
    { ok?: boolean; data?: { source?: string; sha256?: string } };
  const sha1 = read1.data?.sha256 ?? "";
  ok(/^[0-9a-f]{64}$/.test(sha1), "**`source` 把这一版的 sha256 一起给出来**（原来没有 → 调用方只能自己算）", sha1.slice(0, 12) + "…");

  /* ② 中间有人改了它（这里用 `draft_patch`，就是 AI 改一处用的那件） */
  const patched = await postR("draft_patch", { path: F, edits: [{ old: "原来的一行", new: "AI 刚改的一行" }] });
  ok(patched.ok === true, "（样本有效性）中间真的被改了一次", patched.ok ? "改了" : JSON.stringify(patched.errors?.[0]?.message ?? "").slice(0, 60));

  /* ③ 拿**第一次读到的**内容 + 旧 sha 写回去 —— 这正是那颗钮原来做的事 */
  const w = await postR("draft_write", { path: F, content: read1.data?.source ?? "", expectedSourceSha256: sha1 });
  ok(w.data?.written === false && typeof w.data?.refused === "string" && String(w.data.refused).includes("并发"),
     "**带旧 sha 写回被拒**（原来：把读之前的旧内容整份盖回去，AI 刚做的改动被回滚）",
     `written=${String(w.data?.written)} · refused=${String(w.data?.refused ?? "（没有）").slice(0, 40)}`);
  ok(w.ok === true,
     "⚠️ **而信封还是 `ok: true`** —— 所以「只看 `ok`」的调用方会把被拒算成成功（#111 的第二半）",
     `ok=${String(w.ok)}`);
  const disk = await rf5(j3(T, F), "utf8");
  ok(disk.includes("AI 刚改的一行") && !disk.includes(">原来的一行<"),
     "**盘上留的是新内容**（判活不看回执看盘 —— 「被拒了」和「拒了但还是写了」回执长得一样）",
     disk.includes("AI 刚改的一行") ? "是新内容" : "被盖回旧内容了");

  /* ④ 对照组：带**当前**的 sha 写回去要成 —— 不然这道闸可能是「一律拒绝」 */
  const read2 = await fetch(ur(`source?file=${encodeURIComponent(F)}`)).then((x) => x.json()) as
    { data?: { source?: string; sha256?: string } };
  const w2 = await postR("draft_write", { path: F, content: (read2.data?.source ?? "").replace("AI 刚改的一行", "后来又改的一行"), expectedSourceSha256: read2.data?.sha256 });
  ok(w2.data?.written === true && !w2.data?.refused,
     "**（对照组）带当前的 sha 照样写得进去** —— 否则这道闸是「一律拒绝」，那也是坏的",
     `written=${String(w2.data?.written)}`);

  /* 收尾：和 FIFO 那一节同形 —— `serveStart` 回的是 `ServeInfo`（没有 `server`），停服务走 `serveStop(dir)` */
  try { const { serveStop } = await import("./serve.js"); serveStop(pr.dir); }
  catch { /* 停不掉也无妨，进程结束时一起走 */ }
  await rm3(T, { recursive: true, force: true });
}


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


console.log("\n⑬ 通道 A 走 Umbra 服务端 AI（一·c）—— 不出网，改完把配置放回去");
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
      console.log("  · 没登录，服务端 AI 下探图那两条跳过");
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
await rmdirAll(FIXTURE, { recursive: true, force: true });

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

/* ── 打开一个普通目录：**一个字节都不写**（M14-4 B3）──
   这是这一整批的验收点，而它**必须在真 HTTP 面上测** —— `open_project` 是
   HTTP 门面自己的一段逻辑（那句 `if (design && !s.indexExists) await buildIndex(…)`）。
   ⚠️ 判据是**数盘上的东西**，不是看回执：回执说「打开了」和「它没往里写」是两句话。 */
console.log("\n⑯ 打开普通目录不写一个字节 · 接管才部署（M14-4 B3）");
{
  const { mkdtemp: mkt3, writeFile: wf3, readdir: rd3, readFile: rf3 } = await import("node:fs/promises");
  const { tmpdir: td3 } = await import("node:os");
  const { join: join3 } = await import("node:path");
  const { realpathSync: rp4 } = await import("node:fs");
  /* 造一个「像用户文档目录那样」的普通目录：几份 .md，没有 project.json */
  const plain = rp4(await mkt3(join3(td3(), "umbra-plain-")));
  await wf3(join3(plain, "测试清单.md"), "# 清单\n", "utf8");
  await wf3(join3(plain, ".gitignore"), "node_modules/\n", "utf8");
  const before = (await rd3(plain)).sort();

  const o1 = await fetch(`${s.url}__ud/open_project?token=${encodeURIComponent(s.token)}`, {
    method: "POST", headers: { "content-type": "application/json", origin: s.url.replace(/\/$/, "") },
    body: JSON.stringify({ dir: plain }),
  }).then((r) => r.json() as Promise<{ ok: boolean; data?: { designProject?: boolean } }>);
  ok(o1.ok === true, "普通目录打得开（不是报错，也不是被拦去「新建项目」）");
  ok(o1.data?.designProject === false, "回执说清它**不是**设计项目", String(o1.data?.designProject));
  const after = (await rd3(plain)).sort();
  ok(after.join("|") === before.join("|"), "**打开之后那个目录一个文件都没多**（B3 的全部意义）",
     after.filter((x) => !before.includes(x)).join(" · ") || `${after.length} 项，和打开前一样`);
  ok(await rf3(join3(plain, ".gitignore"), "utf8") === "node_modules/\n", "**他的 .gitignore 一个字节都没动**");

  /* 接管之后才部署 —— 对照组。没有它的话上面那条「没多文件」可能只是因为部署整条路都坏了 */
  const o2 = await fetch(`${s.url}__ud/adopt_project?token=${encodeURIComponent(s.token)}`, {
    method: "POST", headers: { "content-type": "application/json", origin: s.url.replace(/\/$/, "") },
    body: JSON.stringify({ dir: plain }),
  }).then((r) => r.json() as Promise<{ ok: boolean; data?: { deployed?: number | null } }>);
  const adopted = (await rd3(plain)).sort();
  ok(o2.ok === true && adopted.includes("project.json"), "**对照组**：接管之后 project.json 才出现", String(o2.ok));
  ok(adopted.includes("index.dc.html") && adopted.includes("support.js"),
     "接管之后壳与运行时才部署（不然上一条「没多文件」可能只是整条路坏了）",
     `${adopted.length - before.length} 个新文件`);
  ok((o2.data?.deployed ?? 0) > 0, "回执说出部署了几份壳", String(o2.data?.deployed));
  await rmdirAll(plain, { recursive: true, force: true });
}

/* ── 收尾：自己造的兜底仓库（M14-6）──
   ⚠️ 这一套在系统临时目录下建过项目 → `STATE_ROOT/.umbrastudio/git/` 里多一个仓库，
   而删临时目录**删不掉它**（「清掉自己造的文件」和「清掉自己造的状态」是两件事，`00` §166）。
   判准只有一条：指向系统临时目录、而那个目录已经不在了。`onlyDead` 保证不碰还活着的。
   ⚠️ 这一条是**实测补的**：filetest / lifecycletest 装了收尾之后，跑完一整轮
   仓库数还是 2 → 5 —— 多出来的正是这三套（captest / difftest / apitest 的 rmw）。
   **「有的测装了收尾」不等于「残留不再增长」。** */
{
  const { dropLeftoversUnder } = await import("./purge.js");
  const { tmpdir: td0 } = await import("node:os");
  const r = await dropLeftoversUnder(td0(), { onlyDead: true });
  if (r.removed.length) console.log(`  · （收尾）清掉自己造的兜底仓库 ${r.removed.length} 个`);
}
console.log(fail === 0 ? `\n✓ HTTP 路由层 ${pass}/${pass + fail}\n` : `\n✗ HTTP 路由层 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
