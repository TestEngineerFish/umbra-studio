import { useCallback, useEffect, useState } from "react";
import type { Comment } from "../../api/types";
import type { ViewContext } from "../context";
import { boxOfNode, draftDoc } from "./nodes";
import { useDc } from "./bridge";

/** 画布上的评论钉（M8-32 · 设计侧第十一轮 §二.5）。
 *
 *  每条评论一枚编号钉，编号和暂存区里的对得上；**发过的钉变成灰色，留在画布上** ——
 *  留着是有用的：它告诉用户「这一处我提过，AI 已经在改」，而擦掉就等于忘了。
 *
 *  钉子画在 iframe **外面**（我们塞不进 iframe 的 DOM），靠穿透读到的坐标定位。
 *  所以位置要在这几件事之后重算：稿加载完 · 稿滚动 · 缩放或宽度档变了 · 评论变了。
 *  ⚠️ **不逐帧重算** —— 滚动用 rAF 合一次，不然一次滚动几十次布局计算。
 */
export function Pins({ ctx }: { ctx: ViewContext }) {
  const d = useDc();
  /* 这份稿的评论。跨文件的那些归暂存区管，画布上只画当前这份的。 */
  const mine = ctx.store.comments.filter((c) => c.file === d.file && !c.resolved);
  const [boxes, setBoxes] = useState<Record<string, { x: number; y: number }>>({});

  const measure = useCallback(() => {
    if (d.mode !== "shell" || !mine.length) { setBoxes({}); return; }
    const next: Record<string, { x: number; y: number }> = {};
    for (const c of mine) {
      const b = boxOfNode(d.frame.current, c.node);
      /* 量不到就**不画这一枚**：节点地址随内容变，改过的节点旧地址就找不着了。
         评论本身不丢（它在属性区的列表里，标着「节点已变」），只是画布上钉不上去。 */
      if (b) next[c.id] = { x: b.x, y: b.y };
    }
    setBoxes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.mode, d.frame, mine.map((c) => c.id + c.node).join(",")]);

  useEffect(() => { measure(); }, [measure, d.shell.zoom, d.shell.preset]);

  /* 稿滚动 / 窗口变化时跟着走。滚动事件来自**稿那一层的 document**（同源才听得到）。 */
  useEffect(() => {
    if (d.mode !== "shell") return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const doc = draftDoc(d.frame.current);
    doc?.addEventListener("scroll", on, true);
    const shellDoc = d.frame.current?.contentDocument;
    shellDoc?.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      doc?.removeEventListener("scroll", on, true);
      shellDoc?.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [d.mode, d.frame, measure]);

  if (d.mode !== "shell") return null;
  /* 编号按「暂存的排在前」给，和暂存区一致：暂存的是 1..N，发过的不编号（它已经交出去了） */
  const unsent = mine.filter((c) => !c.sentAt);
  const numOf = (c: Comment) => unsent.findIndex((x) => x.id === c.id) + 1;

  return (
    <>
      {mine.map((c) => {
        const at = boxes[c.id];
        if (!at) return null;
        const n = numOf(c);
        const sent = !!c.sentAt;
        return (
          <button key={c.id} data-ud="pin" data-sent={sent ? "1" : undefined}
            className="fixed z-30 grid place-items-center text-[9px] font-semibold shadow-md"
            style={{
              left: at.x - 7, top: at.y - 9, width: 18, height: 18,
              /* 水滴形：左上右三个圆角 + 左下尖角，尖角指着它钉的那个元素 */
              borderRadius: "50% 50% 50% 2px",
              background: sent ? "var(--tool-muted)" : "var(--tool-accent)",
              color: "var(--tool-on-accent)",
            }}
            title={`${c.tag ? `<${c.tag}> · ` : ""}${c.text}${sent ? "\n（已经发给 AI 了）" : ""}`}
            onClick={() => ctx.setPicked({ file: c.file, node: c.node, tag: c.tag ?? "" })}>
            {sent ? "✓" : n || "·"}
          </button>
        );
      })}
    </>
  );
}
