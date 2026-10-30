/** AI 配置（M2-2）
 *
 * 存本地，不进任何日志、不进 changelog、不随项目走。密钥属于机器，不属于项目。
 * 存于 STATE_ROOT/.umbrastudio/ai_config.json（开发时 = 仓库根；打包后 = 壳给的 userData，
 * 因为写进 .app 会毁掉 ad-hoc 签名，见 project.ts 的 STATE_ROOT）。
 */

import { platformName } from "./shared/brand.js";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATE_ROOT } from "./project.js";
import { writeAtomic } from "./normalize.js";

const CONFIG_FILE = join(STATE_ROOT, ".umbrastudio", "ai_config.json");

export interface ChannelAConfig {
  baseUrl: string;    // OpenAI 兼容端点
  apiKey: string;     // ⚠️ 密钥
  model: string;      // 用户填的模型名
  /** 走 **Umbra 服务端 AI**（一·c，2026-10-10）：端点 = 账号那一层连的服务端 + `/v1`，密钥 = 登录令牌（`account.ts`），
   *  服务端在那边扣**会员额度**（5 小时 + 周两桶；积分只买插件 / 商品，2026-10-10 第二期定的）。为真时 `baseUrl` / `apiKey` 在取配置那一刻被覆盖（`getChannelA`），文件里的值不算数；
   *  `model` 也不算数（服务端一律用它自己配的那个）。关掉就回到自填端点。 */
  useAccount?: boolean;
  /** 这个模型吃不吃图（M8-10）。不给时按模型名猜 —— 猜不准就当不支持，
   *  宁可把入口灰掉说清楚，也不要发一条对面读不懂的多模态消息。 */
  supportsImage?: boolean;
}

/** 通道 B：Claude Code 子进程要指向的 Anthropic 兼容端点（GLM Coding Plan）。
 *  和通道 A 不是一个地址、不是一把 key —— 曾经复用 A 的配置，真跑之前必须拆开（doc/11 Q11）。 */
export interface ChannelBConfig {
  /** 用哪个本地 CLI（M2-13）。缺省 `"claude"` —— 老配置没这个字段，照旧走 Claude Code。
   *  能选哪些、各自差在哪看 `local_cli.ts` 的 `CLI_SPECS`；这台机器上装了哪些用 `detectLocalClis()` 扫。 */
  cli?: "claude" | "cursor-agent" | "codex" | "gemini" | "opencode";
  /** Anthropic 兼容端点，如 `https://open.bigmodel.cn/api/anthropic`。**只对 `cli: "claude"` 有意义。**
   *  **留空 = 用本机已登录的 Claude Code**（子进程不覆盖 `ANTHROPIC_*`，走用户自己的订阅）。 */
  baseUrl: string;
  /** ⚠️ 密钥。`baseUrl` 留空时这里也留空。 */
  apiKey: string;
  /** 模型名，按所选 CLI 的叫法写（`CLI_SPECS[].modelHint` 有例子）。
   *  Claude Code 本机登录态时是别名（`sonnet` / `opus` / `haiku`）—— 默认给 `sonnet`，
   *  Opus 一条回复能吃掉几万 cache token。 */
  model: string;
  /** 一轮最多花多少（美元）。只有报用量的 CLI 撑得住这个刹车（目前只有 Claude Code）。 */
  maxBudgetUsd?: number;
}

/** 这条通道走的是 CLI 自己的登录态，还是我们给的 Anthropic 兼容端点？
 *  只有 `cli: "claude"` 能给端点；别的 CLI 一律走它们自己的登录态。 */
export function channelBUsesLocalLogin(cfg: ChannelBConfig): boolean {
  if ((cfg.cli ?? "claude") !== "claude") return true;
  return !cfg.baseUrl.trim() || !cfg.apiKey.trim();
}

/** 通道 C：另一条 OpenAI 兼容端点，和 A 完全同形 —— 存在的理由是**订阅额度**：
 *  先用包月的那条，额度用完了自动退回按量计费的 A（`11` Q33）。
 *  火山方舟 Agent Plan 的地址是 `https://ark.cn-beijing.volces.com/api/plan/v1`
 *  （`/api/plan` 下还有一条 Anthropic 形状的 `/v1/messages`，我们用 OpenAI 那条）。 */
export type ChannelCConfig = ChannelAConfig;

