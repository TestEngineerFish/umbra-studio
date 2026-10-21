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

app.setName("Umbra Studio");
/* 可写状态（ai_config / workspace / projects / .archived）不能落在 .app 里：
   ad-hoc 签名的 app 内容一被改动，下次启动就被 macOS 判「已损坏」（M9-4 实测的第一条缺陷）。
   核心读 UMBRASTUDIO_STATE_DIR，没设时退回自己的根 —— 开发模式什么都不变。
   注意 setName 要在前面：getPath("userData") 用 app 名做目录名。 */
if (app.isPackaged && !process.env.UMBRASTUDIO_STATE_DIR) process.env.UMBRASTUDIO_STATE_DIR = app.getPath("userData");
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.commandLine.appendSwitch("remote-debugging-port", "0");
for (const f of ["disable-background-networking", "disable-component-update", "disable-sync", "no-first-run", "no-pings"]) app.commandLine.appendSwitch(f);

/** 未落盘提示的依据：启动写 session.json { cleanExit:false }，正常退出改 true；下次启动看到 false 就是被强杀过 */
const sessionFile = () => join(app.getPath("userData"), "session.json");
function readSession() { try { return JSON.parse(readFileSync(sessionFile(), "utf8")); } catch { return null; } }
function writeSession(v) { try { mkdirSync(dirname(sessionFile()), { recursive: true }); writeFileSync(sessionFile(), JSON.stringify(v)); } catch { /* 只读盘就算了 */ } }

let core = null;      // { hubStart, serveStart, buildProject, listRecentProjects, touchProject }
let hub = null;       // { url, port, token }
let mainWin = null;
let checkWin = null;
const pending = [];   // 主窗口还没 ready 时攒下来的宿主事件

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
function openPath(p) {
  if (!p) return;
  let st = null;
  try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) sendHost({ type: "open-dir", dir: p });
  else sendHost({ type: "open-file", dir: dirname(p), rel: basename(p) });
}

/** 核心还没起来时先攒着，起来之后一次性放出去。 */
function takePath(p) {
  if (core && mainWin) openPath(p); else queued.push(p);
}

/* **顶层注册**，不在 whenReady 里 —— 理由见上面那段⚠️ */
app.on("open-file", (e, p) => { e.preventDefault(); takePath(p); });

function sendHost(ev) { if (mainWin && !mainWin.isDestroyed() && mainWin.webContents.isLoadingMainFrame() === false) mainWin.webContents.send("host:event", ev); else pending.push(ev); }

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
    { label: "帮助", submenu: [{ label: "在浏览器里打开当前页", click: () => { if (mainWin) void safeExternal(mainWin.webContents.getURL()); } }] },
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

async function pickDirectory(opts = {}) {
  const r = await dialog.showOpenDialog(mainWin ?? undefined, { title: opts.title ?? "选择目录", properties: ["openDirectory", "createDirectory"] });
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
    const okSender = !!mainWin && e.sender === mainWin.webContents && e.senderFrame === e.sender.mainFrame
      && isHubOrigin(e.senderFrame?.url);
    e.returnValue = okSender ? bootData() : null;
  });
  ipcMain.handle("host:pickDirectory", (_e, opts) => pickDirectory(opts));
  ipcMain.handle("host:revealInFinder", (_e, p) => { shell.showItemInFolder(p); });
  ipcMain.handle("host:openExternal", (_e, url) => safeExternal(url));   // 协议闸收口在这里（#131；OIDC 登录地址也走这条）
  ipcMain.handle("host:notify", (_e, n) => { if (Notification.isSupported()) new Notification({ title: n?.title ?? "Umbra Studio", body: n?.body ?? "" }).show(); });
  /* 窗口标题**只写项目名**（M8-16，用户实测第 1 条）。
     拼上应用名是 VS Code 那类的惯例，但这里已经有两处在报应用名了：
     macOS 的菜单栏、Dock 的悬停提示。标题栏再写一次，用户看到的就是
     「项目名 + Umbra Studio」黏成一长串，反而认不出哪个是项目。 */
  ipcMain.handle("host:setTitle", (_e, t) => { if (mainWin) mainWin.setTitle(t || "Umbra Studio"); });
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

async function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, title: "Umbra Studio", show: false,
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
  mainWin.once("ready-to-show", () => mainWin.show());
  mainWin.webContents.on("did-finish-load", () => { while (pending.length) mainWin.webContents.send("host:event", pending.shift()); void buildMenu(); });
  mainWin.webContents.setWindowOpenHandler(({ url }) => { void safeExternal(url); return { action: "deny" }; });
  /* ⚠️ **主窗口不许被导出 hub 源**（issue #131）。演示态 iframe、或稿里一句 `top.location=…`
     能把主 frame 换成外部页；换过去之后 preload 照样跑。离开 hub 源的导航一律取消，
     http(s) 的交给系统浏览器（经同一道协议闸），别的丢掉。
     `will-navigate` 在 Electron 25+ 只对主 frame 触发 —— 稿件 iframe 走项目服务（别的端口），不受影响。 */
  mainWin.webContents.on("will-navigate", (e, url) => {
    if (isHubOrigin(url)) return;
    e.preventDefault();
    void safeExternal(url);
  });
  /* 地址里**不带 token** —— 壳靠 preload 的 `sendSync("host:boot")` 拿（issue #39）。
     带在地址里的话它会进历史记录、也会被 `webContents.getURL()` 之类读到。 */
  await mainWin.loadURL(hub.url + "__app/home");
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
  mainWin.webContents.on("will-prevent-unload", (e) => {
    const choice = dialog.showMessageBoxSync(mainWin, {
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
  mainWin.on("closed", () => { mainWin = null; });
}

app.on("second-instance", (_e, argv) => {
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  /* ⚠️ **argv 要接住**（`doc/24` §六①）：Windows 上「应用已经开着时右键 › 用它打开」
     走的就是这条路 —— 原来这个回调把 argv 整个扔了，于是那一下**什么都不会发生**。 */
  for (const p of pathsFromArgv(argv)) takePath(p);
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!mainWin && hub) void createMainWindow(); });
app.on("before-quit", () => { writeSession({ cleanExit: true, at: new Date().toISOString() }); });

app.whenReady().then(async () => {
  const prev = readSession();
  writeSession({ cleanExit: false, at: new Date().toISOString() });
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
