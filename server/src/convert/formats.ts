// 来源：UmbraPC electron/core/convert/formats.ts（2026-10-18 a72ac3a），改动：formatOfPath 里 m[1] 加非空断言（Studio 开了 noUncheckedIndexedAccess）
// 格式转换（doc/格式转换-方案调研-2026-10-18.md §四）：认得的格式。
//
// 一个格式 = 一个 id（也是默认扩展名）+ 它在磁盘上可能的扩展名。路线规划（route.ts）只认 id，
// 「文件 → 格式」只在这里按扩展名判一次。认不出来的文件不转 —— 不去嗅文件头猜：猜错的代价是
// 把一份文档交给图片工具，报一句莫名其妙的错。

export type FormatCategory = "image" | "document" | "sheet" | "slides" | "pdf" | "video" | "audio" | "text" | "ebook";

export interface Format {
  id: string;
  label: string;
  category: FormatCategory;
  /** 磁盘上的扩展名（小写、不带点）；第一个是写出时用的。 */
  exts: string[];
}

export const FORMATS: readonly Format[] = [
  // 图片
  { id: "jpg", label: "JPG", category: "image", exts: ["jpg", "jpeg"] },
  { id: "png", label: "PNG", category: "image", exts: ["png"] },
  { id: "heic", label: "HEIC", category: "image", exts: ["heic", "heif"] },
  { id: "webp", label: "WebP", category: "image", exts: ["webp"] },
  { id: "avif", label: "AVIF", category: "image", exts: ["avif"] },
  { id: "gif", label: "GIF", category: "image", exts: ["gif"] },
  { id: "tiff", label: "TIFF", category: "image", exts: ["tiff", "tif"] },
  { id: "bmp", label: "BMP", category: "image", exts: ["bmp"] },
  { id: "psd", label: "PSD", category: "image", exts: ["psd"] },
  // PDF
  { id: "pdf", label: "PDF", category: "pdf", exts: ["pdf"] },
  // 文档
  { id: "docx", label: "Word（DOCX）", category: "document", exts: ["docx"] },
  { id: "doc", label: "Word 97（DOC）", category: "document", exts: ["doc"] },
  { id: "odt", label: "ODT", category: "document", exts: ["odt"] },
  { id: "rtf", label: "RTF", category: "document", exts: ["rtf"] },
  { id: "html", label: "HTML", category: "text", exts: ["html", "htm"] },
  { id: "md", label: "Markdown", category: "text", exts: ["md", "markdown"] },
  { id: "txt", label: "纯文本", category: "text", exts: ["txt"] },
  { id: "epub", label: "EPUB", category: "ebook", exts: ["epub"] },
  // 表格 / 演示
  { id: "xlsx", label: "Excel（XLSX）", category: "sheet", exts: ["xlsx"] },
  { id: "xls", label: "Excel 97（XLS）", category: "sheet", exts: ["xls"] },
  { id: "ods", label: "ODS", category: "sheet", exts: ["ods"] },
  { id: "csv", label: "CSV", category: "sheet", exts: ["csv"] },
  { id: "pptx", label: "PowerPoint（PPTX）", category: "slides", exts: ["pptx"] },
  { id: "ppt", label: "PowerPoint 97（PPT）", category: "slides", exts: ["ppt"] },
  { id: "odp", label: "ODP", category: "slides", exts: ["odp"] },
  // 视频
  { id: "mp4", label: "MP4", category: "video", exts: ["mp4", "m4v"] },
  { id: "mov", label: "MOV", category: "video", exts: ["mov"] },
  { id: "mkv", label: "MKV", category: "video", exts: ["mkv"] },
  { id: "webm", label: "WebM", category: "video", exts: ["webm"] },
  { id: "avi", label: "AVI", category: "video", exts: ["avi"] },
  // 音频
  { id: "mp3", label: "MP3", category: "audio", exts: ["mp3"] },
  { id: "m4a", label: "M4A（AAC）", category: "audio", exts: ["m4a"] },
  { id: "wav", label: "WAV", category: "audio", exts: ["wav"] },
  { id: "flac", label: "FLAC", category: "audio", exts: ["flac"] },
  { id: "aiff", label: "AIFF", category: "audio", exts: ["aiff", "aif"] },
  { id: "ogg", label: "OGG", category: "audio", exts: ["ogg", "oga"] },
  { id: "opus", label: "Opus", category: "audio", exts: ["opus"] },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));
const BY_EXT = new Map(FORMATS.flatMap((f) => f.exts.map((e) => [e, f] as const)));

export function formatById(id: string): Format | null {
  return BY_ID.get((id || "").toLowerCase().replace(/^\./, "")) ?? null;
}

/** 用户 / AI 写的目标格式（「PDF」「.jpeg」「jpg」）→ 格式 id；认不出回 null。扩展名别名也认（jpeg → jpg）。 */
export function normalizeTarget(raw: string): string | null {
  const k = String(raw || "").trim().toLowerCase().replace(/^\./, "");
  return BY_ID.get(k)?.id ?? BY_EXT.get(k)?.id ?? null;
}

/** 按扩展名判文件的格式；没有扩展名或不认识回 null。 */
export function formatOfPath(p: string): Format | null {
  const m = /\.([a-z0-9]+)$/i.exec(String(p || ""));
  return m ? BY_EXT.get(m[1]!.toLowerCase()) ?? null : null;
}

/** 写出时用的扩展名。 */
export function extOf(id: string): string {
  return BY_ID.get(id)?.exts[0] ?? id;
}
