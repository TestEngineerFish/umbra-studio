import { _electron as electron } from "/Users/sam/Documents/SourceTree/Geek/UmbraStudio/server/node_modules/playwright-core/index.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const bin = require("/Users/sam/Documents/SourceTree/Geek/UmbraStudio/shell/node_modules/electron");
const S = process.env.S; const SHELL = "/Users/sam/Documents/SourceTree/Geek/UmbraStudio/shell";
const env = { ...process.env, UMBRASTUDIO_AUTOTEST_LOG: S + "/shell-autotest.log" };
/* ⚠️ **先看有没有旧实例还活着**（issue #10，2026-10-02 自己又撞到一次）。
   壳是 single-instance 的：第二个进程把参数发给第一个然后自己退出。
   于是 `_electron.launch` 起的那个进程**立刻就没了**，Playwright 等窗口等到超时，
   报的是 `kill EPERM` / 「主窗口没出来」——
   **症状伪装成「产品打不开」**，而真正的原因是上一轮没关干净。
   今天为这件事排查了两轮（和当年那次一样）。

   ⚠️ **不自动 `pkill`** —— issue 里原来写的修法是「步骤前加一行 pkill」，
   而那会**杀掉用户手上正开着的 Umbra Studio**（他可能有未落盘的改动）。
   这个脚本是开发侧工具，但它跑在用户自己的机器上。
   所以：**说清楚是什么、怎么办，然后退出，让人决定。** */
{
  const running = await new Promise((res) => {
    const p = spawn("sh", ["-c", "ps -axww -o pid=,args= | grep -F 'UmbraStudio/shell' | grep -v grep"]);
    let o = ""; p.stdout.on("data", (d) => o += d);
    p.on("close", () => res(o.trim().split("\n").filter(Boolean)));
  });
  if (running.length) {
    console.error("\n✗ 已经有壳在跑，shelltest 起不来（single-instance 会把新进程立刻挤掉）。");
    console.error(`  在跑的进程 ${running.length} 个，主进程 pid：${running.map((l) => l.trim().split(/\s+/)[0]).slice(0, 3).join(" ")}`);
    console.error("  **先把它关掉再跑** —— 这里不替你 pkill，因为那可能是你自己开着的 Umbra Studio，里面也许有没落盘的改动。");
    console.error("  确认没在用的话：ps -axww -o pid=,args= | grep -F 'UmbraStudio/shell' | grep -v grep | awk '{print $1}' | xargs kill\n");
    process.exit(2);
  }
}

/** 把这个实例的所有窗口挪到**非主显示器**上（sam 2026-10-22 的要求）。
 *
 *  ⚠️ 这一套起的是**真 Electron 窗口**，没有无头模式可用（`hometest` 走 Playwright 的
 *  无头 Chromium，所以它不弹窗；壳必须真开窗口才能测主进程那一层）。
 *  而主屏上 sam 自己在用 —— 窗口弹出来就抢焦点。
 *  ⚠️ **不改产品代码**：位置由测试自己摆，而不是给主进程加一个只有测试会设的环境变量
 *  （那种「只在测试里走的分支」迟早会和真实行为分叉）。
 *  只有一个显示器时它是空操作，并**说出来** —— 不然「挪过去了」和「这台机器只有一个屏」
 *  读数一样。 */
const park = async (app) => {
  const r = await app.evaluate(({ BrowserWindow, screen }) => {
    const prim = screen.getPrimaryDisplay();
    const other = screen.getAllDisplays().find((d) => d.id !== prim.id);
    if (!other) return null;
    const a = other.workArea;
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;
      try {
        w.setBounds({ x: a.x + 40, y: a.y + 40, width: Math.min(1280, a.width - 80), height: Math.min(840, a.height - 80) });
      } catch { /* 隐藏的体检窗口摆不动也没关系 */ }
    }
    return { x: a.x, y: a.y, w: a.width, h: a.height };
  }).catch(() => null);
  return r;
};

const t0 = Date.now();
const mainWindow = async (app) => {
  for (let i = 0; i < 100; i++) { const w = app.windows().find(w => w.url().includes("__app")); if (w) return w; await new Promise(r => setTimeout(r, 200)); }
  /* ⚠️ 超时的话**把「可能是什么」一起说出来** —— 原来只说「主窗口没出来」，
     而那句话指向产品，真正的原因往往在别处（旧实例、前端没 build、令牌拿不到）。 */
  throw new Error("主窗口没出来（20 秒）。可能的原因：① 还有旧实例活着（上面那道自检应该拦住了，除非它是刚起的）"
    + " ② `app/dist` 没 build（`npm --prefix app run build`） ③ 核心起不来 —— 看上面 electron 的 stderr");
};
let app = await electron.launch({ executablePath: bin, args: [SHELL], env, cwd: SHELL });
let win = await mainWindow(app);
{
  const at = await park(app);
  console.log("窗口位置:", at ? `挪到非主显示器 ${at.w}×${at.h} @ ${at.x},${at.y}（不抢主屏）` : "只有一个显示器，没地方挪 —— 窗口会出现在主屏上");
}
await win.waitForFunction(() => /最近打开|还没有项目/.test(document.body.innerText), null, { timeout: 30000 })
  .catch(async (e) => { console.error("首页没出来，当前页面文字：", JSON.stringify((await win.evaluate(() => document.body.innerText)).slice(0, 300))); throw e; });
