/** 服务端 AI 失败的**纯判据**：把 OpenAI 形状的错误体翻成「什么类别、给人看哪句、按钮叫什么、点了去哪」。
 *
 *  Umbra 服务端（`routes/openai_proxy.py _error_body`）回 4xx 时的形状：
 *  `{ error: { code: <类别>, message: <中文一句>, detail?: <原话>, topup_url?: <http(s)> } }`。
 *  类别里要分档的三种（Umbra `llm.TOPUP_KINDS`，2026-10-11）：
 *  - `insufficient_balance` —— 模型厂商欠费，**去充值**（厂商控制台）；
 *  - `need_membership`      —— 没会员，**开会员**（Umbra 商城）；
 *  - `quota_exhausted`      —— 5 小时 / 周额度用完，**重置卡 / 加量包**（Umbra 商城）。
 *  其余类别（限流、上游错、参数错…）只摆服务端那句话，没有按钮。
 *
 *  ⚠️ 这里**不碰网络、不碰界面**，只做字符串 → 结构 —— 所以 `aifailtest` 在 node 里直接测。
 *  自填端点（DeepSeek / 智谱…）的 4xx 不是这个形状，解析不出 `error.code` 就回 null，照旧走原来那条「HTTP 402: 原文」。
 */

/** 服务端用的类别名。PC 端那张表把厂商欠费叫 `vision_topup`，这里两个名字都认，免得两端表漂了就哑。 */
export type AiFailKind = "insufficient_balance" | "need_membership" | "quota_exhausted" | string;

export interface AiFailure {
  /** 服务端的原因类别（`error.code`）。 */
  kind: AiFailKind;
  /** 给人看的一句（服务端 `error.message`；没有就用 detail / 原文）。 */
  message: string;
  /** 服务端的原话（`error.detail`），可能为空。 */
  detail: string;
  /** 点按钮去哪（`error.topup_url`，只认 http(s)）。没有就空串。 */
  topupUrl: string;
  /** 按钮文案；不该有按钮的类别为 null。 */
  action: string | null;
}

/** 类别 → 按钮文案。和 PC `reasonKind.topupLabelKey`、iOS `ReasonKind.topupButtonKey` 同一张表。 */
export function failAction(kind: string): string | null {
  switch (kind) {
    case "insufficient_balance":
    case "vision_topup":
      return "去充值";
    case "need_membership":
      return "开会员";
    case "quota_exhausted":
      return "重置卡 / 加量包";
    default:
      return null;
  }
}

/** 没有 `topup_url` 时点按钮该说什么（商城在 Umbra 的 PC / iOS 账号页里，Studio 没有商城）。 */
export function failHint(kind: string): string {
  const a = failAction(kind);
  if (!a) return "";
  if (kind === "insufficient_balance" || kind === "vision_topup") return "到模型服务商控制台充值后再试";
  return `到 Umbra（PC 或手机）的「账号」页里${a === "开会员" ? "开会员" : "买重置卡或加量包"}`;
}

/** 4xx 的响应体 → 结构。不是 OpenAI 错误形状（没有 `error.code`）回 null。 */
export function parseAiFailure(status: number, text: string): AiFailure | null {
  if (status < 400) return null;
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return null; }
  const e = (obj && typeof obj === "object" ? (obj as Record<string, unknown>).error : null) as Record<string, unknown> | null;
  if (!e || typeof e !== "object") return null;
  const kind = typeof e.code === "string" && e.code ? e.code : (typeof e.type === "string" ? e.type : "");
  if (!kind) return null;
  const detail = typeof e.detail === "string" ? e.detail : "";
  const message = (typeof e.message === "string" && e.message) || detail || `HTTP ${status}`;
  const url = typeof e.topup_url === "string" ? e.topup_url.trim() : "";
  return {
    kind,
    message,
    detail,
    topupUrl: /^https?:\/\//.test(url) ? url : "",
    action: failAction(kind),
  };
}

/** 写进 `error` 字符串的那一句：认得出类别就用服务端的中文 + 原话，认不出照旧 `HTTP n: 原文`。
 *  `looksLikeQuotaProblem` 靠这串里的「402 / 额度 / 余额」判要不要换通道，所以状态码一定保留在里面。 */
export function failErrorText(status: number, text: string, fail: AiFailure | null): string {
  if (!fail) return `HTTP ${status}: ${text.slice(0, 200)}`;
  const tail = fail.detail && fail.detail !== fail.message ? `（${fail.detail.slice(0, 160)}）` : "";
  return `HTTP ${status}: ${fail.message}${tail}`;
}
