/** 从系统里把文件 / 文件夹拖进来（M14-5 下半 · `doc/24` §二十二）。
 *
 *  ### 用户给的四个场景，和这里各自对应什么
 *
 *  | # | 他怎么拖 | 落在哪一层 |
 *  | --- | --- | --- |
 *  | ① | 拖进来，而当前开着一个项目 | `App.tsx` 的窗口级 drop → 问一句 |
 *  | ② | 拖到首页（或 Dock 图标） | `App.tsx` 的窗口级 drop → 直接打开（首页没东西可丢）；Dock 那条走 `open-file`，壳里已通 |
 *  | ③ | 拖到左边的文件列里 | `FileTree.tsx` 的 drop → 问「复制到这里吗」 |
 *  | ④ | 首页那颗「打开目录」 | 和拖拽无关，已有 |
 *
 *  ### 这个文件只做三件事
 *  ① 把 `DataTransfer` 换成磁盘路径（**经 host adapter**，理由见 `host/types.ts`）；
 *  ② 一个「正在往这里拖」的状态（`useDragOver`）；
 *  ③ 那两个问句的弹窗（`DropAsk`）。
 *
 *  ⚠️ **判「是不是在拖文件」不能只看 `dragover` 触发了**：在页面里拖一段文字、
 *  拖一个页签也会触发。要看 `dataTransfer.types` 里有没有 `"Files"` ——
 *  不看的话选中一段文字一拖，整个窗口就蒙上一层「松手打开」的罩子。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostAdapter } from "./types";

/** 这一次拖的是系统里的文件吗。 */
export function isFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  for (const t of Array.from(dt.types)) if (t === "Files") return true;
  return false;
}

/** 把 drop 事件里的文件换成磁盘上的绝对路径。
 *  ⚠️ **拿不到路径不等于没拖东西**：浏览器里 `files` 有而路径没有，
 *  所以调用方要分得清「没拖文件」和「拖了但这个宿主拿不到路径」——
 *  后者要说出原因（`capabilities().dropPaths.why`），不能静静没反应。 */
export function pathsFromDrop(host: HostAdapter, e: DragEvent | React.DragEvent): string[] {
  const dt = (e as DragEvent).dataTransfer ?? (e as React.DragEvent).dataTransfer;
  if (!dt) return [];
  return host.pathsForDrop(Array.from(dt.files));
}

/** 拖进来的**全都是文件夹**吗（设计侧第 59 封 §1：文件和文件夹的说法要分两句）。
 *
 *  ⚠️ **渲染进程没有 fs，所以这件事不能「看路径猜」** —— 没扩展名不等于是目录
 *  （`Makefile`、`LICENSE` 都没有）。用 `webkitGetAsEntry().isDirectory`：
 *  它是 drop 事件里**同步可用**的，而且问的是系统给的真实类型。
 *  ⚠️ **必须在 drop 事件的同步段里调** —— `dataTransfer` 一出事件处理器就失效，
 *  异步之后再问拿到的是空。所以它和 `pathsFromDrop` 一起在那一刻取完。
 *  ⚠️ 问不出来（没有 `items`、或者浏览器不给）就回 `false` ——
 *  **宁可说那句对文件成立的话**，因为拖文件是绝大多数。 */
export function allDirsInDrop(e: DragEvent | React.DragEvent): boolean {
  const dt = (e as DragEvent).dataTransfer ?? (e as React.DragEvent).dataTransfer;
  if (!dt?.items?.length) return false;
  const entries = Array.from(dt.items)
    .filter((it) => it.kind === "file")
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null));
  if (!entries.length || entries.some((x) => !x)) return false;
  return entries.every((x) => x!.isDirectory);
}

/** 「正在往这里拖文件」。
 *
 *  ⚠️ **`dragleave` 会在子元素之间来回触发**（鼠标从一个子节点移到另一个子节点，
 *  父节点上先 leave 再 enter）—— 只按 leave 关掉的话罩子会闪。
 *  所以数进出次数，归零才算真的离开了。这是这类代码最常见的那个 bug。 */