/** 「图像编辑」这个角色（2026-10-30，出效果图）：**给一张图 + 一句提示，回另一张图**，
 *  要求保持原图的结构（墙在哪、窗在哪不许动）。
 *
 *  ⚠️⚠️ **它不是第四条会话通道。** 三条通道（A/B/C）答的是「和谁对话」，`defaultChannel` 在它们之间选；
 *  图像编辑是**另一种模型、另一张价目表、另一套入参**。塞进那个联合里的后果有两条：
 *  ① `defaultChannel: "d"` 会让每一处「取当前通道去对话」的代码拿到一个不会聊天的东西；
 *  ② 引擎选择器里会多出一个「选了就不能对话」的选项。
 *  > **一个联合类型的成员，必须在它所有的使用点上都说得通** —— 说不通就该是另一个字段。
 *  （Q49 那次做过同一个判断：打桩通道也**没有**往 `a|b|c` 上加一档。）
 */
export interface ImageEditConfig {
  /** 哪家适配器（表在 `imageedit/index.ts`）。`fake` 是**打桩**：不联网、原图照回、回执明说。 */
  provider: "ark" | "fake";
  /** 端点。留空用适配器自己的默认（方舟是 `https://ark.cn-beijing.volces.com/api/v3`）。 */
  baseUrl?: string;
  /** ⚠️ 密钥。和三条通道一样只存本地，不进日志、不进项目文件、不进仓库。 */
  apiKey?: string;
  /** 模型 id。**不硬编码**（各家都在换代），填错时对端那句话原样转给用户。 */
  model: string;
  /** 密钥**取自哪条通道**，文件里不存第二份。只认 `"c"` —— 火山方舟的 API Key 是账号级的，
   *  Agent Plan 订阅（通道 C）和按量计费的图像接口用的是同一把。
   *  ⚠️ 设了它就**只认那一条路**：取不到就报错，不偷偷回落到 `apiKey`
   *  （静默回落的话，「我以为在用通道 C 那把」会变成一句假话）。 */
  keyFrom?: "c";
  /** 回包尺寸，写法随各家（方舟可写 `2K` / `1024x1024` / `adaptive`）。不给就用对端默认。 */
  size?: string;
}

export interface AiConfig {
  channelA: ChannelAConfig | null;
  channelB: ChannelBConfig | null;
  channelC?: ChannelCConfig | null;
  defaultChannel: "a" | "b" | "c";
  /** 图像编辑角色（见上）。`null` = 没配，**不等于「用假的」**（理由在 `getImageEdit()`）。 */
  imageEdit?: ImageEditConfig | null;
}

const DEFAULT_CONFIG: AiConfig = {
  channelA: null,
  channelB: null,
  channelC: null,
  defaultChannel: "a",
  imageEdit: null,
};

