// 来源：UmbraPC electron/core/convert/tools.ts（2026-10-18 a72ac3a），改动：which / enginePath / isIntelOnly 改从副本自带的 ./util.js 取（PC 分在 shared/util、providers/coding、runtime/macho）
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
  for (const p of candidates) {
    if (!exists(p)) continue;
    if (intelOnly(p)) {
      rejected = `${p} 是 Intel 版，在这台 Apple 芯片的电脑上要靠 Rosetta 跑 —— 换装 Apple 芯片版即可`;
      continue;
    }
    return { path: p };
  }
  return { path: null, rejected };
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
