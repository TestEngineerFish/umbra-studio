import { timeAgo, type Picked } from "../api/types";
import type { ViewContext } from "../kinds/context";
import { toast } from "../ui/Toast";
import { definePanel } from "./registry";

/** 评论列表（M8-17 搬出来）。
 *  **这一页是「这份稿全部评论的列表」，不是写评论的地方**（设计侧第十一轮 §二.5）——
 *  写评论在评论档、元素下面那张框里。 */
function Body({ ctx }: { ctx: ViewContext }) {
  const { core, store, path: file } = ctx;
  const onSendToAI = (text: string, picked: Picked) => { ctx.setPicked(picked); ctx.ask(text); };
  const upd = async (id: string, resolved: boolean) => { const r = await core.post("comment_update", { id, resolved }); if (!r.ok) toast("更新评论失败", r.errors?.[0]?.message, "error"); void store.fetchComments(file); };
  const del = async (id: string) => { const r = await core.post("comment_delete", { id }); if (!r.ok) toast("删除评论失败", r.errors?.[0]?.message, "error"); void store.fetchComments(file); };
  /* ⚠️ 这句空态文案一度是**过期的**：原来写「开『点选』选中一个节点，属性面板底部可以留一句话」——
     而 M8-31 之后写评论的地方是**评论档 + 元素下面那张框**，属性面板底部早就没有输入框了。
     照着过期文案找不到入口，和「点了没反应」是同一类伤害。 */
  if (!store.comments.length) return <div className="p-4 text-muted leading-relaxed">这份稿还没有评论。<br />在编辑栏切到 <b className="text-text2">评论</b> 档（或按 <b className="text-text2">C</b>），点稿里的元素就能写。</div>;
  return <ul className="divide-y divide-border">{store.comments.map((c) => <li key={c.id} className={`px-3 py-2 flex flex-col gap-1 ${c.resolved ? "opacity-60" : ""}`}><div className="flex items-center gap-2">{/* 三态分清（M8-32）：已处理 / 已发给 AI 还没处理 / 还在暂存。
     `sentAt` 和 `resolved` 是两个维度，混成一个标签的话「发过了」会被读成「改好了」。 */}
<span className={`lvl ${c.resolved ? "info" : c.sentAt ? "info" : "warning"}`}>{c.resolved ? "已处理" : c.sentAt ? "已发给 AI" : "暂存"}</span><span className="font-mono text-muted truncate" title={c.node}>{c.tag ? `<${c.tag}>` : ""} {c.node}</span><span className="flex-1" /><span className="text-muted">{timeAgo(c.createdAt)}</span></div><div className={c.resolved ? "line-through" : ""}>{c.text}</div><div className="flex gap-1">{!c.resolved && <button className="btn sm" onClick={() => { void core.post("comment_update", { id: c.id, sent: true }).then(() => store.fetchComments(file)); onSendToAI(c.text, { file: c.file, node: c.node, tag: c.tag ?? "" }); }} title="单独把这一条连同节点地址发给 AI">发给 AI</button>}<button className="btn sm ghost" onClick={() => void upd(c.id, !c.resolved)}>{c.resolved ? "恢复" : "已处理"}</button><button className="btn sm ghost" onClick={() => void del(c.id)}>删除</button></div></li>)}</ul>;
}

definePanel({
  id: "comments", icon: "✎", title: "评论",
  badge: (ctx) => ctx.store.comments.filter((c) => !c.resolved).length,
  Body,
});
