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
 *
 *  ### 字段的来历（2026-10-30 核过官方「图片生成 API」文档）
 *  | 字段 | 文档怎么写 |
 *  | --- | --- |
 *  | `image` | `string / string[]`，「支持 URL 或 Base64 编码」；base64 要写成 `data:image/<格式>;base64,<…>`，**`<格式>` 要小写** |
 *  | `response_format` | `url`（默认）/ `b64_json` |
 *  | `watermark` | **默认 `true`**（右下角「AI 生成」字样），可以给 `false` |
 *  | `size` | 按模型给可选值（4.5 是 `2K` / `4K`），也能写 `宽x高` |
 *  | 改动强度 | **文档里没有这一档** —— 所以 `supportsStrength: false` 有文档依据，不是猜的 |
 *
 *  ⚠️ **文档没说的那一条，我们两头都认**：`b64_json` 回的是裸 base64 还是带 `data:` 前缀，
 *  文档只写「图片的 Base64 信息」。裸的照原样解，带前缀的**先把前缀剥掉** ——
 *  不剥的话 `Buffer.from(…, "base64")` 会把前缀也当 base64 解成垃圾字节，
 *  而报出来的症状是「对端回的不是我们认得的图片格式」：**真因离报错点很远**。
 *
 *  ⚠️⚠️ **到 2026-10-30 为止，一次成功的真请求都没有过** —— 所以上面那张表是**文档依据，不是读数**。
 *  当天拿 sam 的钥匙真跑了一次，对端回 **401**：那把是 Agent Plan 订阅域的钥匙（见下面 `ARK_FIX`）。
 *  回包的两种形状、四种失败由注入的假 `fetch` 钉着（`imageedittest` ⑧⑨）。
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

/** 对端拒了之后给的那句出路。**两件事分开说**，因为用户要做的动作不同。
 *
 *  ⚠️⚠️ **方舟有两域钥匙，而它们不通用**（2026-10-30 实测三条端点）：
 *  Agent Plan 订阅那把是 `ark-` 开头，在 `…/api/plan/v1` 上认得出账号（回包带账号 id），
 *  而**按量的图像接口 `/api/v3` 给它回 401 `AuthenticationError`**。
 *  > 所以「通道 C 已经有方舟密钥」**不等于**图像编辑能用那把 ——
 *  > `doc/24` §四十四 选 provider 时把这一条写成了「账号级 API Key 通用」，那是推断，而它是错的。
 *  ⚠️ 这句话只在**对端已经拒了之后**出现，不做成一道事前的闸：
 *  按前缀猜钥匙的域，等方舟哪天换了前缀就变成「拦住一把好钥匙」，
 *  而那种拦法用户没有任何办法绕过去。 */
const ARK_FIX = "① 模型 id 以方舟控制台的模型列表为准；"
  + "② 如果是 401：图像走的是**按量端点** `/api/v3`，要方舟控制台「API Key 管理」里那把（UUID 形状）——"
  + " Agent Plan 订阅那把（`ark-` 开头）这条接口不认。填法：set_image_edit_config apiKey=<按量那把>";

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
      if (!r.ok) throw new ImageEditError("remote", remoteWhy(status, raw), ARK_FIX);
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
      /* ⚠️ 带 `data:…;base64,` 前缀的先剥掉 —— 文档没说它带不带（见文件头那条）。
         多剥一次对裸 base64 是无害的（正则匹配不上），少剥一次是一张「坏图」。 */
      bytes = Buffer.from(first.b64_json.replace(/^data:[^;,]*;base64,/i, ""), "base64");
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
