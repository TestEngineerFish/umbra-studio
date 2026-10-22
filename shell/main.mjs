/** Umbra Studio 桌面壳（M9-2）。doc/00 §五十 的做法：
 *  - 核心（server/dist）直接 import 进主进程：起 hub 服务 + 按需起项目服务；带 --mcp 时再把 stdio 交给 MCP（秘书 / 其它模型客户端就把这个可执行文件当 MCP server 起）
 *  - 体检走自带 Chromium：开一个隐藏窗口 + remote-debugging-port=0，把 DevTools 端口写进 UMBRASTUDIO_CDP（M9-3）
 *  - 单实例 / 菜单 / 最近项目 / 未落盘提示（上次没正常退出）
 *  前端只通过 preload 暴露的 window.umbraHost 碰壳（host adapter desktop 实现）。 */
import { app, BrowserWindow, Menu, dialog, shell, ipcMain, Notification, nativeTheme } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { externalAllowed, sameOrigin } from "./urlguard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 核心根：开发时是仓库根（shell/..），打包后是 resources/core（electron-builder extraResources） */
const CORE_ROOT = app.isPackaged ? join(process.resourcesPath, "core") : join(HERE, "..");
const CORE_DIST = join(CORE_ROOT, "server", "dist");
const IS_MCP = process.argv.includes("--mcp");

/** 可写状态的目录名，**冻结在改名之前的值**（品牌收口）。
 *
 *  ⚠️⚠️ **这不是品牌名，是一条遗留路径** —— 所以它**刻意不读 `brand.ts`**。
 *  Electron 的 `getPath("userData")` = `appData` + **应用名**，而原来
 *  `app.setName("Umbra Studio")` 正是在喂这个计算（下面第三行就把它塞进
 *  `UMBRASTUDIO_STATE_DIR`）。于是改一次 `productName`，`userData` 就从
 *  `Umbra Studio` 变成别的名字，而躺在里面的是用户的 **`workspace.json`（最近打开）·
 *  `account.json`（登录）· `records/`（全部版本历史）** —— 实测这台机器上 **8.1 MB**。
 *  > **改一个显示用的名字，不该让用户的数据消失** ——
 *  > 而这两件事之间唯一的联系是一个「顺手用了应用名做目录名」的默认行为。
 *  ⚠️ 2026-10-22 这一天产品名改了**两次**（先「悠蜗」后「长尾雀」）——
 *  **这正是为什么数据路径必须和显示名解耦**：解耦之后改几次都不影响它。
 *  ⚠️ 单实例锁也跟着固定了（macOS / Linux 上它就落在 `userData` 里）。
 *  ⚠️ `captest` ⑯ 有一条闸钉着这个常量不等于任何品牌名派生值。 */
const LEGACY_DATA_DIR = "Umbra Studio";

/* 必须在 ready 之前、且在任何 getPath("userData") 之前 —— 同步、不依赖任何 import。
   `appData`（`~/Library/Application Support`）本身不含应用名，所以不受 setName 影响。 */
app.setPath("userData", join(app.getPath("appData"), LEGACY_DATA_DIR));

/** 显示用的应用名。**只有这一处读 brand**，其余地方一律用 `app.getName()`。
 *  ⚠️ 为什么失败不兜一个字面量：兜了就是第二份品牌名。打包版里 `app.getName()`
 *  退回 `Info.plist` 的 `CFBundleName`（electron-builder 从 `extendInfo` 写的，
 *  也是「长尾雀 Studio」），开发版退回 `Electron` —— 而开发版 core 没 build 的话本来也跑不起来。
 *  ⚠️ `setName` **不需要**在 ready 之前（userData 上面已经显式定住了），所以这里 await 是安全的。 */