export function useDragOver(opts: { enabled?: boolean } = {}): {
  over: boolean;
  handlers: { onDragEnter: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void; onDragLeave: (e: React.DragEvent) => void };
  reset: () => void;
} {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const enabled = opts.enabled !== false;
  const reset = useCallback(() => { depth.current = 0; setOver(false); }, []);
  return {
    over: enabled && over,
    reset,
    handlers: {
      onDragEnter: (e) => {
        if (!enabled || !isFileDrag(e.dataTransfer)) return;
        e.preventDefault(); e.stopPropagation();
        depth.current++; setOver(true);
      },
      onDragOver: (e) => {
        if (!enabled || !isFileDrag(e.dataTransfer)) return;
        /* ⚠️ `dragover` 上**必须** `preventDefault()`，否则这个元素不算放置目标，
           `drop` 压根不会触发 —— 而「没反应」看起来和「没接拖拽」一模一样。 */
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e) => {
        if (!enabled) return;
        e.stopPropagation();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
    },
  };
}

/** 整个窗口级的拖拽（场景 ①②）。挂在 `window` 上，一个应用一次。
 *
 *  ⚠️ **还要把浏览器自己的默认行为拦掉**：不拦的话拖一份 PDF 进来，
 *  Chromium 会**直接导航到那个文件**，整个应用就没了（壳里 `will-navigate`
 *  会把它拦成「交给系统浏览器」，于是症状是「拖进来之后在 Safari 里打开了」）。
 *  所以 `document` 上的 `dragover` / `drop` 一律 `preventDefault`，
 *  不管落在哪个元素上。 */
export function useWindowFileDrop(onDrop: (e: DragEvent) => void, enabled = true): boolean {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const onOver = (e: DragEvent) => { if (isFileDrag(e.dataTransfer)) e.preventDefault(); };
    const onEnter = (e: DragEvent) => { if (!isFileDrag(e.dataTransfer)) return; e.preventDefault(); depth.current++; setOver(true); };
    const onLeave = () => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      depth.current = 0; setOver(false);
      /* ⚠️ 落在文件列里的那一下由文件列自己 `stopPropagation()` 接走了 ——
         这里收到的就只是「落在别处」的那些（场景 ①②）。
         **两个落点要有明确的分界，否则一次拖拽会弹两个问句。**
         ⚠️ 路径由调用方用 host adapter 取（这个文件里不许直接碰 Electron，
         `host/` 之外更不许 —— `doc/01` H7）。 */
      onDrop(e);
    };
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [onDrop, enabled]);
  return over;
}

/** 拖进来之后那一问（场景 ① 与 ③ 各一套文案，形制一样）。
 *
 *  ⚠️ **选项顺序不按「我们觉得哪个常用」排，按「哪个最不可逆」靠后排**：
 *  「在新窗口打开」什么都不动 · 「在当前窗口打开」会离开当前项目 ·
 *  「复制进来」会往他的项目里写文件。最靠右的主按钮是当前上下文里最可能的那个，
 *  但**会写文件的那一项一定带上会写到哪里**。 */
