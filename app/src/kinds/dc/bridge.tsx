import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ShellState } from "../../api/types";
import type { ViewContext } from "../context";
import { installHotkeys } from "../../ui/hotkeys";
import { boxOfNode, countNodes, tagOfNode, type NodeBox } from "./nodes";

export type PreviewMode = "shell" | "raw" | "code";

/** 指针三档（设计侧第十一轮，用户 2026-09-28 拍板）。
 *
 *  **实现上只有一个底座**：同一套命中、同一份节点地址、S2 照旧只发 `pick`。
 *  变的只是「这一下点击是什么意思」，由这里分派。设计侧那句话值得记：
 *  第九轮它裁掉评论指针的理由（「评论是选中之后的一个动作」）本身没错，
 *  错在它把那个动作放进了**默认收起**的属性区 —— 于是「选中之后」这一步
 *  在屏幕上没有任何可见的去处，用户点了元素只看到一圈描边。
 *  **一条正确的话放在了错的地方。** */
export type Pointer = "pick" | "comment" | "edit";
export const POINTERS: Array<{ id: Pointer; label: string; key: string; title: string }> = [
  { id: "pick", label: "点选", key: "v", title: "点选（V）：选中，并把它交给会话" },
  { id: "comment", label: "评论", key: "c", title: "评论（C）：点一个元素，在它下面写一条" },
  { id: "edit", label: "编辑", key: "e", title: "编辑（E）：点一个元素，属性区自己打开" },
];

/** 评论框开在哪个节点上。`box` 是它在顶层视口里的位置（穿透稿的 DOM 算的，见 `nodes.ts`）。 */
export interface CommentAt { node: string; tag: string; box: NodeBox | null; line: number | null }
export const PRESETS = ["PC 1440", "笔记本 1280", "iPhone 390", "自适应"];
const SHELL0: ShellState = { selectOn: false, preset: 0, zoom: 1, draftTheme: "light", picked: false, busy: false, editHint: null, checkNote: null, apiErr: null };

/** 画布与 S2 嵌入壳之间那座 postMessage 桥（M8-15b 从 `Canvas.tsx` 提上来）。
 *
 *  **为什么非提不可**：第七轮把工具栏定成统一的一条横带，而画布的开关
 *  （宽度档、缩放、点选、稿的浅深色）**全都住在 iframe 里** ——
 *  读它们要收 `shell-state` 消息，改它们要发 `cmd` 消息。
 *  工具栏搬出画布组件的那一刻，这座桥就得跟着搬到两边都够得着的地方。
 *
 *  这是四种格式里唯一一个「搬工具栏 = 搬架构」的。别的三种只是把 useState 挪个位置。
 */
export interface DcBridge {
  mode: PreviewMode; setMode: (m: PreviewMode) => void;
  shell: ShellState;
  /** iframe 的 ref —— `View` 把 iframe 挂上来，这里才发得出命令 */
  frame: React.RefObject<HTMLIFrameElement>;
  src: string;
  /** 稿**本身**的地址（不带 S2 嵌入壳）—— 演示全屏和「在浏览器打开」用它 */
  rawSrc: string;
  cmd: (c: string, value?: unknown) => void;
  reload: () => void;
  present: boolean; setPresent: (v: boolean) => void;
  file: string;

  /* ── 指针三档（M8-31）── */
  pointer: Pointer;
  setPointer: (p: Pointer) => void;
  /** 这份稿有几个节点地址。`null` = 还没数出来，**和 0 不是一回事**
   *  （0 才出提示条；不分的话加载那一瞬间会闪一条「这份稿没有节点地址」）。 */
  addrCount: number | null;
  /** 真的没有地址：三档都点不中元素，要出提示条 */
  noAddr: boolean;
  /** 在没有地址的稿上点了画布 —— 提示条抖一下（「你点了，这就是为什么没反应」）。
   *  用自增数而不是布尔：连点两次要抖两次，布尔的话第二次不触发。 */
  nudge: number;
  /** 正在写的那条评论（评论档点中元素后开）。`null` = 没开 */
  commentAt: CommentAt | null;
  closeComment: () => void;
  /** 重新数一次地址（「加上地址」做完之后要用） */
  recount: () => void;
  /** 稿的 iframe 加载完了 —— `View` 在 `onLoad` 里叫一声。
   *  ⚠️ **数地址和听画布点击都必须挂在这个时机**，不能挂在 state 变化上：
   *  S2 壳先加载，稿的 iframe 是它渲染出来的；而「加上地址」之后稿还会再重载一次。
   *  实测踩过两条：加完地址提示条不消失（数的是旧 DOM 的 0 就停了）、
   *  点画布不抖（监听挂在了还没有内层 iframe 的那一刻）。 */
  onFrameLoad: () => void;
}

