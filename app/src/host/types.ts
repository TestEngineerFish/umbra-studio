/** host adapter（doc/01 §4.9 H7、doc/12 M7-3）：前端里所有「宿主能力」只从这里走。
 *  两份实现：browser（降级，说清为什么不可用）与 desktop（Electron 壳，M9-2）。
 *  前端别的目录**不许**出现 Electron / Tauri 的 API —— 验收就是 grep 只命中 host/。 */
export interface HostCapability { ok: boolean; why?: string }
export interface HostAdapter {
  readonly kind: "browser" | "desktop";
  /** 弹目录选择框；浏览器里没有，返回 null 并由 capabilities.pickDirectory.why 说明 */
  pickDirectory(opts?: { title?: string }): Promise<string | null>;
  /** 在访达 / 资源管理器里显示 */
  revealInFinder(path: string): Promise<void>;
  /** 用系统浏览器打开外部链接 */
  openExternal(url: string): Promise<void>;
  /** 系统通知；浏览器里退化成页面内 toast（由调用方接 onFallback） */
  notify(n: { title: string; body?: string }): Promise<void>;
  setTitle(title: string): void;
  /** 把一组拖进来的 `File` 换成**磁盘上的绝对路径**（M14-5 下半）。
   *
   *  ⚠️ **只有壳给得出来。** 浏览器里 `File` 压根没有路径这个概念（有过的
   *  `File.path` 是 Electron 自己加的，而 **Electron 32 起也移除了** ——
   *  正确的是 preload 里 `webUtils.getPathForFile`，见 `doc/24` §4.4）。
   *  浏览器宿主回空数组，`capabilities().dropPaths.why` 说清为什么。 */
  pathsForDrop(files: File[]): string[];
  /** 在一个**新窗口**里打开这些路径。回「开没开成」。浏览器里没有窗口这回事 → false。 */
  openInNewWindow(paths: string[]): Promise<boolean>;
  capabilities(): Record<"pickDirectory" | "revealInFinder" | "openExternal" | "notify" | "setTitle" | "dropPaths" | "newWindow", HostCapability>;
  /** 壳主动发来的事：菜单「打开目录」、上次没正常退出（未落盘提示）。浏览器宿主没有这些事。 */
  onEvent?(cb: (e: HostEvent) => void): () => void;
}
export type HostEvent =
  | { type: "open-dir"; dir: string }
  /** 从「打开方式」/ 双击 / 命令行打开**一个文件**（M14-5）：
   *  以它的父目录为根打开，并选中这一份。
   *  ⚠️ 和 `open-dir` 分成两件事，不是「传一个路径让前端自己 stat」——
   *  **前端没有 fs**，判「这是文件还是目录」只有壳做得到。 */
  | { type: "open-file"; dir: string; rel: string }
  | { type: "dirty-restart"; at: string | null }
  | { type: "go-home" };
