import { useCallback, useEffect, useState } from "react";
import type { Core } from "../api/client";
import { timeAgo } from "../api/types";
import { Glyph, ICON } from "../ui/Glyph";
import { Popover, usePopover } from "../ui/Popover";
import { toast } from "../ui/Toast";

/** 一个文件的快照与版本历史（M10-2b，设计侧第十三轮定的形制）。
 *
 *  **为什么归宿主画，不归格式模块。** 设计侧的原话：
 *  「版本列表要的东西很少（版本号、时间、谁改的、一句话），每加一种格式都能直接用上。」
 *  所以它长在工作台这一层 —— 加一种新格式白拿一份版本历史，不用各写一遍。
 *
 *  **但「看那一版」不在这里画。** 点一行只是把「现在要看哪一版」这个状态交出去；
 *  真正把那一版的原文画出来（语法高亮、行号、差异标红）是**编辑区**的事，
 *  而编辑区是格式模块 / 插件的。分界线还是第七轮那条判据：
 *  **点了它，变的是什么** —— 变的是这份文件的显示内容，所以归它。
 */
export interface Snap {
  version: string;
  /** 谁改的：人手改 / AI 改 / 插件改 / 回退 */
  src: string;
  at: string;
  bytes: number;
  note?: string;
  /** 和上一版比增删了几行。`null` = 没算（文件太大），`undefined` = 这一版读不出来 */
  delta?: { plus: number; minus: number } | null;
}
/** 这个文件的 git 兜底在不在。三态，因为后两种后果一样而出路不同（见 `gitkeep.ts`） */
export type GitFallback = "on" | "ignored" | "off" | "broken";

/** 没有 git 兜底时说的那句话。**口气是「少了一道兜底」，不是报错** ——
 *  设计侧定的，理由是快照和回退都不受影响，按报错写会让人以为历史坏了。 */
const FALLBACK_NOTE: Record<Exclude<GitFallback, "on">, { head: string; fix: string }> = {
  ignored: {
    head: "这个文件被 .gitignore 忽略了，外部改动没有 git 兜底。",
    fix: "这里的快照和回退不受影响；少的是「别的编辑器改过一版」那种情况的兜底。",
  },
  off: {
    head: "这个项目没有在用 git 记版本，外部改动没有兜底。",
    fix: "这里的快照和回退不受影响；少的是「别的编辑器改过一版」那种情况的兜底。",
  },
  /* ⚠️ 这一条是**在用户自己的项目上实测出来的**（2026-09-30）：
     他那个仓库有 24 份快照、0 个 git 提交，根因是一个残留的 `.git/index.lock`。
     和另两条不同，**这一条给得出具体的出路**，所以要说出来。 */
  broken: {
    head: "这个项目的 git 现在提交不了，外部改动没有兜底。",
    fix: "多半是 .git/index.lock 残留（某次 git 操作被中断），或者正在 merge / rebase。处理完它就自动恢复。",
  },
};

const SRC_IS_AI = (s: string) => /AI/i.test(s);

/** `+N −M`。**没算出来要说「没算」，不要显示 `+0 −0`** —— 后者是「没改」的意思。 */
function Delta({ d }: { d: Snap["delta"] }) {
  if (d === null || d === undefined) return <span className="text-[11px] text-muted shrink-0">没算</span>;
  return (
    <span className="inline-flex gap-[5px] font-mono text-[11px] tabular-nums shrink-0">
      <span className="text-ok">+{d.plus}</span>
      <span className="text-err">−{d.minus}</span>
    </span>
  );
}

