/** OpenAI 兼容端点的**流式**回复：SSE 解帧 + 增量累加（issue #134）。
 *
 *  ### 为什么要流式
 *  ⚠️ 不只是「逐字出字」好看 —— 它修的是一个**会整段丢产出**的超时：
 *  `stream: false` 时**响应头要等到整段生成完才回来**，而 `fetch` 没传 dispatcher，
 *  走的是 undici 默认的 `headersTimeout = 300 秒`。于是慢模型写一整份
 *  `.dc.html` / 长 `.md` 超过 5 分钟 → `HeadersTimeoutError` 断掉 →
 *  报成「请求失败」，**而这一轮的产出全丢**（通道 C 的降级判据也不认它，不会换 A）。
 *  `stream: true` 时响应头**立刻**回来，之后靠持续到达的分片保活。
 *  > **一个「体验优化」的改动，真正修的是一条数据丢失。**
 *
 *  ### 为什么累加要单独一个纯函数
 *  issue 自己写着「按 `index` 拼接 `tool_calls[i].function.arguments` 这段 ~40 行要自己写」，
 *  而它**正好是坑多的那一段**。抽成纯函数之后，下面这些坑全都能**不起网络**地测：
 *  分片切在行中间 · 切在多字节字符中间 · `data:` 跨多行 · `: keep-alive` 注释行 ·
 *  `\r\n` 换行 · `tool_calls` 分成多帧按 `index` 拼 · 只有 `usage` 的尾帧。
 *  > **把「难做对的那一段」从 I/O 里摘出来，它就从「要联网才能测」变成「一个函数」。**
 */
import { createParser, type EventSourceMessage } from "eventsource-parser";
/* ⚠️ **`import type`** —— `provider.ts` 要 import 本文件，纯类型导入在编译后被擦除，
   所以这不是一条运行时的环（和 `b64limit.ts` 那条教训相反的一面：类型可以反向引，值不行）。 */
import type { ToolCall } from "./provider.js";

/** 一次流式回复累加出来的东西 —— 形状和 `stream: false` 那条路**一模一样**，
 *  这样 `chat()` 以上的代码一行都不用改。 */
export interface StreamAccum {
  content: string;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  /** 收到过 `[DONE]` 吗。**没收到就说明流断在中间** —— 那和「模型说完了」是两件事 */
  done: boolean;
  /** 模型自己报的结束原因（`stop` / `tool_calls` / `length`…）。`length` = 被 max_tokens 截断 */
  finishReason: string | null;
}

/** 累加器。喂 `data:` 帧的**文本**（不含 `data: ` 前缀），按 OpenAI 的 delta 形状累加。 */
export function createAccumulator() {
  let content = "";
  let usage: StreamAccum["usage"] = null;
  let done = false;
  let finishReason: string | null = null;
  /** ⚠️ **按 `index` 存，不是按到达顺序 push** —— 同一个工具调用的
   *  `function.arguments` 会**分成多帧**到达，而不同工具调用交错到达时
   *  只有 `index` 认得出谁是谁。按顺序 push 的话两个调用的参数会拼成一串乱码。 */
  const calls = new Map<number, { id: string; type: string; name: string; args: string }>();

  return {
    /** 喂一帧。`[DONE]` 之后再喂也无害（幂等）。 */
    feed(data: string): void {
      if (data === "[DONE]") { done = true; return; }
      let j: Record<string, unknown>;
      /* ⚠️ **解析不了的帧跳过，不抛** —— 有的端点会插心跳或非标准帧，
         而为了一帧杂质丢掉整轮产出，正是这一条要修的那种事。 */
      try { j = JSON.parse(data) as Record<string, unknown>; } catch { return; }
      const u = j["usage"] as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined;
      /* ⚠️ `usage` 常在**最后一帧**单独来（要请求时给 `stream_options.include_usage`），
         那一帧的 `choices` 可能是空数组 —— 所以先取 usage，再看 choices。 */
      if (u && typeof u.total_tokens === "number") {
        usage = { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens };
      }
      const ch = (j["choices"] as Array<Record<string, unknown>> | undefined)?.[0];
      if (!ch) return;
      if (typeof ch["finish_reason"] === "string") finishReason = ch["finish_reason"] as string;
      const d = ch["delta"] as { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }> } | undefined;
      if (!d) return;
      if (typeof d.content === "string") content += d.content;
      for (const tc of d.tool_calls ?? []) {
        const i = typeof tc.index === "number" ? tc.index : 0;
        const cur = calls.get(i) ?? { id: "", type: "function", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.type) cur.type = tc.type;
        if (tc.function?.name) cur.name += tc.function.name;      // 名字也可能分片（实测少见但规格允许）
        if (typeof tc.function?.arguments === "string") cur.args += tc.function.arguments;
        calls.set(i, cur);
      }
    },
    result(): StreamAccum {
      /* 按 `index` 升序出，和 `stream: false` 那条路的顺序一致 */
      const toolCalls: ToolCall[] = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], n) => ({
        id: c.id || `call_${n}`,
        type: "function",
        function: { name: c.name, arguments: c.args },
      }));
      return { content, toolCalls, usage, done, finishReason };
    },
  };
}

/** 把字节流喂成 `data:` 帧。
 *
 *  ⚠️ **两层都不能自己写**（issue 列的坑）：
 *  ① `TextDecoder({ stream: true })` 管「分片切在**多字节字符**中间」——
 *     不用 stream 模式的话，一个被切开的中文字会变成两个 `U+FFFD`，
 *     **而那是静默的内容损坏**（M14-11 嗅探那条栽过同一件事）；
 *  ② `eventsource-parser` 管「分片切在**行**中间」「`data:` 跨多行」
 *     「`: keep-alive` 注释行」「`\r\n`」—— 它就是把这些规格细节做对的那一层。
 *  > **手写能写，但坑正好都在这两层上，而每一个坑的症状都是「回复少了一截」。** */
export function createSseReader(onData: (data: string) => void): { push(chunk: Uint8Array): void; end(): void } {
  const dec = new TextDecoder("utf-8");
  const parser = createParser({ onEvent: (e: EventSourceMessage) => onData(e.data) });
  return {
    push(chunk) { parser.feed(dec.decode(chunk, { stream: true })); },
    end() { parser.feed(dec.decode()); },
  };
}
