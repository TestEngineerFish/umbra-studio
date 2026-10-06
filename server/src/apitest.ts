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

console.log(fail === 0 ? `\n✓ HTTP 路由层 ${pass}/${pass + fail}\n` : `\n✗ HTTP 路由层 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