export function VersionPill({ core, path, viewing, onView, onRevertDone, confirmLeave }: {
  core: Core;
  path: string;
  /** 现在正在看的历史版本，`null` = 看当前 */
  viewing: string | null;
  onView: (version: string | null) => void;
  onRevertDone: () => void;
  /** 有未落盘改动时先问一句 —— 回退会覆盖盘上那份（S18 演示态 3 的「退回」档） */
  confirmLeave: (path: string) => Promise<boolean>;
}) {
  const pop = usePopover();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [fallback, setFallback] = useState<GitFallback>("on");
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await core.get<{ snapshots: Snap[]; gitFallback: GitFallback }>(
      `file_versions?path=${encodeURIComponent(path)}`);
    if (!r.ok || !r.data) { setSnaps([]); return; }
    setSnaps(r.data.snapshots ?? []);
    setFallback(r.data.gitFallback ?? "on");
  }, [core, path]);

  /* 换文件就把状态全清 —— 上一份文件的版本列表留在这里是错的。
     ⚠️ 也包括 `armed`：二次确认停在半路时切走，切回来不该还举着「要退回 s3 吗」。 */
  useEffect(() => { setSnaps(null); setArmed(null); }, [path]);
  /* 打开时才取。常驻轮询没有意义 —— 落盘会自己调 `load`（见下面 onSaved）。 */
  useEffect(() => { if (pop.open) void load(); }, [pop.open, load]);
  /* 落盘之后版本变了；药丸上的版号和列表都要跟着走。
     ⚠️ 听的是**工作台的落盘事件**而不是轮询 —— 插件落完盘会派发它。 */
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === path) void load(); };
    window.addEventListener("ud-file-saved", on);
    return () => window.removeEventListener("ud-file-saved", on);
  }, [path, load]);
  /* 药丸上要显示版号，所以**没打开也得取一次**。只取一次，不跟着别的状态重来。 */
  useEffect(() => { void load(); }, [load]);
  /* 看旧版那一条上的「回到这一版」：**打开下拉并把那一行举成待确认**（稿里 `askFromView`）。
     ⚠️ 走事件而不是把状态外翻给工作台 —— 举起哪一行是这个浮层自己的事。
     ⚠️ 也**必须有人听**：上一批我 dispatch 过一个没人听的事件，
     症状就是「点了没反应」，而那正是我们要消灭的东西（§一〇三）。 */
  useEffect(() => {
    const on = (e: Event) => {
      const v = (e as CustomEvent<{ path: string; version: string }>).detail;
      if (!v || v.path !== path) return;
      setArmed(v.version);
      if (!pop.open) pop.toggle();
    };
    window.addEventListener("ud-arm-revert", on);
    return () => window.removeEventListener("ud-arm-revert", on);
  }, [path, pop]);

  const latest = snaps?.length ? snaps[snaps.length - 1]!.version : null;
  const label = viewing ? `看 ${viewing}` : latest ?? "—";
  const on = pop.open || !!viewing;

  const revert = async (v: string) => {
    /* 回退会覆盖盘上那份 —— 编辑器里没落盘的改动会没了，所以先问一句。
       同一张卡、说法换成「退回」（S18 演示态 3 的第三档）。 */
    if (!(await confirmLeave(path))) { setArmed(null); return; }
    setBusy(true);
    const r = await core.post<{ snapshot?: string }>("file_revert", { path, version: v });
    setBusy(false);
    setArmed(null);
    if (!r.ok) { toast("回退失败", r.errors?.[0]?.message, "error"); return; }
    toast(`已回到 ${v}`, `历史不删，${r.data?.snapshot ?? "新一版"} 是回退版`, "ok");
    pop.close("pick");
    onView(null);          // 退回之后看的就是当前了
    onRevertDone();
    void load();
  };

  return (
    <div className="relative flex shrink-0">
      <button ref={pop.anchorRef as React.RefObject<HTMLButtonElement>} data-ud="version-pill"
        onClick={pop.toggle} aria-expanded={pop.open}
        title={`快照：${snaps?.length ?? 0} 版${fallback === "on" ? "" : ` · ${FALLBACK_NOTE[fallback].head}`}`}
        className={`flex items-center gap-[5px] h-6 pl-2 pr-1.5 rounded-sm border font-mono text-[11px] tabular-nums
          ${on ? "border-accent bg-accentSoft text-accent" : "border-border text-text2 hover:bg-hover hover:text-text"}`}>
        {label}
        {/* 没有 git 兜底时药丸上挂一颗 warn 点 —— 下拉收着时也看得见「这里有话要说」 */}
        {fallback !== "on" && <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" title={FALLBACK_NOTE[fallback].head} />}
        <Glyph d={ICON.caretDown} size={11} stroke={1.6} className="text-muted" />
      </button>
      <Popover pop={pop} align="start" width={372} tag="versions" pad="0">
        <div className="flex flex-col max-h-[440px]">
          <div className="shrink-0 flex items-baseline gap-2 px-[13px] py-[9px] border-b border-border">
            <span className="text-[13px] font-semibold">快照</span>
            <span className="text-[11px] text-muted">{snaps === null ? "正在读…" : `${snaps.length} 版在手边`}</span>
            <span className="flex-1" />
            <span className="text-[11px] text-muted">点一行看那一版</span>
          </div>

          {/* ⚠️ 这句话**只在这里说，落盘时不说**（设计侧定的）——
              每次落盘都提一遍会很烦，而它不是每次落盘都变的事。 */}
          {fallback !== "on" && (
            <div data-ud="git-fallback" className="shrink-0 flex gap-2 px-[13px] py-2 bg-panel2 border-b border-border text-xs leading-[1.55] text-text2">
              <span className="shrink-0 text-warn grid pt-0.5"><Glyph d="M8 2.5l6 10.5H2zM8 6.6v3M8 11.4v.1" size={12} /></span>
              <span>{FALLBACK_NOTE[fallback].head}<span className="text-muted"> {FALLBACK_NOTE[fallback].fix}</span></span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto">
            {snaps !== null && snaps.length === 0 && (
              <div className="px-[13px] py-3 text-muted text-xs">还没有快照 —— 这个文件还没经写入口落过盘。</div>
            )}
            {/* **最新的在最上面**：升序存、倒序显示，同 S2 的版本历史 */}
            {[...(snaps ?? [])].reverse().map((s, i) => {
              const cur = i === 0, seen = s.version === viewing, ai = SRC_IS_AI(s.src);
              return (
                <div key={s.version} data-ud="version-row" data-version={s.version}
                  onClick={() => { if (!cur) { onView(s.version); pop.close("pick"); } }}
                  className={`grid grid-cols-[16px_minmax(0,1fr)] gap-[9px] px-[13px] py-[9px] border-b border-border
                    ${cur ? "cursor-default" : "cursor-pointer"} ${seen ? "bg-accentSoft" : cur ? "" : "hover:bg-hover"}`}>
                  <div className="flex flex-col items-center pt-1">
                    <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${cur || seen ? "bg-accent ring-[3px] ring-accentSoft" : "bg-borderStrong"}`} />
                    <span className="flex-1 w-px min-h-3 mt-1 bg-border" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-[7px] min-w-0">
                      <span className={`font-mono text-xs ${cur || seen ? "font-bold" : "font-medium"}`}>{s.version}</span>
                      <span className={`text-[11px] px-1.5 rounded-sm border shrink-0
                        ${ai ? "bg-accentSoft border-accent text-accent" : "bg-panel2 border-border text-text2"}`}>{s.src}</span>
                      <span className="text-[11px] text-muted whitespace-nowrap">{timeAgo(s.at)}</span>
                      <Delta d={s.delta} />
                      <span className="flex-1" />
                      {cur
                        ? <span className="text-[11px] font-medium text-accent shrink-0">当前</span>
                        : armed !== s.version && (
                          <button data-ud="ask-revert" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); setArmed(s.version); }}
                            className="shrink-0 h-[22px] px-2 rounded-sm border border-borderStrong bg-panel text-text2 text-[11px] hover:bg-hover hover:text-text">
                            回到这一版
                          </button>
                        )}
                    </div>
                    {s.note && <div className="mt-[3px] text-xs text-text2 leading-[1.5]">{s.note}</div>}
                    {/* 行内二次确认，同 S2 —— 不另起一张对话框。
                        ⚠️ 话要说全：**回退不删历史，而且回退本身也能再回退**，
                        这两点决定了用户敢不敢点。 */}
                    {armed === s.version && (
                      <div data-ud="confirm-revert" onClick={(e) => e.stopPropagation()}
                        className="mt-2 px-2.5 py-[9px] rounded border cursor-default"
                        style={{ background: "var(--tool-warn-soft)", borderColor: "var(--tool-warn-border)" }}>
                        <div className="text-xs text-warn leading-[1.55]">
                          现在的 {latest ?? "这一版"} 会先存成一版，历史不删；回退本身也能再回退。
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <button disabled={busy} onClick={() => void revert(s.version)}
                            className="h-[26px] px-[11px] rounded-sm bg-accent text-onAccent text-xs font-medium hover:opacity-90 disabled:opacity-60">
                            {busy ? "正在退…" : `回到 ${s.version}`}
                          </button>
                          <button disabled={busy} onClick={() => setArmed(null)}
                            className="h-[26px] px-[11px] rounded-sm border text-warn text-xs"
                            style={{ borderColor: "var(--tool-warn-border)" }}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}

/** 正在看某一历史版本时，工具条上那一条（S18 演示态 9）。
 *
 *  它说三件事：**在看哪一版 · 和当前差多少 · 怎么回来**。
 *  ⚠️ 第三件最要紧 —— 只读态最容易让人以为「界面坏了」，
 *  所以「回到当前」是主钮而不是次要按钮，而且写出 Esc。
 */
export function ViewingBar({ core, path, viewing, onRevert, onBack }: {
  core: Core;
  path: string;
  viewing: string;
  onRevert: () => void;
  onBack: () => void;
}) {
  /* ⚠️ 「和当前差多少」**得单独问一次**，不能拿版本列表里的 `delta` 凑。
     那个是「每一版和它上一版」，这里要的是「这一版和当前」——
     **两者不能互相换算**：中间各版的 delta 累加会高估
     （一处改了又改回来，累加算两次，实际是零）。
     这是接线时才看出来的，已经为它加了 `compare_file_versions`。 */
  const [info, setInfo] = useState<{ latest: string | null; delta: { plus: number; minus: number } | null } | null>(null);
  useEffect(() => {
    let live = true;
    setInfo(null);
    void (async () => {
      const [cmp, vers] = await Promise.all([
        core.get<{ delta: { plus: number; minus: number } | null }>(
          `file_compare?path=${encodeURIComponent(path)}&from=${encodeURIComponent(viewing)}`),
        core.get<{ snapshots: Snap[] }>(`file_versions?path=${encodeURIComponent(path)}`),
      ]);
      if (!live) return;
      const snaps = vers.ok ? (vers.data?.snapshots ?? []) : [];
      setInfo({ latest: snaps.length ? snaps[snaps.length - 1]!.version : null, delta: cmp.ok ? (cmp.data?.delta ?? null) : null });
    })();
    return () => { live = false; };
  }, [core, path, viewing]);

  /* Esc 回到当前。挂在顶层 document —— 焦点多半在插件的 iframe 里，
     而**键盘事件不跨 iframe 边界**（§八十一 栽过），所以插件那边也要转发一次。 */
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [onBack]);
  return (
    <div data-ud="viewing-bar" role="status" className="flex items-center gap-2 min-w-0 shrink-0">
      <span className="text-xs text-text2 whitespace-nowrap">只读 · 和当前 {info?.latest ?? "版"} 比</span>
      {info === null ? <span className="text-[11px] text-muted">算着…</span> : <Delta d={info.delta} />}
      <button onClick={onRevert}
        className="h-[22px] px-2 rounded-sm border border-borderStrong bg-panel text-[11px] text-text2 whitespace-nowrap hover:text-text">
        回到这一版
      </button>
      <button data-ud="back-to-current" onClick={onBack}
        className="inline-flex items-center gap-[5px] h-[22px] px-2 rounded-sm bg-accent text-onAccent text-[11px] font-medium whitespace-nowrap hover:opacity-90">
        回到当前 <kbd className="font-mono text-[10px] opacity-80">Esc</kbd>
      </button>
    </div>
  );
}
