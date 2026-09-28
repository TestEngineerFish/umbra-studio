/* 桌面宿主（Electron）的能力桥：把 host adapter 的 desktop 实现挂到 window.umbraHost。
   前端只认这个对象（app/src/host/index.ts），别处不许出现 Electron API。 */
const { contextBridge, ipcRenderer } = require("electron");

/* ⚠️ **启动数据（含访问令牌）从这里进，不从 HTTP 响应进**（`11` Q42 / issue #30）。
   主进程用 `additionalArguments` 把它交给这个窗口的 preload，
   所以令牌从不出现在任何 HTTP 响应里 —— 本机别的进程扫端口也拿不到。
   ⚠️ 用 `exposeInMainWorld` 而不是 `window.__UD_APP = …`：
   preload 跑在隔离世界里，直接赋值页面是看不见的（contextIsolation: true）。 */
{
  const arg = process.argv.find((a) => a.startsWith("--ud-boot="));
  if (arg) {
    try {
      contextBridge.exposeInMainWorld("__UD_APP", JSON.parse(Buffer.from(arg.slice("--ud-boot=".length), "base64").toString("utf8")));
    } catch { /* 解不出来就当没有 —— 前端会显示「拿不到访问令牌」并说怎么办 */ }
  }
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
