import { useEffect, useRef, useState } from "react";
import type { Picked, SourceData } from "../../api/types";
import type { ProjectStore } from "../../store/project";
import type { ViewContext } from "../context";
import { useDc } from "./bridge";
import { CommentBox } from "./CommentBox";
import { Pins } from "./Pins";

/** 画布：S2 嵌入壳 iframe（编辑）/ 稿本身（预览）/ 源码只读。
 *  **工具栏不在这里** —— 第七轮把它搬到了统一那条横带（`index.tsx` 的 `Toolbar`）。
 *  iframe 只在换稿 / 换档时重建；其它状态变化不碰它
 *  （就地编辑的内层 iframe 会被卸掉，`00` §四十三 踩过）。 */
export function DcView({ ctx, store, picked }: { ctx: ViewContext; store: ProjectStore; picked: Picked | null }) {
  const d = useDc();
  const note = d.shell.editHint || d.shell.checkNote || (d.shell.apiErr ? "出错：" + d.shell.apiErr : "") || (d.shell.busy ? "落盘中…" : "");
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-canvas relative">
      {/* 画布的临时提示（就地编辑中 / 体检结果 / 出错）贴在画布顶上，不占工具栏那一行 ——
          它是一条会来会走的状态，混进工具栏会让开关跟着跳 */}
      {note && <div className="h-7 px-3 flex items-center text-[11px] text-accent bg-panel border-b border-border shrink-0 truncate" title={note}>{note}</div>}
      {d.mode === "code"
        ? <CodeView src={store.source && store.source.file === d.file ? store.source : null} picked={picked} />
        : <Canvas />}
      {/* 评论框：评论档点中元素后贴在它下面。**在画布之外渲染**（fixed）——
          它要盖在 iframe 上，而 iframe 里面我们塞不进 DOM。 */}
      <CommentBox ctx={ctx} />
      {/* 评论钉：和评论框一样画在 iframe 外面，靠穿透读到的坐标定位 */}
      <Pins ctx={ctx} />
      {d.present && <Present src={d.rawSrc} onStop={() => d.setPresent(false)} />}
    </div>
  );
}

/** 画布的 iframe **池**（M8-34 · 设计侧第十一轮 §四）。
 *
 *  用户说「预览页面的刷新……要闪烁的那么突兀」。我们给的两个方案（只淡入 / 真交叉淡出）
 *  设计侧都没选，给了第三种，一句话点破了我们的盲点：
 *
 *  > 两层同时半透明时，中间会透出画布的底色，用户说的「闪」就是这一下。
 *
 *  所以做法是 **旧的留到新的画好为止，新的在它上面淡入，旧的不淡出** ——
 *  从头到尾没有一帧是空白的。这才是「不闪」的来由，不是动画曲线。
 *
 *  **能这么做的前提**：`Wrap` 的 key 是 `kind` 不是 file，所以设计稿之间换文件时
 *  这个 Provider **不重挂** —— 它可以同时持有两份 iframe。
 *  （给旧内容新挂一个 Provider 是行不通的：那等于**重新加载**旧稿，反而闪两次。）
 *
 *  留两份还顺带实现了设计侧 §四 最后那条：上一个页签的 iframe 不卸，
 *  A、B 来回切是瞬时的 —— 那正是用户最常遇到的那种闪。
 *  实测内存代价：最重的稿（1428 节点）一份约 5–10 MB。
 *
 *  ⚠️ 只做设计稿这一种。别的格式（md / 图片 / 目录 / json）是同步渲染的，
 *  本来就没有「加载中」那一帧 —— 给它们加过场只会凭空多 120ms 的延迟。
 */
const FADE = 120, GIVE_UP = 400, KEEP = 2;

