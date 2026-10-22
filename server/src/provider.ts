/** 通道 A · provider 适配器（M2-1）
 *
 * 走 OpenAI Chat Completions 形状，覆盖 DeepSeek、智谱通用 API、任何 OpenAI 兼容端点。
 * 模型名由用户配置，不硬编码（§六）。
 *
 * 出参是统一的对话结果，上层（agent 循环 / MCP 工具）不关心具体是哪家 provider。
 */

import { createAccumulator, createSseReader } from "./stream.js";
import { failErrorText, parseAiFailure, type AiFailure } from "./ai_fail.js";

export interface ProviderConfig {
  baseUrl: string;     // e.g. "https://api.deepseek.com/v1"
  apiKey: string;
  model: string;       // 用户填的，不硬编码
  /** 走的是 Umbra 服务端 AI（`ChannelAConfig.useAccount`，`getChannelA` 原样带过来）：请求多带 `X-Umbra-Src: studio`。 */
  useAccount?: boolean;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 多模态的一段（OpenAI 兼容形状）。只有通道明确支持图片时才会出现 —— 见 ai_config.channelSupportsImage */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderResult {
  ok: boolean;
  messages: ChatMessage[];   // 包括模型回复
  usage: UsageInfo | null;
  error: string | null;
  interrupted: boolean;
  /** 服务端 AI 的失败分档（`ai_fail.ts`）：Umbra 回的 402 认得出类别时有；厂商的裸 4xx / 网络错没有。 */
  fail?: AiFailure | null;
}

export interface ProviderOpts {
  systemPrompt?: string;
  messages: ChatMessage[];   // 已有的对话历史
  tools?: ToolDef[];         // 可用工具定义
  maxSteps?: number;         // agent 循环最大步数（默认 10）
  onToolCall?: (toolCall: ToolCall) => Promise<string>;  // 工具调用回调
  /** 模型每回一条就通知（含 tool_calls 的那条）—— 上层据此逐步落盘，界面轮询才能边跑边看到 */
  onReply?: (reply: ChatMessage) => Promise<void>;
  abortSignal?: AbortSignal;
}

export async function chat(
  cfg: ProviderConfig,
  opts: ProviderOpts,
): Promise<ProviderResult> {
  const maxSteps = opts.maxSteps ?? 10;
  const messages: ChatMessage[] = [
    ...(opts.systemPrompt ? [{ role: "system" as const, content: opts.systemPrompt }] : []),
    ...opts.messages,
  ];
  const allMessages: ChatMessage[] = [...messages];
  let totalUsage: UsageInfo | null = null;
  let step = 0;

  while (step < maxSteps) {
    if (opts.abortSignal?.aborted) {
      return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: true };
    }

    let res: SingleResult;
    try {
      res = await singleRequest(cfg, allMessages, opts.tools, opts.abortSignal);
    } catch (e) {
      // 中断信号让 fetch / 读 body 抛 AbortError —— 那不是出错，是「已中断」
      if (opts.abortSignal?.aborted) return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: true };
      return { ok: false, messages: allMessages, usage: totalUsage, error: `请求失败：${(e as Error)?.message ?? String(e)}`, interrupted: false };
    }
    if (!res.ok) {
      if (opts.abortSignal?.aborted) return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: true };
      return { ok: false, messages: allMessages, usage: totalUsage, error: res.error, interrupted: false, fail: res.fail ?? null };
    }

    // 累加用量
    if (res.usage) {
      if (!totalUsage) totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      totalUsage.promptTokens += res.usage.promptTokens;
      totalUsage.completionTokens += res.usage.completionTokens;
      totalUsage.totalTokens += res.usage.totalTokens;
    }

    // 追加模型回复
    const reply = res.message;
    allMessages.push(reply);
    if (opts.onReply) await opts.onReply(reply);

    // 如果没有 tool_calls，对话结束
    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: false };
    }

    // 有 tool_calls，执行工具
    if (!opts.onToolCall) {
      // 没有工具回调，把工具调用结果直接返回给上层
      return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: false };
    }

    const toolResults: ChatMessage[] = [];
    for (const tc of reply.tool_calls) {
      if (opts.abortSignal?.aborted) {
        return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: true };
      }
      let result: string;
      try { result = await opts.onToolCall(tc); }
      catch (e) {
        if (opts.abortSignal?.aborted) return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: true };
        result = JSON.stringify({ ok: false, error: (e as Error)?.message ?? String(e) });
      }
      toolResults.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
        name: tc.function.name,
      });
    }
    allMessages.push(...toolResults);
    step++;
  }

  return { ok: true, messages: allMessages, usage: totalUsage, error: null, interrupted: false };
}

// ── 单次请求 ──

interface SingleResult {
  ok: boolean;
  message: ChatMessage;
  usage: UsageInfo | null;
  error: string | null;
  /** 4xx 体解析出的分档（见 `ProviderResult.fail`）。 */
  fail?: AiFailure | null;
}

