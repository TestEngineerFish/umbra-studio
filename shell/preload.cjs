/* 桌面宿主（Electron）的能力桥：把 host adapter 的 desktop 实现挂到 window.umbraHost。
   前端只认这个对象（app/src/host/index.ts），别处不许出现 Electron API。 */
const { contextBridge, ipcRenderer } = require("electron");

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
  capabilities: () => ({
    pickDirectory: { ok: true }, revealInFinder: { ok: true }, openExternal: { ok: true },
    notify: { ok: true, why: "系统通知" }, setTitle: { ok: true },
  }),
  onEvent: (cb) => {
    const h = (_e, ev) => cb(ev);
    ipcRenderer.on("host:event", h);
    return () => ipcRenderer.removeListener("host:event", h);
  },
});