console.log("launch→home:", Date.now() - t0, "ms | projects:", await win.evaluate(() => document.querySelectorAll("li").length), "| host:", await win.evaluate(() => ({ kind: window.umbraHost?.kind, pick: window.umbraHost?.capabilities().pickDirectory.ok })));
console.log("windows:", await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ visible: w.isVisible(), url: w.webContents.getURL().replace(/token=[^&]+/, "token=…").slice(0, 60) }))));
console.log("cdp env in main:", await app.evaluate(() => process.env.UMBRASTUDIO_CDP ?? null));
// 菜单「打开目录」→ 事件 → 前端 open_project
await app.evaluate(({ BrowserWindow }, dir) => { const w = BrowserWindow.getAllWindows().find(w => w.isVisible()); w.webContents.send("host:event", { type: "open-dir", dir }); }, S + "/umbra_copy");
/* ⚠️ 判据**不要写死稿数**（2026-09-28 实测栽过：写着 `58 份稿`，而测试副本是 38 份，
   于是这条永远超时、整个 shelltest 到不了后面）。它同时犯了两个错：
   拿界面文案当判据（uitest 已经栽过一次，第七轮把那颗钮改名就卡住了），
   还把**夹具的内容数量**写进判据 —— 换一份测试项目就红。
   `role="treeitem"` 是形制变了也还在的东西，和 uitest 用的是同一条。 */
await win.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length > 0 && !/核心断开/.test(document.body.innerText), null, { timeout: 20000 }); await win.waitForTimeout(1500);
console.log("workbench:", await win.evaluate(() => document.querySelector("header")?.innerText.replace(/\s+/g, " ")));

/* ⚠️ **令牌不许出现在任何进程的命令行里**（issue #39，2026-10-02）。
   第一版走 `additionalArguments`，而那会把 boot（含 token）写进**渲染进程的
   命令行** —— 渲染进程是独立的 OS 进程，命令行在 macOS 上对本机任何进程公开可读。
   实测过：`ps -axww -o args=` 一行就拿到完整 JSON，比 issue #30 还隐蔽
   （不用扫端口、不发任何 HTTP 请求）。

   判据**比对真令牌的值**而不是找 `--ud-boot=` 这个串 ——
   找串的话换个参数名判据就瞎了，而要守的不变量是「这个值不在 argv 里」。

   ⚠️ **但只搜明文是一条假判据。**（2026-10-02 反向验证时自己抓到的）
   第一版写的是 `o.includes(tok)` —— 而命令行里放的是 **base64 编码的 boot JSON**，
   明文令牌压根不在里面。把 `additionalArguments` 加回去跑，判据**照样绿**。
   「argv 里没有这个字符串」和「argv 里没有这个秘密」是两件事。

   所以改成：明文搜一遍，再把 argv 里每一个够长的 base64 串**解开**看里面有没有 ——
   不变量是「boot 数据不出现在 argv 里」，**不管它怎么编码**。
   只打印「含 / 不含」和命中的形式，不打印值本身。
   反向验证：把 `additionalArguments` 临时加回 `main.mjs`，这一条应报红。 */
{
  const tok = await win.evaluate(() => window.__UD_APP?.token ?? null);
  const argvHas = await new Promise((res) => {
    const p = spawn("sh", ["-c", "ps -axww -o args="]); let o = "";
    p.stdout.on("data", (d) => o += d);
    p.on("close", () => {
      if (!tok) return res(null);
      if (o.includes(tok)) return res("明文");
      for (const m of o.match(/[A-Za-z0-9+/]{40,}={0,2}/g) ?? []) {
        try { if (Buffer.from(m, "base64").toString("utf8").includes(tok)) return res("base64"); }
        catch { /* 不是合法 base64 就跳过 */ }
      }
      res(false);
    });
  });
  console.log(`token in argv: ${argvHas === null ? "✗ 拿不到令牌，这一条没验到" : argvHas ? `✗ 含（${argvHas}）！本机任何进程 ps 一行就能读到` : "✓ 不含（明文与 base64 都搜过）"}`
    + ` | 前端拿到令牌了吗: ${tok ? `✓ 长度 ${tok.length}` : "✗ 没拿到"}`);
  /* 「不在 argv 里」单独成立没有意义 —— 把令牌整个去掉它也成立。
     所以**两件一起报**：既不在命令行里，又确实能用。 */
  const works = await win.evaluate(async () => {
    const a = window.__UD_APP; if (!a) return "没有 boot";
    const r = await fetch(`${a.url.replace(/\/$/, "")}/__ud/recent_projects`, { headers: { "x-ud-token": a.token } });
    return r.status;
  });
  console.log("token usable:", works === 200 ? "✓ 真调一次能力回 200" : `✗ ${works}`);
}

