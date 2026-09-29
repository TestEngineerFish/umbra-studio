import { useState } from "react";
import type { ViewContext } from "../kinds/context";
import { toast } from "../ui/Toast";
import { definePanel } from "./registry";

/** 变更与版本历史（M8-17 搬出来）。
 *  回退是这里唯一的写操作 —— 它走的是产品自己的 `revert`，不是直接改文件。 */
function Body({ ctx }: { ctx: ViewContext }) {
  const { core, store, path: file } = ctx;
  const [busy, setBusy] = useState<string | null>(null);
  const c = store.changes;
  if (!c) return <div className="p-4 text-muted">正在读…</div>;
  const versions = (c.versions ?? []).slice().reverse();
  const revert = async (v: string) => {
    /* **回退会覆盖盘上的文件**，所以有没落盘的改动要先问一句 ——
       这是 S18 §一.1 那张卡数出来的第三种触发（设计侧管它叫「切快照」）。
       没改动时 `confirmLeave` 同步放行，所以平时一点感觉都没有。

       ⚠️ **这条路今天到不了，接闸是为了它到得了的那天**，别把它当成修了个活缺陷：
       `changes` 面板只挂在 `.dc.html` 上（`kinds/dc/index.tsx`），而 `dirtyStore`
       只有插件会上报（`kinds/plugin/Surface.tsx`）—— **能回退的类型不会脏，
       会脏的类型没有这颗按钮**。两边任意一边变了（代码文件有了版本历史、
       或者 dc 开始上报未落盘），这一行立刻生效。 */
    if (!(await ctx.ui.confirmLeave(file))) return;
    setBusy(v);
    const r = await core.post<{ write?: { version?: string } }>("revert", { file, version: v });
    if (r.ok) { toast(`已退回 ${v}`, `历史不删，${r.data?.write?.version ?? "新一版"} 是回退版`, "ok"); void store.fetchChanges(file); void store.fetchDrafts(); } else toast("回退失败", r.errors?.[0]?.message, "error");
    setBusy(null);
  };
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 text-[11px] text-muted border-b border-border">最新一版与上一版的语义差异</div>
      {c.diff?.changes?.length ? <ul className="divide-y divide-border">{c.diff.changes.map((x, i) => <li key={i} className="px-3 py-2 flex gap-2"><span className="lvl info">{x.level ?? "变更"}</span><span className="font-mono text-muted">{x.at}</span><span className="flex-1">{x.message ?? `${x.target ?? ""} ${x.kind ?? ""}`.trim()}</span></li>)}</ul> : <div className="p-3 text-muted">只有一版，或还没有快照</div>}
      <div className="px-3 py-2 text-[11px] text-muted border-y border-border">版本历史 · {versions.length} 版</div>
      <ul className="divide-y divide-border">{versions.map((v, i) => { const m = c.versionMeta?.[v] ?? {}; return <li key={v} className="px-3 py-2 flex items-center gap-2"><span className="font-mono font-semibold">{v}</span><span className="text-muted">{m.src ?? ""}</span><span className="text-muted">{m.time ?? ""}</span><span className="flex-1 min-w-0 truncate text-text2" title={m.summary}>{m.summary ?? m.note ?? ""}</span>{i === 0 ? <span className="text-accent font-semibold">当前</span> : <button className="btn sm" disabled={!!busy} onClick={() => void revert(v)}>{busy === v ? "…" : "回退"}</button>}</li>; })}</ul>
    </div>
  );
}

definePanel({
  id: "changes", icon: "⟲", title: "变更",
  Body,
});
