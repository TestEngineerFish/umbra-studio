// 来源：UmbraPC electron/core/convert/tools.ts（2026-10-19 cb7d2cc），改动：which / enginePath / isIntelOnly 改从副本自带的 ./util.js 取（PC 分在 shared/util、providers/coding、runtime/macho）
// 格式转换：找本机的转换工具（doc/格式转换-方案调研-2026-10-18.md §三）。
//
// 三类来源：
//   - macOS 系统自带（sips / textutil / avconvert / afconvert）：路径固定在 /usr/bin，不走 PATH ——
//     PATH 上同名的东西不一定是系统那个；
//   - 用户自己装的（ffmpeg / pandoc / LibreOffice）：PATH（用 enginePath 补齐过的那份，打包后的 .app PATH 很短）
//     + 安装器的常见位置（LibreOffice 不往 PATH 放东西）；
//   - **不随包带**：体积和 GPL（§三 3.3）。
// Apple 芯片上只有 Intel 版的 ffmpeg 不用：一调就弹 Rosetta / 「Intel 应用即将不受支持」（runtime/macho.ts 同一条）。

import { accessSync, constants } from "node:fs";
import * as path from "node:path";
import { enginePath, isIntelOnly, which } from "./util.js";

export type ToolId = "sips" | "textutil" | "avconvert" | "afconvert" | "ffmpeg" | "soffice" | "pandoc";

export interface ToolHit {
  path: string | null;
  /** 找到了但不能用（Intel-only 等）时的原因；没找到时为空。 */
  rejected?: string;
  /** 找到的是只有 Intel 版的那一份（Apple 芯片上不用它，见文件头）：它在哪。 */
  intelPath?: string;
}

/** 装上它的一行命令（给结果卡上「没装 X」那一句配的）。 */
export const INSTALL_HINT: Partial<Record<ToolId, string>> = process.platform === "darwin"
  ? { ffmpeg: "brew install ffmpeg", pandoc: "brew install pandoc", soffice: "brew install --cask libreoffice" }
  : process.platform === "win32"
    ? { ffmpeg: "winget install Gyan.FFmpeg", pandoc: "winget install JohnMacFarlane.Pandoc", soffice: "winget install TheDocumentFoundation.LibreOffice" }
    : { ffmpeg: "sudo apt install ffmpeg", pandoc: "sudo apt install pandoc", soffice: "sudo apt install libreoffice" };

export const TOOL_LABEL: Record<ToolId, string> = {
  sips: "sips", textutil: "textutil", avconvert: "avconvert", afconvert: "afconvert",
  ffmpeg: "FFmpeg", soffice: "LibreOffice", pandoc: "Pandoc",
};

function executable(p: string): boolean {
  try { accessSync(p, constants.X_OK); return true; } catch { return false; }
}

const SYSTEM_TOOLS: ToolId[] = ["sips", "textutil", "avconvert", "afconvert"];

