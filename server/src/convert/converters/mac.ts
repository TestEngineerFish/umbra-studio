// 来源：UmbraPC electron/core/convert/converters/mac.ts（2026-10-21 876cb3a），改动：相对 import 补 .js；索引取值加非空断言（noUncheckedIndexedAccess）
// 格式转换：macOS 系统自带的四件（doc/格式转换-方案调研-2026-10-18.md §3.1，参数 10-18 本机实测过）。
//
//   sips      图片：能写 jpeg / png / heic / avif / tiff / gif / bmp / pdf，**写不了 webp**（读得了）；
//             pdf → png 只出第 1 页。
//   textutil  文档：docx / doc / odt / rtf / html / txt 互转；不出 pdf（交给 Electron 打印那一步接）。
//   avconvert 视频：容器按输出扩展名定（mp4 / mov），音频抽成 m4a。
//   afconvert 音频：m4a(aac) / wav / aiff / flac；**写不了 mp3**，而且写 mp3 时报错了退出码还是 0 ——
//             所以每一步完了都要看成品在不在、是不是空的（engine.ts 统一查）。

import { runProc, procError } from "../proc.js";
import type { ToolBox, ToolId } from "../tools.js";
import type { Converter, ConvertStep, Edge, ToolStatus } from "../types.js";

function pairs(froms: string[], tos: string[], cost?: number, note?: string): Edge[] {
  const out: Edge[] = [];
  for (const f of froms) for (const t of tos) if (f !== t) out.push({ from: f, to: t, cost, note });
  return out;
}

function systemStatus(tools: ToolBox, id: ToolId): ToolStatus {
  if (process.platform !== "darwin") return { ok: false, reason: "只有 macOS 自带" };
  return tools.get(id).path ? { ok: true } : { ok: false, reason: `系统里没有 ${id}` };
}

/** 一次不该转很久的命令：5 分钟没动静就当卡死。 */
const IDLE_SHORT = 5 * 60_000;
/** 视频：10 分钟没动静才当卡死（照 Filee）。 */
const IDLE_MEDIA = 10 * 60_000;

async function exec(tools: ToolBox, id: ToolId, args: string[], step: ConvertStep, idleMs: number, onLine?: (l: string) => void) {
  const bin = tools.get(id).path;
  if (!bin) throw new Error(`系统里没有 ${id}`);
  const r = await runProc(bin, args, { signal: step.signal, idleMs, onLine });
  if (r.code !== 0 || r.stopped) throw procError(id, r, idleMs);
}

const SIPS_READ = ["jpg", "png", "heic", "webp", "avif", "gif", "tiff", "bmp", "psd"];
const SIPS_WRITE: Record<string, string> = { jpg: "jpeg", png: "png", heic: "heic", avif: "avif", tiff: "tiff", gif: "gif", bmp: "bmp", pdf: "pdf" };
const LOSSY = new Set(["jpg", "heic", "avif"]);

export function sipsConverter(tools: ToolBox): Converter {
  return {
    id: "sips",
    name: "系统 · sips",
    maxParallel: 4,
    edges: [
      ...pairs(SIPS_READ, Object.keys(SIPS_WRITE)),
      { from: "pdf", to: "png", cost: 14, note: "只转第 1 页" },
      { from: "pdf", to: "jpg", cost: 14, note: "只转第 1 页" },
    ],
    status: async () => systemStatus(tools, "sips"),
    async convert(step) {
      const q = step.options.quality;
      const args = ["-s", "format", SIPS_WRITE[step.to]!];
      if (q && LOSSY.has(step.to)) args.push("-s", "formatOptions", String(Math.max(1, Math.min(100, Math.round(q)))));
      args.push(step.input, "--out", step.output);
      step.progress(null);
      await exec(tools, "sips", args, step, IDLE_SHORT);
    },
  };
}

const TEXTUTIL_IO = ["docx", "doc", "odt", "rtf", "html", "txt"];

/** textutil 的参数。html 进来加 `-noload`（#126）：不去取页面引用的图片 / 样式表等资源。**纯函数。**
 *  10-21 实测（macOS 26）：html → docx / doc / odt / rtf / txt 这几种成品本来就不带图（只有 rtfd 带，我们不出 rtfd），
 *  外链也没收到请求；`-noload` 是把「不去取」写死，不靠系统版本的默认行为。 */
export function textutilArgs(from: string, to: string, input: string, output: string): string[] {
  return [...(from === "html" ? ["-noload"] : []), "-convert", to, "-output", output, input];
}

export function textutilConverter(tools: ToolBox): Converter {
  return {
    id: "textutil",
    name: "系统 · textutil",
    maxParallel: 4,
    edges: [
      // 读 docx / doc 进来的复杂排版（页眉、多栏、文本框）会丢 —— 进 html 这一步标出来，结果卡上照说。
      ...pairs(["docx", "doc", "odt", "rtf"], ["html"], 12, "复杂排版（页眉、图片、多栏）可能丢失"),
      ...pairs(TEXTUTIL_IO, TEXTUTIL_IO).filter((e) => e.to !== "html" || !["docx", "doc", "odt", "rtf"].includes(e.from)),
    ],
    status: async () => systemStatus(tools, "textutil"),
    async convert(step) {
      step.progress(null);
      await exec(tools, "textutil", textutilArgs(step.from, step.to, step.input, step.output), step, IDLE_SHORT);
    },
  };
}

export function avconvertConverter(tools: ToolBox): Converter {
  const video = ["mp4", "mov"];
  return {
    id: "avconvert",
    name: "系统 · avconvert",
    maxParallel: 1,
    edges: [...pairs(video, video), ...video.map((v) => ({ from: v, to: "m4a" }))],
    status: async () => systemStatus(tools, "avconvert"),
    async convert(step) {
      const preset = step.to === "m4a" ? "PresetAppleM4A" : "PresetHighestQuality";
      step.progress(0);
      // 进度行长这样：「avconvert progress:  42.00% complete」
      await exec(tools, "avconvert", ["--source", step.input, "--preset", preset, "--output", step.output, "--progress"], step, IDLE_MEDIA,
        (l) => {
          const m = /([\d.]+)%/.exec(l);
          if (m) step.progress(Math.min(1, Number(m[1]) / 100));
        });
    },
  };
}

const AF_WRITE: Record<string, string[]> = {
  m4a: ["-f", "m4af", "-d", "aac"],
  wav: ["-f", "WAVE", "-d", "LEI16"],
  aiff: ["-f", "AIFF", "-d", "BEI16"],
  flac: ["-f", "flac", "-d", "flac"],
};

export function afconvertConverter(tools: ToolBox): Converter {
  return {
    id: "afconvert",
    name: "系统 · afconvert",
    maxParallel: 2,
    edges: pairs(["m4a", "wav", "aiff", "flac", "mp3"], Object.keys(AF_WRITE)),
    status: async () => systemStatus(tools, "afconvert"),
    async convert(step) {
      step.progress(null);
      await exec(tools, "afconvert", [...AF_WRITE[step.to]!, step.input, step.output], step, IDLE_SHORT);
    },
  };
}