export function DropAsk({ paths, kind, destLabel, allDirs, host, onClose, onOpenHere, onNewWindow, onCopy }: {
  paths: string[];
  /** 拖进来的全是文件夹吗 —— 只影响正文那一句的说法（设计侧 §1） */
  allDirs?: boolean;
  /** `"outside"` = 落在工作台别处（场景 ①） · `"tree"` = 落在文件列里（场景 ③） */
  kind: "outside" | "tree";
  /** 场景 ③ 的目标目录给人看的名字（项目根写「项目根」） */
  destLabel?: string;
  host: HostAdapter;
  onClose: () => void;
  /** 只有场景 ①（落在工作台别处）有这一档：在当前窗口打开 = **离开当前项目**。
   *  场景 ③ 不给它 —— 人把东西拖进文件列的时候要的是「放进来」，
   *  在那里摆一颗「离开当前项目」只会让人点错。 */
  onOpenHere?: () => void;
  onNewWindow: () => void;
  onCopy?: () => void;
}) {
  const canWin = host.capabilities().newWindow.ok;
  const one = paths.length === 1 ? (paths[0]!.split("/").pop() || paths[0]!) : `${paths.length} 项`;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/25 flex items-start justify-center p-4 sm:py-[14vh]" data-ud="drop-ask"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="bg-panel border border-border rounded-lg shadow-2xl flex flex-col text-xs w-[460px] max-w-full">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">{kind === "tree" ? "复制到这个项目里？" : "怎么打开它？"}</h2>
        </div>
        <div className="px-5 flex flex-col gap-3">
          <p className="leading-relaxed">
            拖进来的是 <b className="text-text2 break-all">{one}</b>
            {/* ⚠️ **最多列 3 个名字**（设计侧 §1）：拖 12 个进来时那一串会把弹窗撑开，
                而第 4 个之后的名字对「要不要打开」这个决定没有帮助。 */}
            {paths.length > 1 && (
              <span className="text-muted">（{paths.slice(0, 3).map((x) => x.split("/").pop()).join(" · ")}
                {paths.length > 3 ? ` 等 ${paths.length} 项` : ""}）</span>
            )}。
          </p>
          {kind === "tree" ? (
            <p className="text-muted leading-relaxed">
              放进 <b className="text-text2">{destLabel || "项目根"}</b> 会<b className="text-text2">复制一份</b>进去
              —— 重名的自动顺延（<code className="font-mono text-[11px]">图 (1).png</code>），<b className="text-text2">不会覆盖</b>已有的文件。
              <br />原来那一份一个字节都不动。
            </p>
          ) : (
            <p className="text-muted leading-relaxed">
              {/* ⚠️ **文件和文件夹要分两句**（设计侧 §1）：「以它所在的位置为根」
                  只对文件成立；拖进来是文件夹时，根就是它自己。 */}
              <b className="text-text2">打开它不会复制任何文件</b> —— 我们
              {allDirs ? <>直接以这{paths.length > 1 ? "几" : "个"}个文件夹为根来看。</> : <>只是以它所在的文件夹为根来看。</>}
              <br />要把它<b className="text-text2">复制进当前项目</b>的话，把它拖到左边的<b className="text-text2">文件列</b>里。
            </p>
          )}
          {!canWin && (
            <p className="text-muted leading-relaxed">
              {host.capabilities().newWindow.why ?? "这个宿主开不了新窗口"} —— 所以只有「在当前窗口打开」。
            </p>
          )}
        </div>
        <div className="px-5 pt-3 pb-5 mt-4 flex items-center justify-end gap-2 border-t border-border">
          <button className="btn" onClick={onClose}>取消 Esc</button>
          {/* ⚠️⚠️ **主钮是「在新窗口里打开」**（设计侧第 59 封裁的）：它是**不破坏任何东西**的那一个。
              ⚠️ 而设计侧给的后果句「当前项目会关掉」**我没照抄，因为它在 M15-1 S2 之后不成立了** ——
              它审的是 S2 之前的行为（那时候打开另一个项目确实会顶掉当前那个）。
              现在「在当前窗口打开」实际做的是**把它加到这个窗口**，当前项目不关。
              所以那颗次钮**改名**叫「加到这个窗口」，后果句去掉。
              > **照抄一条正确的裁定，可能写出一句错的话** —— 裁定基于的那个行为变了。 */}
          {kind === "outside" && onOpenHere && (
            <button className="btn" data-ud="drop-here" onClick={onOpenHere}>加到这个窗口</button>
          )}
          {canWin
            ? <button className="btn primary" data-ud="drop-newwin" onClick={onNewWindow}>在新窗口里打开</button>
            : null}
          {kind === "tree" && onCopy && (
            <button className="btn primary" data-ud="drop-copy" onClick={onCopy}>复制进来</button>
          )}
        </div>
      </div>
    </div>
  );
}
