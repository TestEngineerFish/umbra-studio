import { useState } from "react";
import type { Comment } from "../api/types";

/** 暂存的评论（M8-32 · 设计侧第十一轮 §二.5）。
 *
 *  **为什么放在聊天输入框上方，而不是属性区里**：设计侧的理由 ——
 *  暂存的东西最后都要交给 AI，放在发送键旁边，用户一直看得见「还有 2 条没发」。
 *  放进属性区就又变成上一轮那个病：一个默认收起的抽屉里躺着待办，谁都不知道。
 *
 *  ⚠️ **不按当前文件过滤**：评审是跨文件的，每条自己带着文件路径。
 *
 *  「全部发给 AI」合成**一条**消息（不是一条一轮）—— agent 循环每一步都要重发
 *  工具表 + 系统提示 + 全部历史，五条评论发五轮就是五倍的钱（`CLAUDE.md` 那条读数）。
 */
export function Stash({ stash, currentFile, running, onSendAll, onDrop, onLocate }: {
  stash: Comment[];
  /** AI 正在跑 —— 这颗钮要停手。
   *  ⚠️ 不防的话快点两次就发两轮，而 agent 循环每轮都要重发全部历史：**两倍的钱**。
   *  `chat.send` 已经不被 await 了（标记挂在「作业起成功」那一刻），所以这里必须自己防。 */
  running: boolean;
  /** 当前打开的文件 —— 别的文件的评论要把文件名写出来，不然「标题再大一号」说的是哪份稿都不知道 */
  currentFile: string | null;
  onSendAll: () => void | Promise<void>;
  onDrop: (id: string) => void;
  onLocate: (c: Comment) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!stash.length) return null;
  return (
    <div data-ud="stash" className="px-3 pb-2 shrink-0">
      <div className="rounded border border-border bg-panel2">
        <div className="h-7 px-2 flex items-center gap-2 border-b border-border">
          <span className="text-[11px] font-semibold">暂存的评论 {stash.length}</span>
          <span className="flex-1" />
          <button data-ud="stash-send" className="h-5 px-2 rounded text-[11px] bg-accent text-onAccent font-semibold disabled:opacity-40"
            disabled={busy || running}
            title={running ? "AI 正在跑这一轮，等它结束再发" : "合成一条消息发给 AI（每条都带文件、节点地址、行号和原文）"}
            onClick={async () => { setBusy(true); try { await onSendAll(); } finally { setBusy(false); } }}>
            {busy ? "发…" : "全部发给 AI"}
          </button>
        </div>
        <ul className="max-h-40 overflow-auto">
          {stash.map((c, i) => (
            <li key={c.id} data-ud="stash-row" className="px-2 py-1 flex items-center gap-1.5 text-[11px] hover:bg-hover">
              {/* 编号和画布上那枚钉子对得上 —— 用户在画布上看到 ②，这里就能找到 ② */}
              <button onClick={() => onLocate(c)} title="在画布上找到它"
                className="w-4 h-4 shrink-0 grid place-items-center rounded-full bg-accent text-onAccent text-[9px] font-semibold">{i + 1}</button>
              <span className="font-mono text-muted shrink-0">{c.tag ? `<${c.tag}>` : "节点"}</span>
              {c.file !== currentFile && <span className="text-muted shrink-0 truncate max-w-[84px]" title={c.file}>{c.file.split("/").pop()}</span>}
              <span className="flex-1 min-w-0 truncate" title={c.text}>{c.text}</span>
              <button onClick={() => onDrop(c.id)} title="丢掉这条（不发了）"
                className="w-4 h-4 shrink-0 grid place-items-center rounded text-muted hover:text-err hover:bg-hover">×</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 把暂存的评论合成**一条**消息。每条带文件、节点地址、行号和原文（设计侧 §二.5）。
 *  行号是写评论那一刻存下来的，可能已经不准 —— 所以写成「约」，不让 AI 当成硬坐标。 */
export function composeStash(stash: Comment[]): string {
  const lines = stash.map((c, i) => {
    const where = [c.file, c.tag ? `<${c.tag}>` : null, c.line ? `约第 ${c.line} 行` : null, `节点 ${c.node}`].filter(Boolean).join(" · ");
    return `${i + 1}. ${where}\n   ${c.text}`;
  });
  return `照这 ${stash.length} 条评论改（每条都给了文件和节点地址，改哪一处按地址找）：\n\n${lines.join("\n\n")}`;
}