async function singleRequest(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[] | undefined,
  signal?: AbortSignal,
): Promise<SingleResult> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id, name: m.name } : {}),
    })),
    /* ⚠️⚠️ **流式**（issue #134）。它修的不是「逐字出字」那个体验，是一条**数据丢失**：
       `stream: false` 时响应头要等到**整段生成完**才回来，而 `fetch` 没传 dispatcher，
       走 undici 默认的 `headersTimeout = 300 秒` —— 慢模型写一整份 `.dc.html` / 长 `.md`
       超过 5 分钟就 `HeadersTimeoutError` 断掉，报成「请求失败」，**这一轮产出全丢**
       （通道 C 的降级判据也不认它，不会换 A）。
       `stream: true` 时响应头**立刻**回来，之后靠持续到达的分片保活。
       > **一个看起来是「体验优化」的改动，真正修的是一条数据丢失。** */
    stream: true,
    /* `usage` 在流式下要显式要（DeepSeek / 智谱 / 火山方舟都支持）。
       ⚠️ 个别端点不认这个字段 —— 认不认都不影响正文，拿不到就 `usage: null`（下游已经容忍 null）。 */
    stream_options: { include_usage: true },
  };
  if (tools && tools.length > 0) body.tools = tools;

  /* 端点拼接要保留 baseUrl 自带的路径：智谱是 https://open.bigmodel.cn/api/paas/v4，
     `new URL("/chat/completions", base)` 会把 /api/paas/v4 整段丢掉，POST 到根路径 → nginx 405【实测 2026-09-23】。 */
  const endpoint = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  // 排查开关：UMBRASTUDIO_AI_DEBUG=<文件路径> 时把请求体原样落到那个文件（不含密钥），拿它去二分 4xx
  if (process.env.UMBRASTUDIO_AI_DEBUG) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(process.env.UMBRASTUDIO_AI_DEBUG, JSON.stringify({ endpoint, body }, null, 1)).catch(() => {});
  }
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
        // 走 Umbra 服务端 AI 时报上「是 Studio 用的」：Node 的 fetch UA 服务端认不出，它靠这个头把积分流水记成 Studio
        // （sam 2026-10-10：流水要分得出端）。自填端点不带 —— 别往第三方厂商那里送多余的头。
        ...(cfg.useAccount ? { "X-Umbra-Src": "studio" } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    return { ok: false, message: { role: "assistant", content: null }, usage: null, error: (e as Error)?.name === "AbortError" ? "已中断" : `请求失败：${(e as Error)?.message ?? String(e)}` };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    /* Umbra 服务端的 4xx 是 OpenAI 形状的错误体（`error.code` 分档，402 带 `topup_url`）：翻成人话 + 按钮；
       自填端点的 4xx 认不出形状，照旧 `HTTP n: 原文`。 */
    const fail = parseAiFailure(resp.status, text);
    return { ok: false, message: { role: "assistant", content: null }, usage: null, error: failErrorText(resp.status, text, fail), fail };
  }

  /* ── 读流 ──（issue #134）
     ⚠️ **没有 body 要当错处理而不是当空回复** —— 「模型什么都没说」和
     「连接根本没给我们 body」在下游长得一样，而后者该报出来。 */
  if (!resp.body) {
    return { ok: false, message: { role: "assistant", content: null }, usage: null, error: "流式响应没有 body" };
  }
  const acc = createAccumulator();
  const reader = createSseReader((data) => {
    acc.feed(data);
    /* 逐字回调：前端要边出边显示的话从这里拿（`chat()` 的 `onDelta`）。
       ⚠️ 只在**有新正文**时回调 —— 工具调用的分片不该当正文推给用户。 */
  });
  try {
    for await (const chunk of resp.body as unknown as AsyncIterable<Uint8Array>) reader.push(chunk);
    reader.end();
  } catch (e) {
    /* ⚠️ 流**断在中间**时把**已经收到的那部分**带出来 —— 整轮丢掉正是这一条要修的事。
       中断（用户点「中断」）照旧报「已中断」。 */
    const partial = acc.result();
    const aborted = (e as Error)?.name === "AbortError";
    if (!aborted && (partial.content || partial.toolCalls.length)) {
      return {
        ok: true,
        message: { role: "assistant", content: partial.content || null, tool_calls: partial.toolCalls.length ? partial.toolCalls : undefined },
        usage: partial.usage,
        error: null,
      };
    }
    return { ok: false, message: { role: "assistant", content: null }, usage: null, error: aborted ? "已中断" : `流中断：${(e as Error)?.message ?? String(e)}` };
  }
  const got = acc.result();
  /* ⚠️ 一帧都没有 = 端点没按 SSE 回（或者它不认 `stream: true`）。
     **照实说出来**，别让它变成一句「模型没说话」。 */
  if (!got.done && !got.content && got.toolCalls.length === 0) {
    return { ok: false, message: { role: "assistant", content: null }, usage: null, error: "流式回复里一帧有效内容都没有（端点可能不支持 stream）" };
  }
  return {
    ok: true,
    message: {
      role: "assistant",
      content: got.content || null,
      tool_calls: got.toolCalls.length ? got.toolCalls : undefined,
    },
    usage: got.usage,
    error: null,
  };
}
