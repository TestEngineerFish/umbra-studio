import { studioName } from "@shared/brand";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Core } from "../api/client";
import { timeAgo, type FileEntry, type ListFilesResult } from "../api/types";
import { isFileDrag } from "../host/drop";
import { Glyph } from "../ui/Glyph";
import { CtxMenu, itemsFor, type CtxActions, type CtxTarget } from "./ctxmenu";
import { toast } from "../ui/Toast";
import { kindDef } from "@shared/kinds";
import { PopoverAt } from "../ui/Popover";
import { inActive } from "./scope";   // 并存：只找当前那个工作台（M15-1 S2）

/** 常驻目录列里的那棵树（M8-11，形制按设计侧第六轮的 S11 窄列 / S12）。
 *
 *  和 `DirView` 的分工：这里是**导航**，一直在，只放名称和一个状态点；
 *  `DirView`（S12 宽区）是**干活的地方**，有勾选框、读数、网格。两边共用同一个 `expanded`。
 *
 *  尺寸是设计侧定的一套，别各改各的：
 *  每层缩进 16px（正好是三角的宽度，所以子项的三角落在父项图标正下方）、
 *  三角 16px、类型图标 14px、行高 28px。**不画层级线** —— 层级靠缩进和三角对位表达。
 */
const INDENT = 16, ROW_H = 28;

/* 图标问 `@shared/kinds`，这里不留第二张表（M8-14） */

export interface TreeProps {
  core: Core;
  /** 当前在详情区打开的文件（相对路径），用来高亮 + 自动展开祖先 */
  current: string | null;
  /** 哪些目录是展开的 —— 存在 layout 里，和 DirView 共用 */
  expanded: string[];
  onExpandedChange: (next: string[]) => void;
  /** 单击文件 / 双击目录（双击是「在详情区以它为根打开」） */
  /** `dbl` = 双击（打开态）。单击是预览态 —— 会被下一次单击盖掉 */
  onOpenFile: (path: string, dbl?: boolean) => void;
  onOpenDir: (path: string) => void;
  /** 列头显示的项目名，点它回到根 */
  projectName: string;
  /** 右键菜单要的动作（M8-21）。目录列和目录视图共用同一套定义，见 `ctxmenu.tsx` */
  actions: CtxActions;
  /** 已经塌成「已移到回收站 · 撤销」的那几行 */
  trashed: string[];
  /** 那几行上要补的一句「有几处引用它，会断」。**只有有引用的才在这里面**（M16-8 ⑤）。 */
  trashWarn?: Record<string, string>;
  onUndoTrash: (path: string) => void;
  /** 文件变动的信号（传最近一次事件的时刻即可）：变了就把已展开的层重新拉一遍 */
  tick: string;
  /** 就地改名成功了（issue #105）。
   *
   *  ⚠️ **树自己只能重拉这一层，改不了别人手里的路径。** 工作台里以路径为键的状态
   *  至少六处（`tabs` / `store.selected` / `us.lastDraft` / `editBy` / `dirtyStore`），
   *  原来一个都不跟着改 —— 页签还叫旧名、指着一个已经不存在的路径。
   *  所以改名这件事**要报出去**，由持有路径的那一层自己迁。 */
  onRenamed: (from: string, to: string) => void;
  /** 改名之前问一句（issue #105）。回 `false` = 用户反悔了，不改。
   *
   *  ⚠️ 这道闸是给「那份文件有没落盘的改动」用的：改动在插件的内存里、
   *  以**旧路径**为键，改完名它按新路径重读 → **改动没了，一句话都不说**。
   *  而切文件 / 关页签都经过这道闸，**只有改名绕过了它**。 */
  beforeRename?: (path: string) => Promise<boolean>;
  /** 从系统里把文件 / 文件夹拖进了树里（场景 ③，M14-5 下半）。
   *  `destDir` 是落点（`""` = 项目根）。**树自己不复制，也不认识宿主** ——
   *  它只报「拖了这几个 File、落在哪一层」，换磁盘路径那一步由工作台经 host adapter 做
   *  （`doc/01` H7：**`host/` 之外不许出现宿主 API**，而 `File → 路径` 只有壳给得出来）。
   *  问句和那件写操作也归工作台 —— 和 `onRenamed` 同一个分工：**树不持有别人的决定**。 */
  onDropFiles?: (files: File[], destDir: string) => void;
}

