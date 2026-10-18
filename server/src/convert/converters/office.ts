// 来源：UmbraPC electron/core/convert/converters/office.ts（2026-10-18 a72ac3a），改动：相对 import 补 .js；LO_FILTER / PANDOC_FROM / PANDOC_TO 取值加非空断言（noUncheckedIndexedAccess）
// 格式转换：用户自己装的 LibreOffice / Pandoc（doc/格式转换-方案调研-2026-10-18.md §3.3）。
//
// LibreOffice：Office → PDF 的高保真路线（代价 8，比「textutil → html → 打印」那条 20 便宜，装了就优先它）。
//   - 配置目录（UserInstallation）固定一份、不用用户自己那份：用户开着 LibreOffice 时，共用配置会撞锁，
//     命令行那边静默退出、什么都不转。也正因为固定一份，同时只能跑一个（maxParallel 1）。
//   - 它不让指定输出文件名，只给 `--outdir`，成品叫「源文件名.新扩展名」→ 转到一个专用子目录里再挪到 step.output。
// Pandoc：Markdown / HTML / Word / EPUB 之间的文字类互转。docx → md 时图片不导出（成品只许一个文件）。

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { runProc, procError } from "../proc.js";
import { INSTALL_HINT, type ToolBox } from "../tools.js";
import type { Converter, Edge, ToolStatus } from "../types.js";

const IDLE = 5 * 60_000;

/** LibreOffice `--convert-to` 的写法：目标格式 → 「扩展名:过滤器名」。 */
const LO_FILTER: Record<string, string> = {
  pdf: "pdf",
  docx: "docx:MS Word 2007 XML",
  odt: "odt",
  xlsx: "xlsx:Calc MS Excel 2007 XML",
  ods: "ods",
  // 44 = 逗号、34 = 双引号、76 = UTF-8、1 = 从第一行起
  csv: "csv:Text - txt - csv (StarCalc):44,34,76,1",
  pptx: "pptx:Impress MS PowerPoint 2007 XML",
  odp: "odp",
};

function loEdges(): Edge[] {
  const out: Edge[] = [];
  const add = (fs_: string[], ts: string[], cost = 10, note?: string) => {
    for (const f of fs_) for (const t of ts) if (f !== t) out.push({ from: f, to: t, cost, note });
  };
  add(["docx", "doc", "odt", "rtf"], ["pdf"], 8);
  add(["doc", "odt", "rtf"], ["docx"]);
  add(["docx", "doc", "rtf"], ["odt"]);
  add(["xlsx", "xls", "ods", "csv"], ["pdf"], 8);
  add(["xls", "ods", "csv"], ["xlsx"]);
  add(["xlsx", "xls", "csv"], ["ods"]);
  add(["xlsx", "xls", "ods"], ["csv"], 10, "只转第一个工作表");
  add(["pptx", "ppt", "odp"], ["pdf"], 8);
  add(["ppt", "odp"], ["pptx"]);
  add(["pptx", "ppt"], ["odp"]);
  return out;
}

export function libreOfficeConverter(tools: ToolBox, profileDir: string): Converter {
  return {
    id: "libreoffice",
    name: "LibreOffice",
    maxParallel: 1,
    edges: loEdges(),
    async status(): Promise<ToolStatus> {
      const hit = tools.get("soffice");
      return hit.path ? { ok: true } : { ok: false, reason: hit.rejected || "没装 LibreOffice", hint: INSTALL_HINT.soffice };
    },
    async convert(step) {
      const bin = tools.get("soffice").path;
      if (!bin) throw new Error("没装 LibreOffice");
      const outDir = path.join(step.workDir, `lo-${step.to}-${Date.now()}`);
      await fs.mkdir(outDir, { recursive: true });
      await fs.mkdir(profileDir, { recursive: true });
      step.progress(null);
      const r = await runProc(bin, [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--headless", "--norestore", "--nolockcheck", "--nodefault",
        "--convert-to", LO_FILTER[step.to]!, "--outdir", outDir, step.input,
      ], { signal: step.signal, idleMs: IDLE, totalMs: 30 * 60_000 });
      if (r.code !== 0 || r.stopped) throw procError("LibreOffice", r, IDLE);
      const made = (await fs.readdir(outDir)).find((n) => n.toLowerCase().endsWith(`.${step.to}`));
      if (!made) throw new Error(`LibreOffice 没有转出文件${r.tail.trim() ? `：${r.tail.trim().slice(-200)}` : ""}`);
      await fs.rename(path.join(outDir, made), step.output);
    },
  };
}

const PANDOC_FROM: Record<string, string> = { md: "markdown", html: "html", docx: "docx", odt: "odt", epub: "epub" };
const PANDOC_TO: Record<string, string> = { md: "gfm", html: "html", docx: "docx", odt: "odt", epub: "epub" };

export function pandocConverter(tools: ToolBox): Converter {
  const edges: Edge[] = [];
  for (const f of Object.keys(PANDOC_FROM)) {
    for (const t of Object.keys(PANDOC_TO)) {
      if (f === t) continue;
      edges.push({ from: f, to: t, note: t === "md" && f !== "html" ? "图片不导出" : undefined });
    }
  }
  return {
    id: "pandoc",
    name: "Pandoc",
    maxParallel: 2,
    edges,
    async status(): Promise<ToolStatus> {
      const hit = tools.get("pandoc");
      return hit.path ? { ok: true } : { ok: false, reason: hit.rejected || "没装 Pandoc", hint: INSTALL_HINT.pandoc };
    },
    async convert(step) {
      const bin = tools.get("pandoc").path;
      if (!bin) throw new Error("没装 Pandoc");
      step.progress(null);
      const r = await runProc(bin, ["-f", PANDOC_FROM[step.from]!, "-t", PANDOC_TO[step.to]!, "-s", "-o", step.output, step.input],
        { signal: step.signal, idleMs: IDLE, cwd: step.workDir });
      if (r.code !== 0 || r.stopped) throw procError("Pandoc", r, IDLE);
    },
  };
}
