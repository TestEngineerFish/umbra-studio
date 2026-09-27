import { useEffect, useMemo, useState } from "react";
import type { Core } from "../api/client";
import { Glyph } from "../ui/Glyph";
import { Detail } from "./Detail";
import { Installed } from "./Installed";
import { Credits } from "./Credits";
import type { InstalledRow, MarketRow } from "./types";

/** 插件市场（M11-6 接线，形制 `ui/S17-插件市场.dc.html`）。
 *
 *  设计侧定的放法：**在详情区当一个页签打开，不单开窗口** ——
 *  「用户买完装完，要立刻回到刚才那份文件里看效果」。
 *
 *  ⚠️ 买和付**接成明确的未启用态**，不做成看起来能用但点了没反应：
 *  账号（微信 / Apple / Umbra）和支付都还没做，积分余额是假的。
 *  哪些是真的：已装列表、版本切换、卸载、未签名、权限展示 —— 那几条技术侧跑通了。
 */
export function Market({ core, onClose }: { core: Core; onClose: () => void }) {
  const [tab, setTab] = useState<"market" | "installed" | "credits">("market");
  const [rows, setRows] = useState<MarketRow[] | null>(null);
  const [installed, setInstalled] = useState<InstalledRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const reload = () => {
    void core.get<{ plugins: MarketRow[] }>("market").then((r) => setRows(r.data?.plugins ?? []));
    void core.get<{ plugins: InstalledRow[] }>("plugins").then((r) => setInstalled(r.data?.plugins ?? []));
  };
  useEffect(reload, [core]);
  /* 装 / 切版本 / 卸完服务端会发 `plugin` 事件，列表要跟着变 */
  useEffect(() => core.events((e) => { if (e.type === "plugin") reload(); }), [core]);

  const hasUnsigned = (installed ?? []).some((x) => x.unsigned);
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) for (const k of r.kinds) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!kind || r.kinds.includes(kind)) &&
      (!kw || r.name.toLowerCase().includes(kw) || r.formats.some((f) => f.toLowerCase().includes(kw))));
  }, [rows, kind, q]);

  const open = openId ? (rows ?? []).find((r) => r.id === openId) ?? null : null;

  return (
    <div data-ud="market" className="flex-1 min-w-0 flex flex-col bg-bg min-h-0">
      {/* 页签条 36 · 右端常驻余额（设计侧：不上顶栏 —— 顶栏是窗口级的布局开关） */}
      <div className="h-9 px-3 flex items-center gap-1 border-b border-border bg-panel shrink-0 text-xs">
        {([["market", "市场", 0], ["installed", "已装", (installed ?? []).length], ["credits", "积分", 0]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => { setTab(k); setOpenId(null); }}
            className={`relative h-7 px-3 rounded-t ${tab === k ? "text-text font-semibold" : "text-muted hover:text-text"}`}>
            {label}{n ? <span className="ml-1.5 text-muted tabular-nums">{n}</span> : null}
            {/* 有未签名插件时「已装」上挂一个红点 —— 不打开那一页也知道（设计侧 §三.3） */}
            {k === "installed" && hasUnsigned && <span className="absolute top-1 right-0.5 w-1.5 h-1.5 rounded-full bg-err" />}
            {tab === k && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent rounded-full" />}
          </button>
        ))}
        <span className="flex-1" />
        {/* ⚠️ 余额是**假的** —— 没有账号就没有余额。标出来，别让它看着像真的 */}
        <button onClick={() => setTab("credits")} title="积分还没接（账号与支付未做）"
          className="h-7 px-2 rounded flex items-center gap-1.5 text-muted hover:text-text hover:bg-hover">
          <Glyph icon="coin" size={13} /><span className="font-mono tabular-nums">—</span><span>积分</span>
        </button>
        <button className="ib" onClick={onClose} title="关闭">×</button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "installed" ? <Installed core={core} rows={installed} onChanged={reload} />
          : tab === "credits" ? <Credits />
          : open ? <Detail row={open} onBack={() => setOpenId(null)} />
          : (
            <div className="max-w-[1100px] mx-auto px-8 py-6">
              <h1 className="text-lg font-semibold">插件市场</h1>
              {/* 这一句空态也在 —— 第一次进来的人先读到的就该是它（设计侧 §一.3） */}
              <div className="mt-2 flex items-start gap-2 text-xs text-text2 leading-relaxed">
                <span className="text-ok shrink-0 mt-0.5"><Glyph icon="sandbox" size={13} /></span>
                <span>每个插件都跑在沙箱里：读写文件要经过 Umbra，出不了当前项目。它要什么权限，装之前会摆给你看。</span>
              </div>

              <div className="mt-5 flex items-center gap-2 flex-wrap">
                <Chip on={!kind} onClick={() => setKind(null)} label="全部" n={(rows ?? []).length} />
                {kinds.map(([k, n]) => <Chip key={k} on={kind === k} onClick={() => setKind(k)} label={k} n={n} />)}
                <span className="flex-1" />
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"><Glyph icon="search" size={12} /></span>
                  {/* 按扩展名找是最常见的来路：打开一个文件打不开，想知道有没有插件（设计侧 §一.1） */}
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按扩展名找，比如 .mp4"
                    className="h-8 w-[230px] pl-7 pr-2 rounded border border-border bg-panel outline-none focus:border-accent text-xs" />
                </div>
              </div>

              {rows === null ? <div className="mt-8 text-muted text-xs">读取中…</div>
                : shown.length === 0 ? <Empty hasAny={(rows ?? []).length > 0} q={q} kind={kind}
                    onClear={() => { setQ(""); setKind(null); }} onInstalled={() => setTab("installed")} />
                : (
                  <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                    {shown.map((r) => <Card key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
                  </div>
                )}
            </div>
          )}
      </div>
    </div>
  );
}

