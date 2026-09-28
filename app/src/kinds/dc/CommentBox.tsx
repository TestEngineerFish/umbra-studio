import { useEffect, useRef, useState } from "react";
import type { ViewContext } from "../context";
import { useDc } from "./bridge";

/** 评论框（设计侧第十一轮 §二.4）：评论档点中一个元素，就贴在它下面。
 *
 *  **两个出口，主次是有理由的**：「暂存」是主按钮（⏎），「发给 AI」是次按钮（⌘⏎）。
 *  设计侧的理由我们照收 —— 评审时通常看完一遍再一起发；暂存随时能撤回，
 *  而发给 AI 会立刻开始改稿、用按量引擎还要花钱。**代价大的那个就多按一个键。**
 *
 *  框里是空的时候两个按钮都不响应。这**不算**「禁用不解释」——
 *  原因就摆在眼前（框是空的），和 issue #31 那种「点了没反应又不说为什么」不是一回事。
 */
const W = 296;

export function CommentBox({ ctx }: { ctx: ViewContext }) {
  const d = useDc();
  const at = d.commentAt;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [line, setLine] = useState<number | null>(null);

  /* 换一个节点就清空重来 —— 上一条没写完的字不该跟到新元素上 */
  useEffect(() => { setText(""); setLine(null); ta.current?.focus(); }, [at?.node]);

  /* 行号是顺带的：头上写「标签 · L17 · 地址」比只写地址好认。
     拿不到就不写这一段，不写「L—」——占位符会让人以为行号是坏的。 */
  useEffect(() => {
    if (!at) return;
    let live = true;
    /* ⚠️ 行号在 `at.line` 里，不是顶层的 `line` —— 第一版写成 `r.data.line`，
       于是框头永远不显示行号，而「没有行号」和「拿不到行号」在界面上长得一样。 */
    void ctx.core.get<{ at?: { line?: number } }>(`locate?file=${encodeURIComponent(d.file)}&node=${encodeURIComponent(at.node)}`)
      .then((r) => { if (live && r.ok && typeof r.data?.at?.line === "number") setLine(r.data.at.line); })
      .catch(() => { /* 定位不到不影响写评论 */ });
    return () => { live = false; };
  }, [at, ctx.core, d.file]);

  if (!at) return null;

  /* 贴在元素下沿 8px、左边对齐；下面放不下就翻到上面（同第九轮的浮层定位规则）。
     拿不到位置（缩放中 / 元素被卸掉）就落到画布左上角，**不因为算不出坐标就不让人写评论**。 */
  const box = at.box;
  const H = 132;
  const below = box ? box.y + box.h + 8 : 72;
  const flip = below + H > window.innerHeight - 8;
  const top = box ? (flip ? Math.max(8, box.y - H - 8) : below) : 72;
  const left = box ? Math.min(Math.max(8, box.x), window.innerWidth - W - 8) : 72;

  const stash = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    /* 行号**存进这条评论**：「全部发给 AI」时要一起给 AI，
       而那会儿节点可能已经被改过、地址都变了（M8-32） */
    const r = await ctx.core.post("comment_add", { file: d.file, node: at.node, tag: at.tag, text: text.trim(), ...(line !== null ? { line } : {}) });
    setBusy(false);
    if (!r.ok) { ctx.ui.toast("存不下这条评论", r.errors?.[0]?.message, "error"); return; }
    void ctx.store.fetchComments(d.file);
    ctx.ui.toast("已暂存", "在聊天输入框上方那一叠里，评完一起发", "ok");
    d.closeComment();
  };
  const toAI = () => {
    if (!text.trim() || busy) return;
    /* 带上节点药丸再问 —— 不带的话 AI 不知道说的是哪个元素 */
    ctx.select("node", { kind: "node", label: at.tag || "节点", detail: `${d.file} · ${at.node}`, ref: { file: d.file, node: at.node } });
    ctx.ask(text.trim());
    d.closeComment();
  };

  return (
    <div data-ud="comment-box" role="dialog" aria-label="写一条评论"
      className="fixed z-40 rounded-lg border border-border bg-panel shadow-2xl anim-pop"
      style={{ left, top, width: W }}
      onMouseDown={(e) => e.stopPropagation()}>
      {/* 头：写清这条评论会挂在哪里 —— 用户要知道他评的是哪个元素 */}
      <div className="h-7 px-2.5 flex items-center gap-1.5 border-b border-border font-mono text-[11px] text-muted">
        <span className="text-accent">◌</span>
        <span className="text-text2">{at.tag || "节点"}</span>
        {line !== null && <><span>·</span><span>L{line}</span></>}
        <span>·</span><span className="truncate" title={at.node}>{at.node.slice(0, 8)}</span>
      </div>
      <textarea ref={ta} rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus
        placeholder="这里哪儿不对？"
        className="w-full px-2.5 py-2 bg-transparent outline-none text-xs resize-none leading-relaxed"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); d.closeComment(); return; }
          /* ⏎ 暂存、⌘⏎ 发给 AI；Shift+⏎ 换行（写两句话是常事） */
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toAI(); return; }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void stash(); }
        }} />
      <div className="h-8 px-2 flex items-center gap-1.5 border-t border-border">
        <button className="h-6 px-2 rounded text-[11px] text-muted hover:text-text hover:bg-hover" onClick={() => d.closeComment()}>取消</button>
        <span className="flex-1" />
        <button disabled={!text.trim() || busy} onClick={toAI} title="发给 AI，让它照这条改（⌘⏎）"
          className="h-6 px-2 rounded text-[11px] border border-border text-text2 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed">
          发给 AI ⌘⏎
        </button>
        <button disabled={!text.trim() || busy} onClick={() => void stash()} title="先存下来，评审完一起发（⏎）"
          className="h-6 px-2.5 rounded text-[11px] bg-accent text-onAccent font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? "存…" : "暂存 ⏎"}
        </button>
      </div>
    </div>
  );
}
