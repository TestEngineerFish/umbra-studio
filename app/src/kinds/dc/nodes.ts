/** 穿透 S2 壳，读稿自己的 DOM（M8-31，设计侧第十一轮）。
 *
 *  **为什么要有它。** 三档指针要的三件事都不在 `picked` 消息里：
 *  ① 这份稿到底有没有节点地址（没有就整组点不中，要出提示条）
 *  ② 某个节点在屏幕上的位置（评论框要贴在它下沿、评论钉要钉在它上面）
 *  ③ 悬停时该不该描边
 *
 *  设计侧写「**S2 不用改、不加命令**」，靠的就是这条路：
 *  稿和 S2 壳都由同一个本地服务托管，**三层同源**，顶层能直接读进去。
 *  ⚠️ 这一点 2026-09-26 栽过一次反过来的：当时量到「键盘事件到不了我们的 document」
 *  就推出「要请设计侧转发」，漏了验同源（`00` §八十一）。这次先验了再写代码：
 *  实测穿透两层读到 5 个 `data-ud-node`，并把稿内 48,69 换算成顶层 309,165。
 *
 *  拿不到就一律给 null / 0，让调用方自己决定怎么退 —— **不抛**。
 *  iframe 还在加载、换了稿、演示全屏卸掉了，都会短暂拿不到，那不是错误。
 */

/** 稿那一层的 document。`null` = 还读不到（正在加载 / 不是编辑态 / 被浏览器拦了）。 */
export function draftDoc(frame: HTMLIFrameElement | null): Document | null {
  try {
    const shell = frame?.contentDocument;
    if (!shell) return null;
    /* 编辑态是「S2 壳 iframe → 稿 iframe」两层；预览态 `frame` 本身就是稿，没有内层。 */
    const inner = shell.querySelector("iframe");
    return inner ? (inner as HTMLIFrameElement).contentDocument : shell;
  } catch { return null; }
}

/** 稿里的那个 iframe（编辑态才有）。坐标换算要用它的 rect 和 clientWidth。 */
function innerFrame(frame: HTMLIFrameElement | null): HTMLIFrameElement | null {
  try { return (frame?.contentDocument?.querySelector("iframe") as HTMLIFrameElement | null) ?? null; }
  catch { return null; }
}

/** 数这份稿有多少个节点地址。`null` = 还读不到（**和 0 是两件事**：
 *  0 是「确实没有」，null 是「还不知道」。提示条只能在 0 的时候出 ——
 *  分不清就会在加载那一瞬间闪一条「这份稿没有节点地址」。 */
export function countNodes(frame: HTMLIFrameElement | null): number | null {
  const doc = draftDoc(frame);
  if (!doc || doc.readyState === "loading") return null;
  /* `<body>` 都还没有 = 还没开始渲染，这时候数到 0 是假的 */
  if (!doc.body || doc.body.children.length === 0) return null;
  return doc.querySelectorAll("[data-ud-node]").length;
}

export interface NodeBox { x: number; y: number; w: number; h: number }

/** 一个节点在**顶层视口坐标系**里的位置。
 *
 *  ⚠️ 中间那一层有缩放：S2 把包着稿 iframe 的 div 做 `transform: scale(zoom)`，
 *  `transform-origin: top left`。所以稿内元素的 rect（稿自己的坐标系，不含外部 transform）
 *  要乘一个比例才能换到上面来。比例不从 `shell.zoom` 读 —— 那是**我们以为的**缩放；
 *  这里按 iframe 的实际尺寸算，量的是**真实发生的**缩放（两者不一致时，
 *  贴出来的框会离元素几十个像素，而那种错位最难查）。 */
export function boxOfNode(frame: HTMLIFrameElement | null, node: string): NodeBox | null {
  const doc = draftDoc(frame);
  if (!doc || !frame) return null;
  const el = doc.querySelector(`[data-ud-node="${CSS.escape(node)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return null;   // 不可见的（head 里的 link 之类）
  const outer = frame.getBoundingClientRect();
  const inner = innerFrame(frame);
  if (!inner) return { x: outer.left + r.left, y: outer.top + r.top, w: r.width, h: r.height };
  const ir = inner.getBoundingClientRect();
  const scale = inner.clientWidth > 0 ? ir.width / inner.clientWidth : 1;
  return {
    x: outer.left + ir.left + r.left * scale,
    y: outer.top + ir.top + r.top * scale,
    w: r.width * scale,
    h: r.height * scale,
  };
}

/** 稿里的标签名（`h1` / `button`…）。评论框头和悬停标签要写它。 */
export function tagOfNode(frame: HTMLIFrameElement | null, node: string): string {
  const doc = draftDoc(frame);
  const el = doc?.querySelector(`[data-ud-node="${CSS.escape(node)}"]`);
  return el ? el.tagName.toLowerCase() : "";
}
