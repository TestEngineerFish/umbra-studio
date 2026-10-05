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

console.log(fail === 0 ? `\n✓ HTTP 路由层 ${pass}/${pass + fail}\n` : `\n✗ HTTP 路由层 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