/* ⚠️ **稿里的链接不许让壳外开任意协议、也不许把主窗口导出 hub 源**（issue #131）。
   原来 `setWindowOpenHandler` / `host:openExternal` 原样交给 `shell.openExternal`，
   `file:///Applications/X.app` 在 macOS 上会直接启动程序；主窗口被 `top.location=` 导走后
   preload 照跑，令牌也交出去。
   判据：在主进程里把 `shell.openExternal` 换成**记录桩**（不真开任何东西），
   从前端走三条入口（`umbraHost.openExternal` / `window.open` / 顶层导航），
   断言 file: / smb: 一次都没到 openExternal、https 照常到。
   顶层导航那一条放在脚本最后那个实例里验（被取消的导航会让 Playwright 一直「等导航结束」，
   放在这里会卡住后面所有 locator）。 */
{
  await app.evaluate(({ shell }) => { globalThis.__extCalls = []; globalThis.__extOrig = shell.openExternal; shell.openExternal = async (u) => { globalThis.__extCalls.push(String(u)); }; });
  const hubOrigin = await win.evaluate(() => location.origin);
  await win.evaluate(async () => {
    await window.umbraHost.openExternal("file:///Applications/Calculator.app");
    await window.umbraHost.openExternal("https://example.com/ok-1");
    window.open("smb://evil/share", "_blank");
    window.open("https://example.com/ok-2", "_blank");
  });
  await win.waitForTimeout(500);
  const calls = await app.evaluate(() => globalThis.__extCalls);
  const badProto = calls.filter((u) => !/^(https?|mailto):/i.test(u));
  console.log("外开协议闸:", badProto.length === 0 && calls.includes("https://example.com/ok-1") && calls.includes("https://example.com/ok-2")
    ? `✓ file: / smb: 没到 openExternal，https 照常（${calls.length} 次）` : `✗ ${JSON.stringify(calls)}`);
  await app.evaluate(({ shell }) => { shell.openExternal = globalThis.__extOrig; });
  void hubOrigin;
}

