import { useEffect, useRef, useState } from "react";
import type { ViewContext } from "../context";
import { useDc } from "./bridge";

/** 「这份稿没有节点地址」提示条 + 「加上地址」确认卡（issue #31 · 设计侧第十一轮 §三）。
 *
 *  **为什么是一条常驻的提示条，而不是点了才说**：用户的原话是「点击页面中的任意元素，
 *  均没有效果」。他项目里能打开的 29 份稿**一份都没有节点地址**（实测），
 *  所以「点选」这颗钮对他从来没有可用过 —— 而界面一句话都不说。
 *  一展开编辑栏就该看见原因，不要等他点了半天才说。
 *
 *  ⚠️ **三颗档位钮照样能按**。禁用态不解释原因，和现在的静默是同一个病
 *  （设计侧原话，我们同意）。点画布时提示条抖一下，那一下就是「你点了，这就是为什么」。
 */
export function AddrBar({ ctx }: { ctx: ViewContext }) {
  const d = useDc();
  const [sheet, setSheet] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  /* 抖动：`nudge` 是自增数，连点两次要抖两次（布尔的话第二次不触发）。
     用 Web Animations 而不是 CSS class —— class 要等它自己被移除才能再抖一次。 */
  useEffect(() => {
    if (!d.nudge || !bar.current) return;
    bar.current.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
      { duration: 360, easing: "ease-in-out" },
    );
  }, [d.nudge]);

  if (!d.noAddr) return null;
  return (
    <>
      {/* `data-nudge` 是给回归用的判据钩子：动画的时序难量（量早了没开始、量晚了已结束），
          而「点了几下画布」是数得到的。视觉上的抖动照旧由上面那个 effect 跑。 */}
      <div ref={bar} data-ud="no-addr" data-nudge={d.nudge} className="flex items-center gap-1.5 h-[22px] px-2 rounded-sm border shrink-0 min-w-0"
        style={{ background: "var(--tool-warn-soft)", borderColor: "var(--tool-warn)" }}
        title={[
          "节点地址是我们落盘时给每个元素打的一个短码（data-ud-node），点选、评论、改属性都靠它认元素。",
          "这份稿没有 —— 它是从别处来的（设计侧交付 / 导入 / 别的工具生成），从没经过我们的写入口。",
          "两条出路：① 加上地址：只加这一个属性，内容和样式一个字不动，改前那版留在「变更」里；② 改用 AI：直接说要改哪里。",
        ].join("\n")}>
        {/* 稿里用的就是这个字符，不是图标 —— 图标表里没有警示那一颗 */}
        <span aria-hidden className="text-[11px] shrink-0" style={{ color: "var(--tool-warn)" }}>⚠</span>
        <span className="text-[11px] truncate">这份稿没有节点地址，点选 / 评论 / 编辑都点不中元素</span>
        <button onClick={() => setSheet(true)}
          className="h-[18px] px-1.5 rounded-sm bg-accent text-onAccent text-[11px] font-semibold shrink-0">加上地址…</button>
        <button onClick={() => {
          /* 「改用 AI」：带上这份文件的药丸、展开会话、把焦点交给输入框 ——
             不带药丸的话用户还得自己说清是哪份稿 */
          ctx.select("files", { kind: "files", label: d.file.split("/").pop() ?? d.file, detail: d.file });
          ctx.ui.expandChat();
          /* 占位字换成一句**能照着改**的例子（设计侧 §三.3）——
             「说要改哪里」太抽象，给个样例用户才知道这里能说什么。
             监听方在 `chat/ChatRail.tsx`。 */
          setTimeout(() => window.dispatchEvent(new CustomEvent("ud-focus-chat",
            { detail: { placeholder: "说要改哪里，比如「标题再大一号」…" } })), 60);
        }} className="h-[18px] px-1 rounded-sm text-[11px] underline decoration-dotted shrink-0">改用 AI</button>
      </div>
      {sheet && <AddrSheet ctx={ctx} onClose={() => setSheet(false)} />}
    </>
  );
}