/** 这些位置之外还会去 PATH 上找（LibreOffice 的程序名 Windows 上是 soffice.exe，which 会补扩展名）。 */
function knownSpots(id: ToolId): string[] {
  if (id !== "soffice") return [];
  if (process.platform === "darwin") return ["/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  if (process.platform === "win32") {
    return [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
      .filter((x): x is string => !!x)
      .map((d) => path.join(d, "LibreOffice", "program", "soffice.exe"));
  }
  return ["/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice"];
}

export interface ToolFinderDeps {
  platform?: string;
  exists?: (p: string) => boolean;
  which?: (cmd: string) => string | null;
  intelOnly?: (p: string) => boolean;
}

/** 找一个工具。纯查找、不起进程；结果由调用方缓存。 */
export function findTool(id: ToolId, deps: ToolFinderDeps = {}): ToolHit {
  const platform = deps.platform ?? process.platform;
  const exists = deps.exists ?? executable;
  const wh = deps.which ?? ((c: string) => which(c, enginePath()));
  const intelOnly = deps.intelOnly ?? ((p: string) => isIntelOnly(p));
  if (SYSTEM_TOOLS.includes(id)) {
    if (platform !== "darwin") return { path: null };
    const p = `/usr/bin/${id}`;
    return { path: exists(p) ? p : null };
  }
  const candidates = [...knownSpots(id), wh(id)].filter((x): x is string => !!x);
  let rejected: string | undefined;
  let intelPath: string | undefined;
  for (const p of candidates) {
    if (!exists(p)) continue;
    if (intelOnly(p)) {
      rejected ??= `${TOOL_LABEL[id]} 是 Intel 版`;
      intelPath ??= p;
      continue;
    }
    return { path: p };
  }
  return { path: null, rejected, intelPath };
}

/** Homebrew 的 Apple 芯片版装在哪（Intel 版在 /usr/local）。 */
export const ARM_BREW = "/opt/homebrew/bin/brew";
/** 各工具在 Homebrew 里的包名（LibreOffice 是 cask）。 */
const BREW_PKG: Partial<Record<ToolId, string>> = { ffmpeg: "ffmpeg", pandoc: "pandoc", soffice: "--cask libreoffice" };
/** Homebrew 官网的安装命令：在 Apple 芯片的电脑上跑，装出来的就是 /opt/homebrew 那份（设置页「先装 Apple 芯片版的 Homebrew」那一档，批次 271 ①）。 */
export const HOMEBREW_INSTALL = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

/** 装的是 Intel 版时，换装 Apple 芯片版的那一行命令（设置 › 转换工具「装的是 Intel 版」那一档下面那句，批次 271 ①）。
 *
 *   - Intel 版的 pandoc 几乎总是 Intel 版 Homebrew（前缀 /usr/local）装的。那份 brew 在 arm64 下跑会直接拒绝
 *     （「Cannot install in Homebrew on ARM processor in Intel default prefix (/usr/local)!」），`arch -arm64` 救不了；
 *   - 用的要是 Apple 芯片版 Homebrew（/opt/homebrew），它装出来的本来就是 arm64 版。
 * 所以通常是用 /opt/homebrew 那份 brew `install` 一份（设置页那句「用 Apple 芯片版的 Homebrew 再装一份」）；
 * 只有 Intel 版在 /opt/homebrew 下面（罕见：手动拷进去的、cask 只发了 Intel 包）时才是 `reinstall`（「重新装一遍」）。
 * 这台电脑上压根没有 /opt/homebrew 那份 brew 时，设置页改给 HOMEBREW_INSTALL（settingsIpc.ts）。 */
export function armReinstallHint(id: ToolId, intelPath: string): string | undefined {
  const pkg = BREW_PKG[id];
  if (!pkg) return undefined;
  if (intelPath.startsWith("/opt/homebrew/")) return `${ARM_BREW} reinstall ${pkg}`;
  return `${ARM_BREW} install ${pkg}`;
}

/** 本机有没有 Apple 芯片版的 Homebrew（`/opt/homebrew/bin/brew` 可执行）。 */
function hasArmBrew(): boolean {
  try { accessSync(ARM_BREW, constants.X_OK); return true; } catch { return false; }
}

/** 没找到能用的那一份时给转换器回的状态：Intel 版给「X 是 Intel 版」+ 换装命令，真没装给「没装 X」+ 安装命令。
 *  Intel 版而本机没有 Apple 芯片版 Homebrew 时，换装命令跑不起来，hint 改给 Homebrew 官网安装命令（同设置页 c 档，批次 271 ①）。
 *  `armBrew` 默认现查，测试里传死。 */
export function missingStatus(id: ToolId, hit: ToolHit, armBrew: boolean = hasArmBrew()): { ok: false; reason: string; hint?: string } {
  if (hit.intelPath) {
    const hint = armBrew ? (armReinstallHint(id, hit.intelPath) ?? INSTALL_HINT[id]) : HOMEBREW_INSTALL;
    return { ok: false, reason: hit.rejected || `${TOOL_LABEL[id]} 是 Intel 版`, hint };
  }
  return { ok: false, reason: `没装 ${TOOL_LABEL[id]}`, hint: INSTALL_HINT[id] };
}

/** 带缓存的查找：同一个工具 60 秒内不重复查（能力页刷新、AI 问「能转什么」都会来问）。 */
export class ToolBox {
  private cache = new Map<ToolId, { at: number; hit: ToolHit }>();
  constructor(private deps: ToolFinderDeps = {}, private ttlMs = 60_000, private now: () => number = Date.now) {}
  get(id: ToolId): ToolHit {
    const c = this.cache.get(id);
    if (c && this.now() - c.at < this.ttlMs) return c.hit;
    const hit = findTool(id, this.deps);
    this.cache.set(id, { at: this.now(), hit });
    return hit;
  }
  /** 用户刚装完工具、点了「重新检测」。 */
  forget(): void {
    this.cache.clear();
  }
}
