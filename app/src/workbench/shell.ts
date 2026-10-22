import { inActive } from "./scope";   // 并存：只找当前那个工作台（M15-1 S2）
/** 应用 → 嵌入的 S2 壳的指令通道（S2 再转给内层 iframe 里的点选桥）。壳的 iframe 带 data-shell。 */
export function shellCmd(cmd: string, value?: unknown): void {
  /* ⚠️ **只找当前那个工作台里的壳**（M15-1 S2）：并存之后 DOM 里有 N 个
     `iframe[data-shell="1"]`，全局查会拿到文档顺序第一个 ——
     于是换主题 / 切预设 / 点选这些指令会发给**另一个项目**的预览壳。 */
  const f = inActive<HTMLIFrameElement>('iframe[data-shell="1"]');
  f?.contentWindow?.postMessage({ source: "umbradesign-app", type: "cmd", cmd, value }, "*");
}