function Canvas() {
  const d = useDc();
  /** 池：`[当前, 上一份]`，最多 `KEEP` 份。key 用 file —— 同一份文件重载不换 key，
   *  所以 iframe 不重建，滚动位置也不丢（设计侧：同一份稿重载**不淡入、直接换**）。 */
  const [pool, setPool] = useState<Array<{ file: string; src: string }>>([{ file: d.file, src: d.src }]);
  /** 当前这份画好了没。`false` 期间旧的那份仍然完整可见。 */
  const [ready, setReady] = useState(true);
  /** 等太久了（>400ms）：不再拿上一份冒充新文件，淡成一张空白稿纸。
   *  **稿纸不是骨架** —— 它不假装内容，只占住位置（骨架是「看起来能用其实是假的」那一类）。 */
  const [blank, setBlank] = useState(false);

  useEffect(() => {
    setPool((old) => {
      if (old[0]?.file === d.file) {
        /* 同一份文件：只更新 src（重载、换 shell/raw），**不动池的顺序，也不走过场** */
        return [{ file: d.file, src: d.src }, ...old.slice(1)];
      }
      setReady(false);
      setBlank(false);
      const rest = old.filter((x) => x.file !== d.file).slice(0, KEEP - 1);
      return [{ file: d.file, src: d.src }, ...rest];
    });
  }, [d.file, d.src]);

  /* ⚠️ **切回池里已经加载好的那一份，不会再有 `load` 事件** ——
     于是 `ready` 永远回不到 true，过场就卡在「新的透明、旧的可见」上。
     实测：切回上一份耗时 8152ms（卡到兜底超时）。缓存命中不发 load 是浏览器的常态，
     所以池化方案必须自己补这一下。 */
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ready) return;
    const fr = host.current?.querySelector('iframe[data-pool="cur"]') as HTMLIFrameElement | null;
    try { if (fr?.contentDocument?.readyState === "complete") setReady(true); } catch { /* 跨源读不到就等 load */ }
  }, [ready, pool]);

  /* 等太久就把上一份撤掉 —— 拿旧内容冒充新文件超过这个时长就成了误导 */
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setBlank(true), GIVE_UP);
    return () => clearTimeout(t);
  }, [ready, d.file]);

  /* 兜底：`load` 可能永远不来（断网、被 CSP 拦）。**不能把旧内容永远留着** ——
     那会变成「打开了新文件，屏幕上却是另一份稿」，比空白更糟。 */
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), 8000);
    return () => clearTimeout(t);
  }, [ready, d.file]);

  return (
    <div ref={host} className="flex-1 min-h-0 relative" data-ud="canvas" data-fading={!ready ? "1" : undefined}>
      {/* 空白稿纸：只在等太久时盖住上一份，压在当前那份下面 */}
      {blank && !ready && <div data-ud="canvas-blank" className="absolute inset-0 bg-panel" />}
      {pool.map((it, i) => {
        const cur = i === 0;
        return (
          <iframe key={it.file} src={it.src} title={it.file}
            ref={(el) => { if (cur && el) (d.frame as React.MutableRefObject<HTMLIFrameElement | null>).current = el; }}
            data-shell={d.mode === "shell" ? "1" : undefined}
            data-pool={cur ? "cur" : "prev"}
            onLoad={() => { if (cur) { setReady(true); d.onFrameLoad(); } }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="absolute inset-0 w-full h-full border-0 bg-panel"
            style={{
              /* 当前那份：画好之前透明（但**已经在加载**，所以等待和展示是重叠的）。
                 上一份：**保持不透明**直到被盖住 —— 淡出它才会透出画布底色。 */
              opacity: cur ? (ready ? 1 : 0) : (ready || blank ? 0 : 1),
              transition: `opacity ${FADE}ms var(--ease)`,
              /* 非当前的那份不接指针，也不进 tab 序 */
              pointerEvents: cur && ready ? undefined : "none",
              zIndex: cur ? 2 : 1,
            }} />
        );
      })}
    </div>
  );
}

function CodeView({ src, picked }: { src: SourceData | null; picked: Picked | null }) {
  const hit = useRef<HTMLTableRowElement>(null);
  useEffect(() => { hit.current?.scrollIntoView({ block: "center" }); }, [src, picked]);
  if (!src) return <div className="flex-1 flex items-center justify-center text-muted text-xs">正在读源码…</div>;
  const needle = picked?.node ? `data-ud-node="${picked.node}"` : null;
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-panel font-mono text-[11.5px] leading-5" title={`${src.file} · ${src.lines} 行 · ${src.bytes} 字节 · 只读`}>
      <table className="border-collapse w-full"><tbody>{src.source.split("\n").map((line, i) => { const h = !!needle && line.includes(needle); return <tr key={i} ref={h ? hit : undefined} className={h ? "bg-accentSoft" : ""}><td className="select-none text-right pr-3 pl-3 text-muted w-12 align-top">{i + 1}</td><td className="whitespace-pre pr-4">{line || " "}</td></tr>; })}</tbody></table>
    </div>
  );
}

/** 演示全屏：只看稿，Esc 退出 */
function Present({ src, onStop }: { src: string; onStop: () => void }) {
  useEffect(() => {
    const el = document.getElementById("present");
    el?.requestFullscreen?.().catch(() => {});
    const on = () => { if (!document.fullscreenElement) onStop(); };
    document.addEventListener("fullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [onStop]);
  /* 演示看的是**稿本身**，不是 S2 嵌入壳 —— 所以用 `rawSrc` 而不是 bridge 的 `src`
     （编辑态那份带 `embed=1`，演示时会把壳的 chrome 也放大出来） */
  return (
    <div id="present" className="fixed inset-0 z-50 bg-black">
      <iframe src={src} title="演示" className="w-full h-full border-0 bg-white" />
      <button className="btn sm absolute top-3 right-3 opacity-70 hover:opacity-100" onClick={onStop}>退出演示 Esc</button>
    </div>
  );
}
