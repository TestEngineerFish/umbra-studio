/* 桌面宿主（Electron）的能力桥：把 host adapter 的 desktop 实现挂到 window.umbraHost。
   前端只认这个对象（app/src/host/index.ts），别处不许出现 Electron API。 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

/* ⚠️ **启动数据（含访问令牌）走一次同步 IPC 取，不从 HTTP 响应进、也不从命令行进**
   （`11` Q42 / issue #30 / issue #39）。

   第一版是 `process.argv` 里找 `--ud-boot=<base64>`，而主进程那边用的
   `additionalArguments` **会把它写进渲染进程的命令行** ——
   渲染进程是独立的 OS 进程，命令行对本机任何进程公开可读。
   2026-10-02 实测：`ps -axww -o args=` 一行就拿到含 token 的完整 JSON。

   `sendSync` 在 preload 顶层执行，**页面脚本跑之前就挂好了**，所以前端不用改。
   同步 IPC 一般要避开（它阻塞渲染进程），但这里只有启动时一次、主进程那边是
   纯内存读，而「页面第一行脚本就能拿到令牌」这个时序是前端依赖的。

   ⚠️ 用 `exposeInMainWorld` 而不是 `window.__UD_APP = …`：
   preload 跑在隔离世界里，直接赋值页面是看不见的（contextIsolation: true）。 */
{
  try {
    const boot = ipcRenderer.sendSync("host:boot");
    /* 拿不到就**当没有**，不要挂一个空对象 —— 前端是按「有没有 `__UD_APP`」
       分路的，空对象会让它以为拿到了令牌，然后每个请求都 401。 */
    if (boot && typeof boot === "object") contextBridge.exposeInMainWorld("__UD_APP", boot);
  } catch { /* 主进程没登记这条（旧版壳）就当没有 —— 前端会说「拿不到访问令牌」 */ }
}
contextBridge.exposeInMainWorld("umbraHost", {
  kind: "desktop",
  pickDirectory: (opts) => ipcRenderer.invoke("host:pickDirectory", opts ?? {}),
  revealInFinder: (path) => ipcRenderer.invoke("host:revealInFinder", path),
  openExternal: (url) => ipcRenderer.invoke("host:openExternal", url),
  notify: (n) => ipcRenderer.invoke("host:notify", n),
  setTitle: (title) => { void ipcRenderer.invoke("host:setTitle", title); },
  /* ⚠️⚠️ **拖进来的 File 怎么变成磁盘路径：这里有一个版本陷阱**（`doc/24` §4.4）。
     老教程写的是 `e.dataTransfer.files[0].path` —— 而 **Electron 32 起 `File.path`
     被移除了**，本机实测 Electron 44.4.5 上它是 `undefined`。
     正确的是 `webUtils.getPathForFile(file)`，而我们 `contextIsolation: true`，
     所以必须**在 preload 里包一层**：`webUtils` 在渲染进程的页面世界里拿不到。
     ⚠️ 这个陷阱的症状最容易误诊成「拖拽没接上」——
     事件收到了、`files.length` 是 1，只有路径是 `undefined`。 */
  pathsForDrop: (files) => {
    const out = [];
    for (const f of files ?? []) {
      try { const p = webUtils.getPathForFile(f); if (p) out.push(p); } catch { /* 拿不到就跳过 */ }
    }
    return out;
  },
  /** 在一个新窗口里打开这些路径（M14-5 下半，场景 ①②）。回「开没开成」。 */
  openInNewWindow: (paths) => ipcRenderer.invoke("host:openWindow", paths ?? []),
  capabilities: () => ({
    pickDirectory: { ok: true }, revealInFinder: { ok: true }, openExternal: { ok: true },
    notify: { ok: true, why: "系统通知" }, setTitle: { ok: true },
    dropPaths: { ok: true }, newWindow: { ok: true },
  }),
  onEvent: (cb) => {
    const h = (_e, ev) => cb(ev);
    ipcRenderer.on("host:event", h);
    /* ⚠️ **挂好了要报一声**（M14-5 下半，2026-10-22）。
       主进程原来按「窗口加载完了」决定能不能直接发事件，而那两件事不是一回事：
       `loadURL` resolve 的时候这一行还没跑。于是「开一个新窗口并让它打开某个目录」
       这条路上事件**静默丢掉** —— 新窗口停在首页，而主进程一切正常。
       **只有这一行知道「页面在听了」。** */
    ipcRenderer.send("host:ready");
    return () => ipcRenderer.removeListener("host:event", h);
  },
});