try {
  const brand = await import(pathToFileURL(join(CORE_DIST, "shared", "brand.js")).href);
  app.setName(brand.studioName);
} catch { /* core 没 build：名字退回 Info.plist / Electron，见上 */ }
/* 可写状态（ai_config / workspace / projects / .archived）不能落在 .app 里：
   ad-hoc 签名的 app 内容一被改动，下次启动就被 macOS 判「已损坏」（M9-4 实测的第一条缺陷）。
   核心读 UMBRASTUDIO_STATE_DIR，没设时退回自己的根 —— 开发模式什么都不变。
   注意 setName 要在前面：getPath("userData") 用 app 名做目录名。 */
if (app.isPackaged && !process.env.UMBRASTUDIO_STATE_DIR) process.env.UMBRASTUDIO_STATE_DIR = app.getPath("userData");
/** 单实例锁 —— ⚠️ **`--mcp` 模式不抢**（issue #191）。
 *
 *  锁落在 `userData` 里，而两种模式共用同一个 `userData`。原来这一句**不分模式**，
 *  于是最常见的那种用法直接不可用：**用户开着界面，秘书同时连上来** ——
 *  外部客户端起 `… --mcp` → 拿不到锁 → `app.quit()` → stdio 当场关闭，
 *  客户端看到的是 `MCP error -32000: Connection closed`，**一句解释都没有**。
 *  而「当 MCP 用（给别的模型客户端）」写在 CLAUDE.md §3 里，是正式支持的场景。
 *  > **实测**：`shelltest` 的 MCP 那一节在主实例活着时就是这个读数，
 *  > 排查了一轮才定位到是锁，而不是产品坏了 ——
 *  > **「拿不到锁」和「坏了」在报错里长得一样。**
 *
 *  ⚠️ 单实例是**给窗口模式**的（避免开出两个主界面）；
 *  MCP 模式是一台 server，本来就该允许多个客户端各起一个。 */
