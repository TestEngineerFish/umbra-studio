/** 格式转换：拼出 Studio 这边的引擎（格式转换二期 · Studio 宿主能力 `file.convert`，2026-10-18）。
 *
 *  参照 UmbraPC `electron/core/convert/index.ts`（2026-10-18 a72ac3a），**这一份不是副本**，三处不同：
 *
 *  | 不同 | 为什么 |
 *  | --- | --- |
 *  | **不带 builtin 转换器**（html → pdf / md → html / png ↔ jpg） | 它靠 Electron 的 `BrowserWindow.printToPDF` 与 `nativeImage`。Studio 的核心**不一定**跑在 Electron 主进程里：壳里是 import 进主进程的，但 `npm run ui`、外部客户端起的 MCP（`node server/dist/index.js`）、通道 B 给本地 CLI 起的 MCP 都是**裸 Node** —— 同一件能力在一个门面能转、换个门面就说「转不了」，比都不带更难解释。要带也得照 PC `print.ts` 的四条安全约束重做一遍（不跑脚本 · 只许同目录本地资源 · 网络全拦 · 导航不转交浏览器），这一期不做 |
 *  | LibreOffice 配置目录放 `STATE_ROOT/.umbrastudio/convert/` | 可写状态一律看 `STATE_ROOT`（`CLAUDE.md` §4：打包后 `TOOL_ROOT` 在 `.app` 里，只读） |
 *  | 引擎可以换（`setConvertEngine`） | `converttest` 用假的转换器测宿主那一层，不能真去调 sips / ffmpeg |
 *
 *  不带 builtin 的后果要照实说：Mac 上没装 LibreOffice 时 **docx / md / html → pdf 转不了**
 *  （PC 那边是 textutil → html → Electron 打印），`list_convert_targets` 会把 pdf 列成「没装 LibreOffice」。
 *
 *  ⚠️ **插件碰不到这里**：插件只能经 `plugin/host.ts` 的白名单调 `file.convert`，参数只有路径 / 目标格式 / 质量，
 *  命令行、工具路径、输出位置全在宿主这边定（`doc/20` P1 / `11` Q40：插件不许起子进程）。
 */
import { join } from "node:path";
import { STATE_ROOT } from "../project.js";
import { ConvertEngine } from "./engine.js";
import { ToolBox } from "./tools.js";
import { afconvertConverter, avconvertConverter, sipsConverter, textutilConverter } from "./converters/mac.js";
import { ffmpegConverter } from "./converters/ffmpeg.js";
import { libreOfficeConverter, pandocConverter } from "./converters/office.js";
import type { Converter } from "./types.js";

/** 从 PC 拷来的文件（相对 `electron/core/convert/`）。**`converttest` 逐份和 PC 比**，
 *  加一份副本就在这里加一行 —— 漏登记的副本两边改了一边也没人知道。 */
export const COPIED_FROM_PC: readonly string[] = [
  "types.ts", "formats.ts", "route.ts", "output.ts", "proc.ts", "tools.ts", "engine.ts",
  "converters/mac.ts", "converters/ffmpeg.ts", "converters/office.ts",
];

/** 转换器的顺序 = 同代价时谁优先：系统自带的 → 用户装的高保真工具（和 PC 一致，只是少了末尾的 builtin）。 */
export function buildConverters(tools: ToolBox, loProfileDir: string): Converter[] {
  return [
    sipsConverter(tools),
    textutilConverter(tools),
    avconvertConverter(tools),
    afconvertConverter(tools),
    libreOfficeConverter(tools, loProfileDir),
    pandocConverter(tools),
    ffmpegConverter(tools),
  ];
}

let shared: ConvertEngine | null = null;
let sharedTools: ToolBox | null = null;

/** 进程里共用的那一个（插件、MCP、应用内会话都用它，闸门才是全局的 —— 两路同时转视频不会各开两个 ffmpeg）。 */
export function convertEngine(): ConvertEngine {
  if (shared) return shared;
  sharedTools = new ToolBox();
  shared = new ConvertEngine(buildConverters(sharedTools, join(STATE_ROOT, ".umbrastudio", "convert", "libreoffice-profile")));
  return shared;
}

/** 测试用：换成假的转换器。传 null 退回真的（下次 `convertEngine()` 重建）。 */
export function setConvertEngine(e: ConvertEngine | null): void {
  shared = e;
  if (!e) sharedTools = null;
}

/** 用户装完工具后「重新检测」（60 秒缓存不等了）。 */
export function forgetTools(): void {
  sharedTools?.forget();
}

export { ConvertEngine } from "./engine.js";
export type { FileResult, TargetInfo } from "./engine.js";
export { normalizeTarget, formatOfPath, formatById, FORMATS } from "./formats.js";
