import { Glyph } from "../ui/Glyph";
import { permRows, type MarketRow } from "./types";

/** 插件详情（形制 `ui/S17` 演示态 4–7）。
 *
 *  两条设计侧定死的：
 *  **① 权限摆在购买按钮正上方** —— 手移到按钮上时，眼睛正好扫过权限。
 *  **② 不允许的也要列出来** —— 「让人敢装的是它**做不了什么**」。
 *     `⊘` 用 muted 不用红：**不允许不是危险，是被关住了**。
 *
 *  ⚠️ 买和付**没接**（账号 / 支付 / 积分都还没做）。按钮接成明确的未启用态，
 *  不做成看起来能用但点了没反应 —— 那比没有按钮更糟。
 */
export function Detail({ row, onBack }: { row: MarketRow; onBack: () => void }) {
  const perms = permRows(row.permissions);
  const tools = row.tools ?? [];
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
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-muted">一次买断</span>
                  <span className="text-sm font-semibold tabular-nums">{row.price} 积分</span>
                </div>
                {/* ⚠️ **明确的未启用态**：账号和支付都没做。
                    做成能点但点了没反应，比做成灰的更糟 —— 用户会以为是坏了。 */}
                <button disabled className="btn primary w-full opacity-60 cursor-not-allowed" data-ud="market-act"
                  title="购买还没接：账号与支付未做">购买并安装 · {row.price} 积分</button>
                <p className="text-[11px] text-warn mt-2 leading-relaxed">
                  <b>购买还没接通</b> —— 账号（微信 / Apple / Umbra）和支付还在做。
                  现在能用的是内置插件；本地装包可以走命令行。
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