if (!IS_MCP && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
/* ⚠️ `--mcp` 模式**不开 CDP**（issue #191）：它不跑体检，而
   `DevToolsActivePort` 是 `userData` 里的**一个文件** —— 两个进程都写的话
   后起的覆盖先起的，于是**主实例的体检会连到 MCP 进程那个 Chromium 上**。
   这一条今天不一定炸（体检只在主实例里发起），但它是一个「两个进程写同一个
   文件、而读的人不知道」的结构，和 #189 那条索引覆盖是同一个形状。 */
if (!IS_MCP) app.commandLine.appendSwitch("remote-debugging-port", "0");
for (const f of ["disable-background-networking", "disable-component-update", "disable-sync", "no-first-run", "no-pings"]) app.commandLine.appendSwitch(f);

/** 未落盘提示的依据：启动写 session.json { cleanExit:false }，正常退出改 true；下次启动看到 false 就是被强杀过 */
const sessionFile = () => join(app.getPath("userData"), "session.json");
function readSession() { try { return JSON.parse(readFileSync(sessionFile(), "utf8")); } catch { return null; } }
function writeSession(v) { try { mkdirSync(dirname(sessionFile()), { recursive: true }); writeFileSync(sessionFile(), JSON.stringify(v)); } catch { /* 只读盘就算了 */ } }

let core = null;      // { hubStart, serveStart, buildProject, listRecentProjects, touchProject }
let hub = null;       // { url, port, token }
/** 开着的所有工作窗口（M14-5 下半，2026-10-22）。
 *
 *  ⚠️ **原来这里是一个 `mainWin` 单例。** 多窗口不是「再 new 一个 BrowserWindow」那么一句 ——
 *  一个单例在这个文件里被**九处**读着：`sendHost` 发事件给谁 · `host:boot` 的发送方校验 ·
 *  `host:setTitle` 改谁的标题 · 选目录对话框挂在哪个窗口上 · `will-prevent-unload` ·
 *  `activate` · `second-instance` · 菜单里「在浏览器里打开当前页」。
 *  **只改 new 的那一句，其余八处会静默指着「第一个窗口」** ——
 *  症状是「第二个窗口里点什么都作用在第一个窗口上」，而那比不能开新窗口难查得多。
 *
 *  所以这里换成一个集合 + 一个「谁在前面」，上面九处逐处改成「按发送方找窗口」。 */
const wins = new Set();
/** 最后被聚焦的那个窗口 —— 系统事件（Dock 图标、`second-instance`）没有发送方，只能给它。 */
let lastFocused = null;
let checkWin = null;
/** 窗口 → 它还没 ready 时攒下的宿主事件。**按窗口分**：原来是一个全局队列，
 *  多窗口下第二个窗口 ready 时会把第一个窗口的事件也一起领走。 */
const pendingOf = new WeakMap();

/** 这个 webContents 是我们自己的工作窗口吗（`host:boot` 那道闸要用）。 */
function winOf(webContents) {
  for (const w of wins) if (!w.isDestroyed() && w.webContents === webContents) return w;
  return null;
}
/** 事件该发给哪个窗口：点名的那个 → 最后聚焦的 → 任意一个。 */
function targetWin(prefer) {
  if (prefer && !prefer.isDestroyed()) return prefer;
  if (lastFocused && !lastFocused.isDestroyed()) return lastFocused;
  for (const w of wins) if (!w.isDestroyed()) return w;
  return null;
}

/* ══ 「打开方式」/ 双击 / 命令行（M14-5，`doc/11` Q59–Q61）══
 *
 *  ⚠️ **`open-file` 必须在 `whenReady` 之前注册**（`doc/24` §六②）。
 *  macOS 冷启动双击一个文件时，这个事件**在 app ready 之前就触发**了 ——
 *  注册晚了就是「冷启动丢、热启动好」，也就是用户嘴里的「**有时候行有时候不行**」。
 *  这一类缺陷最难报：它不是「不работает」，是「不稳定」。
 *
 *  ⚠️ `second-instance` 原来**把 argv 整个扔了**（同节①）——
 *  Windows 上「应用已经开着时右键用它打开」至今是失效的，只是没人走到过。 */
const queued = [];    // 核心还没起来时攒下的「要打开的路径」

/** 从一串 argv 里挑出**真实存在的路径**。
 *  ⚠️ 不按「第一个非选项参数」取：Electron 自己的开关（`--inspect` 之类）、
 *  开发模式下的 `.`、以及 Windows 传来的引号形式都会混在里面。
 *  **「它在盘上存在」是一条不用枚举的判准** —— 和 M14-6 清理兜底仓库同一个思路。 */
function pathsFromArgv(argv) {
  /* ⚠️ **要把「应用自己的路径」排掉**（2026-10-22 `shelltest` 当场抓到）。
     开发模式下 `process.argv` 是 `[electron, <应用目录>, ...用户参数]` ——
     而那个应用目录**在盘上存在**，于是「存在就打开」会把 `shell/` 自己当成项目打开：
     实测首页变成了 `shell → out → mac-arm64 → Umbra Studio.app → …` 的目录树。
     打包后 `getAppPath()` 在 `.app` 里，碰不到，所以**这是一条只在开发模式下出现的**
     —— 正是 `doc/00` §63.1 那一族（开发模式下测不出来 / 只在开发模式下出现）的反面。 */
  let selfPaths = [];
  try { const ap = app.getAppPath(); selfPaths = [ap, resolve(ap)]; } catch { /* ready 之前拿不到也没关系 */ }
  return argv.slice(1).filter((a) =>
    typeof a === "string" && !a.startsWith("-") && a !== "." && !selfPaths.includes(a) && !selfPaths.includes(resolve(a)) && existsSync(a));
}

/** 打开一个路径：目录就当目录开，文件就开它的父目录并选中它。
 *  ⚠️ **父目录不会被写进任何东西**（M14-4 B3）—— 这是 Q59 那一档成立的前提。
 *  B3 之前这条路会在用户的下载文件夹里部署 780 KB，所以当时它不能做。 */
function openPath(p, win) {
  if (!p) return;
  let st = null;
  try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) sendHost({ type: "open-dir", dir: p }, win);
  else sendHost({ type: "open-file", dir: dirname(p), rel: basename(p) }, win);
}

