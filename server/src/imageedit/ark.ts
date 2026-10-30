/** 火山方舟（豆包 Seedream）图像编辑适配器。
 *
 *  **为什么第一家接它**（2026-10-30 定，备选是通义万相，理由全文在 `doc/24` §四十四）：
 *  ① **同步**单请求（`POST /images/generations`）；万相的图像编辑是**异步**的
 *     （提交任务 → 轮询，官方说 5–15 秒，RPS 2 / 并发 2）—— 为一条「等十几秒」的路
 *     加一套任务状态机，而那套状态机的每一个分支都要有判据；
 *  ② 形状和仓里已有的东西一样：方舟这条是 OpenAI 风格的 JSON，通道 A / C 就是这个形状；
 *     万相是 DashScope 自有形状，等于多一套词汇；
 *  ③ 密钥：sam **已经有方舟的 key**（通道 C 就是方舟 Agent Plan），万相要另开一个百炼账号。
 *  ⚠️ **效果没有对比过**，所以它不在上面三条理由里 —— 手上没有可用密钥，
 *  拿「效果更好」当理由就是误报（纪律③）。价格也不构成理由：方舟 0.20 元/张（输入图免费）、
 *  万相 0.14 元/张，同一个数量级。
 *
 *  ⚠️ **模型 id 不写死**（配置里填）。方舟的模型按日期带后缀、会换代，写死的那天它就过期了。
 *  ⚠️ 下面这些字段**没有用真密钥验过**（没有 key，不替用户花钱）：`image` 收 data URL、
 *  `response_format: "b64_json"`、`watermark`。所以三件事都做了保守处理：
 *  回包 **`b64_json` 和 `url` 两样都认**、把对端的原话原样转出来、超时与上限都在我们这边。
 */
import { ImageEditError, sniffImageMime, type ImageEditor } from "./types.js";

/** 方舟的默认端点（公开文档里的那个）。配置里填了就用配置的。 */
export const ARK_DEFAULT_BASE = "https://ark.cn-beijing.volces.com/api/v3";

/** 对端回的 JSON 里只认这几样；多出来的一律不看。 */
interface ArkReply {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { code?: string; message?: string };
  message?: string;
}

const parse = (raw: string): ArkReply => {
  try { return JSON.parse(raw) as ArkReply; } catch { return {}; }
};

/** 对端那句话。**原样转**，只截长度 —— 改写它等于把「密钥过期」说成「出错了」。 */
const remoteWhy = (status: number, raw: string): string => {
  const j = parse(raw);
  const msg = (j.error?.message ?? j.message ?? "").trim();
  return msg ? `${msg}（HTTP ${status}）` : `HTTP ${status}：${raw.slice(0, 200) || "（空回包）"}`;
};

export const arkEditor: ImageEditor = {
  id: "ark",
  label: "火山方舟 · 豆包 Seedream",
  /* ⚠️ 方舟这条接口**没有 strength 这一档**。照实回 false ——
     调用方会在回执里说「这次没用上」，而不是让用户以为自己调了。 */
  supportsStrength: false,

  async edit(req, cfg, deps) {
    const base = (cfg.baseUrl ?? "").trim().replace(/\/+$/, "") || ARK_DEFAULT_BASE;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), deps.timeoutMs);
    let raw: string;
    let status: number;
    try {
      const r = await deps.fetchFn(`${base}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        /* 身子**只放要紧的几样**：每多一个对端不认的字段，就多一次 400，
           而那种 400 的报错长得像「密钥不对」。 */
        body: JSON.stringify({
          model: cfg.model,
          prompt: req.prompt,
          image: `data:${req.mime};base64,${req.bytes.toString("base64")}`,
          response_format: "b64_json",
          /* ⚠️ 水印默认是**开**的 —— 带水印的效果图没法给客户看。 */
          watermark: false,
          ...(cfg.size ? { size: cfg.size } : {}),
        }),
        signal: ac.signal,
      });
      status = r.status;
      raw = await r.text();
      if (!r.ok) throw new ImageEditError("remote", remoteWhy(status, raw), "多半是密钥或模型 id —— 对端原话见上。模型 id 以方舟控制台的模型列表为准");
    } catch (e) {
      if (e instanceof ImageEditError) throw e;
      /* `abort` 和「网线断了」要分开说：一个可以重试，一个要查网络。 */
      if ((e as Error).name === "AbortError") {
        throw new ImageEditError("timeout", `等了 ${Math.round(deps.timeoutMs / 1000)} 秒还没出图`, "再试一次；一直这样就把提示写短一点");
      }
      throw new ImageEditError("remote", `连不上图像模型：${(e as Error).message}`, "查一下网络和端点地址");
    } finally {
      clearTimeout(timer);
    }

    const j = parse(raw);
    const first = j.data?.[0];
    if (!first) throw new ImageEditError("remote", `对端没回图：${remoteWhy(status, raw)}`);

    let bytes: Buffer;
    let note: string | undefined;
    if (first.b64_json) {
      bytes = Buffer.from(first.b64_json, "base64");
    } else if (first.url) {
      /* 对端只给 URL 那一支：**两样都认**（见文件头那段）。
         ⚠️ 下载也要带超时和上限 —— 这一步同样是网络。 */
      const ac2 = new AbortController();
      const t2 = setTimeout(() => ac2.abort(), deps.timeoutMs);
      try {
        const g = await deps.fetchFn(first.url, { signal: ac2.signal });
        if (!g.ok) throw new ImageEditError("remote", `出图成功但取不回来：HTTP ${g.status}`);
        bytes = Buffer.from(await g.arrayBuffer());
        note = "对端回的是 URL，我们下载后落盘";
      } catch (e) {
        if (e instanceof ImageEditError) throw e;
        if ((e as Error).name === "AbortError") throw new ImageEditError("timeout", "出图成功，但把图取回来超时了");
        throw new ImageEditError("remote", `出图成功但取不回来：${(e as Error).message}`);
      } finally { clearTimeout(t2); }
    } else {
      throw new ImageEditError("remote", "对端回了一条没有图的记录（既没有 b64_json 也没有 url）");
    }

    if (!bytes.length) throw new ImageEditError("remote", "对端回的图是 0 字节");
    if (bytes.length > deps.outMax) {
      throw new ImageEditError("too_big", `对端回的图 ${(bytes.length / 1048576).toFixed(1)} MB，超过上限 ${Math.round(deps.outMax / 1048576)} MB`);
    }
    /* 认不出类型就拒。**不默认当 png** —— 名字写 `.png` 而内容不是，
       下一个打开它的人看到的是「这张图坏了」，而真因在这里。 */
    const mime = sniffImageMime(bytes);
    if (!mime) throw new ImageEditError("remote", "对端回的不是我们认得的图片格式（按字节头判：png / jpeg / webp）");

    const parts = [note];
    if (req.strength !== undefined) parts.push(`strength=${req.strength} 这家接口没有这一档，没用上`);
    return { bytes, mime, note: parts.filter(Boolean).join("；") || undefined, real: true };
  },
};