export async function getAiConfig(): Promise<AiConfig> {
  if (!existsSync(CONFIG_FILE)) return DEFAULT_CONFIG;
  try {
    const cfg = JSON.parse(await readFile(CONFIG_FILE, "utf8")) as Partial<AiConfig>;
    return { ...DEFAULT_CONFIG, ...cfg, channelB: cfg.channelB ?? null };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setAiConfig(cfg: AiConfig): Promise<void> {
  await mkdir(join(STATE_ROOT, ".umbrastudio"), { recursive: true });
  await writeAtomic(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

/** 获取通道 B 的配置，未配置时报错（不再回落到通道 A —— 端点不同，回落只会打到错的地址） */
export async function getChannelB(): Promise<ChannelBConfig> {
  const cfg = await getAiConfig();
  if (!cfg.channelB) throw new Error("通道 B 未配置：set_ai_config channel=b。要用本机已登录的 Claude Code 就把 baseUrl 与 apiKey 留空、model 给 sonnet；要用别家的 Anthropic 兼容端点就三个都填");
  return cfg.channelB;
}

/** 获取通道 A 的配置，未配置时报错 */
/** 模型名里认得出的多模态家族。认不出就是 false —— 判断要往保守那边倒。 */
const IMAGE_MODEL_RE = /(vl|vision|gpt-4o|gpt-4\.1|gpt-5|o[34]|claude-|gemini|qwen.*-vl|glm-4v|step-1v|internvl|llava|pixtral|grok.*vision)/i;
export function channelSupportsImage(c: { model: string; supportsImage?: boolean } | null): boolean {
  if (!c) return false;
  if (typeof c.supportsImage === "boolean") return c.supportsImage;   // 用户说了算
  return IMAGE_MODEL_RE.test(c.model);
}

export async function getChannelA(): Promise<ChannelAConfig> {
  const cfg = await getAiConfig();
  if (!cfg.channelA) throw new Error("通道 A 未配置：请先设置 baseUrl、apiKey 和 model");
  if (cfg.channelA.useAccount) {
    // 服务端 AI：端点与密钥从账号那一层现取（动态 import —— account.ts 不被这个文件静态依赖，免得绕成环）。
    const { account } = await import("./account.js");
    /* 先取令牌（快过期会先刷新，刷不动会清掉登录），再读状态 —— 反过来的话状态是刷新前那一刻的 */
    const token = await account.bearer();
    const st = await account.status();
    if (!st.signedIn || !token) throw new Error(`通道 A 走的是${platformName}服务端 AI，但还没登录：去设置 → ${platformName}账号登录，或关掉「用服务端 AI」`);
    return { ...cfg.channelA, baseUrl: st.serverUrl.replace(/\/+$/, "") + "/v1", apiKey: token, model: cfg.channelA.model || "umbra" };
  }
  /* 开过服务端 AI 又关掉、但从没自填过的人，文件里会留一条 `baseUrl: ""` 的空配置（#141）——
     别让空地址打出去报一句底层的请求错误，照实说「没配」。 */
  if (!cfg.channelA.baseUrl) throw new Error(`通道 A 未配置：请先设置 baseUrl、apiKey 和 model（或在设置 → ${platformName}账号里打开「用服务端 AI」）`);
  return cfg.channelA;
}

export async function getChannelC(): Promise<ChannelCConfig> {
  const cfg = await getAiConfig();
  if (!cfg.channelC) throw new Error("通道 C 未配置：请先设置 baseUrl、apiKey 和 model");
  return cfg.channelC;
}

/** A 与 C 同形（都是 OpenAI 兼容），取哪一条只看通道名 */
/** 取图像编辑的配置，**把密钥解析好**。没配 / 配不全一律抛，而抛的那句话要能照着做。
 *
 *  ⚠️⚠️ **没配时拒，不回落到打桩适配器。** 回落的话用户拿到的是一张
 *  「看着是效果图而其实是原图」的文件，而他会把它当成模型的输出。
 *  > **一个看起来像 AI 而其实不是的回答，比没有回答糟**（§161.3 那条的图片版）。
 */
export async function getImageEdit(): Promise<ImageEditConfig & { apiKey: string; keySource: string }> {
  const cfg = await getAiConfig();
  const ie = cfg.imageEdit;
  if (!ie || !ie.provider) {
    throw new Error("还没配「图像编辑」模型。填法：set_image_edit_config provider=ark model=<方舟的模型 id> keyFrom=c"
      + "（keyFrom=c 表示复用通道 C 那把火山方舟密钥，不另存一份）");
  }
  /* 打桩适配器不要密钥。它**必须是显式选的**（`provider: "fake"`），所以这不是一条暗门。 */
  if (ie.provider === "fake") return { ...ie, apiKey: "", keySource: "假适配器（不联网）" };
  if (!ie.model.trim()) {
    throw new Error(`图像编辑配了 provider=${ie.provider} 却没给 model —— 模型 id 以对端控制台的模型列表为准，我们不硬编码`);
  }
  if (ie.keyFrom === "c") {
    const k = (cfg.channelC?.apiKey ?? "").trim();
    if (!k) throw new Error("图像编辑的密钥配的是「取通道 C 那把」，而通道 C 现在没有密钥 —— 先配通道 C，或者给图像编辑单独填 apiKey");
    return { ...ie, apiKey: k, keySource: "通道 C（火山方舟）那把" };
  }
  const own = (ie.apiKey ?? "").trim();
  if (!own) throw new Error("图像编辑还没有密钥：给 apiKey，或者写 keyFrom=c 复用通道 C 那把火山方舟密钥");
  return { ...ie, apiKey: own, keySource: "自己填的" };
}

export async function getOpenAiChannel(ch: "a" | "c"): Promise<ChannelAConfig> {
  return ch === "c" ? getChannelC() : getChannelA();
}

/** 这条错误像不像「订阅额度用完 / 被限流」—— 像才降级，别把参数错、网络抖动也当额度问题。
 *  命中就换通道重试一次；没命中就照原样报错，原文也一并留给用户看。 */
export function looksLikeQuotaProblem(error: string): boolean {
  return /(quota|exceed|insufficient|balance|欠费|余额|额度|用完|超出|限流|rate.?limit|too many requests|\b429\b|\b402\b)/i.test(error);
}

/* ── 「引擎」的显示名与计费方式（M8-13，设计侧第六轮 6.4） ──
 *
 * 用户原话：「只显示了选择的通道（**这里应该是模式**）」—— 说明「通道 A/B/C」这个词
 * 没向他传达任何东西。设计侧定了叫**「引擎」**（指「这一轮由谁来干活」），
 * 理由是它同时涵盖工具（Claude Code / Codex）和模型（DeepSeek），而「模型」「工具」
 * 都只能涵盖一边；**不用「模式」是因为 Claude Code 和 Codex 自己就有 plan/ask/auto，会撞车**。
 *
 * 显示名一律由服务端给，前端不再抄一份 id→名字 的表 —— 抄第二份迟早对不上。
 */

/** 从端点地址认出是谁家。认不出就退回模型名，再不行才说「自定义端点」。 */
function vendorOf(baseUrl: string, model: string): string {
  const u = (baseUrl || "").toLowerCase();
  if (u.includes("deepseek")) return "DeepSeek";
  if (u.includes("bigmodel") || u.includes("zhipu")) return "智谱";
  if (u.includes("volces") || u.includes("ark")) return "火山方舟";
  if (u.includes("moonshot")) return "Moonshot";
  if (u.includes("dashscope") || u.includes("aliyun")) return "通义";
  if (u.includes("openai")) return "OpenAI";
  if (u.includes("anthropic")) return "Anthropic";
  return model.split(/[-/]/)[0] || "自定义端点";
}

export interface EngineView {
  /** 界面上显示的引擎名：DeepSeek / Claude Code / 火山方舟 … */
  engine: string;
  /** 谁在付钱 —— 设计侧按这个把选择器分三组 */
  billing: "本机订阅" | "按量" | "订阅端点" | "会员额度";
  /** 分组标题（选择器用） */
  group: "本机 · 用你已有的订阅" | "API · 按量计费" | "订阅端点" | "服务端 · 会员额度";
}

export function engineView(cfg: AiConfig, ch: "a" | "b" | "c", cliLabel?: string): EngineView {
  if (ch === "b") return { engine: cliLabel || "本机 CLI", billing: "本机订阅", group: "本机 · 用你已有的订阅" };
  if (ch === "c") return { engine: vendorOf(cfg.channelC?.baseUrl ?? "", cfg.channelC?.model ?? ""), billing: "订阅端点", group: "订阅端点" };
  if (cfg.channelA?.useAccount) return { engine: `${platformName}服务端 AI`, billing: "会员额度", group: "服务端 · 会员额度" };
  return { engine: vendorOf(cfg.channelA?.baseUrl ?? "", cfg.channelA?.model ?? ""), billing: "按量", group: "API · 按量计费" };
}

/** 改**一条**通道，别的原样保留（issue #34，2026-09-28）。
 *
 *  为什么要有这个函数：`setAiConfig` 是整文件覆盖、不做合并，于是每一个调用方
 *  都得自己记着「有几条通道、每条有哪些字段」。MCP 那一条就是这么烂掉的 ——
 *  它写在通道 C 加进来之前，手工列了 `channelA / channelB / defaultChannel` 三项，
 *  之后没人跟上，**外部模型客户端调一次就把通道 C 整条清空**。
 *
 *  两条都要合并，少一条就丢东西：
 *  - **通道之间**：`...current` —— 不然没点名的通道消失
 *  - **通道之内**：`...prev` —— 不然同一条通道上没传的字段消失
 *    （通道 B 的 `cli` 被打回 `claude`、`maxBudgetUsd` 那道刹车没了；
 *     通道 A 手动声明的 `supportsImage` 退回按模型名猜）
 *
 *  ⚠️ `patch` 里**值为 `undefined` 的键当作没传**，不是「设成空」。
 *  清空一条通道请直接把它设成 `null`，不要靠传空串。
 */
export function mergeChannel(
  current: AiConfig,
  ch: "a" | "b" | "c",
  patch: Partial<ChannelAConfig & ChannelBConfig>,
): AiConfig {
  const prev = ch === "a" ? current.channelA : ch === "b" ? current.channelB : current.channelC;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next = {
    ...(prev ?? {}),
    ...clean,
    baseUrl: (clean.baseUrl as string | undefined) ?? prev?.baseUrl ?? "",
    apiKey: (clean.apiKey as string | undefined) ?? prev?.apiKey ?? "",
    model: (clean.model as string | undefined) ?? prev?.model ?? "",
  };
  return {
    ...current,
    ...(ch === "a" ? { channelA: next } : ch === "b" ? { channelB: next as ChannelBConfig } : { channelC: next }),
  };
}