const Ctx = createContext<DcBridge | null>(null);
export const useDc = (): DcBridge => {
  const v = useContext(Ctx);
  if (!v) throw new Error("dc 的 Provider 没包上 —— 工作台必须用 mod.Provider 裹住 View / Toolbar / Panels");
  return v;
};

export function DcProvider({ ctx, children }: { ctx: ViewContext; children: ReactNode }) {
  const { project, store, path: file } = ctx;
  /* 预览模式记在盘上，换稿不重置 —— 用户挑好的看法是长期偏好。
     走 ctx.mem 而不是 localStorage 直接读写：它已经按格式加了命名空间。 */
  const [mode, setModeRaw] = useState<PreviewMode>(() => ctx.mem.get("previewMode", "shell" as PreviewMode));
  const setMode = (m: PreviewMode) => { ctx.setPicked(null); setModeRaw(m); ctx.mem.set("previewMode", m); };
  const [shell, setShell] = useState<ShellState>(SHELL0);
  const [present, setPresent] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const seen = useRef(false);
  /* 档位**记在全局，不按页签分**（设计侧第十一轮 §二.3）：
     评审是一段时间里的工作方式，不是某一份文件的属性。`ctx.mem` 已经按格式加了命名空间。 */
  const [pointer, setPointerRaw] = useState<Pointer>(() => ctx.mem.get("pointer", "pick" as Pointer));
  const setPointer = useCallback((p: Pointer) => { setPointerRaw(p); ctx.mem.set("pointer", p); }, [ctx.mem]);
  const [addrCount, setAddrCount] = useState<number | null>(null);
  const [nudge, setNudge] = useState(0);
  const [commentAt, setCommentAt] = useState<CommentAt | null>(null);
  /* 分派要读当前档位，而消息监听只挂一次 —— 用 ref 取最新值，
     不把 pointer 放进那个 effect 的依赖：重挂监听会漏掉正在飞的消息。 */
  const pointerRef = useRef(pointer); pointerRef.current = pointer;
  /* 稿加载完的节拍。自增数而不是布尔 —— 同一份稿会重载多次（改完、加完地址、手动重载） */
  const [frameTick, setFrameTick] = useState(0);

  const rawSrc = `${project.url}${encodeURIComponent(file).replace(/%2F/g, "/")}`;
  const src = mode === "shell"
    ? `${project.url}${encodeURIComponent("S2-单稿预览壳.dc.html")}?file=${encodeURIComponent(file)}&embed=1`
    : rawSrc;
  const cmd = useCallback((c: string, value?: unknown) => {
    frame.current?.contentWindow?.postMessage({ source: "umbradesign-app", type: "cmd", cmd: c, value }, "*");
  }, []);
  const reload = useCallback(() => {
    seen.current = false;
    if (frame.current) frame.current.src = src;
    if (mode === "code") void store.fetchSource(file);
  }, [src, mode, store, file]);

  useEffect(() => { seen.current = false; setShell(SHELL0); setCommentAt(null); setAddrCount(null); }, [file, mode]);

  /* ── 数这份稿有多少节点地址 ──
     一份稿都没有 = 三档全都点不中，要出提示条（issue #31：用户项目里 29 份稿全是这一类）。
     ⚠️ 不能只在 `load` 时数一次：S2 壳先加载，稿的 iframe 是它渲染出来的，
     `load` 那一刻内层往往还不存在。所以隔一段重试几次，数到就停。 */
  const recount = useCallback(() => {
    let stop = false, tries = 0;
    const tick = () => {
      if (stop) return;
      const n = countNodes(frame.current);
      if (n !== null) { setAddrCount(n); return; }
      if (++tries < 12) setTimeout(tick, 250);
    };
    tick();
    return () => { stop = true; };
  }, []);
  useEffect(() => { if (mode !== "shell") { setAddrCount(null); return; } return recount(); }, [file, mode, recount, frameTick]);
  useEffect(() => { if (mode === "code") void store.fetchSource(file); }, [mode, file, store]);

  // S2 → 应用：选中 / 清除 / 评论变了 / 壳状态
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const m = e.data as { source?: string; type?: string; payload?: Record<string, unknown> };
      if (!m || m.source !== "umbradesign-s2") return;
      if (m.type === "picked" && m.payload) {
        const node = m.payload.node as string;
        const picked = { file: (m.payload.file as string) || file, node, tag: (m.payload.tag as string) || "" };
        ctx.setPicked(picked);
        /* ═══ 按档位分派（设计侧第十一轮 §二.3）═══
           三档共用同一个 `pick` 事件，差别只在**点下去之后去哪** ——
           这正是「一档 + 选中后的动作」做不到的地方：那样每一下都要点两次。 */
        const mode0 = pointerRef.current;
        if (mode0 === "edit") {
          /* 编辑档：属性区**自己打开**。这一步就是用户上一轮没找到的那一步 */
          ctx.ui.openPanel("props");
        } else if (mode0 === "comment") {
          setCommentAt({ node, tag: picked.tag || tagOfNode(frame.current, node), box: boxOfNode(frame.current, node), line: null });
        }
        /* 点选档：只选中 + 出药丸（药丸由工作台按 `picked` 挂），不动属性区 ——
           设计侧明说「属性区开着就跟着换，**关着不去打开**」。 */
      }
      if (m.type === "cleared") { ctx.setPicked(null); setCommentAt(null); }
      if (m.type === "comments-changed") void store.fetchComments(file);
      if (m.type === "shell-state" && m.payload) {
        const p = m.payload as Partial<ShellState>; const first = !seen.current; seen.current = true;
        setShell((s) => ({ ...s, ...p }));
        /* 第一帧且还是默认档时，按详情区的实际宽度自动缩一下 —— 1440 的稿塞进 900 的区里
           不缩的话一进来就是横向滚动条 */
        if (first && p.preset === 0 && (p.zoom === 1 || !p.zoom)) {
          const w = (frame.current?.parentElement?.clientWidth ?? 0) - 24;
          if (w > 0 && w < 1440) cmd("zoom", Math.max(0.3, Math.floor(w / 1440 * 20) / 20));
        }
      }
    };
    window.addEventListener("message", on); return () => window.removeEventListener("message", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, store, cmd]);

  // 落盘 / 回退之后刷新预览
  useEffect(() => {
    const e = store.lastEvent; if (!e || e.type !== "write") return;
    const p = e.payload as { file?: string }; if (p.file === file) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.lastEvent]);

  /* 「重新加载预览」由文件 `⋯` 里那一项触发。走事件是因为 `menu` 是个纯函数、
     拿不到 React context —— 它只能说「要重载」，重载的动作在这里。 */
  useEffect(() => {
    const on = () => reload();
    window.addEventListener("ud-dc-reload", on); return () => window.removeEventListener("ud-dc-reload", on);
  }, [reload]);
  useEffect(() => {
    const on = () => setPresent(true);
    window.addEventListener("ud-dc-present", on); return () => window.removeEventListener("ud-dc-present", on);
  }, []);

  /* ── V / C / E 切档（设计侧第十一轮 §二.3）──
     **不带修饰键**，所以必须看清焦点在哪：在输入框 / contenteditable 上一律让路，
     不然用户在聊天里打「视频」的拼音 v 就把档位切了。
     稿那一层的让路规则由 `installHotkeys` 统一管（`00` §八十一）。 */
  useEffect(() => {
    if (mode !== "shell") return;
    return installHotkeys((e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const hit = POINTERS.find((p) => p.key === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      setPointer(hit.id);
      /* 切档时把没写完的评论框放下 —— 留着它会和新档位的行为叠在一起 */
      if (hit.id !== "comment") setCommentAt(null);
    });
  }, [mode, setPointer]);

  /* 没有地址的稿上点画布：提示条抖一下。
     ⚠️ 这一下不能靠 S2 发消息（它没有「点了但没命中」这种事件），
     所以直接听稿那一层的 click —— 同源才做得到。 */
  useEffect(() => {
    if (mode !== "shell" || addrCount !== 0) return;
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const on = () => setNudge((n) => n + 1);
    doc.addEventListener("click", on, true);
    let innerDoc: Document | null = null;
    try { innerDoc = (doc.querySelector("iframe") as HTMLIFrameElement | null)?.contentDocument ?? null; } catch { /* 跨源就算了 */ }
    innerDoc?.addEventListener("click", on, true);
    return () => { doc.removeEventListener("click", on, true); innerDoc?.removeEventListener("click", on, true); };
  }, [mode, addrCount, file, frameTick]);

  /* 演示全屏归这个模块自己 —— **只有设计稿能演示**，工作台不必替它记一个 state。
     Esc 退出由 `Present` 自己听（它要的是 fullscreenchange，不是 keydown）。 */
  useEffect(() => {
    if (!present) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") setPresent(false); };
    document.addEventListener("keydown", on); return () => document.removeEventListener("keydown", on);
  }, [present]);

  return <Ctx.Provider value={{
    mode, setMode, shell, frame, src, rawSrc, cmd, reload, present, setPresent, file,
    pointer, setPointer, addrCount, noAddr: addrCount === 0, nudge,
    commentAt, closeComment: () => setCommentAt(null), recount: () => { void recount(); },
    onFrameLoad: () => setFrameTick((n) => n + 1),
  }}>{children}</Ctx.Provider>;
}
