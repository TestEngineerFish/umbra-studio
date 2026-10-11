import { useState } from "react";
import type { Core } from "../api/client";
import { Glyph } from "../ui/Glyph";
import { toast } from "../ui/Toast";
import { permRows, type AcquireResult, type MarketRow } from "./types";

/** 插件详情（形制 `ui/S17` 演示态 4–7）。
 *
 *  两条设计侧定死的：
 *  **① 权限摆在购买按钮正上方** —— 手移到按钮上时，眼睛正好扫过权限。
 *  **② 不允许的也要列出来** —— 「让人敢装的是它**做不了什么**」。
 *     `⊘` 用 muted 不用红：**不允许不是危险，是被关住了**。
 *
 *  买和装（2026-10-11 接上）：两颗钮都走 `acquire_plugin` —— 已有授权跳过购买 → 用积分买 → 取许可证 →
 *  有安装包就装。没登录时钮改「登录后购买」跳设置页；回包每一步都有，「买了没装上」照实说。
 */
export function Detail({ core, row, signedIn, onBack, onChanged, onSettings }: {
  core: Core; row: MarketRow; signedIn: boolean; onBack: () => void; onChanged?: () => void; onSettings?: () => void;
}) {
  const perms = permRows(row.permissions);
  const tools = row.tools ?? [];
  const [busy, setBusy] = useState(false);

  const acquire = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await core.post<AcquireResult>("plugin_acquire", { id: row.id });
      const d = out.data;
      if (!out.ok) {
        const e = out.errors?.[0];
        /* 买成了但后面某一步没过：标题要说「已购买」，不然用户会再买一次 */
        toast(d?.bought ? "已购买，但没装上" : d?.licensed ? "已授权，但没装上" : "没拿到", e?.message, "error");
      } else if (d?.installed) {
        toast(`${row.name} 已安装${d.version ? " " + d.version : ""}`, d.note || "立刻生效，不用重启", "ok");
      } else {
        toast(`${row.name} 已授权`, d?.note || "发布方还没放安装包", "warn");
      }
      onChanged?.();
    } finally { setBusy(false); }
  };
  const buyLabel = (text: string) => !signedIn ? "登录后购买" : busy ? "处理中…" : text;
  const onBuy = () => { if (!signedIn) { onSettings?.(); return; } void acquire(); };
  return (
    <div data-ud="market-detail" className="max-w-[1100px] mx-auto px-8 py-6">
      <button className="text-xs text-muted hover:text-text flex items-center gap-1" onClick={onBack}>
        <Glyph icon="chevron-left" size={12} />市场
      </button>

      <div className="mt-5 flex items-start gap-4">
        <span className="w-12 h-12 rounded-lg grid place-items-center bg-panel2 text-text2 shrink-0"><Glyph icon="plugin" size={20} /></span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{row.name}</h1>
          <div className="text-xs text-muted mt-0.5">
            {[row.author, row.version, row.size, row.updated && `${row.updated}更新`].filter(Boolean).join(" · ")}
          </div>
          <div className="text-xs text-text2 mt-2">{row.brief}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] text-muted">认领</span>
            {row.formats.map((f) => <span key={f} className="px-1.5 h-5 grid place-items-center rounded bg-panel2 font-mono text-[11px] text-text2">{f}</span>)}
          </div>
        </div>
      </div>

      {/* 窄窗时右栏排到说明前面，还是先看见权限（设计侧：`row-reverse` 换行） */}
      <div className="mt-6 flex flex-wrap-reverse gap-6 items-start">
        <div className="flex-1 min-w-[340px]">
          {/* AI 能力排在截图前面：A 面截图一看就懂，**B 面才需要讲**（设计侧 §二.4） */}
          {tools.length > 0 && <section>
            <h2 className="text-sm font-semibold">AI 多了哪些能力</h2>
            <p className="text-xs text-muted mt-1">装上以后，会话里的 AI 改 {row.formats.join(" / ")} 时会用这{tools.length === 2 ? "两" : tools.length === 3 ? "三" : tools.length}件事。</p>
            <div className="mt-3 rounded-lg border border-border overflow-hidden">
              {tools.map((t, i) => (
                <div key={t.id} className={`px-4 py-3 ${i ? "border-t border-border" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-xs">{t.name}</span>
                    <span className="font-mono text-[11px] text-muted">{t.id}</span>
                  </div>
                  {/* 每一句都在说「只」：B 面的价值就是范围小（设计侧原话） */}
                  <div className="text-xs text-text2 mt-1">{t.desc}</div>
                </div>
              ))}
              {/* ⚠️ 那道「读写账」**还没接** —— 它要按用户项目里最大的同格式文件算，
                  而插件清单里的 `sample` 现在只有内置那一个有。先如实说，不拿样例充数
                  （设计侧 §五.1 就是这么要求的）。 */}
              <div className="px-4 py-3 border-t border-border bg-panel2 text-xs text-muted leading-relaxed">
                装上之后这里会按**你项目里最大的** {row.formats[0]} 算一笔账：
                没有这个插件 AI 要读写多少、装了之后只动多少。
                <span className="text-text2"> 现在还没接 —— 要先让插件声明示例任务。</span>
              </div>
            </div>
          </section>}
        </div>

        {/* ═══ 右栏：权限 + 价格 + 按钮。**权限在按钮正上方** ═══ */}
        <aside className="w-[320px] shrink-0 rounded-lg border border-border bg-panel">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-ok"><Glyph icon="sandbox" size={14} /></span>它能碰什么
            </div>
            <div className="mt-3 grid gap-3">
              {perms.map((p) => (
                <div key={p.label} className="flex items-start gap-2">
                  <span className={`shrink-0 mt-0.5 ${p.allow ? "text-ok" : "text-muted"}`}>
                    <Glyph icon={p.allow ? "check" : "deny"} size={13} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs">{p.label}</div>
                    <div className="text-[11px] text-muted mt-0.5 leading-relaxed">{p.note}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded bg-panel2 px-3 py-2 text-[11px] text-text2 leading-relaxed">
              界面和逻辑各关在一个隔间里。它碰文件的每一下都要经过 Umbra，碰不到项目以外的地方，也碰不到别的插件。
            </div>
          </div>

          <div className="border-t border-border p-4">
            {row.state === "builtin" ? (
              <>
                <button disabled className="btn w-full" data-ud="market-act">内置 · 已安装</button>
                <p className="text-[11px] text-muted mt-2">Umbra 自带，免费且卸不掉。</p>
              </>
            ) : row.state === "installed" ? (
              <>
                <button disabled className="btn w-full" data-ud="market-act">已安装 {row.installedVersion}</button>
                <p className="text-[11px] text-muted mt-2">切版本、更新、卸载都在「已装」里。</p>
              </>
            ) : row.gift ? (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-muted">会员赠送</span>
                  <span className="text-sm font-semibold text-accent">随会员</span>
                </div>
                {/* 赠送的也要「装」：许可证随会员到期（草案 §3.5）。走 acquire：不买，取许可证，有包就装 */}
                <button className="btn primary w-full" data-ud="market-act" disabled={busy} onClick={onBuy}>
                  {buyLabel("安装 · 随会员免费")}</button>
                <p className="text-[11px] text-muted mt-2 leading-relaxed">
                  你的会员档随会员赠送这个插件，有效期到会员到期日。{!row.package_url && "发布方还没放安装包，现在只能先领授权。"}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-muted">一次买断</span>
                  <span className="text-sm font-semibold tabular-nums">{row.price} 积分</span>
                </div>
                <button className="btn primary w-full" data-ud="market-act" disabled={busy}
                  onClick={() => {
                    if (!signedIn) { onSettings?.(); return; }
                    if (row.price > 0 && !window.confirm(`用 ${row.price} 积分买下「${row.name}」？买断，含后续所有版本更新。`)) return;
                    void acquire();
                  }}>
                  {buyLabel(row.price > 0 ? `购买并安装 · ${row.price} 积分` : "免费安装")}</button>
                <p className="text-[11px] text-muted mt-2 leading-relaxed">
                  {signedIn ? "一次买断，含后续所有版本更新；积分不够时会提示去充值。" : "先在设置里登录 Umbra 账号；积分和会员在 Umbra 账号页。"}
                  {!row.package_url && " 发布方还没放安装包，现在买到的是授权，包放上后再点一次「安装」。"}
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
