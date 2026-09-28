import { PANEL_TITLE, type PanelId } from "../layout/layout";
import type { ViewContext } from "../kinds/context";
import { panelDef } from "../panels";

/** 从属面板列的**壳**（S11 第 1 题的定稿）：40px 图标轨常驻 + 面板体，同一时刻只开一个。
 *
 *  ⚠️ **这个文件现在不认识任何具体面板**（M8-17）。原来它是五条
 *  `active === "props" && <PropsPanel core={…} file={…} picked={…} …/>` 的分叉，
 *  每个面板的 props 各不相同，加一个面板要改三处（这里 + 标题表 + 图标查表）。
 *  那正是 M8-14 之前格式层的同一个病 —— 那一轮的结论是
 *  **「工作台只提供能力，不认识任何具体的东西」**，面板这一层当时没跟上。
 *
 *  现在：一个面板 = `panels/` 下一个文件（`PanelDef`），这里只负责
 *  「排图标轨 · 开合 · 窄窗变抽屉 · 把 `ctx` 递进去」。
 *  插件带来的面板也走同一条路（查不到 def 就只画图标，不会漏画）。
 */
export const PANEL_WIDTH = 340;

export function SidePanels({ ctx, panels, active, setActive, narrow }: {
  ctx: ViewContext;
  panels: PanelId[];
  active: PanelId | null;
  setActive: (p: PanelId | null) => void;
  /** 详情区窄到要让位了（R5）：面板体改成浮在正文上的抽屉 */
  narrow: boolean;
}) {
  const badgeOf = (id: PanelId): number => panelDef(id)?.badge?.(ctx) ?? 0;
  const def = active ? panelDef(active) : undefined;
  const body = active && (
    <section className={`bg-panel border-border flex flex-col min-h-0 ${narrow ? "fixed top-[86px] bottom-6 right-10 z-40 w-[320px] shadow-2xl border-l" : "shrink-0 border-l"}`}
      style={narrow ? undefined : { width: PANEL_WIDTH }}>
      <header className="h-9 px-3 flex items-center gap-2 border-b border-border text-xs font-semibold shrink-0">
        {def?.title ?? PANEL_TITLE[active]}
        {badgeOf(active) ? <span className="badge">{badgeOf(active)}</span> : null}
        <span className="flex-1" />
        <button className="ib" onClick={() => setActive(null)} title="收起">›</button>
      </header>
      <div className="flex-1 min-h-0 overflow-auto text-xs">
        {/* 查不到 def = 插件注册的面板还没到，或者 id 写错了。
            **明说而不是空白** —— 空白会被读成「这个面板是空的」。 */}
        {def ? <def.Body ctx={ctx} /> : <div className="p-4 text-muted">这个面板还没准备好（{active}）</div>}
      </div>
    </section>
  );
  return (
    <>
      {narrow && active && <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setActive(null)} />}
      {body}
      <nav className="relative z-40 w-10 shrink-0 border-l border-border bg-panel flex flex-col items-center py-1 gap-0.5">
        {panels.map((p) => {
          const d = panelDef(p);
          const n = badgeOf(p);
          return (
            <button key={p} className={`relative w-8 h-8 rounded grid place-items-center text-sm ${active === p ? "bg-accentSoft text-accent" : "text-muted hover:text-text hover:bg-hover"}`}
              onClick={() => setActive(active === p ? null : p)} title={d?.title ?? PANEL_TITLE[p]}>
              {/* 插件带来的面板查不到图标就用通用符号 —— 不会漏画 */}
              {d?.icon ?? "▤"}
              {n ? <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-semibold text-onAccent grid place-items-center ${d?.badgeWarn ? "bg-warn" : "bg-accent"}`}>{n}</span> : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}
