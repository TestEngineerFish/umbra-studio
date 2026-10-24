/** 找这台机器上的浏览器可执行文件。
 *
 *  ⚠️⚠️ **2026-10-23（M16-7c-2a）从 `render.ts` 搬出来的，而搬它的理由值得记。**
 *  `render.ts`（`render_check` 真实渲染体检）整个随 C3 删掉了 —— 而这一件
 *  **和设计稿一点关系都没有**：它回答的是「这台机器上有没有 Chromium」，
 *  而问这件事的还有 `app/actxtest.mjs`（没浏览器就整块跳过判据）。
 *
 *  > **删一个模块之前，要先问「它里面有没有别人也在用的东西」。**
 *  > 这一轮撞到两次（另一次是 `isToolPage`），而两次的形状一样：
 *  > 一个以 dc 命名的模块里混着几件通用能力 —— 因为当初它们只有一个调用者，
 *  > 而那个调用者恰好是 dc。编译错误会把它们指出来，
 *  > **但如果图快、把报错的那一节判据整节删掉，就会连带删掉通用能力，
 *  > 而那种损失编译器不会再提醒第二次。** */
import { accessSync, constants, statSync } from "node:fs";

/** 是不是一个能执行的**文件**。只判 existsSync 会把 /opt/pw-browsers/chromium
 *  这种同名目录也当成命中，launch 时才炸 —— 验证时实际踩到过。 */
function isExecutableFile(p: string): boolean {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch { return false; }
}

/** 浏览器可执行文件：环境变量 → 常见路径。找不到返回 null（**不猜、不下载**）。
 *  ⚠️ **为判据开的接缝** —— 生产侧零调用，只有回归在用（2026-10-24 量过）。
 */
export function findBrowser(): { path: string; from: string } | null {
  const envPath = process.env.UMBRASTUDIO_CHROMIUM;
  if (envPath && isExecutableFile(envPath)) return { path: envPath, from: "UMBRASTUDIO_CHROMIUM" };
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome",
    "/opt/pw-browsers/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const c of candidates) if (isExecutableFile(c)) return { path: c, from: "常见路径" };
  return null;
}
