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
import { buildProject, listProjectDirs } from "./project.js";
import { start as startJob } from "./jobs.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`); }
};

const dirs = await listProjectDirs();
if (!dirs.length) { console.log("– 没有项目可测，跳过（projects/ 是空的）"); process.exit(0); }
const p = await buildProject(dirs[0] as string);
const s = await serveStart(p);
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
console.log("\n① 同一会话还有一轮在跑时说出来（issue #35）");
{
  const sessionId = "apitest-busy-session";
  /* 塞一个 8 秒不结束的作业，键和路由里拼的那个一模一样 —— 键不同就测不到这条路 */
  let release = () => {};
  const slow = new Promise<void>((r) => { release = r; });
  const held = startJob("chat", `${p.name}::chat::${sessionId}`, () => slow);
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

/* ── 预览路由的三道闸（M10-3）──
   这条路由存在的唯一理由是「让插件能嵌用户项目里的一个网页」。
   **它一旦松一点，就等于给插件开了一条读项目内容的新路** ——
   而读文件本来有 `read_file`（带权限声明），这条不该重复那件事。 */
console.log("\n③ 预览路由的三道闸（M10-3）");
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
console.log("\n④ 预览路由的文件名里带 %（issue #43）");
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

console.log(fail === 0 ? `\n✓ HTTP 路由层 ${pass}/${pass + fail}\n` : `\n✗ HTTP 路由层 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
