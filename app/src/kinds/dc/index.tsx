import { HEALTH_LABEL } from "../../api/types";
import { SidePanels } from "../../workbench/SidePanels";
import type { ViewContext } from "../context";
import type { KindModule } from "../registry";
import { Seg, SizeBtn } from "../toolbar";
import { Glyph } from "../../ui/Glyph";
import { DcProvider, POINTERS, PRESETS, useDc } from "./bridge";
import { DcView } from "./View";
import { AddrBar } from "./AddrBar";

export type { PreviewMode } from "./bridge";

/** `.dc.html` 设计稿 —— 这个工具最深的一种类型（`01` §1）。
 *
 *  它是唯一同时用到全部六样声明的格式：画布、五个从属面板、自己的 `⋯`、
 *  状态行读数、一条工具栏，以及一份跨位置共享的状态（那座 postMessage 桥，见 `bridge.tsx`）。
 *  别的格式简单得多 —— 这是「基础设施按最复杂的那一种设计，简单的自然装得下」。
 */
const ZOOMS = [0.3, 0.5, 0.75, 1, 1.25, 1.5];

/** 编辑栏（**默认收起**，点 Tab 条右端的 ✎ 展开）：只放**改稿用**的。
 *  第九轮把「编辑 / 预览」两档并进了 ✎ 本身 —— 展开 = 编辑态，收起 = 预览态，
 *  所以这里不再有那两档，只剩「源码」这一档和指针。 */
function Toolbar({ ctx }: { ctx: ViewContext }) {
  const d = useDc();
  return (
    <>
      <Seg label="视图" items={[
        { label: "画布", active: d.mode !== "code", onPick: () => d.setMode("shell"), title: "在稿上直接改" },
        { label: "源码", active: d.mode === "code", onPick: () => d.setMode("code"), title: "只读" },
      ]} />
      {/* ═══ 指针三档（用户 2026-09-28 拍板 · 设计侧第十一轮 §二）═══
          第九轮曾裁到只剩「点选」一颗，理由是「评论是选中之后的一个动作」——
          这一轮设计侧自己推翻了：那句话没错，错在它把那个动作放进了**默认收起**的属性区，
          于是「选中之后」这一步在屏幕上没有任何可见的去处。

          三档在实现上共用一个底座：**S2 不用改、不加命令**，照旧只发 `pick`，
          由 `bridge` 按当前档位分派。所以这里只是三颗钮 + 一个 state。 */}
      {d.mode === "shell" && (
        <>
          <Seg label="指针" items={POINTERS.map((p) => ({
            label: p.label, active: d.pointer === p.id, title: p.title, toggle: true,
            onPick: () => { d.setPointer(p.id); if (!d.shell.selectOn) d.cmd("pick"); },
          }))} />
          {/* 没有节点地址时那条提示 —— 占掉剩下的宽度，一展开编辑栏就看得见 */}
          <AddrBar ctx={ctx} />
        </>
      )}
      <span className="flex-1" />
    </>
  );
}

/** 正文右下角的浮块：只放**看稿用**的 —— 它们回答「稿在屏上长什么样」，一直会用。 */
function Corner() {
  const d = useDc();
  if (d.mode === "code") return null;
  return (
    <>
      <button onClick={() => d.cmd("theme", d.shell.draftTheme === "dark" ? "light" : "dark")}
        aria-pressed={d.shell.draftTheme === "dark"} data-ud="draft-theme"
        title="稿的浅 / 深色 —— 只改这份稿怎么显示，不改工具外观"
        className={`w-7 h-7 grid place-items-center rounded ${d.shell.draftTheme === "dark" ? "bg-accentSoft text-accent" : "text-muted hover:text-text hover:bg-hover"}`}>
        <Glyph icon="draft-theme" />
      </button>
      <SizeBtn
        label={`${PRESETS[d.shell.preset] ?? "自适应"} · ${Math.round(d.shell.zoom * 100)}%`}
        title="画布宽度与缩放"
        widths={PRESETS.map((label, i) => ({ label, px: label.match(/\d+/)?.[0] ?? "—", on: d.shell.preset === i, pick: () => d.cmd("preset", i) }))}
        zoomPct={Math.round(d.shell.zoom * 100)}
        onZoom={(dir) => d.cmd("zoom", dir > 0 ? (ZOOMS.find((z) => z > d.shell.zoom) ?? 1.5) : (ZOOMS.filter((z) => z < d.shell.zoom).pop() ?? 0.3))}
        onFit={() => d.cmd("zoom", 1)} />
      <button className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-hover"
        onClick={() => d.setPresent(true)} title="演示：全屏只看稿，Esc 退出">
        <Glyph icon="present" />
      </button>
    </>
  );
}

