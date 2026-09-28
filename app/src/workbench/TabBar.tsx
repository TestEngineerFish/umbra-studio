import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PopItem, PopSep, Popover, usePopover } from "../ui/Popover";
import { kindOf } from "@shared/kinds";
import { draftTitle } from "../api/types";
import { dirtyStore } from "../ui/dirty";
import { Glyph } from "../ui/Glyph";
import type { IconName } from "../ui/icons";
import { PopoverAt } from "../ui/Popover";
import { closable, ordered, type Tab } from "./tabs";

/** 页签条（M8-22 重画，形制按设计侧第八轮 §六）。
 *
 *  用户提了三件，每件背后都有一条理由：
 *
 *  **① 那颗灰点是什么？** 原来是体检状态，他读成了「未保存」。
 *  设计侧的裁决：**体检不上页签**（它已经在树、诊断角标、诊断面板三处），
 *  页签上只留**未保存**，而且**占关闭钮的位置**、颜色用 `text-2` **不用 warn 橙** ——
 *  「它表示进度，不是警告」。他会那样读，恰恰因为见过这种写法。
 *
 *  **② 太过直白。** 原来每个页签都是等大的格子、中间用竖线隔开。
 *  现在只有当前那一个有形状：panel 底色 + 三面描边 + 上圆角，
 *  下边和文件工具栏连成一片，读作「这一行工具属于这个页签」。
 *
 *  **③ 右边不该有竖滚动条。** 那是横向滚动容器带出来的。
 *  第八轮的解法是「放不下就收进 +N ▾，不横向滚动」。
 *
 *  ⚠️ **第十一轮改了这一条**（设计侧 §一.1，用户拍板三档那一轮一起交的）：
 *  改回**横向滚动**，但把当初那个毛病单独治掉 —— 滚动条藏起来（`scrollbar-width: none`），
 *  被裁掉的那一端用 16px 渐隐告诉人「那边还有」。
 *  「+N」去掉了：放不下时在 ✎ ◨ ⋯ 左边出一颗 `chevron-down`，点开是完整列表。
 *  **固定的页签单独一组贴在最左边，不跟着滚** —— 固定就是为了「永远看得见」，
 *  跟着滚走就白固定了。
 */
const TAB_W = 184, TAB_MIN = 112, PIN_W = 150;