const Chip = ({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) => (
  <button onClick={onClick}
    className={`h-7 px-3 rounded-full border text-xs flex items-center gap-1.5 ${
      on ? "border-accent bg-accentSoft text-accent font-semibold" : "border-border bg-panel text-text2 hover:text-text"}`}>
    {label}<span className="tabular-nums opacity-70">{n}</span>
  </button>
);

/** 卡片右上角那个状态，四选一。**价格只挂在没买的上** ——
 *  买过的再写价格，用户会以为还要付（设计侧 §一.2）。 */
function statusOf(r: MarketRow): { text: string; cls: string } {
  if (r.state === "builtin") return { text: "内置", cls: "text-muted" };
  if (r.state === "installed") return { text: `已装 ${r.installedVersion ?? r.version}`, cls: "text-ok font-semibold" };
  if (r.state === "bought") return { text: "已购 · 未装", cls: "text-text2" };
  return { text: `${r.price} 积分`, cls: "text-text font-semibold" };
}

const Card = ({ r, onOpen }: { r: MarketRow; onOpen: () => void }) => {
  const st = statusOf(r);
  return (
    <button onClick={onOpen} data-ud="market-card"
      className="text-left rounded-lg border border-border bg-panel hover:border-borderStrong p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded grid place-items-center bg-panel2 text-text2 shrink-0"><Glyph icon="plugin" size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{r.name}</div>
          <div className="text-[11px] text-muted truncate">{r.author} · {r.version}</div>
        </div>
        <div className={`text-xs shrink-0 flex items-center gap-1 ${st.cls}`}>
          {r.hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-accent" title="有新版本" />}
          {st.text}
        </div>
      </div>
      <div className="text-xs text-text2 leading-relaxed">{r.brief}</div>
      <div className="flex flex-wrap gap-1.5">
        {r.formats.map((f) => <span key={f} className="px-1.5 h-5 grid place-items-center rounded bg-panel2 font-mono text-[11px] text-text2">{f}</span>)}
      </div>
    </button>
  );
};

const Empty = ({ hasAny, q, kind, onClear, onInstalled }: {
  hasAny: boolean; q: string; kind: string | null; onClear: () => void; onInstalled: () => void;
}) => (
  <div className="mt-10 max-w-[520px] text-xs leading-relaxed">
    {hasAny ? <>
      <div className="font-semibold text-sm">没有插件认领 {q.trim() || kind}</div>
      <button className="btn sm mt-3" onClick={onClear}>清掉筛选</button>
    </> : <>
      <div className="font-semibold text-sm">市场里还没有可买的插件</div>
      <p className="text-text2 mt-2">现在能用的是内置的 Markdown 编辑。新插件上架后会出现在这里，<b className="text-text">不用更新 Umbra</b>。</p>
      <button className="btn sm mt-3" onClick={onInstalled}>看已装的</button>
    </>}
  </div>
);
