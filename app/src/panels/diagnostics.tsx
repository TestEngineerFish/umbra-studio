import type { ViewContext } from "../kinds/context";
import { definePanel } from "./registry";

/** 诊断面板（M8-17 从 `SidePanels` 的第二条分叉搬出来）。
 *  角标只数 error / warning —— info 级不该让图标上挂个数字催人去看。 */
function Body({ ctx }: { ctx: ViewContext }) {
  const store = ctx.store;
  if (!store.diags.length) return <div className="p-4 text-muted">暂无诊断 · 点「体检」跑一次 render_check</div>;
  return <ul className="divide-y divide-border">{store.diags.map((d, i) => <li key={i} className="px-3 py-2 flex flex-col gap-1"><div className="flex items-center gap-2"><span className={`lvl ${d.level}`}>{d.level}</span><span className="font-mono text-muted">{d.code}</span><span className="flex-1" />{d.line != null && <span className="font-mono text-muted">L{d.line}{d.col != null ? `:${d.col}` : ""}</span>}</div><div className="leading-relaxed">{d.message}</div>{d.fix && <div className="text-muted leading-relaxed">改法：{d.fix}</div>}</li>)}</ul>;
}

definePanel({
  id: "diagnostics", icon: "⚠", title: "诊断", badgeWarn: true,
  badge: (ctx) => ctx.store.diags.filter((d) => d.level === "error" || d.level === "warning").length,
  Body,
});
