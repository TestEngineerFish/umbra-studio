// 来源：UmbraPC electron/core/convert/converters/ffmpeg.ts（2026-10-18 a72ac3a），改动：相对 import 补 .js；正则分组 m[1] / d[1] / t[1] 加非空断言（noUncheckedIndexedAccess）
// 格式转换：用户自己装的 FFmpeg —— 音视频几乎全靠它，外加 webp 输出（sips 写不了）。
//
// 编码器先查再用（照 Filee，doc §9.3 第 6 条）：Homebrew 的 ffmpeg 和别处下的不一定带 x264 / libvpx / lame，
// 第一次用时跑一次 `ffmpeg -encoders`，缺哪个编码器，那几条边就不登记 —— 规划器自然绕开或者说「转不了」，
// 而不是让用户看一屏 ffmpeg 的报错。

import { runProc, procError } from "../proc.js";
import type { ToolBox } from "../tools.js";
import { INSTALL_HINT } from "../tools.js";
import type { Converter, ConvertStep, Edge, ToolStatus } from "../types.js";

const VIDEO_IN = ["mp4", "mov", "mkv", "webm", "avi", "gif"];
const AUDIO_IN = ["mp3", "m4a", "wav", "flac", "aiff", "ogg", "opus"];

/** 每种输出要哪些编码器（任一个在就行）。 */
const NEEDS: Record<string, string[]> = {
  mp4: ["libx264", "h264_videotoolbox"],
  mov: ["libx264", "h264_videotoolbox"],
  mkv: ["libx264", "h264_videotoolbox"],
  webm: ["libvpx-vp9", "libvpx"],
  gif: ["gif"],
  mp3: ["libmp3lame"],
  m4a: ["aac"],
  wav: ["pcm_s16le"],
  aiff: ["pcm_s16be"],
  flac: ["flac"],
  ogg: ["libvorbis"],
  opus: ["libopus"],
  webp: ["libwebp"],
};

function allEdges(): Edge[] {
  const out: Edge[] = [];
  const add = (f: string, t: string, cost = 11, note?: string) => { if (f !== t) out.push({ from: f, to: t, cost, note }); };
  // 比系统 avconvert / afconvert 贵一点：两边都能转时，Mac 上先用系统的（硬件编码、不吃风扇）。
  for (const f of VIDEO_IN) {
    for (const t of ["mp4", "mov", "mkv", "webm"]) add(f, t);
    add(f, "gif", 12, "动图只保留前 60 秒、宽度最大 640");
    for (const t of ["mp3", "m4a", "wav", "flac", "ogg", "opus"]) if (f !== "gif") add(f, t);
  }
  for (const f of AUDIO_IN) for (const t of ["mp3", "m4a", "wav", "flac", "aiff", "ogg", "opus"]) add(f, t);
  for (const f of ["png", "jpg"]) add(f, "webp");
  return out;
}

/** 解析 `ffmpeg -encoders` 的输出 → 编码器名集合。行形如「 V....D libx264   libx264 H.264 …」。 */
export function parseEncoders(text: string): Set<string> {
  const got = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line);
    if (m) got.add(m[1]!);
  }
  return got;
}

/** 「HH:MM:SS.xx」→ 秒。 */
export function clockToSec(s: string): number {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** 目标格式 → 编码参数（输入 / 输出之间那一段）。`enc` 是这台 ffmpeg 有的编码器。 */
export function encodeArgs(to: string, enc: Set<string>, quality?: number): string[] {
  const h264 = enc.has("libx264") ? ["-c:v", "libx264", "-preset", "medium", "-crf", "23"] : ["-c:v", "h264_videotoolbox", "-q:v", "60"];
  const v264 = [...h264, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"];
  switch (to) {
    case "mp4":
    case "mov": return [...v264, "-movflags", "+faststart"];
    case "mkv": return v264;
    case "webm": return enc.has("libvpx-vp9")
      ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1", ...(enc.has("libopus") ? ["-c:a", "libopus"] : ["-an"])]
      : ["-c:v", "libvpx", "-b:v", "1M", ...(enc.has("libvorbis") ? ["-c:a", "libvorbis"] : ["-an"])];
    case "gif": return ["-t", "60", "-an", "-vf", "fps=12,scale='min(640,iw)':-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"];
    case "mp3": return ["-vn", "-c:a", "libmp3lame", "-q:a", "2"];
    case "m4a": return ["-vn", "-c:a", "aac", "-b:a", "192k"];
    case "wav": return ["-vn", "-c:a", "pcm_s16le"];
    case "aiff": return ["-vn", "-c:a", "pcm_s16be"];
    case "flac": return ["-vn", "-c:a", "flac"];
    case "ogg": return ["-vn", "-c:a", "libvorbis", "-q:a", "5"];
    case "opus": return ["-vn", "-c:a", "libopus", "-b:a", "128k"];
    case "webp": return ["-frames:v", "1", "-c:v", "libwebp", "-quality", String(quality ? Math.max(1, Math.min(100, Math.round(quality))) : 82)];
    default: throw new Error(`ffmpeg 不会写 ${to}`);
  }
}

const IDLE_MEDIA = 10 * 60_000;

export function ffmpegConverter(tools: ToolBox): Converter {
  const full = allEdges();
  let encoders: Set<string> | null = null;
  let encodersOf = "";
  const usable = () => (encoders ? full.filter((e) => NEEDS[e.to]?.some((x) => encoders!.has(x))) : full);

  async function probe(bin: string): Promise<void> {
    if (encoders && encodersOf === bin) return;
    // 编码器清单有几十 KB，超过 runProc 留的尾巴，所以逐行收。
    const lines: string[] = [];
    const r = await runProc(bin, ["-hide_banner", "-encoders"], { totalMs: 15_000, onLine: (l) => lines.push(l) });
    if (r.code !== 0) return;
    encoders = parseEncoders(lines.join("\n"));
    encodersOf = bin;
  }

  return {
    id: "ffmpeg",
    name: "FFmpeg",
    maxParallel: 2,
    get edges() { return usable(); },
    async status(): Promise<ToolStatus> {
      const hit = tools.get("ffmpeg");
      if (!hit.path) return { ok: false, reason: hit.rejected || "没装 FFmpeg", hint: INSTALL_HINT.ffmpeg };
      try { await probe(hit.path); } catch { /* 查不到编码器就按全量登记，转的时候再报 */ }
      return { ok: true };
    },
    async convert(step: ConvertStep) {
      const bin = tools.get("ffmpeg").path;
      if (!bin) throw new Error("没装 FFmpeg");
      await probe(bin).catch(() => {});
      const args = ["-hide_banner", "-nostdin", "-y", "-i", step.input, ...encodeArgs(step.to, encoders ?? new Set(), step.options.quality), step.output];
      let total = NaN;
      step.progress(0);
      const r = await runProc(bin, args, {
        signal: step.signal,
        idleMs: IDLE_MEDIA,
        onLine: (l) => {
          if (Number.isNaN(total)) {
            const d = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(l);
            if (d) total = clockToSec(d[1]!);
          }
          const t = /time=\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(l);
          if (t && total > 0) step.progress(Math.min(1, clockToSec(t[1]!) / (step.to === "gif" ? Math.min(total, 60) : total)));
        },
      });
      if (r.code !== 0 || r.stopped) throw procError("FFmpeg", r, IDLE_MEDIA);
    },
  };
}
