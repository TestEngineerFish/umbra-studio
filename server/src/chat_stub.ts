/** 打桩的那一轮（Q49，2026-10-07）—— **不联网、不读 key、一个字节都不落盘**。
 *
 *  **为什么要有它。** 2026-10-07 修 issue #117 时撞上一面墙：那条缺陷的时序是
 *  「**一轮正在跑的时候**切会话」，而要造出它得有一轮真的在跑 ——
 *  仓库里**没有任何打桩的 AI 通道**（`agenttest` 要真 AI 配置、一轮真跑要花钱，
 *  而 CLAUDE.md 明写「别拿真 AI 回合当回归」）。
 *  于是 #117 的修复**只有代码审查、没有读数**，而它恰好属于最容易复发的一类（闭包定格）。
 *
 *  它解锁的不止 #117：会话流程里凡是「跑的过程中做点什么」的判据原来**一条都没有** ——
 *  切会话 · 中断 · 并发发两条 · 用量显示。
 *
 *  ── 为什么不是「第四条通道」 ──
 *  `"a" | "b" | "c"` 这个联合在 **8 个文件 20 处**写着，而且一路通到
 *  `ai_probe` / `ai_config` / 引擎选择器。加一档等于把一个测试设施推到
 *  **用户要在下拉里看见并避开**的位置，而「怎么不让他误选」又是个设计问题。
 *
 *  所以落点是**消息前缀**：一句以 `#stub` 开头的话走这里，别的一切照旧。
 *  好处是这条规则**只住在一处**（`runChatSend` 开头那一个 `if`），
 *  而且**从界面上够得着** —— 判据在真的输入框里打字、走真的 `send()`、
 *  真的轮询循环，测的是产品本身而不是一个旁路。
 *
 *  ⚠️ **刻意不藏在环境变量后面。** 藏起来的话判据就依赖「起服务时记得设」，
 *  而那等于「忘了设就静默测不到」—— `doc/00` §160.4 刚为这一类装过闸。
 *
 *  ⚠️ **工具行是假的，不真调工具。** 它测的是「工具行会不会长出来、
 *  界面会不会跟着刷」，**不是工具本身**。所以这一轮的 `changes` 永远是空的 ——
 *  **变更卡与回退那一类判据它解锁不了**，照实说。
 *  （要解锁那一类就得让打桩真写一次盘，而那会给一个测试设施安上破坏力。）
 *
 *  ⚠️ 回复里**每一条都带标记**。一个看起来像 AI 而其实不是的回答，
 *  比没有回答糟 —— 这和 §161.3「假成功」是同一条。
 */
import { addMessage, loadChat, type ChatEntry, type ChatSession } from "./chat.js";

/** 一次打桩要怎么跑。全部有上限 —— 判据写错一个数字不该把回归挂住几分钟 */
export interface StubPlan {
  /** 每一步停多久（毫秒）。默认 300，上限 60 秒 */
  ms: number;
  /** 几个工具行。默认 1，上限 10 */
  steps: number;
  /** 最后那句回复 */
  reply: string;
  /** 不为 null 就让这一轮失败，内容就是错误文本 */
  fail: string | null;
  /** 工具行上显示哪个工具名（只是显示，不执行） */
  tool: string;
  /** 报出去的用量 */
  tokens: number;
}

/** 这条消息是不是打桩的。**认的是整句开头**，不在中间匹配 */
export const STUB_PREFIX = "#stub";