export function TabBar({ tabs, current, busy, onPick, onOpen, onClose, onCloseMany, onPin, onKeep, onLocate, onToChat, onCopyPath, onReveal, metaOf, tail }: {
  tabs: Tab[];
  current: string | null;
  /** 当前文件在忙（渲染 / 体检）：下沿那条线变 2px 流动 */
  busy?: boolean;
  /** 单击页签：切过去（不改它的态） */
  onPick: (path: string) => void;
  /** 双击页签：预览态转正 */
  onOpen: (path: string) => void;
  onClose: (path: string) => void;
  onCloseMany: (list: Tab[]) => void;
  onPin: (path: string, pinned: boolean) => void;
  /** 「保持打开」= 预览态转正，只在预览页签上出现 */
  onKeep: (path: string) => void;
  /** 在目录中显示：展开到它所在的目录、滚到它、描一圈边 */
  onLocate: (path: string) => void;
  onToChat: (path: string) => void;
  onCopyPath: (path: string) => void;
  onReveal: (path: string) => void;
  /** 一个页签的读数，给悬停提示的第二行用。拿不到就给空 —— 那一行不写。 */
  metaOf?: (path: string) => string;
  /** Tab 条**右端固定的那几颗**（第九轮：✎ 编辑栏 · ◨ 属性区 · ⋯ 这份文件）。
   *  位置固定，不跟着格式变 —— 格式变的是它们展开之后的内容。 */
  tail?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(9999);
  const morePop = usePopover();
  const [ctx, setCtx] = useState<{ x: number; y: number; tab: Tab } | null>(null);
  const dirtySnap = useSyncExternalStore(dirtyStore.subscribe, dirtyStore.snapshot);
  void dirtySnap;

  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { const w = e!.contentRect.width; if (w > 0) setAvail(w); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const list = ordered(tabs);
  /* **固定的单独一组，贴最左，不参与滚动**（设计侧第十一轮 §一.1）。
     `ordered` 已经把固定的排在前面，这里只是切成两段。 */
  const pinned = list.filter((t) => t.pinned);
  const rest = list.filter((t) => !t.pinned);
  const pinW = pinned.length * PIN_W;
  /* 剩下的宽度里按 184 排；排不下就压，**压到 112 为止**，再放不下就横向滚动。 */
  const room = Math.max(0, avail - pinW - 44 /* 下拉钮 + 一点余量 */);
  const width = rest.length * TAB_W <= room ? TAB_W : Math.max(TAB_MIN, Math.floor(room / Math.max(1, rest.length)));
  /* 滚了才需要下拉钮和渐隐 —— 放得下的时候什么都不多出来 */
  const overflow = rest.length * width > room + 1;

  /** 两端的渐隐：**被裁掉的那一端**才有（16px）。
   *  两端都判，不只判右边 —— 用户滚到最右时左边才是被裁的那一端。 */
  const syncEdge = useCallback(() => {
    const el = scroller.current; if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => { syncEdge(); }, [syncEdge, avail, tabs.length, width]);

  /* 竖滚轮换算成横向（设计侧 §一.1）：在 Tab 条上滚滚轮，人的意图是「看别的页签」，
     而这一条上没有纵向内容可滚。
     ⚠️ **必须用原生监听 + `passive: false`**。React 的 `onWheel` 挂的是 passive listener，
     在里面调 `preventDefault()` 只会得到一句
     `Unable to preventDefault inside passive event listener invocation.` ——
     滚动照样生效（`scrollLeft` 改得动），但控制台多一条 error，
     「零 error」那条判据当场抓到了它。**能用不等于对。** */
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const on = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // 本来就是横向手势，交给浏览器
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  /* **当前页签永远滚到看得见的位置**，但**只在它变了的时候滚** ——
     设计侧特意写了后半句：用户自己滚开之后不该被拽回来。
     所以这里盯的是 `current`，不是 scrollLeft。 */
  useEffect(() => {
    if (!current) return;
    const el = scroller.current?.querySelector(`[data-ud="tab"][data-path="${CSS.escape(current)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    syncEdge();
  }, [current, syncEdge]);

  /** 同名文件（两个 README.md）在名字后面带上目录名，页签和下拉里都一样 */
  const label = (path: string) => {
    const base = draftTitle(path);
    const same = list.filter((x) => x.path !== path && draftTitle(x.path) === base);
    if (!same.length) return base;
    const dir = path.split("/").slice(-2, -1)[0];
    return dir ? `${base} · ${dir}` : base;
  };

  /* 36px：第九轮定的**所有模块状态栏一个值**。
     理由不只是整齐 —— 三列并排时三条状态栏的底线在同一个 y 上，
     横着看是一条线贯穿全屏；44/34/34 混用时这条线断成三截，
     用户说的「高度不一致」看到的就是这个。 */
  /** 一个页签。**两组共用同一个渲染**（固定组和滚动组）——
   *  写两遍的话，将来改页签形制就要改两处，而漏改一处的症状是
   *  「固定的那几个长得不一样」，很难联想到是这里。 */
  const renderTab = (t: Tab) => {
        const cur = t.path === current;
        const dirty = dirtyStore.has(t.path);
        return (
          <div key={t.path} data-ud="tab" data-path={t.path} data-current={cur || undefined} data-preview={t.preview || undefined} data-pinned={t.pinned || undefined}
            style={{ width: t.pinned ? PIN_W : width, maxWidth: t.pinned ? PIN_W : width }}
            className={`group relative flex items-center gap-1.5 pl-3 pr-1.5 cursor-pointer select-none ${
              cur
                ? "bg-panel border border-b-0 border-border rounded-t-md -mb-px text-text"
                : "text-muted hover:text-text hover:bg-hover"} ${
              /* 预览态：**浅一档的颜色 + 不加粗**。不用斜体 ——
                 中文字体没有斜体，浏览器会硬斜切，很难看（设计侧特意写的）。 */
              t.preview ? "text-text2 font-normal" : cur ? "font-semibold" : ""}`}
            onClick={() => onPick(t.path)}
            onDoubleClick={() => onOpen(t.path)}
            onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, tab: t }); }}
            /* 悬停提示分三行（设计侧第十一轮 §一.2）：路径 · 读数 · 状态。
               ⚠️ 读数只对拿得到的那些写（现在是 `.dc.html`，它的读数在索引里）——
               别的类型的读数住在各自格式模块的 Provider 里，页签条这一层取不到。
               **拿不到就不写那一行**，不写「— · —」；第三行没状态也不写。 */
            title={[t.path, metaOf?.(t.path) || null,
              t.preview ? "预览页签：下一次单击别的文件会盖掉它，双击留下" : t.pinned ? "已固定" : null].filter(Boolean).join("\n")}>
            <Glyph icon={ICON_OF[kindOf(t.path)] ?? "file"} size={14}
              className={`shrink-0 ${cur && !t.preview ? "text-accent" : "text-muted"}`} />
            <span className="truncate flex-1">{label(t.path)}</span>
            <span className="w-4 h-4 shrink-0 grid place-items-center">
              {/* 固定的：关闭钮的位置换成图钉，点它 = 取消固定 */}
              {t.pinned ? (
                <button className="ib w-4 h-4 text-accent" onClick={(e) => { e.stopPropagation(); onPin(t.path, false); }} title="取消固定">
                  <Glyph icon="pin" size={12} />
                </button>
              ) : <>
                {/* 未保存点**占关闭钮的位置**，hover 时变成 ×（编辑器通行的写法） */}
                {dirty && <span className="w-1.5 h-1.5 rounded-full bg-text2 group-hover:hidden" title="改了还没落盘" />}
                <button className={`ib w-4 h-4 ${dirty ? "hidden group-hover:grid" : "opacity-0 group-hover:opacity-100"}`}
                  onClick={(e) => { e.stopPropagation(); onClose(t.path); }} title="关闭 ⌘W">
                  <Glyph icon="close" size={12} />
                </button>
              </>}
            </span>
          </div>
        );
  };

  return (
    <div ref={box} data-ud="tabbar" className={`h-9 flex items-stretch border-b border-border bg-panel shrink-0 text-xs relative ${busy ? "busyline" : ""}`}>
      {/* ① 固定的那一组：贴最左、不滚。滚动开始后右边出一条 1px 分隔线（设计侧） */}
      {pinned.length > 0 && (
        <div data-ud="tab-pinned" className={`shrink-0 flex items-stretch ${edge.left ? "border-r border-border" : ""}`}>
          {pinned.map((t) => renderTab(t))}
        </div>
      )}
      {/* ② 其余的：横向滚动。滚动条藏起来，被裁的那端 16px 渐隐 */}
      {/* `data-edge` 是判据钩子：computed 的 `mask-image` 会被浏览器规范化成
          `rgba(0, 0, 0, 0) 0px …`，按字符串判很脆（第一版就这么误判过一次）。
          哪一端被裁是个**离散状态**，直接写出来。 */}
      <div ref={scroller} data-ud="tab-scroll" data-edge={edge.left && edge.right ? "both" : edge.left ? "left" : edge.right ? "right" : "none"} onScroll={syncEdge}
        className="flex-1 min-w-0 flex items-stretch overflow-x-auto overflow-y-hidden no-scrollbar"
        style={{
          /* 两端渐隐用 mask：被裁的那一端才加。渐隐比「加一颗箭头」轻 ——
             它不占位置，也不需要用户点。 */
          maskImage: edge.left && edge.right ? "linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)"
            : edge.right ? "linear-gradient(90deg, #000 calc(100% - 16px), transparent 100%)"
            : edge.left ? "linear-gradient(90deg, transparent 0, #000 16px)" : undefined,
        }}>
        {tabs.length === 0 && <span className="px-3 self-center text-muted text-[11px]">还没打开文件 —— 从左边的目录里选一个</span>}
        {rest.map((t) => renderTab(t))}
      </div>
      {/* 下面这一段是原来的渲染逻辑，抽成 `renderTab` 给两组共用 */}
      {/* ⚠️ 「+N ▾」**去掉了**（设计侧第十一轮 §一.1）：改成一颗 28×28 的 `chevron-down`，
          摆在 ✎ ◨ ⋯ 左边，**只有放不下的时候才出现**。
          为什么不要「+N」：那个数字看着像「还有 3 个没显示」，而横向滚动之后
          「显示了几个」随时在变，写一个数反而让人去数。 */}
      {overflow && (
        <div className="shrink-0 flex items-center">
          <button data-ud="tab-more" ref={morePop.anchorRef as React.RefObject<HTMLButtonElement>}
            className={`w-7 h-7 grid place-items-center rounded self-center ${morePop.open ? "bg-hover text-text" : "text-muted hover:text-text hover:bg-hover"}`}
            onClick={morePop.toggle} aria-expanded={morePop.open} title="所有打开的文件">
            <Glyph icon="chevron-down" size={16} />
          </button>
          {/* 这一个自己带滚动容器，内边距归它管 */}
          <Popover pop={morePop} align="end" width={300} pad="0">
            <div className="max-h-[60vh] overflow-auto p-1">
              {list.map((t) => (
                <button key={t.path} className={`w-full px-2.5 py-1.5 flex items-center gap-2 text-left hover:bg-hover ${t.path === current ? "bg-accentSoft" : ""}`}
                  onClick={() => { morePop.close("pick"); onPick(t.path); }}>
                  <span className="w-3 shrink-0 text-accent">{t.path === current ? "✓" : ""}</span>
                  <Glyph icon={ICON_OF[kindOf(t.path)] ?? "file"} size={13} className="shrink-0 text-muted" />
                  <span className={`truncate flex-1 ${t.preview ? "text-text2" : ""}`}>{label(t.path)}</span>
                  {t.pinned && <Glyph icon="pin" size={12} className="shrink-0 text-accent" />}
                  {dirtyStore.has(t.path) && <span className="w-1.5 h-1.5 rounded-full bg-text2 shrink-0" title="改了还没落盘" />}
                </button>
              ))}
              {current && tabs.length > 1 && <>
                <PopSep />
                <PopItem label="关闭其他页签" onPick={() => { morePop.close("pick"); onCloseMany(closable(tabs, "others", current)); }} />
              </>}
            </div>
          </Popover>
        </div>
      )}
      {tail && <div className="shrink-0 flex items-center gap-0.5 px-1.5 border-l border-border">{tail}</div>}
      {ctx && <TabMenu ctx={ctx} tabs={tabs} onClose={() => setCtx(null)}
        on={{ onClose, onCloseMany, onPin, onKeep, onLocate, onToChat, onCopyPath, onReveal }} />}
    </div>
  );
}

/** 页签右键菜单（设计侧第九轮 §六.2）。
 *
 *  三个「关闭…」后面**写出真会关掉的个数** ——「点之前就知道结果」。
 *  未保存和固定的不算在内，一个都关不掉时整项置灰。
 *  这和目录右键那套「不弹确认、做完给撤销」是同一个思路：**把结果提前告诉人**。
 */
function TabMenu({ ctx, tabs, onClose, on }: {
  ctx: { x: number; y: number; tab: Tab };
  tabs: Tab[];
  onClose: () => void;
  on: {
    onClose: (p: string) => void; onCloseMany: (l: Tab[]) => void;
    onPin: (p: string, v: boolean) => void; onKeep: (p: string) => void;
    onLocate: (p: string) => void; onToChat: (p: string) => void;
    onCopyPath: (p: string) => void; onReveal: (p: string) => void;
  };
}) {
  const t = ctx.tab;
  const others = closable(tabs, "others", t.path);
  const right = closable(tabs, "right", t.path);
  const saved = closable(tabs, "saved", t.path);
  const run = (f: () => void) => () => { onClose(); f(); };
  return (
    <PopoverAt x={ctx.x} y={ctx.y} onClose={onClose} tag="tabmenu">
      <div>
        <div className="px-2.5 py-1 text-[11px] text-muted truncate" title={t.path}>{draftTitle(t.path)}</div>
        <PopItem label="关闭" hint="⌘W" onPick={run(() => on.onClose(t.path))} />
        <PopItem label="关闭其他" hint={`${others.length} 个`} onPick={others.length ? run(() => on.onCloseMany(others)) : undefined} />
        <PopItem label="关闭右侧" hint={`${right.length} 个`} onPick={right.length ? run(() => on.onCloseMany(right)) : undefined} />
        <PopItem label="关闭已保存的" hint={`${saved.length} 个`} onPick={saved.length ? run(() => on.onCloseMany(saved)) : undefined} />
        <PopSep />
        <PopItem label={t.pinned ? "取消固定" : "固定"} onPick={run(() => on.onPin(t.path, !t.pinned))} />
        {/* 「保持打开」只在预览页签上出现 —— 别的页签本来就是打开态 */}
        {t.preview && <PopItem label="保持打开" hint="双击" onPick={run(() => on.onKeep(t.path))} />}
        <PopSep />
        <PopItem label="在目录中显示" onPick={run(() => on.onLocate(t.path))} />
        <PopItem label="带进会话" onPick={run(() => on.onToChat(t.path))} />
        <PopSep />
        <PopItem label="复制路径" onPick={run(() => on.onCopyPath(t.path))} />
        <PopItem label="在访达中显示" onPick={run(() => on.onReveal(t.path))} />
      </div>
    </PopoverAt>
  );
}

/** 文件类型 → 图标名（第九轮那 56 颗里的） */
const ICON_OF: Record<string, IconName> = {
  dc: "file-dc", md: "file-md", image: "file-image", json: "file-json",
  code: "file-code", html: "file-web", other: "file", dir: "folder",
};
