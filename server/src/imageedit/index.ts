/** 图像编辑：适配器表 + 一个入口（2026-10-30）。
 *
 *  加一家只做两件事：写一个 `ImageEditor`、在下面这张表里加一行。
 *  路径闸、重名顺延、写入口、错误码都不用动 —— 那是「适配层可换」这句话的具体含义。
 */
import { getImageEdit, type ImageEditConfig } from "../ai_config.js";
import { arkEditor } from "./ark.js";
import { fakeEditor } from "./fake.js";
import { ImageEditError, type ImageEditDeps, type ImageEditRequest, type ImageEditResult, type ImageEditor } from "./types.js";

export { ImageEditError } from "./types.js";
export type { ImageEditRequest, ImageEditResult } from "./types.js";
export { extOfMime, sniffImageMime } from "./types.js";

/** ⚠️ 键要和 `ImageEditConfig.provider` 的取值一一对应 —— 对不上的话
 *  「配了一个不存在的 provider」会在这里变成 undefined，而症状出现在很远的地方。 */
const EDITORS: Record<ImageEditConfig["provider"], ImageEditor> = {
  ark: arkEditor,
  fake: fakeEditor,
};

/** 原图上限。比插件那套的二进制上限小得多 —— 这一张图要整个 base64 进 HTTP 身子里
 *  （+33%），而对端自己也有限制（方舟文档是 10 MB）。 */
export const IMAGE_IN_MAX = 10 * 1048576;
/** 回包上限。 */
export const IMAGE_OUT_MAX = 20 * 1048576;
/** 单次出图的总超时。出图普遍 10–30 秒，所以这个数比别处大；
 *  ⚠️ 但**必须有**：没有超时的网络调用会把一轮会话永久挂住（§3.4 那条的网络版）。 */
export const EDIT_TIMEOUT_MS = 120_000;

const defaultDeps = (): ImageEditDeps => ({
  fetchFn: (u, i) => fetch(u, i as never) as never,
  timeoutMs: EDIT_TIMEOUT_MS,
  outMax: IMAGE_OUT_MAX,
});

/** 这台机器上「图像编辑」配好了没 —— **只读配置，一个请求都不发**。
 *  同 `list_convert_targets` 的角色：**让调用方在承诺「我来出效果图」之前先问一句**。 */
export async function imageEditStatus(): Promise<{
  configured: boolean; provider?: string; label?: string; model?: string;
  keySource?: string; supportsStrength?: boolean; real?: boolean; why?: string;
}> {
  let cfg: Awaited<ReturnType<typeof getImageEdit>>;
  try { cfg = await getImageEdit(); }
  catch (e) { return { configured: false, why: (e as Error).message }; }
  const ed = EDITORS[cfg.provider];
  if (!ed) return { configured: false, why: `配的 provider 是「${cfg.provider}」，而我们没有这家的适配器（有的是：${Object.keys(EDITORS).join(" / ")}）` };
  return {
    configured: true, provider: ed.id, label: ed.label, model: cfg.model,
    keySource: cfg.keySource, supportsStrength: ed.supportsStrength,
    /* 假适配器也算「配好了」，但 `real: false` —— 调用方据此决定要不要说明 */
    real: ed.id !== "fake",
  };
}

/** 出一张图。配置从 `ai_config.json` 现取（密钥不在这一层缓存）。 */
export async function editImage(req: ImageEditRequest, deps?: Partial<ImageEditDeps>): Promise<ImageEditResult & { provider: string; model: string }> {
  const cfg = await getImageEdit();
  const ed = EDITORS[cfg.provider];
  if (!ed) {
    throw new ImageEditError("config", `配的 provider 是「${cfg.provider}」，而我们没有这家的适配器`,
      `能填的：${Object.keys(EDITORS).join(" / ")}`);
  }
  if (req.bytes.length > IMAGE_IN_MAX) {
    throw new ImageEditError("too_big", `原图 ${(req.bytes.length / 1048576).toFixed(1)} MB，超过上限 ${IMAGE_IN_MAX / 1048576} MB`,
      "先用 convert_file 转一张小一点的（jpg + quality），再拿它出效果图");
  }
  const r = await ed.edit(req, cfg, { ...defaultDeps(), ...deps });
  return { ...r, provider: ed.id, model: cfg.model };
}
