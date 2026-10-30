/** 图像编辑适配层的词汇（2026-10-30）。
 *
 *  ⚠️ **这一层不认信封、不认 `ToolError`、不读配置文件。** 它只回答一个问题：
 *  「给一张图和一句提示，拿到另一张图」。装信封、查路径、落盘全在 `cap/imageedit.ts`。
 *  分这一刀的理由是「适配层可换」：第二家（万相 / Gemini）进来时**只写一个 `ImageEditor`**，
 *  不碰路径闸、不碰写入口、不碰错误码表。
 */

/** 够用的 `fetch` 形状。
 *  ⚠️ 不 import 全局 `fetch` 的类型也不复用 `account.ts` 的 `FetchLike` ——
 *  前者让这一层没法被注入（自测就得真联网），后者会把账号服务整个拖进来（它有模块级实例）。 */
export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface ImageEditRequest {
  /** 原图的字节 */
  bytes: Buffer;
  /** 原图的 MIME（`image/png` / `image/jpeg` …） */
  mime: string;
  /** 一句话说要改成什么样 */
  prompt: string;
  /** 改多狠，0–1。⚠️ **不是每家都有这一档** —— 没有的那家要在 `note` 里说出来，
   *  不许悄悄忽略（悄悄忽略的话，用户以为自己调了而其实没调）。 */
  strength?: number;
}

export interface ImageEditResult {
  bytes: Buffer;
  mime: string;
  /** 适配器要补的话：没用上的旋钮、对端加了水印、尺寸被改了…… 原样回给调用方。 */
  note?: string;
  /** **真的调了外部模型没有。** 假适配器是 `false`，调用方据此在回执里说清楚。
   *  ⚠️ 这一项不是调试信息，是**反误报的凭据**：没有它的话，一张原图照回的「效果图」
   *  在回执里和真的一模一样。 */
  real: boolean;
}

/** 适配器失败的四种，和 `codes.ts` 里那四个码一一对应。
 *  分四种的理由在 `codes.ts`：**用户要做的动作不同**（改配置 / 换一张 / 重试）。 */
export type ImageEditFailKind = "remote" | "too_big" | "timeout" | "config";

export class ImageEditError extends Error {
  constructor(readonly kind: ImageEditFailKind, message: string, readonly fix?: string) {
    super(message);
    this.name = "ImageEditError";
  }
}

export interface ImageEditDeps {
  fetchFn: FetchLike;
  /** 单次调用的总超时（毫秒）。出图普遍 10–30 秒，所以这个数比别处大。 */
  timeoutMs: number;
  /** 回包图片的上限（字节）。对端给 URL 时也按它截。 */
  outMax: number;
}

/** 一家适配器。**`id` 要和 `ImageEditConfig.provider` 的取值一致。** */
export interface ImageEditor {
  id: string;
  label: string;
  /** 它认不认 `strength`。回执里要照实说。 */
  supportsStrength: boolean;
  edit(req: ImageEditRequest, cfg: {
    baseUrl?: string; apiKey: string; model: string; size?: string;
  }, deps: ImageEditDeps): Promise<ImageEditResult>;
}

/** 按字节头认图片类型。**不看扩展名** —— 这里的字节是对端给的，没有名字。
 *  认不出就回 null，让调用方按「对端没说清是什么」处理，而不是默认写成 `.png`。 */
export function sniffImageMime(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export const extOfMime = (mime: string): string =>
  mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