function View({ ctx }: { ctx: ViewContext }) {
  return <DcView ctx={ctx} store={ctx.store} picked={ctx.picked} />;
}

function Panels({ ctx }: { ctx: ViewContext }) {
  return (
    <SidePanels core={ctx.core} store={ctx.store} file={ctx.path} picked={ctx.picked} onPicked={ctx.setPicked}
      panels={[...(dc.panels ?? [])]} active={ctx.ui.activePanel} setActive={ctx.ui.openPanel} narrow={ctx.narrow}
      onSendToAI={(text, p) => { ctx.setPicked(p); ctx.ask(text); }} />
  );
}

function Status({ ctx }: { ctx: ViewContext }) {
  const d = ctx.store.drafts.find((x) => x.file === ctx.path);
  if (!d) return <span>设计稿</span>;
  return (
    <>
      <span>{d.kind === "component" ? "组件稿" : "设计稿"}</span>
      <span>·</span><span>{d.version ?? "—"}</span>
      <span>·</span><span>{d.elements ?? "—"} 元素</span>
      <span>·</span><span title={d.healthWhy}>{HEALTH_LABEL[d.health]}</span>
    </>
  );
}

/** `⋯` 里这四项都是低频动作。体检收进来是第七轮的裁决，它给的理由好：
 *  「结果本来就常驻在诊断角标、状态行、树里的点上，常驻一颗钮只为手动重跑，那是低频」。 */
function menu(ctx: ViewContext) {
  const checking = ctx.store.checking === ctx.path;
  return [
    { label: checking ? "体检中…" : "重新体检", hint: checking ? "" : "手动重跑", run: () => void ctx.store.runCheck(ctx.path) },
    { label: "对比上一版", hint: "S6", run: () => window.open(`${ctx.project.url}${encodeURIComponent("S6-版本对比.dc.html")}?file=${encodeURIComponent(ctx.path)}`, "_blank") },
    { label: "重新加载预览", run: () => window.dispatchEvent(new CustomEvent("ud-dc-reload")) },
    { label: "在浏览器中打开", run: () => void ctx.host.openExternal(`${ctx.project.url}${encodeURIComponent(ctx.path).replace(/%2F/g, "/")}`) },
    /* 「存为模板…」是第九轮给「用户永远不知道有模板」这件事的解法（§十.2）：
       新建稿件那一屏在项目没有模板时整组不出，用户存过一次，那一组就出现了。 */
    { label: "存为模板…", run: () => {
      const name = window.prompt("模板名", ctx.path.split("/").pop()?.replace(/\.dc\.html$/, "") ?? "");
      if (!name) return;
      void ctx.core.post("save_template", { path: ctx.path, name }).then((r) => {
        ctx.ui.toast(r.ok ? "已存为模板" : "存不了", r.ok ? name : r.errors?.[0]?.message, r.ok ? "ok" : "error");
      });
    } },
    { label: "在目录中显示", run: () => window.dispatchEvent(new CustomEvent("ud-locate-file", { detail: ctx.path })) },
  ];
}

/** 稿的读数（设计侧第十一轮 §一.2）。
 *  用索引里已经算好的，**不为这一行去拉源码** —— 它只是浮层头的一行字，
 *  不该让人为看一眼读数而读一份几百 KB 的文件。 */
function Meta({ ctx }: { ctx: ViewContext }) {
  const d = ctx.store.drafts.find((x) => x.file === ctx.path);
  if (!d) return null;
  const t = d.updatedAt ? new Date(d.updatedAt) : null;
  const s = [
    d.elements != null ? `${d.elements} 元素` : null,
    d.version ?? null,
    t ? `改于 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : null,
  ].filter(Boolean).join(" · ");
  return s ? <>{s}</> : null;
}

export const dc: KindModule = {
  ids: ["dc"],
  panels: ["props", "diagnostics", "changes", "comments", "info"],
  Provider: DcProvider,
  View, Toolbar, Corner, Panels, Status, menu, meta: Meta,
};