/** 在一个**新窗口**里打开这些路径（M14-5 下半，场景 ①②）。
 *  ⚠️ 新窗口先开出来、事件进它自己的待发队列，等它 `did-finish-load` 再放 ——
 *  直接 `send` 的话页面还没挂上监听，事件**静默丢掉**（原来那个全局 `pending`
 *  就是为这件事存在的，多窗口下它必须按窗口分）。 */
async function openPathsInNewWindow(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter((x) => typeof x === "string" && x);
  if (!list.length || !hub) return false;
  /* ⚠️ **一个路径一个窗口**，不是「这些路径一个窗口」。
     前端是单项目模型（一个窗口一个项目，并存那一档是 M15-1），
     所以往同一个窗口连发三个 `open-dir` 的结果是**只有最后一个留下**，
     而界面上看起来像「拖了三个，只开了一个」—— 又一条静默丢东西。 */
  for (const p of list) {
    const w = await createMainWindow();
    openPath(p, w);
  }
  return true;
}

/** 核心还没起来时先攒着，起来之后一次性放出去。 */
function takePath(p) {
  if (core && wins.size) openPath(p); else queued.push(p);
}

/* **顶层注册**，不在 whenReady 里 —— 理由见上面那段⚠️ */
app.on("open-file", (e, p) => { e.preventDefault(); takePath(p); });

/** 哪些窗口的页面**已经挂上了 `onEvent` 监听**（渲染侧经 `host:ready` 报的）。
 *
 *  ⚠️⚠️ **原来这里判的是 `webContents.isLoadingMainFrame() === false`，而那是错的判准。**
 *  `loadURL` 的 promise resolve 只说明**加载完了**，不说明页面脚本已经
 *  `ipcRenderer.on("host:event", …)` 过 —— React 的 `useEffect` 还在后面。
 *  于是「开一个新窗口并让它打开某个目录」这条路上事件**静默丢掉**，
 *  新窗口停在首页，而主进程这边一切正常。
 *  2026-10-22 `shelltest` 当场量到：新窗口的读数是「(没有目录列)」。
 *  ⚠️ 更坏的是它**时序敏感** —— 冷启动那条路（中间还开了一个体检窗口，多了几十毫秒）
 *  一直是好的，所以这个缺陷只在「新开窗口」这条新路上现形。
 *  > **「窗口加载完了」是主进程的事实，「页面在听了」只有渲染侧知道。**
 *  > 用前者替后者，就是一个按时序碰运气的实现。
 *
 *  现在改成渲染侧报到：`preload.cjs` 的 `onEvent` 挂完监听就 `send("host:ready")`。 */
const readyWins = new WeakSet();

function drain(w) {
  const q = pendingOf.get(w);
  if (!q) return;
  while (q.length) w.webContents.send("host:event", q.shift());
}

function sendHost(ev, prefer) {
  const w = targetWin(prefer);
  if (!w) { (pendingOf.get(prefer) ?? []).push(ev); return; }
  if (readyWins.has(w) && !w.webContents.isLoadingMainFrame()) { w.webContents.send("host:event", ev); return; }
  let q = pendingOf.get(w);
  if (!q) pendingOf.set(w, (q = []));
  q.push(ev);
}

async function loadCore() {
  const mod = async (f) => import(pathToFileURL(join(CORE_DIST, f)).href);
  const serve = await mod("serve.js"); const project = await mod("project.js"); const workspace = await mod("workspace.js");
  core = { ...serve, ...project, ...workspace };
}

