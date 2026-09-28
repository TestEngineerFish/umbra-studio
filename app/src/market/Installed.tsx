import { useEffect, useState } from "react";
import type { Core } from "../api/client";
import { Glyph } from "../ui/Glyph";
import { PopItem, PopSep, Popover, usePopover } from "../ui/Popover";
import { toast } from "../ui/Toast";
import type { InstalledRow } from "./types";

/** 已装插件（形制 `ui/S17` 演示态 8–10）。**这一屏接的是真数据。**
 *
 *  设计侧定的两条：
 *  **① 回退的按钮要在更新之前就看得见** —— 「鼓励更新」靠这个，不是靠文案劝。
 *  **② 未签名要显眼，三处**：顶部横幅 · 那一行的底色 · 页签上的红点。
 */
export function Installed({ core, rows, onChanged, clockBack }: {
  core: Core; rows: InstalledRow[] | null; onChanged: () => void;
  /** 系统时间被调回去过（M11-12 的单调高水位发现的） */
  clockBack?: boolean;
}) {
  const unsigned = (rows ?? []).filter((x) => x.unsigned);
  return (
    <div className="max-w-[900px] mx-auto px-8 py-6">
      <h1 className="text-lg font-semibold">已装插件</h1>
      <p className="text-xs text-text2 mt-2 leading-relaxed">
        旧版本装过就留在本机。<b className="text-text">切版本不用重新下载，立刻生效</b> ——
        所以放心更新：出了问题切回上一版就行。
      </p>

      {/* 时钟回拨：**必须说出来**。不说的话用户看到「已过期」只会觉得是我们的 bug，
          而真正的原因是他的系统时间被调回去了 —— 我们判的是「见过的最晚时间」。
          ⚠️ 语气不要像在指控：多数情况是换时区、装系统、虚拟机快照，不是有人想白用。 */}
      {clockBack && (
        <div data-ud="clock-banner" className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed"
          style={{ background: "var(--tool-warn-soft)", border: "1px solid var(--tool-warn)" }}>
          <div className="font-semibold">本机的系统时间比我们见过的最晚时间更早</div>
          <p className="mt-1 opacity-90">
            有时效的授权按「见过的最晚时间」算，所以把时间调回去不会让过期的重新可用。
            换时区、重装系统、恢复虚拟机快照都会这样 —— 把系统时间调准就好。
          </p>
        </div>
      )}

      {/* 未签名横幅：**不打开这一页也要知道**，所以页签上还有个红点 */}
      {unsigned.length > 0 && (
        <div data-ud="unsigned-banner" className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed"
          style={{ background: "var(--tool-err-soft)", border: "1px solid var(--tool-err)", color: "var(--tool-err)" }}>
          <div className="font-semibold">有 {unsigned.length} 个插件没有签名：{unsigned.map((x) => x.id).join("、")}</div>
          <p className="mt-1 opacity-90">
            它{unsigned.length > 1 ? "们" : ""}是开发模式下从本地装的，没人验证过是谁写的、装上以后有没有被改过。
            一样关在沙箱里，但<b>如果不是你自己装的，请卸掉</b>。
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-2">
        {rows === null ? <div className="text-muted text-xs">读取中…</div>
          : rows.length === 0 ? <div className="text-muted text-xs">本机还没有装插件。</div>
          /* 内置的排第一 */
          : [...rows].sort((a, b) => Number(b.bundled) - Number(a.bundled)).map((r) =>
              <Row key={r.id} core={core} r={r} onChanged={onChanged} />)}
      </div>
    </div>
  );
}

function Row({ core, r, onChanged }: { core: Core; r: InstalledRow; onChanged: () => void }) {
  const more = usePopover();
  const ver = usePopover();
  const [vs, setVs] = useState<{ versions: string[]; current: string | null } | null>(null);
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (r.bundled) return;
    void core.get<{ versions: string[]; current: string | null }>(`plugin_versions?id=${encodeURIComponent(r.id)}`)
      .then((x) => setVs(x.data ?? null));
  }, [core, r.id, r.bundled]);

  const multi = (vs?.versions.length ?? 0) > 1;
  const cur = vs?.current ?? r.version;

  const doUninstall = async () => {
    const out = await core.post<{ removed: boolean }>("plugin_uninstall", { id: r.id });
    if (!out.ok) { toast("卸不掉", out.errors?.[0]?.message, "error"); setArming(false); return; }
    toast(`${r.name} 已卸载`, "买过的记录还在，之后随时可以免费再装", "ok");
    setArming(false); onChanged();
  };
  const doSwitch = async (v: string) => {
    ver.close("pick");
    const out = await core.post("plugin_switch", { id: r.id, version: v });
    if (!out.ok) { toast("切不过去", out.errors?.[0]?.message, "error"); return; }
    toast(`已切到 ${v}`, "立刻生效，不用重启", "ok");
    onChanged();
  };

  return (
    <div data-ud="installed-row" data-unsigned={r.unsigned || undefined}
      className="rounded-lg border px-4 py-3 flex items-start gap-3"
      style={r.unsigned
        ? { background: "var(--tool-err-soft)", borderColor: "var(--tool-err)" }
        : { background: "var(--tool-panel)", borderColor: "var(--tool-border)" }}>
      <span className="w-8 h-8 rounded grid place-items-center bg-panel2 text-text2 shrink-0"><Glyph icon="plugin" size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{r.name}</span>
          {r.bundled && <span className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] bg-panel2 text-muted">内置</span>}
          {/* 实心红只给这一个标签：全页只有它是实心的，扫一眼就停在这里（设计侧原话） */}
          {r.unsigned && <span className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] text-onAccent" style={{ background: "var(--tool-err)" }}>未签名</span>}
          {r.unsigned && <span className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] border" style={{ borderColor: "var(--tool-err)", color: "var(--tool-err)" }}>开发模式</span>}
          {/* ═══ 授权态（M11-12）═══ **装了 ≠ 能用**。
              这一档以前根本不存在 —— 界面上只有「装没装」，而限时免费到期那天
              所有试用用户同时需要看到「过期」这一态。
              ⚠️ 只给**要紧的那几种**挂标签：有效不挂（正常状态不需要标签），
              内置已经有「内置」那一颗。挂满标签等于没有标签。 */}
          {r.entitlement === "expired" && (
            <span data-ud="ent-expired" className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] text-onAccent"
              style={{ background: "var(--tool-warn)" }}>已过期</span>
          )}
          {r.entitlement === "unlicensed" && !r.bundled && (
            <span data-ud="ent-unlicensed" className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] border"
              style={{ borderColor: "var(--tool-warn)", color: "var(--tool-warn)" }}>未授权</span>
          )}
          {r.entitlement === "not-yet" && (
            <span data-ud="ent-notyet" className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] border border-border text-muted">还没生效</span>
          )}
          {r.entitlement === "bad-license" && (
            <span data-ud="ent-bad" className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] text-onAccent"
              style={{ background: "var(--tool-err)" }}>许可证有问题</span>
          )}
          {/* 有时效但还有效的：把日子写出来。「可用至 X」比一颗绿点有用得多 */}
          {r.entitlement === "active" && r.until && (
            <span data-ud="ent-until" className="px-1.5 h-[18px] grid place-items-center rounded text-[10px] border border-border text-muted">
              可用至 {r.until.slice(0, 10)}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted mt-0.5">
          {r.bundled ? "Umbra 自带" : `认领 ${r.kinds.join(" / ") || "—"}`}
          {r.problems.length > 0 && <span className="text-err"> · 清单有毛病：{r.problems[0]!.field}</span>}
        </div>
        {/* 每一种不能用的态都要**给出路** —— 只说「不可用」等于什么都没说（`doc/20` §4.4）。
            文案由后端给（它才知道到期日和原因），这里只负责显示。 */}
        {r.entitlementNote && r.entitlement !== "active" && r.entitlement !== "builtin" && (
          <div data-ud="ent-note" className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--tool-warn)" }}>{r.entitlementNote}</div>
        )}
        {arming && (
          <div className="mt-2 text-xs leading-relaxed" style={{ color: "var(--tool-err)" }}>
            {/* 卸载最让人犹豫的是「钱是不是白花了」—— 这句先答掉（设计侧 §三.2） */}
            卸载 {r.name}？本机的 {vs?.versions.length ?? 1} 个版本一起删掉。买过的记录还在，之后在市场里随时可以免费再装。
            <div className="mt-1.5 flex gap-2">
              <button className="btn sm" onClick={() => setArming(false)}>取消</button>
              <button className="btn sm" style={{ background: "var(--tool-err)", borderColor: "var(--tool-err)", color: "#fff" }}
                onClick={() => void doUninstall()}>确认卸载</button>
            </div>
          </div>
        )}
      </div>

      {/* 版本：只装过一版时**不是钮**（无边框、不可点），装过两版以上才出下拉 */}
      <div className="relative shrink-0">
        <button ref={ver.anchorRef as React.RefObject<HTMLButtonElement>}
          onClick={multi ? ver.toggle : undefined} disabled={!multi} aria-expanded={multi ? ver.open : undefined}
          data-ud="version-btn"
          title={multi ? "本机装着的版本 · 点一下就切" : "本机只装过这一版"}
          className={`h-7 px-2 rounded font-mono text-[11px] flex items-center gap-1 ${
            multi ? "border border-border bg-bg text-text2 hover:bg-hover" : "text-muted cursor-default"}`}>
          {cur}{multi && <Glyph icon="chevron-down" size={11} />}
        </button>
        <Popover pop={ver} align="end">
          <div>
            <div className="px-2 pt-1.5 pb-1 text-[11px] text-muted">本机装着的版本 · 点一下就切</div>
            {(vs?.versions ?? []).slice().reverse().map((v) => (
              <PopItem key={v} label={v} hint={v === cur ? "在用" : "切到这一版"}
                onPick={v === cur ? undefined : () => void doSwitch(v)} />
            ))}
          </div>
        </Popover>
      </div>

      <div className="relative shrink-0">
        <button ref={more.anchorRef as React.RefObject<HTMLButtonElement>} className="ib" onClick={more.toggle} aria-expanded={more.open} title="更多">⋯</button>
        <Popover pop={more} align="end">
          <div>
            <PopItem label="在市场里查看" onPick={r.unsigned ? undefined : () => more.close("pick")} />
            <PopSep />
            {/* 内置的这一位置是**置灰的原因**，不是没有这一项 ——
                用户会去找「卸载」，找到的是原因（设计侧 §三.2） */}
            {r.bundled
              ? <PopItem label="内置插件不能卸载" disabled />
              : <PopItem label="卸载" danger onPick={() => { more.close("pick"); setArming(true); }} />}
          </div>
        </Popover>
      </div>
    </div>
  );
}