/* ⚠️ **有未落盘时关窗要有人问一句**（issue #44，2026-10-02）。
   前端在有 dirty 时取消 `beforeunload`，而 **Electron 不弹浏览器那种确认** ——
   没人听 `will-prevent-unload` 的话窗口**静默关不掉、界面上什么都不显示**，
   用户只能强制退出，而强制退出恰好丢掉那些改动。

   判据分两层，**缺哪一层都会留下假绿**：
   ① 主进程**真的挂了** `will-prevent-unload` 监听（结构）——
      这一条便宜，而且它是「会不会静默卡住」的唯一前提。
   ② 装一个会取消的 `beforeunload`，`close()` 之后**窗口真的还在**（行为）——
      光有监听不够：监听里要是无条件 `preventDefault()`，就变成「永远放行」，
      那等于没有这道闸。所以要验**默认那一支拦住了**。
   `showMessageBoxSync` 是模态的，自动化里会把测试挂住 —— 所以**只把「人点按钮」
   那一步换成桩**（在主进程里临时替换 `dialog.showMessageBoxSync`），
   真实的那一段逻辑照样走到。
   ⚠️ 只验「拦住」那一半：验「放行」要真关窗口，后面还有「强杀 → 重开」要用它。
   放行那一半用最小 Electron 实验单独验过（`doc/00` §一三四）。 */
{
  const listeners = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.isVisible());
    return w ? w.webContents.listenerCount("will-prevent-unload") : -1;
  });
  console.log("will-prevent-unload:", listeners > 0 ? `✓ 挂了 ${listeners} 个监听` : "✗ 没人听 —— 有未落盘时关窗会静默卡住");

  /* ⚠️ **先挂一个空的 dialog 监听器。**（2026-10-02 实测）
     Playwright 默认**自动 dismiss 所有 dialog**，而 Electron 下 beforeunload
     那个 dialog 事件一开就没了 → 它去 handle 时报
     `Protocol error (Page.handleJavaScriptDialog): No dialog is showing`，
     **而那是个 unhandledRejection，直接把 shelltest 带走**。
     挂了监听器它就不再自动处理。

     这件事本身也是教训：**仪器会改变被观测的行为** ——
     正因为这个，`will-prevent-unload` 的「放行」那一半没放在这里测，
     而是用一个不经 Playwright 的最小 Electron 实验单独验的。 */
  win.on("dialog", () => { /* 故意什么都不做 —— 只为阻止 Playwright 自动处理 */ });
  /* 装一个会取消的 beforeunload（和前端有 dirty 时做的事一样） */
  await win.evaluate(() => { window.addEventListener("beforeunload", (e) => { e.preventDefault(); e.returnValue = ""; }); });
  const r2 = await app.evaluate(async ({ BrowserWindow, dialog }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.isVisible());
    const real = dialog.showMessageBoxSync;
    let asked = null;
    dialog.showMessageBoxSync = (_win, opts) => { asked = opts; return 0; };   // 0 = 回去接着改
    try {
      const before = BrowserWindow.getAllWindows().length;
      w.close();
      await new Promise((res) => setTimeout(res, 1200));
      return { before, after: BrowserWindow.getAllWindows().length, asked };
    } finally { dialog.showMessageBoxSync = real; }
  });
  /* ⚠️ **「窗口还在」不能单独报。**（2026-10-02 反向验证抓到的假绿）
     第一版把它拆成两条「拦住了」和「问了吗」，而「拦住了」在 **bug 版本下照样绿** ——
     因为那条 bug 的症状**正是「窗口关不掉」**：

     | 窗口还在，因为 | 对不对 |
     | --- | --- |
     | 我们问了，用户选「回去接着改」 | ✅ |
     | 没人问，Electron 静默取消 | ❌ 正是那条 bug |

     **修好的状态和坏掉的状态在这一个维度上完全相同**，
     所以「窗口还在」单独为真**毫无信息量**。两件必须合成一条：
     「问了一句，**而且**留住了窗口」。 */
  const asked44 = !!r2.asked, kept44 = r2.after === r2.before;
  console.log(`close with dirty: ${asked44 && kept44 ? "✓ 问了一句，而且留住了窗口" : asked44 ? "✗ 问了但没留住 —— 改动会丢" : "✗ 没问（静默卡住）—— 「窗口还在」这时候不算好事"}`
    + ` | 窗口 ${r2.before} → ${r2.after}`
    + ` | ${asked44 ? `问的是「${r2.asked.message}」按钮 ${JSON.stringify(r2.asked.buttons)}` : "一句话都没说"}`);
}
/* ── 要输入的那几个入口在壳里也得能用（issue #103，2026-10-06）──
   **Electron 不实现 `window.prompt`。** 而「新建目录」「存为模板」「改名」「移到…」
   四处原来都是 `const name = window.prompt(...); if (!name) return;` ——
   于是在桌面版里**没有输入框、什么都不发生、也不说为什么**。
   而**用户真正在用的就是桌面版**，「新建目录」「存为模板」在那里只有这一个入口。

   ⚠️ **这一类只有这里测得到**：`uitest` 走浏览器模式（Chromium 原生有 `prompt`），
   所以它在那边永远是绿的。**同族：#44 的 `beforeunload`** ——
   「依赖浏览器原生行为的 Web API 在 Electron 壳里表现不同」。

   判据两半：① **先确认这个壳里 `prompt` 真的不能用**（样本有效性 ——
   哪天 Electron 补上了它，这条 bug 的前提就不成立，而判据该说出来）；
   ② 点那个入口，**我们自己的卡要出来**。 */
{
  const promptState = await win.evaluate(() => {
    try { const v = window.prompt("探针", "x"); return v === null ? "回 null（点不出输入框）" : `回了 ${JSON.stringify(v)}`; }
    catch (e) { return "抛了：" + String(e && e.message || e).slice(0, 40); }
  });
  console.log(`window.prompt in shell: ${/抛了|回 null/.test(promptState) ? "✓" : "⚠️"} ${promptState}`
    + "（这是 #103 的前提：不成立的话下面那条判据测的就不是这件事）");

  /* 右键目录树第一行 → 点「新建目录」→ 我们自己的卡该出来 */
  const row = win.locator('[role="treeitem"]').first();
  await row.click({ button: "right" });
  await win.waitForTimeout(500);
  const item = win.locator('[role="menu"] *').filter({ hasText: /^新建目录$/ }).first();
  const hasItem = await item.count();
  if (hasItem) {
    await item.click();
    await win.waitForTimeout(600);
    const dlg = win.locator('[role="dialog"]');
    const n = await dlg.count();
    const title = n ? (await dlg.first().innerText()).split("\n")[0] : "";
    console.log(`newFolder prompt: ${n === 1 && /新目录的名字/.test(title) ? "✓ 我们自己的输入卡出来了" : "✗ 没有输入卡 —— 点了没反应"}`
      + ` | ${n} 个 dialog${title ? ` · 标题「${title}」` : ""}`);
    /* ⚠️ **还要能走完**：出来一张卡但确认不了，和没有卡一样糟。
       输入一个名字 → 回车 → 树里该多一行。 */
    if (n === 1) {
      const name = `_壳回归目录-${Date.now()}`;
      await win.locator('[role="dialog"] input').fill(name);
      await win.keyboard.press("Enter");
      /* ⚠️ **直接看盘**（Node 侧，地面真相）。
         第一版从页面里问 `/__ud/files` —— 而壳里 `window.__UD_APP` 指的是
         **hub 服务**（没有项目上下文），真代码走的是**项目自己的**服务。
         探针问错了服务，读到的「盘上 0」说明不了任何事；
         诊断那一行把它暴露出来了（「hub 服务没有项目上下文」）。
         **判据要么走产品真实的那条路，要么直接看盘 —— 不要走第三条路。**
         ⚠️ **轮询**，别定时等（§150.7 那条）；而且「盘上有没有」和「树刷没刷」分开问。 */
      const { existsSync: ex } = await import("node:fs");
      /* ⚠️ **建在哪取决于右键点的是哪一行**（2026-10-06 实测栽过）：
         右键一个**目录**行时 `newFolder(dir)` 收到的是那个目录，新目录建在它**里面**。
         第一版判据写死 `umbra_copy/<名字>`，读到「盘上没有」——
         而目录其实建在 `umbra_copy/design_handoff_umbra/<名字>` 里。
         **判据写死了一个位置，而那个位置由界面状态决定。**
         所以这里从那一行的 `title`（= 相对项目根的路径）算父目录。 */
      const parent = (await row.getAttribute("title").catch(() => "")) || "";
      const dirOnDisk = S + "/umbra_copy/" + (parent ? parent + "/" : "") + name;
      /* ⚠️ **只等「盘上有」** —— 树里出不出现取决于那个父目录**展开了没有**，
         而我们右键的那一行多半是收起的，所以子项**本来就不该画出来**。
         第一版把 `inTree > 0` 也当成退出条件，于是白等 10 秒、还把
         「盘上有而树没刷」当成一件事报出来 —— **那句话本身是错的**。
         判据只认地面真相（盘），树的那个数只作为读数附带一句。 */
      let onDisk = false;
      for (let q = 0; q < 24; q++) {
        onDisk = ex(dirOnDisk);
        if (onDisk) break;
        await win.waitForTimeout(400);
      }
      const inTree = await win.locator('[role="treeitem"]').filter({ hasText: name }).count();
      /* 诊断：失败时界面会弹一条 toast（`toast("建不了", …, "error")`）——
         读它比猜快。⚠️ toast 3.2 秒就消失，所以上面轮询的间隔内要抓得到。 */
      if (!onDisk) {
        /* 先问一句最关键的：那张卡**关掉了吗**？
           关掉了 = `done()` 跑了（问题在 post 之后）；还开着 = Enter 没到输入框。 */
        const still = await win.locator('[role="dialog"]').count();
        const rowTitle = await row.getAttribute("title").catch(() => "?");
        console.log(`  诊断：卡还开着吗 ${still ? "是（Enter 没到输入框）" : "否（done 跑了）"} · 右键点的那一行是「${rowTitle}」`);
        const why = await win.evaluate(() => {
          const t = [...document.querySelectorAll("div")].map((n) => n.textContent || "")
            .filter((x) => /建不了|不合法|没有这个|跨出/.test(x) && x.length < 120);
          return t[0] ?? "（界面上没有任何错误提示 —— 也就是说那次 post 可能压根没发）";
        }).catch((e) => "探针炸了：" + String(e).slice(0, 50));
        console.log("  诊断：", why);
      }
      console.log(`newFolder done: ${onDisk ? "✓ 目录真建出来了" : "✗ 卡走完了但盘上没有这个目录"}`
        + ` | 建在 ${parent || "项目根"} 下 · 盘上 ${onDisk ? "有" : "没有"}`
        + ` · 树里 ${inTree}（那个父目录收起时子项本来就不画，所以这个数不是判据）`);
      /* 收尾：直接删掉盘上那个目录（纪律⑥）。
         ⚠️ 这是**项目副本**（`umbra_copy`），但也不该留 ——
         下一轮跑的时候树里会多一行，而那会让「树里 N 行」那类判据读数变错。 */
      try { const { rmSync } = await import("node:fs"); rmSync(dirOnDisk, { recursive: true, force: true }); } catch { /* 删不掉也无妨，它在副本里 */ }
    }
  } else {
    console.log("newFolder prompt: ✗ 右键菜单里找不到「新建目录」—— 这一条没验到");
  }
  await win.keyboard.press("Escape");
  await win.waitForTimeout(300);
}