function cdpPortFromDevTools() {
  // Chromium 把它挑的端口写在 userData/DevToolsActivePort 第一行
  try { return Number(readFileSync(join(app.getPath("userData"), "DevToolsActivePort"), "utf8").split("\n")[0]) || null; } catch { return null; }
}

async function createCheckWindow() {
  checkWin = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { backgroundThrottling: false } });
  await checkWin.loadURL("about:blank#umbrastudio-check");   // 标记：核心 render.ts 按它找体检页（CDP_PAGE_MARK）
  const port = cdpPortFromDevTools();
  if (port) process.env.UMBRASTUDIO_CDP = `http://127.0.0.1:${port}`;
  return port;
}

async function recentSubmenu() {
  const list = core ? (await core.listRecentProjects()).recents.filter((r) => r.exists).slice(0, 10) : [];
  if (!list.length) return [{ label: "（还没有）", enabled: false }];
  return list.map((r) => ({ label: `${r.name}  ${r.dir}`, click: () => sendHost({ type: "open-dir", dir: r.dir }) }));
}
async function buildMenu() {
  const isMac = process.platform === "darwin";
  const tpl = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "文件", submenu: [
      { label: "打开目录…", accelerator: "CmdOrCtrl+O", click: async () => { const dir = await pickDirectory({ title: "打开目录" }); if (dir) sendHost({ type: "open-dir", dir }); } },
      { label: "最近打开", submenu: await recentSubmenu() },
      { type: "separator" },
      { label: "回到项目列表", accelerator: "CmdOrCtrl+Shift+H", click: () => sendHost({ type: "go-home" }) },
      ...(isMac ? [] : [{ type: "separator" }, { role: "quit", label: "退出" }]),
    ] },
    { label: "编辑", role: "editMenu" },
    { label: "视图", submenu: [{ role: "reload", label: "重新加载" }, { role: "toggleDevTools", label: "开发者工具" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "窗口", role: "windowMenu" },
    { label: "帮助", submenu: [{ label: "在浏览器里打开当前页", click: () => { const w = targetWin(null); if (w) void safeExternal(w.webContents.getURL()); } }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/** 外开走一道协议闸（issue #131，判据在 `urlguard.mjs`）：
 *  setWindowOpenHandler、`host:openExternal`、菜单「在浏览器里打开」全经这里。 */
function safeExternal(url) {
  if (!externalAllowed(url)) { console.warn(`[shell] 拒绝外开（协议不在白名单）：${String(url).slice(0, 120)}`); return Promise.resolve(); }
  return shell.openExternal(String(url));
}
/** 这个 frame 当前是不是 hub 源（令牌只给 hub 源，issue #131）。 */
function isHubOrigin(url) { return !!hub && sameOrigin(url, hub.url); }

/** ⚠️ `owner` 是**发起这次选择的那个窗口**，不是「第一个窗口」——
 *  挂错了的话第二个窗口点「选择目录」，对话框贴在第一个窗口上（macOS 上是一张
 *  垂下来的 sheet），看上去像是点错了窗口。 */
async function pickDirectory(opts = {}, owner = null) {
  const r = await dialog.showOpenDialog(targetWin(owner) ?? undefined, { title: opts.title ?? "选择目录", properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
}

function wireIpc() {
  /* ⚠️ **只回给主窗口的主 frame**（issue #39）。
     `sendSync` 是同步 IPC，任何能拿到 `ipcRenderer` 的地方都能发 ——
     而插件跑在 iframe 里（`nodeIntegrationInSubFrames` 默认 false，子 frame 没有
     preload，所以今天拿不到 `ipcRenderer`）。这一道闸是**按不变量写的，不是按
     今天的配置写的**：哪天子 frame 有了 preload，这里不用跟着改。 */
  ipcMain.on("host:boot", (e) => {
    /* ⚠️ 再核一条**来源**（issue #131）：只按 frame 身份判的话，主窗口被稿里的
       `top.location = "http://外部"` 导走以后，外部页跑在同一个主 frame 里、preload 照常执行，
       令牌就交给它了。不变量是「令牌只给 hub 源」。 */
    /* ⚠️ 判准从「是不是**那一个**主窗口」换成「是不是**我们自己的某个**工作窗口」——
       不变量没变（主 frame + hub 源 + 是我们开的窗口），变的只是窗口不止一个。 */
    const okSender = !!winOf(e.sender) && e.senderFrame === e.sender.mainFrame
      && isHubOrigin(e.senderFrame?.url);
    e.returnValue = okSender ? bootData() : null;
  });
  /* 渲染侧挂好 `host:event` 监听了（见 `preload.cjs`）。
     ⚠️ **只认我们自己的窗口**，和 `host:boot` 同一道判准。 */
  ipcMain.on("host:ready", (e) => {
    const w = winOf(e.sender);
    if (!w) return;
    readyWins.add(w);
    drain(w);
  });
  ipcMain.handle("host:pickDirectory", (e, opts) => pickDirectory(opts, winOf(e.sender)));
  ipcMain.handle("host:revealInFinder", (_e, p) => { shell.showItemInFolder(p); });
  ipcMain.handle("host:openExternal", (_e, url) => safeExternal(url));   // 协议闸收口在这里（#131；OIDC 登录地址也走这条）
  ipcMain.handle("host:notify", (_e, n) => { if (Notification.isSupported()) new Notification({ title: n?.title ?? app.getName(), body: n?.body ?? "" }).show(); });
  /* 窗口标题**只写项目名**（M8-16，用户实测第 1 条）。
     拼上应用名是 VS Code 那类的惯例，但这里已经有两处在报应用名了：
     macOS 的菜单栏、Dock 的悬停提示。标题栏再写一次，用户看到的就是
     「项目名 + Umbra Studio」黏成一长串，反而认不出哪个是项目。 */
  ipcMain.handle("host:setTitle", (e, t) => { const w = winOf(e.sender); if (w) w.setTitle(t || app.getName()); });
  /* 在新窗口里打开拖进来的东西（M14-5 下半，场景 ①②）。
     ⚠️ **只接我们自己窗口发来的** —— 和 `host:boot` 同一道判准。 */
  ipcMain.handle("host:openWindow", async (e, paths) => {
    if (!winOf(e.sender)) return false;
    return openPathsInNewWindow(paths);
  });
}

/** 交给 preload 的启动数据。和 `serve.ts` 注进 `window.__UD_APP` 的那一份同形 ——
 *  **同形很重要**：前端只认一个形状，两边长得不一样的话会变成「壳里能用、浏览器里不能用」
 *  这种最难查的差异。 */
function bootData() {
  return {
    url: hub.url, token: hub.token,
    name: null, title: null, dir: null,
    ws: `ws://127.0.0.1:${hub.port}/__ud/ws`,
    hub: true,
  };
}

/** 开一个工作窗口。**返回它** —— 调用方（新窗口那条路）要往它发事件。
 *  ⚠️ 原来这个函数把结果写进 `mainWin` 单例；现在它只认一个局部变量，
 *  **让「忘了用返回值」变成一个显式的错**，而不是悄悄作用在别的窗口上。 */
async function createMainWindow() {
  /* 新窗口错开一点位置，不要严丝合缝叠在上一个上面（看着像没开成） */
  const front = targetWin(null);
  const off = front ? front.getBounds() : null;
  const win = new BrowserWindow({
    ...(off ? { x: off.x + 28, y: off.y + 28 } : {}),
    width: 1440, height: 900, minWidth: 900, minHeight: 600, title: app.getName(), show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#13151a" : "#f6f7f9",
    webPreferences: {
      preload: join(HERE, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false,
      /* ⚠️ **令牌经 preload 的 IPC 进去，不经 HTTP、也不经命令行**
         （`11` Q42 的 (a)；issue #30 定方向、issue #39 修掉第一版的新口子）。

         第一版用的是 `additionalArguments: ["--ud-boot=<base64>"]`，
         而那段注释写着「那是这个窗口自己的进程，不是全局可见的东西」——
         **这个前提是错的**。`additionalArguments` 的定义就是「appended to
         `process.argv` in the renderer process」，而渲染进程是 Chromium 起的
         **独立 OS 进程**，附加参数就是它的命令行开关；macOS 上进程命令行
         对本机任何进程公开可读。

         2026-10-02 在跑着的桌面版上实测确证：
         `ps -axww -o args=` 一行就拿到完整 boot JSON（含 32 位 token）——
         **比 issue #30 还隐蔽：不用扫端口、不发任何 HTTP 请求。**

         所以改成 preload 在顶层 `sendSync` 问一次（见 `preload.cjs`）：
         令牌只在两个进程之间走一次 IPC，**不落在 argv、也不落在任何响应里**。 */
    },
  });
  wins.add(win);
  lastFocused = win;
  win.on("focus", () => { lastFocused = win; });
  win.once("ready-to-show", () => win.show());
  /* ⚠️ **换页 / 刷新要把「在听」撤回**：新的页面脚本还没跑，旧的监听已经没了。
     不撤的话刷新那一瞬间发出去的事件又会丢 —— 和上面那条是同一个病。 */
  win.webContents.on("did-start-navigation", (_e, _u, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) readyWins.delete(win);
  });
  win.webContents.on("did-finish-load", () => { void buildMenu(); });
  win.webContents.setWindowOpenHandler(({ url }) => { void safeExternal(url); return { action: "deny" }; });
  /* ⚠️ **主窗口不许被导出 hub 源**（issue #131）。演示态 iframe、或稿里一句 `top.location=…`
     能把主 frame 换成外部页；换过去之后 preload 照样跑。离开 hub 源的导航一律取消，
     http(s) 的交给系统浏览器（经同一道协议闸），别的丢掉。
     `will-navigate` 在 Electron 25+ 只对主 frame 触发 —— 稿件 iframe 走项目服务（别的端口），不受影响。 */
  win.webContents.on("will-navigate", (e, url) => {
    if (isHubOrigin(url)) return;
    e.preventDefault();
    void safeExternal(url);
  });
  /* 地址里**不带 token** —— 壳靠 preload 的 `sendSync("host:boot")` 拿（issue #39）。
     带在地址里的话它会进历史记录、也会被 `webContents.getURL()` 之类读到。 */
  await win.loadURL(hub.url + "__app/home");
  /* ⚠️ **有未落盘时关窗 / ⌘Q / 重新加载都要问一句**（issue #44，2026-10-02）。
     前端在有 dirty 时对 `beforeunload` 调 `preventDefault()` ——
     **浏览器**会弹自带的「离开此网站？」，而 **Electron 不弹**：
     它直接取消关窗，界面上**什么都不显示**，除非主进程听这个事件。

     2026-10-02 用最小 Electron 实验做了对照（不经 Playwright ——
     Playwright 会自动 dismiss 对话框，**它会改变被观测的行为**）：

     | 听不听 | close() 之后 |
     | --- | --- |
     | 不听（改之前） | 窗口数 1 → 1，**关不掉，界面上什么都没显示** |
     | 听（现在） | 事件触发 → 放行 → 关掉 |

     用户只会觉得「程序关不掉了」，而他唯一的出路是强制退出 ——
     **强制退出恰好会丢掉那些改动，也就是这道闸本来要防的那件事。**

     ⚠️ 为什么用系统对话框而不是我们自己那张确认卡（`LeaveGuard`）：
     `will-prevent-unload` 是**同步**事件，等不了异步的前端应答。
     而关窗这件事发生在页面之外，前端根本画不到那里。
     文案和 `LeaveGuard` 对齐（「回去接着改」），**按钮顺序和它一致**。

     ⚠️ `preventDefault()` 的语义是**反直觉的**：它表示「忽略 beforeunload」
     = **放行关闭**。写反了就是「选了离开反而关不掉」。 */
  win.webContents.on("will-prevent-unload", (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["回去接着改", "不要了，离开"],
      defaultId: 0, cancelId: 0,
      message: "有文件还没落盘",
      detail: "离开以后这些改动不会留。",
    });
    if (choice === 1) { e.preventDefault(); return; }   // 放行（见上面那条⚠️）
    /* ⚠️ 留下来的话要把 `before-quit` 写的 `cleanExit: true` **撤回**。
       ⌘Q 时 `before-quit` 先跑、已经写了 true，而退出被这里取消了 ——
       程序还在跑而 session 说「上次是正常退出的」。
       之后真被强杀，下次启动看到 true，**那条「上次没正常退出」的提示就不出了**。 */
    writeSession({ cleanExit: false, at: new Date().toISOString() });
  });
  win.on("closed", () => { wins.delete(win); if (lastFocused === win) lastFocused = targetWin(null); });
  return win;
}

app.on("second-instance", (_e, argv) => {
  const w = targetWin(null);
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  /* ⚠️ **argv 要接住**（`doc/24` §六①）：Windows 上「应用已经开着时右键 › 用它打开」
     走的就是这条路 —— 原来这个回调把 argv 整个扔了，于是那一下**什么都不会发生**。 */
  for (const p of pathsFromArgv(argv)) takePath(p);
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!wins.size && hub) void createMainWindow(); });
/* ⚠️ `--mcp` 不写（issue #191）：「上次没正常退出」是**窗口模式**的概念，
   而 MCP 进程的生命周期由客户端决定（断开 stdio 就该走） ——
   让它去写这个标记，等于让它替用户的那个窗口说话。 */
app.on("before-quit", () => { if (!IS_MCP) writeSession({ cleanExit: true, at: new Date().toISOString() }); });

app.whenReady().then(async () => {
  const prev = IS_MCP ? null : readSession();
  if (!IS_MCP) writeSession({ cleanExit: false, at: new Date().toISOString() });
  await loadCore();
  hub = await core.hubStart();
  wireIpc();
  await createMainWindow();            // 主窗口先出来，体检用的隐藏窗口随后开（它只是 CDP 的宿主）
  const cdp = await createCheckWindow();
  process.stderr.write(`[shell] hub ${hub.url} · cdp ${cdp ?? "(none)"} · core ${CORE_ROOT}\n`);
  if (IS_MCP) {
    // 把 stdio 交给 MCP：核心的 index.js 在 import 时就接上 StdioServerTransport（doc/00 §五十）
    await import(pathToFileURL(join(CORE_DIST, "index.js")).href);
  }
  if (prev && prev.cleanExit === false) sendHost({ type: "dirty-restart", at: prev.at ?? null });
  /* 冷启动：命令行里带的路径（`open -a "Umbra Studio" <路径>` / `Umbra\ Studio <路径>`），
     以及 ready 之前 `open-file` 攒下的那些。**两条一起放，顺序不重要** —— 第一期换当前窗口（Q61）。 */
  for (const p of pathsFromArgv(process.argv)) queued.push(p);
  while (queued.length) openPath(queued.shift());
  if (process.env.UMBRASTUDIO_AUTOTEST_LOG) {
    // 壳内自测：把关键读数写一行，Playwright _electron 之外的最低限度证据
    try { writeFileSync(process.env.UMBRASTUDIO_AUTOTEST_LOG, JSON.stringify({ hub: hub.url, cdp, coreRoot: CORE_ROOT, packaged: app.isPackaged, electron: process.versions.electron }) + "\n", { flag: "a" }); } catch { /* ignore */ }
  }
});
