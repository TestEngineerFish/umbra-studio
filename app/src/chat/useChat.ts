import { useCallback, useEffect, useRef, useState } from "react";
import type { Core } from "../api/client";
import type { ChatMessage, ChatNote, ChatSessionRow, ChatUsage, Selection } from "../api/types";

interface Cap {
  model: string; supportsImage: boolean; via?: "local" | "endpoint"; cli?: string; cliLabel?: string;
  /** 界面上叫什么（服务端给，前端不另抄一份映射）：DeepSeek / Claude Code / 火山方舟 */
  engine?: string;
  /** 谁在付钱 */
  billing?: "本机订阅" | "按量" | "订阅端点";
  group?: string;
}
import { mem } from "../layout/layout";
import { pickChannel as pickChannelShared } from "./channel";
import { toast } from "../ui/Toast";

/** AI 会话（M2-12 / §四十）：作业化 —— chat_send async 拿 jobId，每 1.2 s 拉一次会话正文与作业状态；WS 的 chat 事件到了也拉一次 */
export function useChat(core: Core, dir: string, ctx: { selectedDraft: string | null; selections: Selection[]; afterChanges: () => void }) {
  const [channel, setChannel] = useState<"a" | "b" | "c">(() => mem.get("us.chatChannel", "a"));
  /** 当前通道的模型名与它吃不吃图（M8-10：不支持时圈选入口禁用并说明原因） */
  const [caps, setCaps] = useState<{ a?: Cap; b?: Cap; c?: Cap }>({});
  /** 后端配的默认通道（`defaultChannel`）只在用户没切过时生效；切过一次就一直用用户的 */
  const followedDefault = useRef(false);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  /* ── 「界面现在在看哪条会话」要能在异步回调里读到（issue #117）──
     ⚠️ 一轮最长跑 12 分钟，而轮询循环里每 1.2 秒**无条件** `setMessages(sid 那条会话的正文)`。
     用户在这期间点「新建会话」或切到另一条 B，下一次轮询就把 **A 的消息写回消息区**：
     界面看着还在 A 里，而 `sessionId` 已经是 `null` / `B` —— 于是他接着说的那句
     **发进了另一条会话**，AI 看不到屏幕上那段上下文。
     「看到的对话 ≠ AI 收到的上下文」比丢消息更难发现，因为两边都「看起来正常」。

     ⚠️ **包住 `setSessionId` 而不是在六个调用点各加一行 ref 赋值** ——
     漏一个就静默复发，而症状和没修一模一样。一处定义。 */
  const [sessionId, setSessionIdRaw] = useState<string | null>(null);
  /** 界面**此刻**在看哪条（`sessionId` 的同步镜像，给异步回调判过期用） */
  const viewRef = useRef<string | null>(null);
  const setSessionId = useCallback((id: string | null) => { viewRef.current = id; setSessionIdRaw(id); }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<ChatNote[]>([]);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const job = useRef<string | null>(null);
  const ctxRef = useRef(ctx); ctxRef.current = ctx;

  /** 拉会话列表（历史面板与顶栏都用它） */
  const reloadSessions = useCallback(async () => {
    const r = await core.get<{ sessions: ChatSessionRow[] }>("chat_list").catch(() => null);
    const list = r?.data?.sessions ?? [];
    setSessions(list);
    return list;
  }, [core]);

  /** 切到某一条历史会话 */
  const openSession = useCallback(async (id: string) => {
    const g = await core.get<{ id: string; messages: ChatMessage[]; channel?: "a" | "b" | "c" }>("chat_get?session=" + encodeURIComponent(id)).catch(() => null);
    if (!g?.data) { toast("这条会话打不开", undefined, "error"); return; }
    setSessionId(g.data.id); setMessages(g.data.messages ?? []); setNotes([]); setUsage(null);
    if (g.data.channel) setChannel(g.data.channel);
  }, [core]);

  const load = useCallback(async () => {
    setSessionId(null); setMessages([]); setNotes([]); setUsage(null);
    const list = await reloadSessions();
    /* 进项目自动接上**最近说过话的那条**。列表里已经滤掉了空会话（后端做的），
       所以这里接到的一定是有内容的。 */
    if (list.length) {
      const latest = list.slice().sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]!;
      await openSession(latest.id);
    }
  }, [reloadSessions, openSession]);
  useEffect(() => { void load(); }, [load, dir]);
  const reloadCaps = useCallback(async () => {
    const r = await core.get<{ channelA?: Cap | null; channelB?: Cap | null; channelC?: Cap | null; defaultChannel?: "a" | "b" | "c" }>("ai_config").catch(() => null);
    if (!r?.data) return;
    setCaps({ a: r.data.channelA ?? undefined, b: r.data.channelB ?? undefined, c: r.data.channelC ?? undefined });
    // 没切过就跟后端的默认通道（用户把订阅那条配成默认时，进来就该是它）
    if (!followedDefault.current && mem.get<string | null>("us.chatChannel", null) === null) {
      followedDefault.current = true;
      const d = r.data.defaultChannel;
      if (d === "a" || d === "b" || d === "c") setChannel(d);
    }
  }, [core]);
  useEffect(() => { void reloadCaps(); }, [reloadCaps]);

  const renameSession = useCallback(async (id: string, title: string) => {
    const r = await core.post<{ title: string; titled: boolean }>("chat_rename", { session: id, title });
    if (!r.ok) { toast("改名没成", r.errors?.[0]?.message, "error"); return; }
    await reloadSessions();
  }, [core, reloadSessions]);

  /** 删一条会话。**真删** —— 界面上的「已删除 · 撤销」由调用方自己维持一小段时间，
   *  离开列表时才调到这里（设计侧第六轮：删除不弹确认框，行塌成一行可撤销）。 */
  const deleteSession = useCallback(async (id: string) => {
    const r = await core.post("chat_delete", { session: id });
    if (!r.ok) { toast("删不掉", r.errors?.[0]?.message, "error"); return; }
    const list = await reloadSessions();
    /* ⚠️ **判的是「此刻」在看哪条，不是闭包里那一刻**（issue #118）。
       这件事真会发生，而且是**确定性的**，不靠时序：
       历史面板卸载时会把攒下的删除真删掉（`History.tsx` 那个依赖 `[]` 的清理函数），
       它闭包里的 `chat` 是**挂载那一刻**的 —— 于是「删掉当前会话 A → 点新建会话」
       走到这里时 `sessionId` 还是 A，命中这个分支 → `openSession(剩下最近的一条)`。
       **用户明明点了「新建会话」，落到的却是另一条旧会话**，接下来说的话续进了它的上下文。

       ⚠️ 只在 `History` 那边加 `chatRef` **不够** —— 卸载那一刻 `newSession()` 的
       `setSessionId(null)` 还没提交到下一次渲染，`chatRef.current` 里的 `sessionId` 仍是 A。
       所以判据必须读一个**同步**更新的镜像，也就是 `viewRef`（它在 `setSessionId` 里当场写）。 */
    if (id === viewRef.current) {
      // 删掉的正是当前这条：接上剩下里最近的，没有就变成新会话
      const next = list.slice().sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
      if (next) await openSession(next.id);
      else { setSessionId(null); setMessages([]); setNotes([]); setUsage(null); }
    }
  }, [core, reloadSessions, openSession, setSessionId]);

  const newSession = useCallback(() => { setSessionId(null); setMessages([]); setNotes([]); setUsage(null); }, []);
  /** 换引擎。**三处都要写到**：
   *  界面 state（马上看得见）· `us.chatChannel`（下一条新会话跟着它开）·
   *  **当前会话文件**（M8-16 修的那条）。
   *  只写前两处的话：会话在火山方舟上 → 选成 Claude → 新建一条 → 再切回来，
   *  `chat_get` 从文件里读，又变回火山方舟 —— 用户实测撞到的。 */
  const pickChannel = useCallback((c: "a" | "b" | "c") => {
    setChannel(c);
    pickChannelShared(c);
    if (sessionId) void core.post("chat_channel", { session: sessionId, channel: c, tool: caps[c]?.cli });
  }, [core, sessionId, caps]);
  /* 设置面板里也能切通道（在那儿选 CLI 的人多半就是想用它）。
     它发这个事件，这里跟上 —— 不然会出现「设置里选了 Codex，会话栏还停在通道 C」。 */
  useEffect(() => {
    const on = (e: Event) => { const c = (e as CustomEvent<"a" | "b" | "c">).detail; if (c === "a" || c === "b" || c === "c") setChannel(c); };
    window.addEventListener("ud-pick-channel", on);
    return () => window.removeEventListener("ud-pick-channel", on);
  }, []);

  /** 发一轮。
   *  ⚠️ **这个 Promise 要等到整轮跑完才 resolve**（下面轮询最多 12 分钟）。
   *  所以「消息已经交出去了」那一刻的事情不能挂在它后面 —— 用 `onStarted`（M8-32）：
   *  暂存区就是这样在点下去的**那一瞬**清空的，而不是等 AI 干完。
   *  第一版把「标记已发」写在 `await send()` 之后，实测点完暂存区半分钟不动、
   *  用户只会以为没发出去而重复点。 */
  const send = useCallback(async (textIn?: string, selIn?: Selection[], onStarted?: () => void) => {
    const text = (textIn ?? input).trim();
    if (!text || running) return;
    const sels = selIn ?? ctxRef.current.selections;
    const node = sels.find((s) => s.kind === "node")?.ref;
    setInput(""); setRunning(true);
    setMessages((m) => m.concat([{ role: "user", content: text, timestamp: new Date().toISOString() }]));
    /* ⚠️ **提到 `try` 外面**：`catch` 里也要判「界面还在不在这条会话上」，
       而 `sid` 原来声明在 `try` 里面，`catch` 够不着它。
       `null` = 还没拿到会话 id（起作业就失败了）—— 那时候用户一定还在原地，照常写正文。 */
    let sid: string | null = null;
    try {
      const body: Record<string, unknown> = { message: text, channel, async: true };
      if (sessionId) body.sessionId = sessionId;
      if (ctxRef.current.selectedDraft) body.contextFile = ctxRef.current.selectedDraft;
      if (node?.node) { body.selectedNodeFile = node.file; body.selectedNodeAddress = node.node; }
      // files 药丸：把路径带过去（M8-4）。range / region 随 M8-6 / M8-10 接
      const files = sels.filter((s) => s.kind === "files").flatMap((s) => s.detail.split("\n")).filter(Boolean);
      if (files.length) body.selectedFiles = files;
      // range 药丸（.md 选中一段，M8-8）：把路径、行范围、原文一起带过去
      const range = sels.find((s) => s.kind === "range");
      if (range) { const [head, ...rest] = range.detail.split("\n"); body.selectedRange = { label: head, text: rest.join("\n") }; }
      // region 药丸（图片圈选，M8-10）：坐标 + 备注 + 裁出来的那一块
      const region = sels.find((s) => s.kind === "region");
      if (region) { const [head, ...rest] = region.detail.split("\n"); body.selectedRegion = { label: head, note: rest.join("\n"), image: region.image ?? null }; }
      const started = await core.post<{ jobId: string; sessionId?: string }>("chat_send", body);
      /* ⚠️ **这个会话还有一轮在跑**（issue #35，2026-09-28）。
         服务端现在回 409 `E_CHAT_BUSY` 并**带上那一轮的 jobId** ——
         以前它静默复用旧作业回 `ok: true`，于是这条消息根本没执行，
         而界面会把旧那一轮的结果当成这一条的回复。

         下面这个 `throw` 会让调用方**把消息留在输入框里**（`onStarted` 不会被调），
         所以用户的话不会凭空消失，他可以等一下再发，或者先点中断。
         本地的 `running` 挡不住这种情况：刷新页面、切项目再切回来、
         或者第二个窗口打开同一会话，它都是 false 而服务端那一轮还在跑。 */
      if (started.errors?.[0]?.code === "E_CHAT_BUSY") {
        /* 接上那一轮的会话 id，界面至少能继续看到它跑到哪了 */
        const sid0 = started.data?.sessionId; if (sid0) setSessionId(sid0);
        throw new Error(started.errors[0].message ?? "这个会话还有一轮在跑");
      }
      if (!started.ok || !started.data) throw new Error(started.errors?.[0]?.message ?? "起作业失败");
      job.current = started.data.jobId; sid = started.data.sessionId ?? sessionId!; setSessionId(sid);
      /* 作业起成功了 —— 这一刻「已经交给 AI」就成立，不必等它跑完。
         起失败会走上面那个 throw，`onStarted` 不会被调用，所以不会错标。 */
      onStarted?.();
      type Done = { running?: boolean; error?: { message?: string; code?: string }; result?: { data?: { usage?: ChatUsage; interrupted?: boolean; changes?: Array<{ path: string; from: string; to: string; summary: string }> }; errors?: Array<{ message?: string; code?: string }> } };
      let done: Done | null = null;
      for (let i = 0; i < 600 && !done; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const g = await core.get<{ messages: ChatMessage[] }>("chat_get?session=" + encodeURIComponent(sid));
          /* ⚠️ **切走了就只继续轮询状态，不写界面**（issue #117）。
             不能 `break` —— 这一轮还在跑，`running` 和中断按钮都靠这个循环收尾。 */
          if (g.data?.messages && viewRef.current === sid) setMessages(g.data.messages);
          const st = await core.get<Done>("chat_status?job=" + encodeURIComponent(job.current!));
          if (st.data && st.data.running === false) done = st.data;
        } catch { /* 网络抖一下不算失败 */ }
      }
      if (!done) throw new Error("等了 12 分钟还没结束");
      const d = done.result?.data ?? {};
      const add: ChatNote[] = [];
      if (done.error) add.push({ kind: "err", idx: 0, text: "出错：" + (done.error.message ?? done.error.code) });
      if (done.result?.errors?.length) add.push({ kind: "err", idx: 0, text: "出错：" + (done.result.errors[0]!.message ?? done.result.errors[0]!.code) });
      if (d.interrupted) add.push({ kind: "err", idx: 0, text: "已中断（这一步之前落盘的改动照常可审可回退）" });
      for (const ch of d.changes ?? []) add.push({ kind: "change", idx: 0, path: ch.path, from: ch.from, to: ch.to, summary: ch.summary, reverted: false });
      const g2 = await core.get<{ messages: ChatMessage[] }>("chat_get?session=" + encodeURIComponent(sid)).catch(() => null);
      /* ── 收尾也要判过期（issue #117）──
         ⚠️ 这一半比轮询那一半更要紧：变更卡（「回退到 vX」）和出错行会被追加到
         **当前**会话的界面上 —— 一颗挂在不相干会话里的「回退」按钮，
         用户点它是会真回退的。 */
      if (viewRef.current === sid) {
        if (d.usage) setUsage(d.usage);
        setNotes((n) => n.concat(add.map((x, i) => ({ ...x, idx: n.length + i }))));
        if (g2?.data?.messages) setMessages(g2.data.messages);
      } else {
        /* ⚠️ **切走了也要说一句它跑完了**（issue #117 第 3 点）：
           不说的话用户不知道 A 已经结束 —— 而他切走之前看到的是「正在跑」。
           改稿的结果照常落了盘，所以 `afterChanges` 不受这道闸影响。 */
        const label = sessions.find((x) => x.id === sid)?.title ?? sid.slice(0, 8);
        const n = (d.changes ?? []).length;
        toast(`会话「${label}」那一轮跑完了`, n ? `改了 ${n} 处 —— 切回那条会话能看到变更卡` : "你已经切到别的会话，所以没往这儿写", "ok");
      }
      if ((d.changes ?? []).length) ctxRef.current.afterChanges();
    } catch (e) {
      /* ⚠️ 失败也一样：切走之后别把「发送失败」写进**别人的**会话里。
         那时候用 toast —— 话一定要说出来，只是不往那条会话的正文里塞。 */
      const msg = "发送失败：" + String((e as Error).message ?? e);
      if (sid === null || viewRef.current === sid) setNotes((n) => n.concat([{ kind: "err", idx: n.length, text: msg }]));
      else toast("那条会话出错了", msg, "error");
    }
    finally { setRunning(false); job.current = null; }
  }, [core, input, running, channel, sessionId, sessions, setSessionId]);

  const interrupt = useCallback(async () => {
    if (!job.current) return;
    const r = await core.post("chat_interrupt", { job: job.current }).catch((e: Error) => ({ ok: false, errors: [{ message: e.message }] }));
    if (r.ok) toast("已发中断，等这一步结束", undefined, "ok"); else toast("中断失败", r.errors?.[0]?.message, "error");
  }, [core]);

  const revert = useCallback(async (idx: number) => {
    const n = notes[idx]; if (!n || n.reverted || !n.path) return;
    const r = await core.post<{ write?: { version?: string } }>("revert", { file: n.path, version: n.from });
    if (r.ok) { setNotes((ns) => ns.map((x, i) => i === idx ? { ...x, reverted: true } : x)); toast(`已退回 ${n.from}`, `历史不删，${r.data?.write?.version ?? "新一版"} 是回退版`, "ok"); ctxRef.current.afterChanges(); }
    else toast("回退失败", r.errors?.[0]?.message, "error");
  }, [core, notes]);

  return { channel, pickChannel, sessions, sessionId, messages, notes, usage, running, input, setInput, send, interrupt, revert, newSession, reload: load,
    openSession, renameSession, deleteSession, reloadSessions,
    model: caps[channel]?.model ?? "", supportsImage: caps[channel]?.supportsImage ?? false, caps, reloadCaps };
}
export type ChatStore = ReturnType<typeof useChat>;
