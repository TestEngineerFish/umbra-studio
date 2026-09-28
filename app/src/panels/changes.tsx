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
