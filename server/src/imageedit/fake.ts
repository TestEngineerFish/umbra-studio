/** 打桩适配器：**不联网，原图照回**。
 *
 *  它存在的理由只有一条：**在还没有密钥的时候，让「从一句提示到项目里多一张图」这条链路
 *  整条跑起来并且有判据**（路径三道闸 → 读字节 → 适配层 → 重名顺延 → 第二条写入口 → 快照）。
 *
 *  ⚠️⚠️ **它必须是显式选的**（`provider: "fake"`），而且 `real: false` 一路带到回执上。
 *  Q49 打桩会话通道那次定过同一件事的做法：每条回复都带「【打桩通道 · 不是真的 AI】」。
 *  > **一个看起来像 AI 而其实不是的产物，比没有产物糟** —— 而图片比文字更难看出来：
 *  > 一张原图照回的「效果图」在文件管理器里和真的长得一模一样。
 *  所以除了 `real: false`，`cap/imageedit.ts` 还会**把「假」写进文件名**。
 */
import type { ImageEditor } from "./types.js";

export const fakeEditor: ImageEditor = {
  id: "fake",
  label: "假适配器（不联网）",
  /* 它什么旋钮都「认」，因为它什么都不做 —— 但照实说，别让回执把它读成「这家支持 strength」 */
  supportsStrength: false,
  async edit(req) {
    return {
      bytes: req.bytes,
      mime: req.mime,
      note: `假适配器：没有调用任何模型，这是原图的副本。提示原样记下：「${req.prompt.slice(0, 60)}」`
        + (req.strength !== undefined ? `（strength=${req.strength} 没用上）` : ""),
      real: false,
    };
  },
};