/** 点到「指向项目外的链接」时说的那句话（issue #140）。
 *  ⚠️ **要给出路** —— 只说「打不开」用户会以为是软件坏了。 */
const sayOutside = (path: string): void =>
  toast("这是一条指向项目外面的链接", `${path} 指到项目目录外面。从这里读写它等于读写项目外的文件，所以不放行。要改那个文件，直接打开它真正所在的那个目录。`, "error");

export function FileTree({ core, current, expanded, onExpandedChange, onOpenFile, onOpenDir, projectName, actions, trashed, trashWarn, onUndoTrash, tick, onRenamed, beforeRename, onDropFiles }: TreeProps) {
  const [goto, setGoto] = useState(false);
  const [q, setQ] = useState("");
  const [ctx, setCtx] = useState<{ x: number; y: number; target: CtxTarget } | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  /** 正在就地改名的那一行（设计侧 §五：重命名就地改，不弹窗 ——
   *  弹窗要把视线从树里拉走，而改名的时候人正盯着这一行） */
  const [renaming, setRenaming] = useState<string | null>(null);
  /** 正被拖到哪个目录上（`""` = 项目根 / 空白处，`null` = 没在拖）。
   *  ⚠️ **要把落点画出来**：一个 460px 宽的问句弹窗事后告诉人「放进了 X」，
   *  已经晚了 —— 他要在**松手之前**知道会放到哪一层。 */
  const [dropAt, setDropAt] = useState<string | null>(null);
  /** 这一行作为拖拽落点代表哪一层目录。 */
  const dirOfRow = (e: FileEntry): string => (e.isDir ? e.path : e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "");
  /* 每一层的内容按需拉，拉过就留在内存里。`children[path] === undefined` = 还没拉过，
     这和后端约定的「children 缺省表示未拉取、[] 表示空目录」是同一套语义。 */
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const expSet = new Set(expanded);

  const load = useCallback(async (dir: string) => {
    setLoading((s) => new Set(s).add(dir));
    const r = await core.get<ListFilesResult>(`files?dir=${encodeURIComponent(dir)}`);
    setLoading((s) => { const n = new Set(s); n.delete(dir); return n; });
    if (r.ok && r.data) setChildren((c) => ({ ...c, [dir]: r.data!.entries }));
  }, [core]);

  /* 挂载时除了根，**还要把已经展开的那些层一起拉回来**。
     `expanded` 存在 layout 里能活过卸载，而 `children` 是组件内的内存缓存，
     ⌘B 收起时整棵树卸载、缓存就没了 —— 不补这一步，再展开会看到
     「三角是展开的、底下一个子项都没有」（2026-09-24 截图里抓到的，自动测试当时没测出来）。 */
  useEffect(() => {
    void load("");
    for (const d of expanded) void load(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  /* 盘上变了就重拉**已经展开的那些层** —— 只重拉根会让展开着的子目录显示旧内容。
     没展开的层等下次展开时自然是新的。 */
  useEffect(() => {
    if (!tick) return;
    for (const d of ["", ...expanded]) if (children[d] !== undefined) void load(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /* 打开一个文件时，把它的祖先自动展开 —— 不然用户点了页签，树里却看不见它在哪 */
  const lastCurrent = useRef<string | null>(null);
  useEffect(() => {
    if (!current || current === lastCurrent.current) return;
    lastCurrent.current = current;
    const parts = current.split("/").slice(0, -1);
    const need: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts.slice(0, i + 1).join("/");
      if (!expSet.has(p)) need.push(p);
    }
    if (need.length) onExpandedChange([...expanded, ...need]);
    for (const p of need) if (children[p] === undefined) void load(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    const on = () => { setGoto(true); setQ(""); };
    window.addEventListener("ud-goto-file", on); return () => window.removeEventListener("ud-goto-file", on);
  }, []);

  /** 「在目录中显示」高亮的那一行（1.2 s 后退回普通的当前行，设计侧 §六.2） */
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const on = (ev: Event) => {
      const path = (ev as CustomEvent<string>).detail;
      if (!path) return;
      /* 先把祖先都展开，再滚过去 —— 目录没展开的话那一行根本不在 DOM 里 */
      const parts = path.split("/").slice(0, -1);
      const need: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const p2 = parts.slice(0, i + 1).join("/");
        if (!expanded.includes(p2)) need.push(p2);
      }
      if (need.length) onExpandedChange([...expanded, ...need]);
      for (const p2 of need) if (children[p2] === undefined) void load(p2);
      setFlash(path);
      setTimeout(() => inActive(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), need.length ? 400 : 60);
      setTimeout(() => setFlash((f) => (f === path ? null : f)), 1200);
    };
    window.addEventListener("ud-locate-file", on); return () => window.removeEventListener("ud-locate-file", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, children]);

  const toggle = (path: string) => {
    const next = expSet.has(path) ? expanded.filter((x) => x !== path) : [...expanded, path];
    onExpandedChange(next);
    if (!expSet.has(path) && children[path] === undefined) void load(path);
  };

  const rows = (dir: string, depth: number): React.ReactNode[] => {
    const list = children[dir];
    if (list === undefined) return [];
    if (list.length === 0) return [<Empty key={dir + ":empty"} depth={depth} text="空目录" />];
    const out: React.ReactNode[] = [];
    /* `.git` 这类基础设施目录排到**同级末尾**（Q77，用户选的「显示但折叠」）。
       ⚠️ 排序只按服务端给的 `opaque` 标记，不按名字猜 —— 名单只有一份，在服务端。
       服务端已经按「目录在前、其余按更新时间倒序」排过了，这里**只把 opaque 的挪到后面**，
       其余相对顺序不动（`sort` 对相等元素稳定）。 */
    const ordered = [...list].sort((a, b) => Number(!!a.opaque) - Number(!!b.opaque));
    for (const e of ordered) {
      const open = expSet.has(e.path);
      const isCur = e.path === current;
      /* 已移到回收站的行：**原地塌成一行撤销**，不弹确认框（沿用 S1 的口径：
         先做，再给一步回头路）。落实时机由上层的四条规则决定。 */
      if (trashed.includes(e.path)) {
        /* ⚠️ 「有几处引用它」那一句（M16-8 ⑤）：**第二行**，而不是挤进同一行。
           挤进去的话文件名和那句警告会**互相截断**，而目录列本来就窄。
           ⚠️ 行高因此比 `ROW_H` 高 —— 这里**不是虚拟滚动**（`ROW_H` 只是统一行高，
           没有按 scrollTop 切片），所以变高是安全的。
           > **一个「行高写死」的约定，只有在有人按它算位置时才是约束。**
           ⚠️ 用 `--tool-warn` 而不是红：这不是错误，是「你刚那一下有代价」。 */
        const warn = trashWarn?.[e.path];
        out.push(
          <div key={e.path} className="pr-2 text-[11px] text-muted" style={{ paddingLeft: 6 + depth * INDENT }}>
            <div className="flex items-center gap-2" style={{ height: ROW_H }}>
              <span className="flex-1 truncate">已移到回收站 · {e.name}</span>
              <button className="btn sm ghost" onClick={() => onUndoTrash(e.path)}>撤销</button>
            </div>
            {warn && <div className="pb-1.5 leading-snug" data-ud="trash-warn" style={{ color: "var(--tool-warn)" }}>{warn}</div>}
          </div>,
        );
        continue;
      }
      if (renaming === e.path) {
        out.push(
          <div key={e.path} className="flex items-center gap-1.5 pr-2" style={{ height: ROW_H, paddingLeft: 6 + depth * INDENT + 20 }}>
            {/* `data-ud="rename"` 是判据钩子（issue #105）—— 树里还有个搜索输入框，
                按「最后一个 input」挑会挑错（§159.3 ② 同一个错法：`.last()` 挑到了复选框）。 */}
            <input autoFocus defaultValue={e.name} data-ud="rename" className="flex-1 min-w-0 h-6 px-1.5 rounded border border-accent bg-bg outline-none text-xs"
              /* 默认选中去掉扩展名的部分（设计侧 §五）—— 改名十有八九只改名字那一段 */
              onFocus={(ev) => { const dot = e.name.indexOf("."); ev.target.setSelectionRange(0, dot > 0 ? dot : e.name.length); }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                if (ev.key === "Escape") { ev.stopPropagation(); setRenaming(null); }
              }}
              onBlur={(ev) => {
                const name = ev.target.value.trim();
                setRenaming(null);
                if (!name || name === e.name) return;
                const dir = e.path.split("/").slice(0, -1).join("/");
                const to = dir ? `${dir}/${name}` : name;
                void (async () => {
                  /* ⚠️ **先过「未落盘」那道闸**（issue #105）：改完名插件按新路径重读，
                     内存里那份以旧路径为键的改动就没了。 */
                  if (beforeRename && !(await beforeRename(e.path))) return;
                  const r = await core.post("file_move", { from: e.path, to });
                  if (!r.ok) { window.dispatchEvent(new CustomEvent("ud-toast", { detail: { title: "改不了名", body: r.errors?.[0]?.message, kind: "error" } })); return; }
                  void load(dir);
                  /* ⚠️ **报出去**：树重拉了自己这一层，而页签 / 详情区 / 编辑栏开合
                     还都指着旧路径（issue #105）。 */
                  onRenamed(e.path, to);
                })();
              }} />
          </div>,
        );
        continue;
      }
      out.push(
        <div key={e.path} role="treeitem" data-path={e.path} aria-expanded={e.isDir ? open : undefined} aria-selected={isCur}
          className={`flex items-center gap-1.5 pr-2 cursor-pointer select-none ${isCur ? "bg-accentSoft text-accent font-semibold" : "hover:bg-hover"} ${
            ctx && "path" in ctx.target && ctx.target.path === e.path ? "ring-1 ring-inset ring-accent" : ""} ${
            flash === e.path ? "ring-1 ring-inset ring-accent" : ""} ${
            /* ⚠️ **只有「目录行自己」亮，不是「落点等于我所在的目录」就亮**。
               后者是第一版，而它的后果是：拖到一个根级文件上时 `dirOfRow` 是 `""`，
               于是**每一行根级文件一起亮** —— 看上去像「会放到所有这些地方」。
               落点是项目根时亮的是树的空白区（下面那个容器），那才是「根」的样子。 */
            dropAt !== null && e.isDir && dropAt === e.path ? "bg-accentSoft ring-1 ring-inset ring-accent" : ""}`}
          style={{ height: ROW_H, paddingLeft: 6 + depth * INDENT, ...(e.opaque || e.outsideLink ? { opacity: 0.55 } : null) }}
          title={e.outsideLink
            ? `${e.path} —— 这是一条指向项目外面的链接。看得见，但从这里读写它等于读写项目外的文件，所以打不开。`
            : e.opaque ? `${e.path} —— 版本控制自己的数据。看得见，但 ${studioName} 不碰它，也不计入项目统计。` : e.path}
          /* ⚠️ 指向项目外的链接**点了要说一句**，不是静默不动（issue #140）——
             「点了没反应」这一族在本项目里出现过太多次；而这里**有一个真实的理由**
             可以说出来，不说才是浪费。 */
          onClick={() => (e.outsideLink ? sayOutside(e.path) : e.isDir ? toggle(e.path) : onOpenFile(e.path))}
          onDoubleClick={() => (e.outsideLink ? sayOutside(e.path) : e.isDir ? onOpenDir(e.path) : onOpenFile(e.path, true))}
          onContextMenu={(ev) => {
            ev.preventDefault(); ev.stopPropagation();
            setCtx({ x: ev.clientX, y: ev.clientY, target: e.isDir
              ? { kind: "dir", path: e.path, name: e.name }
              /* ⚠️ 这里原来带一个 `isDraft: false` 的常量字段 —— C3 之后
                 `e.kind === "dc"` 永远为假，而当时不能改成 `true`（`duplicateDraft`
                 硬编码 `.dc.html`，对 `.md` 是个假按钮）。M16-8 ② 把那件能力通用化了，
                 于是**字段整个去掉**，「复制一份」对任何文件都在。 */
              : { kind: "file", path: e.path, name: e.name } });
          }}
          /* ── 拖进来落在这一行（场景 ③）──
             ⚠️ **落在文件行上算「放进它所在的目录」**，不是「放到这个文件上」：
             一个文件不是容器，而人确实会瞄着文件松手。
             不这么做的话，瞄歪一行就什么都不会发生 —— 又一条「点了没反应」。 */
          onDragEnter={(ev) => { if (!onDropFiles || !isFileDrag(ev.dataTransfer)) return; ev.preventDefault(); ev.stopPropagation(); setDropAt(dirOfRow(e)); }}
          onDragOver={(ev) => {
            if (!onDropFiles || !isFileDrag(ev.dataTransfer)) return;
            ev.preventDefault(); ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
            setDropAt(dirOfRow(e));
          }}
          onDrop={(ev) => {
            if (!onDropFiles || !isFileDrag(ev.dataTransfer)) return;
            /* ⚠️ `stopPropagation` 是**两个落点的分界线**：不拦的话窗口级那个处理器
               也会收到同一下，于是一次拖拽弹两个问句（`host/drop.tsx` 文件头那条）。 */
            ev.preventDefault(); ev.stopPropagation();
            const files = Array.from(ev.dataTransfer.files);
            setDropAt(null);
            onDropFiles(files, dirOfRow(e));
          }}>
          {/* 三角占位：文件也占同样宽度，图标才对得齐 */}
          <span className="w-4 shrink-0 text-[10px] text-muted grid place-items-center transition-transform"
            style={{ transform: e.isDir && open ? "rotate(90deg)" : "none" }}>{e.isDir ? "▶" : ""}</span>
          {/* ⚠️ 原来稿也用强调色（和「当前文件」同一个颜色）—— C3 之后没有「稿」这一类，
              所以只有当前文件是强调色。 */}
          <span className={`w-[14px] shrink-0 text-center text-[13px] ${isCur ? "text-accent" : "text-muted"}`}>
            {kindDef(e.isDir ? "dir" : e.kind).icon}
          </span>
          <span className="truncate flex-1 text-xs leading-none">{e.name}</span>
          {/* 「通过」不挂点（设计侧口径：只有该看的才出现）。
              TODO 未落盘的 warn 点：前端目前拿不到这个信号，等 S1 那套 hasUnsaved 接到工作台再补 */}
        </div>,
      );
      if (e.isDir && open) {
        if (loading.has(e.path) && children[e.path] === undefined) out.push(<Loading key={e.path + ":ld"} depth={depth + 1} />);
        else out.push(...rows(e.path, depth + 1));
      }
    }
    return out;
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      {/* 列头：项目名（点回根）+ 两颗导航钮。钮常驻不 hover 才出 —— 键盘和触控都要够得着 */}
      {/* 高度和分隔线都跟页签条对齐（34px + border-b）——
          目录列通栏之后它和页签条并排，差 2px 或少一条线，那条横线就是断的 */}
      {/* 36px —— 所有模块状态栏一个值（第九轮 §二） */}
      <div ref={headRef} data-ud="tree-head" className="h-9 pl-2.5 pr-1 flex items-center gap-0.5 shrink-0 text-xs relative border-b border-border">
        {/* 项目名**右键 = 空白处菜单**（M8-21）。
            光靠「树的空白区」不够：树一满就没有空白可点，用户等于没法在根目录新建。
            项目名就是项目根，在它上面右键最说得通。 */}
        <button className="min-w-0 flex-1 flex items-center gap-1.5 h-7 px-1 rounded font-semibold hover:bg-hover text-left"
          onContextMenu={(ev) => { ev.preventDefault(); setCtx({ x: ev.clientX, y: ev.clientY, target: { kind: "blank" } }); }}
          onClick={() => onOpenDir("")} title="回到项目根（右键：对项目根的操作）">
          <Glyph icon="folder-open" className="text-muted shrink-0" /><span className="truncate">{projectName}</span>
        </button>
        <button className="w-6 h-6 grid place-items-center rounded text-muted hover:bg-hover hover:text-text shrink-0"
          onClick={() => { setGoto((g) => !g); setQ(""); }} title="转到文件（⌘P）" aria-label="转到文件">
          <Glyph icon="search" />
        </button>
        {/* 第九轮：**收起钮删掉**（用户第 14 条「有点多余」）—— 目录的显隐只归顶栏那一颗。
            这个位置换成 `⋯`，和在空白处右键是**同一张菜单**：
            两个入口指向同一个对象、列的是同一张单，不算一件事两个入口（设计侧 §一.2）。 */}
        <button data-ud="tree-more" className="w-7 h-7 grid place-items-center rounded text-muted hover:bg-hover hover:text-text shrink-0"
          onClick={(ev) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setCtx({ x: r.left, y: r.bottom + 2, target: { kind: "blank" } }); }}
          title="对这个项目的操作" aria-label="更多">
          <Glyph icon="more" />
        </button>
        {goto && headRef.current && <GotoFile core={core} q={q} setQ={setQ} current={current} tick={tick}
          anchor={{ x: headRef.current.getBoundingClientRect().left + 4, y: headRef.current.getBoundingClientRect().bottom - 4, w: headRef.current.getBoundingClientRect().width - 8 }}
          onPick={(f) => { setGoto(false); onOpenFile(f); }} onClose={() => setGoto(false)} />}
      </div>
      {/* 空白处 = 项目根（设计侧 §五）。所以在树的空白区右键，新建就落在根目录。 */}
      <div className={`flex-1 min-h-0 overflow-auto pb-2 ${dropAt === "" ? "ring-1 ring-inset ring-accent bg-accentSoft/40" : ""}`} role="tree"
        data-ud="tree-body"
        onContextMenu={(ev) => { ev.preventDefault(); setCtx({ x: ev.clientX, y: ev.clientY, target: { kind: "blank" } }); }}
        /* 空白处 = 项目根，和右键菜单同一个口径（设计侧 §五）——
           **两个入口指着同一个对象，就该用同一个口径**，否则「右键新建落在根、
           拖拽落在别处」会让人以为空白区有两种含义。 */
        onDragEnter={(ev) => { if (!onDropFiles || !isFileDrag(ev.dataTransfer)) return; ev.preventDefault(); setDropAt(""); }}
        onDragOver={(ev) => {
          if (!onDropFiles || !isFileDrag(ev.dataTransfer)) return;
          ev.preventDefault(); ev.dataTransfer.dropEffect = "copy";
          /* ⚠️ 只在**还没有**更具体的落点时才接 —— 行上那几个处理器会
             `stopPropagation()`，所以走到这里就说明落在空白区。 */
          setDropAt("");
        }}
        onDragLeave={(ev) => { if (ev.currentTarget === ev.target) setDropAt(null); }}
        onDrop={(ev) => {
          if (!onDropFiles || !isFileDrag(ev.dataTransfer)) return;
          ev.preventDefault(); ev.stopPropagation();
          const files = Array.from(ev.dataTransfer.files);
          setDropAt(null);
          onDropFiles(files, "");
        }}>
        {children[""] === undefined ? <Loading depth={0} /> : rows("", 0)}
        {/* 底部留一块空白，专门接「空白处右键」—— 树短的时候这里本来就是空的，
            树长的时候滚到底也有一块。两条路都留着。 */}
        <div className="min-h-[56px]" />
      </div>
      {ctx && <CtxMenu x={ctx.x} y={ctx.y} items={itemsFor(ctx.target, { ...actions, rename: setRenaming })} onClose={() => setCtx(null)} />}
    </div>
  );
}


/** 「转到文件」浮层（⌘P）。原来是页签条右边那颗「N 份稿 ▾」——
 *  按第七轮的分层，它变的是「在详情区看哪份文件」，属于导航，所以跟着目录列走。
 *
 *  ⚠️⚠️ **2026-10-23（Q85 / M16-7c-1b）换了数据源，而这是它第二次换。**
 *  它原来搜的是 `list_drafts`，也就是**全项目的 `.dc.html`** —— C3 删掉设计稿之后
 *  那份名单恒为空，于是 7c-1 把整个功能删了并照实记成「数据源消失」的欠账。
 *  现在搜 `list_files?recursive=true`（Q85 为它新开的那一档，上限 5000）。
 *
 *  ⚠️ **三样东西一个字没改**：120ms 防抖 · 焦点不离开输入框的漫游（`keys="off"` +
 *  `aria-activedescendant`）· 「还有 N 条」的截断说明。那是 sam 2026-09-27 tmp.txt
 *  第 2 条提的需求，和数据源无关 —— 换数据源不是重做交互。
 *
 *  ⚠️ **列换了三样**：原来是 `稿名 / 健康点 / 版本号`（全是索引里算好的 dc 读数），
 *  现在是 `文件名 / 相对路径（灰字）/ 改动时间`。健康与版本对普通文件压根不存在，
 *  留一个永远空的列比不留糟。 */
function GotoFile({ core, q, setQ, current, tick, onPick, onClose, anchor }: {
  core: Core; q: string; setQ: (v: string) => void; current: string | null; tick: string;
  onPick: (file: string) => void; onClose: () => void; anchor: { x: number; y: number; w: number };
}) {
  /* 名单在**打开浮层时取一次**，不是每次打字都问服务端 ——
     筛选是内存里的（下面那个 `filter`），而递归列全项目是一次几十毫秒的 IO。
     ⚠️ `tick` 进依赖：盘上有文件增删时（磁盘监听 → 工作台 bump）这一份要跟着重取，
     否则刚建出来的文件在这里搜不到，而用户刚刚看见它出现在树里。 */
  const [all, setAll] = useState<FileEntry[] | null>(null);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    let dead = false;
    void core.get<ListFilesResult>("files?recursive=true").then((r) => {
      if (dead) return;
      /* ⚠️ 拿不到就给空数组**而不是停在 null** —— null 画的是「正在找」，
         而一个永远转着的转圈比一句「没有匹配」糟。失败的那一句由下面 `all` 为空时的文案兜。 */
      setAll(r.ok && r.data ? r.data.entries : []);
      setCut(!!r.data?.truncated);
    }).catch(() => { if (!dead) setAll([]); });
    return () => { dead = true; };
  }, [core, tick]);

  /* ═══ 打字才出结果、防抖、只列前 10（用户 tmp.txt 第 2 条，2026-09-27）═══
     为什么空串不列全部：**打开这个浮层的动作本身不表达「我要看全部文件」** ——
     要看全部，目录列一直在左边。空着就列全部只有两个效果：
     首次打开要渲染几百行，以及把真正的入口埋在噪音里。
     防抖 120ms：筛选本身是内存里的，不花钱；**花钱的是渲染**。 */
  const [dq, setDq] = useState(q);
  useEffect(() => { const t = setTimeout(() => setDq(q), 120); return () => clearTimeout(t); }, [q]);
  const kw = dq.trim().toLowerCase();
  /* 名字和路径都能搜（原来是 `title + file`，同一个口径） */
  const hits = kw && all ? all.filter((e) => `${e.name} ${e.path}`.toLowerCase().includes(kw)) : [];
  const MAX = 10;
  const rows = hits.slice(0, MAX);
  const more = hits.length - rows.length;
  const [act, setAct] = useState(0);
  const [grown, setGrown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(r); }, []);
  const hit = Math.min(act, Math.max(0, rows.length - 1));
  useEffect(() => { setAct(0); }, [kw]);
  const rowId = (i: number) => `goto-row-${i}`;
  return (
      <PopoverAt x={anchor.x} y={anchor.y} onClose={onClose} width={anchor.w} pad="0" keys="off">
      <div className="max-h-[60vh] flex flex-col">
        <div className="anim-col m-1.5" style={{ width: grown ? "auto" : 0, opacity: grown ? 1 : 0 }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="转到文件…"
          role="combobox" aria-expanded aria-controls="goto-list"
          aria-activedescendant={rows.length ? rowId(hit) : undefined}
          className="w-full h-7 px-2 rounded border border-borderStrong bg-bg outline-none focus:border-accent text-xs"
          onKeyDown={(e) => {
            if (e.key === "Escape") { if (q) setQ(""); else onClose(); return; }
            if (!rows.length) return;
            if (e.key === "Enter") { e.preventDefault(); onPick(rows[hit]!.path); return; }
            const mv = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
            const to = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : mv ? (hit + mv + rows.length) % rows.length : -1;
            if (to < 0) return;
            e.preventDefault(); setAct(to);
            inActive(`#${CSS.escape(rowId(to))}`)?.scrollIntoView({ block: "nearest" });
          }} />
        </div>
        <div id="goto-list" role="listbox" className="flex-1 overflow-auto pb-1">
          {all === null ? <div className="px-2 py-3 text-muted text-[11px] text-center">正在列这个项目的文件…</div>
            : !kw ? <div className="px-2 py-3 text-muted text-[11px] text-center">打几个字开始找 —— 名字或路径都行</div>
            : rows.length ? rows.map((e, i) => (
            <button key={e.path} id={rowId(i)} role="option" aria-selected={i === hit} tabIndex={-1}
              onMouseEnter={() => setAct(i)}
              className={`w-full px-2 py-1 flex items-center gap-2 text-left ${i === hit ? "bg-hover" : ""} ${e.path === current ? "bg-accentSoft" : ""}`} onClick={() => onPick(e.path)}>
              <span className="shrink-0 text-muted">{kindDef(e.kind).icon}</span>
              <span className="truncate shrink-0 max-w-[45%] text-xs">{e.name}</span>
              {/* 相对路径：**同名文件只能靠它分辨**（`README.md` 在一个项目里常有好几份）。
                  ⚠️ **只画目录那一段**，不画整条 `path` —— 整条的话根目录的文件
                  会在同一行里把自己的名字写两遍（实测读数：
                  `≡ CHANGELOG-设计侧.md CHANGELOG-设计侧.md 15 小时前`）。
                  > **一个「为了消歧」的列，在不需要消歧的那一行里就是噪音。**
                  这一条是判据的 detail 暴露的：它当时红在一个写错的条件上
                  （我要求路径里有 `/`），而**读数顺带把重复画出来了**。 */}
              <span className="truncate flex-1 text-muted font-mono text-[11px]">{e.path.slice(0, e.path.length - e.name.length)}</span>
              <span className="text-muted text-[11px] shrink-0">{timeAgo(e.updatedAt)}</span>
            </button>
          )) : <div className="px-2 py-3 text-muted text-[11px] text-center">没有匹配的文件</div>}
        </div>
        {/* 截断要说出来 —— 「只列了前 10」和「一共就这 10 条」不是一回事 */}
        {more > 0 && <div className="px-2 h-6 flex items-center border-t border-border text-[11px] text-muted">还有 {more} 条 —— 再多打几个字缩小范围</div>}
        {/* ⚠️ **项目超过 5000 个文件时照实说**（geek-99 2026-10-23 定的口径）——
            不说的话「搜不到某个文件」看起来和「这个文件不存在」一模一样。
            ⚠️ 这句话**不能写成「还有 N 个没搜」**：那条路扫到上限就停，
            压根算不出项目里一共有多少（见 `ListFilesResult.total` 的注释）。 */}
        {cut && <div className="px-2 py-1 flex items-center border-t border-border text-[11px] text-warn">项目太大，只搜了前 {all?.length ?? 0} 个文件</div>}
      </div>
      </PopoverAt>
  );
}

const Loading = ({ depth }: { depth: number }) => (
  <div className="flex items-center gap-1.5 text-[11px] text-muted" style={{ height: ROW_H, paddingLeft: 6 + depth * INDENT + 20 }}>
    <span className="inline-block w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />读取中…
  </div>
);
const Empty = ({ depth, text }: { depth: number; text: string }) => (
  <div className="text-[11px] text-muted" style={{ height: ROW_H, lineHeight: `${ROW_H}px`, paddingLeft: 6 + depth * INDENT + 20 }}>{text}</div>
);