// 体检：走项目自己的服务，主进程里 render_check 应经 CDP（UMBRASTUDIO_CDP 已设）
/* ⚠️ 路径**只有一个来源**：环境变量 `S`（2026-09-28 实测栽过）。
   原来这里是字面量 `"<scratchpad>/umbra_copy"`，而第 7 行同一个目录走的是 `process.env.S` ——
   **同一个脚本里两种传法混着**。照文档只替换那个占位符的话，第 18 行拿到的是
   `undefined/umbra_copy`，工作台永远开不出来，而超时报在第 24 行那条判据上，
   看着像「产品打不开目录」。**夹具的问题和产品的问题报出来的样子一样**（§111.3 同一族）。 */
const r = await win.evaluate(async (dir) => {
  // 从 React 状态拿不到句柄，直接用 hub 的 open_project 再拿一次 url/token（幂等）
  const hub = window.__UD_APP; const o = await (await fetch(`${hub.url}__ud/open_project?token=${hub.token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir }) })).json();
  const c = await (await fetch(`${o.data.url}__ud/check?token=${o.data.token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: "PC 吐司.dc.html" }) })).json();
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); const s = await (await fetch(`${o.data.url}__ud/check_status?job=${c.data.jobId}&token=${o.data.token}`)).json(); if (s.data && s.data.running === false) return { ok: s.data.ok, res: s.data.result && s.data.result.result }; }
  return { timeout: true };
}, S + "/umbra_copy");
console.log("check via CDP:", JSON.stringify(r).slice(0, 200));
console.log("chrome processes launched by core? (ps count of headless chrome):", await new Promise(res => { const p = spawn("sh", ["-c", "ps aux | grep -c '[h]eadless.*--disable-background-networking'"]); let o = ""; p.stdout.on("data", d => o += d); p.on("close", () => res(o.trim())); }));
// 单实例：第二个实例应立刻退出
const second = spawn(bin, [SHELL], { env, stdio: "ignore" }); const code = await new Promise(res => { const t = setTimeout(() => { second.kill(); res("still running after 6s"); }, 6000); second.on("exit", c => { clearTimeout(t); res(c); }); });
console.log("second instance exit:", code);
// 强杀 → 重开 → 未落盘提示
const pid = await app.evaluate(() => process.pid); process.kill(pid, "SIGKILL"); await new Promise(r => setTimeout(r, 1500));
app = await electron.launch({ executablePath: bin, args: [SHELL], env, cwd: SHELL }); win = await mainWindow(app); await park(app);
await win.waitForFunction(() => /上次没有正常退出/.test(document.body.innerText), null, { timeout: 15000 }).then(() => console.log("dirty-restart toast: ok")).catch(() => console.log("dirty-restart toast: 没出现"));
await app.close();
// 正常退出后再开：不该有提示
app = await electron.launch({ executablePath: bin, args: [SHELL], env, cwd: SHELL }); win = await mainWindow(app); await park(app); await win.waitForTimeout(2500);
console.log("clean restart toast:", await win.evaluate(() => /上次没有正常退出/.test(document.body.innerText)) ? "有（错）" : "无（对）");
/* ── 多窗口 + 拖拽路径桥（M14-5 下半，2026-10-22）──
   ⚠️⚠️ **这一节钉的是「多窗口不是一句 new BrowserWindow」。**
   主进程原来有一个 `mainWin` 单例，而它被**九处**读着（发事件给谁 · boot 校验 ·
   改谁的标题 · 对话框挂哪 · 导航闸 · activate · second-instance …）。
   只改 new 的那一句，其余八处会静默指着「第一个窗口」——
   症状是「第二个窗口里点什么都作用在第一个窗口上」，**那比开不出新窗口难查得多**。
   所以这里不只数窗口数，还要钉**两个窗口互不串线**。

   ⚠️ **真从访达拖一个文件进来，判据写不进来**（要驱动系统 UI）；
   而 `webUtils.getPathForFile()` 对页面里 `new` 出来的 `File` 回空串 ——
   它只认真从系统拖进来的那种。所以拖拽分两层测：
   逻辑那一层在 `hometest` ⑦（合成 drag，钉落点 / 问句 / 两个落点的分界），
   这里钉**桥在不在、以及那个版本陷阱是真的**。 */
{
  const winCount = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length);
  const n0 = await winCount();

  /* ⓐ 版本陷阱本身：这个 Electron 上 `File.path` 真的没了 —— **这是 `webUtils` 存在的理由**。
     ⚠️ 这一条是「为什么不能照老教程写」的读数。没有它，下一个人会把
     `webUtils.getPathForFile` 「简化」回 `file.path`，而那在这个版本上静默回 undefined。 */
  const trap = await win.evaluate(() => ({
    pathProp: typeof new File([new Uint8Array(1)], "x.png").path,
    hasBridge: typeof window.umbraHost?.pathsForDrop === "function",
    canDrop: window.umbraHost?.capabilities?.().dropPaths?.ok ?? null,
    canWin: window.umbraHost?.capabilities?.().newWindow?.ok ?? null,
    electron: null,
  }));
  console.log("拖拽路径桥:", trap.pathProp === "undefined" && trap.hasBridge && trap.canDrop === true
    ? `✓ File.path 在这个版本上是 undefined（所以必须走 webUtils）· 桥在 · dropPaths.ok`
    : `✗ ${JSON.stringify(trap)}`);
  /* 合成的 File 拿不到路径是**预期**（`getPathForFile` 只认真拖进来的）——
     钉的是**它不抛异常**：抛的话一次拖拽会把整个处理器炸掉，而症状是「拖了没反应」。 */
  const synth = await win.evaluate(() => {
    try { return { ok: true, n: window.umbraHost.pathsForDrop([new File([new Uint8Array(1)], "x.png")]).length }; }
    catch (e) { return { ok: false, why: String(e).slice(0, 80) }; }
  });
  console.log("合成的 File 走桥:", synth.ok ? `✓ 不抛，回 ${synth.n} 个路径（0 是对的：getPathForFile 只认真拖进来的）` : `✗ 抛了：${synth.why}`);

  /* ⓑ 开一个新窗口，而且**它真的打开了那个目录** */
  const copyDir = S + "/umbra_copy";
  const opened = await win.evaluate((d) => window.umbraHost.openInNewWindow([d]), copyDir);
  await new Promise((r) => setTimeout(r, 3000));
  await park(app);
  const n1 = await winCount();
  console.log("多窗口:", opened === true && n1 === n0 + 1 ? `✓ ${n0} → ${n1} 个窗口` : `✗ openInNewWindow 回 ${opened} · 窗口 ${n0} → ${n1}`);

  const second = app.windows().find((w) => w !== win && w.url().includes("__app"));
  if (!second) console.log("第二个窗口:", "✗ 找不到（上一条已经红了）");
  else {
    /* 判据是**那个窗口真的开到了那个项目**，不是「窗口出来了」——
       后者在事件丢掉的时候也成立（那正是「按窗口分待发队列」要防的）。 */
    /* ⚠️⚠️ **第一版这一条绿错了，而只有详情那一串看得出来。**
       原来的条件是 `/umbra_copy/.test(innerText) || tree-head` —— 而
       「umbra_copy」这个名字出现在**新窗口首页的「最近打开」列表**里
       （第一个窗口刚打开过它）。于是判据通过，读数却是「(没有目录列)」：
       **新窗口停在首页，事件丢了。**
       > 又一次「它还可能因为什么原因这么说」—— 一个 `||` 里的某一支，
       > 在要测的那件事完全没发生时也成立。
       现在只认目录列，而且列头上要**真的是那个目录的名字**。 */
    let got = "";
    try {
      await second.waitForFunction(() => {
        const h = document.querySelector('[data-ud="tree-head"]');
        return !!h && /\S/.test(h.innerText);
      }, null, { timeout: 25000 });
      got = await second.evaluate(() => document.querySelector('[data-ud="tree-head"]').innerText.trim().slice(0, 30));
    } catch { got = ""; }
    console.log("新窗口打开了那个目录:", got && /umbra_copy|Umbra_design/.test(got)
      ? `✓ 它自己的目录列，列头「${got}」`
      : `✗ ${got ? `列头是「${got}」，不是那个目录` : "25 秒内没开出工作台 —— 事件丢了（页面还没挂上监听就发了？）"}`);

    /* ⓒ **两个窗口互不串线** —— 这一条才是「九处单例」的判据。
       在第二个窗口里改标题，第一个窗口的标题不许跟着变。 */
    await second.evaluate(() => window.umbraHost.setTitle("第二个窗口"));
    await new Promise((r) => setTimeout(r, 800));
    const titles = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).map((w) => w.getTitle()));
    console.log("两个窗口互不串线:", titles.filter((t) => t === "第二个窗口").length === 1
      ? `✓ 只有一个窗口改了标题 · ${JSON.stringify(titles)}`
      : `✗ 标题串了 · ${JSON.stringify(titles)}`);
    await second.evaluate(() => window.close()).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const n2 = await winCount();
    console.log("关掉第二个窗口:", n2 === n0 ? `✓ 回到 ${n2} 个（集合里删干净了）` : `✗ 还剩 ${n2} 个`);
  }
}