/** 解析 `#stub ms=8000 steps=2 tool=read_file reply=好了`。不是打桩消息就回 `null`。 */
export function parseStub(message: string): StubPlan | null {
  const text = message.trimStart();
  /* ⚠️ **光看前缀不够**：`#stubborn 的拼写对吗` 也以 `#stub` 开头。
     `apitest` 那条「普通的话一句都不会被当成打桩」**第一次跑就把它抓出来了** ——
     而这个误判的后果正是最坏的那种：一次**真的 AI 请求**被静默换成假回复，
     用户看到的是一段像回答的文字（§161.3「假成功」同一族）。
     所以要求前缀后面**是空白或者到此为止**。 */
  if (!text.startsWith(STUB_PREFIX)) return null;
  const nextCh = text.charAt(STUB_PREFIX.length);
  if (nextCh !== "" && !/\s/.test(nextCh)) return null;
  /* 只取第一行当指令 —— 后面的行随便写，方便判据把说明写在消息里 */
  const head = text.slice(STUB_PREFIX.length).split("\n")[0] ?? "";
  const num = (k: string, dflt: number, max: number) => {
    const m = new RegExp(`\\b${k}=(\\d+)`).exec(head);
    if (!m) return dflt;
    return Math.max(0, Math.min(max, Number(m[1])));
  };
  const word = (k: string) => {
    const m = new RegExp(`\\b${k}=([^\\s]+)`).exec(head);
    return m ? m[1]! : null;
  };
  /* `reply=` / `fail=` 吃到行尾（里面可能有空格） */
  const rest = (k: string) => {
    const m = new RegExp(`\\b${k}=(.*)$`).exec(head);
    return m ? m[1]!.trim() : null;
  };
  return {
    ms: num("ms", 300, 60_000),
    steps: num("steps", 1, 10),
    tokens: num("tokens", 123, 1_000_000),
    tool: word("tool") ?? "read_file",
    fail: rest("fail"),
    reply: rest("reply") ?? "打桩这一轮跑完了。",
  };
}

/** 睡一会儿，**中断就立刻醒**。回 `true` 表示是被中断醒的。
 *  ⚠️ 不能写成 `await sleep(ms)` 然后再看信号 —— 那样「中断」要等满这一步，
 *  而判据量到的「中断生效了」会把一个**慢**误报成**对**。 */
function nap(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(true);
  return new Promise((res) => {
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); res(false); }, ms);
    function onAbort() { clearTimeout(t); res(true); }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 打桩消息在会话里长什么样 —— **一眼能看出不是 AI**。 */
const MARK = "【打桩通道 · 不是真的 AI】";

export interface StubOut {
  sessionId: string;
  channel: ChatSession["channel"];
  messages: ChatEntry[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  interrupted: boolean;
  changes: never[];
  stub: true;
}

/** 跑一轮打桩：按计划把工具行和回复**逐条写进会话文件** ——
 *  界面轮询 `chat_get` 才能边跑边看到它们长出来（和真通道同一条路，`doc/00` §四十）。 */
export async function runStubRound(
  projectDir: string, session: ChatSession, plan: StubPlan, signal?: AbortSignal,
): Promise<StubOut> {
  let interrupted = false;
  for (let i = 0; i < plan.steps && !interrupted; i++) {
    interrupted = await nap(plan.ms, signal);
    if (interrupted) break;
    const id = `stubcall-${i}`;
    await addMessage(projectDir, session.id, {
      role: "assistant", content: `${MARK}第 ${i + 1} 步：调 ${plan.tool}`,
      toolCalls: [{ id, type: "function", function: { name: plan.tool, arguments: "{}" } }],
    });
    await addMessage(projectDir, session.id, {
      role: "tool", content: JSON.stringify({ ok: true, stub: true, step: i + 1 }),
      toolCallId: id, toolName: plan.tool,
    });
  }
  if (!interrupted) interrupted = await nap(plan.ms, signal);
  if (!interrupted) {
    await addMessage(projectDir, session.id, {
      role: "assistant",
      content: plan.fail ? `${MARK}这一轮按计划失败了` : `${MARK}${plan.reply}`,
    });
  }
  const fresh = (await loadChat(projectDir, session.id)) ?? session;
  return {
    sessionId: fresh.id,
    channel: fresh.channel,
    messages: fresh.messages.slice(-10),
    usage: { promptTokens: plan.tokens, completionTokens: plan.tokens, totalTokens: plan.tokens * 2 },
    interrupted,
    /* ⚠️ 永远空 —— 它不真写盘，所以**变更卡那一类判据它解锁不了**（见文件头） */
    changes: [],
    stub: true,
  };
}