/** 确认卡（320）：改什么、不改什么、怎么回去。
 *  勾选「项目里另外 N 份也没有，一起加上」**默认不勾** —— 改别的文件要用户明说。 */
function AddrSheet({ ctx, onClose }: { ctx: ViewContext; onClose: () => void }) {
  const d = useDc();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  /* ⚠️ **这个勾选框一度是假的**：第一版从 `drafts` 里读 `x.nodes === 0` 来挑候选，
     而 `list_drafts` 返回的字段只有「类型 / 健康 / 元素数 / 版本」—— **没有 nodes**。
     于是候选永远是空的，勾了也只加当前这一份。
     「看起来能用但其实是假的」比「明说还没做」糟得多 —— 这条我们对积分屏用过，
     对自己也一样。

     不用加后端字段就能做对：**写入口对「内容与盘上一致」的稿会短路**
     （不落盘、不新增快照、不写 changelog）。所以直接对项目里每一份稿都写一遍就行：
     没有地址的那些会变（多出地址），已经有地址的原样写回、自然被跳过。
     代价是多读几份源码，而这是用户显式点的一次操作。 */
  const others = ctx.store.drafts.map((d) => d.file).filter((f) => f !== d.file);

  const run = async () => {
    setBusy(true);
    const targets = [d.file, ...(all ? others : [])];
    let ok = 0, skipped = 0; const failed: string[] = [];
    for (const f of targets) {
      /* **原样写回去**：写入口落盘时会自己给整份打地址（`stampNodes`，幂等）。
         所以这颗钮不需要任何新能力 —— 读一遍、原样写回。
         实测 5 份用户真实的稿全部能过落盘前的校验（`00` §102.3）。 */
      const src = await ctx.core.get<{ source?: string }>(`source?file=${encodeURIComponent(f)}`);
      if (!src.ok || typeof src.data?.source !== "string") { failed.push(f); continue; }
      const w = await ctx.core.post<{ unchanged?: boolean }>("draft_write", { path: f, content: src.data.source });
      if (!w.ok) { failed.push(f); continue; }
      /* `unchanged` = 这份稿本来就有地址，原样写回后内容一致，写入口短路了 —— 不算「加上了一份」 */
      if (w.data?.unchanged) skipped++; else ok++;
    }
    setBusy(false);
    onClose();
    if (ok) {
      d.recount();
      d.reload();
      const tail = [skipped ? `${skipped} 份本来就有，没动` : "", failed.length ? `${failed.length} 份没成功` : ""].filter(Boolean).join(" · ");
      ctx.ui.toast(`加上了地址 · ${ok} 份`, tail || "三档现在能用了，改前那版留在「变更」里", failed.length ? "error" : "ok");
    } else if (skipped && !failed.length) {
      ctx.ui.toast("都已经有地址了", `${skipped} 份没动`, "ok");
    } else {
      ctx.ui.toast("没能加上地址", failed[0] ?? "", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "var(--scrim-drawer)" }} onMouseDown={onClose}>
      <div className="rounded-lg border border-border bg-panel shadow-2xl p-4 anim-pop" style={{ width: 320 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-[13px] font-semibold mb-2">给这份稿加上节点地址</div>
        <dl className="text-[11px] leading-relaxed text-text2 space-y-1.5 mb-3">
          <div><dt className="inline text-muted">改什么：</dt><dd className="inline"> 给每个元素加一个 <code className="font-mono">data-ud-node</code> 短码</dd></div>
          <div><dt className="inline text-muted">不改什么：</dt><dd className="inline"> 内容和样式**一个字不动**</dd></div>
          <div><dt className="inline text-muted">怎么回去：</dt><dd className="inline"> 改之前那一版留在「变更」里，一键回退</dd></div>
        </dl>
        <label className="flex items-start gap-2 text-[11px] text-text2 mb-3 cursor-pointer">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="mt-0.5" />
          <span>项目里另外 {others.length} 份稿一起加上<span className="text-muted">（已经有地址的不会动）</span></span>
        </label>
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <button className="btn sm" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn sm primary" onClick={() => void run()} disabled={busy}>{busy ? "加…" : "加上地址"}</button>
        </div>
      </div>
    </div>
  );
}