/* 主窗口导航闸（issue #131）：顶层导航到 hub 以外要被取消、交给系统浏览器（这里是记录桩），主窗口仍在 hub 源。
   放在这个实例的最后：被取消的导航会让 Playwright 之后的操作一直「等导航结束」。 */
{
  await app.evaluate(({ shell }) => { globalThis.__extCalls = []; shell.openExternal = async (u) => { globalThis.__extCalls.push(String(u)); }; });
  const hubOrigin = await win.evaluate(() => location.origin);
  await win.evaluate(() => { location.href = "http://127.0.0.1:1/attacker"; }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  const calls = await app.evaluate(() => globalThis.__extCalls);
  const nowUrl = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.isVisible())?.webContents.getURL() ?? "");
  console.log("主窗口导航闸:", nowUrl.startsWith(hubOrigin) && calls.includes("http://127.0.0.1:1/attacker")
    ? "✓ 导出 hub 源被取消（交给系统浏览器），主窗口仍在 hub" : `✗ 主窗口在 ${nowUrl.slice(0, 60)} · 外开 ${JSON.stringify(calls)}`);
}
await app.close();
// --mcp：壳当 MCP server 起，stdio 归 MCP
{
  const { Client } = await import("/Users/sam/Documents/SourceTree/Geek/UmbraStudio/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
  const { StdioClientTransport } = await import("/Users/sam/Documents/SourceTree/Geek/UmbraStudio/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js");
  const t1 = Date.now(); const tr = new StdioClientTransport({ command: bin, args: [SHELL, "--mcp"], env, cwd: SHELL, stderr: "pipe" }); const c = new Client({ name: "t", version: "0" });
  await c.connect(tr); const tools = await c.listTools(); const r = await c.callTool({ name: "list_projects", arguments: {} }); const j = JSON.parse(r.content[0].text);
  console.log("--mcp: initialize", Date.now() - t1, "ms · tools", tools.tools.length, "· list_projects ok", j.ok);
  await c.close(); await new Promise(r => setTimeout(r, 800)); const alive = await new Promise(res => { const p = spawn("sh", ["-c", "ps aux | grep -c '[U]mbraStudio/shell.*--mcp'"]); let o = ""; p.stdout.on("data", d => o += d); p.on("close", () => res(o.trim())); });
  console.log("--mcp: 客户端断开后壳进程还活着:", alive, "(壳有窗口，stdin 关了不退出是预期；秘书用时窗口可见)");
}
/* ── 命令行带一个路径进来（M14-5 / `doc/11` Q59–Q61）──
   「右键 › 打开方式」和「双击」走的是 macOS 的 `open-file` 事件，**判据写不进来**
   （要 LaunchServices 真的派发）；而**命令行这条路和它们汇到同一个 `openPath()`**，
   所以它是三条路里**唯一能钉住的那一条**。钉住它 = 钉住那个汇流处。
   ⚠️ 单实例：这一段必须在前一个实例 `close()` 之后跑，否则新进程会被立刻挤掉。 */
{
  const { readdirSync } = await import("node:fs");
  const copy = S + "/umbra_copy";
  /* ⚠️ **别挑 `project.json`**（第一版挑中了它，而判据因此是假的）：
     它在目录树里本来就列着，于是「页面上出现这个名字」在 argv 被**整个忽略**时
     照样成立 —— 正是 `doc/00` §114.6「判据在测别的东西也会绿」。
     挑一份**不会被自动打开**的普通文件，并且判据看的是**有没有为它开一个页签**。 */
  const one = readdirSync(copy).find((f) => /\.(md|txt)$/i.test(f))
    ?? readdirSync(copy).find((f) => f.endsWith(".dc.html") && !/^(index|S\d|IconGlyph)/.test(f));
  if (!one) console.log("命令行打开：跳过 —— 测试副本里没有可打开的文件");
  else {
    const t2 = Date.now();
    const a2 = await electron.launch({ executablePath: bin, args: [SHELL, copy + "/" + one], env, cwd: SHELL });
    const w2 = await mainWindow(a2);
    await park(a2);
    /* 判据是**工作台开到了那一份**，不是「窗口出来了」——
       后者在参数被整个忽略的时候也成立（那正是 `second-instance` 原来的样子）。 */
    let got = "";
    try {
      await w2.waitForFunction((name) => [...document.querySelectorAll('[data-ud="tab"]')].some((e) => e.getAttribute("data-path") === name),
        one, { timeout: 25000 });
      got = await w2.evaluate(() => [...document.querySelectorAll('[data-ud="tab"]')].map((e) => e.getAttribute("data-path")).join(" · "));
    } catch { got = ""; }
    console.log(`命令行打开一个文件 ${JSON.stringify(one)}:`, got ? `✓ ${Date.now() - t2}ms · 页签 ${got}` : "✗ 25 秒内没为它开页签（argv 被忽略了？）");
    await a2.close();
  }
}

console.log("autotest log:", (await readFile(S + "/shell-autotest.log", "utf8")).trim().split("\n").pop());

/* ── 收尾：撤掉「最近打开」里那一条（2026-10-07）──
   壳打开这个副本是**产品的正常行为**（`open_project` → `touchProject`），
   但那条记录指向一个**测试用的副本目录** —— 跑完留在首页的「最近打开」上。
   和 `lifecycletest` 步骤 8 同一个病：**清掉自己造的文件 ≠ 清掉自己造的状态。** */
try {
  const { removeRecentProject } = await import("/Users/sam/Documents/SourceTree/Geek/UmbraStudio/server/dist/workspace.js");
  const r = await removeRecentProject(S + "/umbra_copy");   // 记的是副本目录本身，不是 S（原来传 S，永远「本来就没有」）
  console.log("收尾：最近打开里那条测试记录", r.removed ? "已撤掉" : "本来就没有");
} catch (e) { console.log("收尾：撤「最近打开」没成（不影响测试结论）:", String(e).slice(0, 60)); }
/* ⚠️ **还要清掉旁数据那条记录**（M14-9 收尾时量到，2026-10-22）。
   打开那个副本会在 `STATE_ROOT/.umbrastudio/records/` 里建一条记录 + 一个目录，
   而 `removeRecentProject` 只管「最近打开」那张列表 —— **两件事，两处状态**。
   ⚠️ 别套用 `apitest` 那句 `dropLeftoversUnder(os.tmpdir())`：
   这一套的副本在**会话 scratchpad**（`/private/tmp/claude-501/…`）下，不在 `os.tmpdir()`（`/var/folders/…`）里，
   那句话扫不到它 —— 又一次「清理的判准和样本的位置对不上」。
   所以按**副本自己的目录**清。 */
try {
  const { dropRecordsUnder } = await import("/Users/sam/Documents/SourceTree/Geek/UmbraStudio/server/dist/records.js");
  /* ⚠️ **`{ onlyDead: false }` 是必须显式写的**：不传 opts 时它只删「目标已经不在」的，
     而这里副本目录**还在**（跑完由人决定要不要留着看）。
     第一版没传，读数是「旁数据记录 **本来就没有**」——
     **一句「本来就没有」把「我没删到」说成了「没有要删的」。** */
  const r2 = dropRecordsUnder(S, { onlyDead: false });
  console.log("收尾：旁数据记录", r2.removed.length ? `清掉 ${r2.removed.length} 条` : "本来就没有");
} catch (e) { console.log("收尾：清旁数据记录没成（不影响测试结论）:", String(e).slice(0, 60)); }
