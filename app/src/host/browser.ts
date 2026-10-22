import { studioName } from "@shared/brand";
import type { HostAdapter, HostCapability } from "./types";

/** 浏览器宿主：能做的走本地 API，做不了的说清原因（doc/12 M7-3「不可用的按钮说明原因」） */
export function createBrowserHost(api: { post: (route: string, body: unknown) => Promise<{ ok: boolean; errors?: { message: string }[] }> }): HostAdapter {
  const NO_DIALOG: HostCapability = { ok: false, why: "浏览器里没有目录选择框：把目录路径粘进输入框即可" };
  return {
    kind: "browser",
    async pickDirectory() { return null; },
    async revealInFinder(path) {
      const r = await api.post("reveal_dir", { dir: path });
      if (!r.ok) throw new Error(r.errors?.[0]?.message ?? "打不开目录");
    },
    async openExternal(url) { window.open(url, "_blank", "noopener"); },
    async notify(n) {
      try {
        if ("Notification" in window && Notification.permission === "granted") { new Notification(n.title, { body: n.body }); return; }
      } catch { /* 无权限就落到页面内提示 */ }
      window.dispatchEvent(new CustomEvent("ud-toast", { detail: n }));
    },
    setTitle(title) { document.title = title ? `${title} · ${studioName}` : studioName; },
    /* ⚠️ **回空数组而不是抛**：拖拽这条路在浏览器里是「拿不到路径」，
       不是「出错了」。调用方按 `capabilities().dropPaths` 决定说什么话。 */
    pathsForDrop() { return []; },
    async openInNewWindow() { return false; },
    capabilities() {
      return {
        pickDirectory: NO_DIALOG,
        /* ⚠️ 说明要说准（issue #110）：mac 是 `open -R`、win 是 `explorer /select,`、
           linux 没有通用的 reveal，**打开它所在的目录**。
           原来这句写的是「执行 open / explorer / xdg-open」—— 没说那对文件意味着
           「用默认程序打开」，而那正是那条 bug（zip 会被直接解压）。
           **一句不够准的说明，会让下一个人以为这条路和桌面壳是一回事。** */
        revealInFinder: { ok: true, why: "由核心在本机定位（mac `open -R` · win `explorer /select,` · linux 打开所在目录）" },
        openExternal: { ok: true },
        notify: { ok: "Notification" in window, why: "浏览器通知要先授权；没授权就显示在页面里" },
        setTitle: { ok: true },
        /* ⚠️ 这句话要说清**为什么**，不是「不支持」—— 用户拖了一下没反应，
           他需要知道的是「浏览器里拿不到文件在磁盘上的位置」这件事实。 */
        /* ⚠️ 两处按设计侧第 59 封 §7 改了：
           ① 「不是我们没做」**是在辩解** —— 用户不关心是谁的问题，他要的是出路；
           ② 「**上面的**「打开目录」」是按位置指路，**布局一变它就错** ——
              而布局是设计侧会动的东西。
           > **一句提示里的「上面」「右边」，是一个会被别人改掉的事实。** */
        dropPaths: { ok: false, why: "浏览器不会告诉网页文件存在磁盘的什么位置。用桌面版，或者用「打开目录」去选。" },
        newWindow: { ok: false, why: "浏览器里由你自己开标签页" },
      };
    },
  };
}
