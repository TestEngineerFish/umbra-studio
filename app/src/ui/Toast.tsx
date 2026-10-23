import { useEffect, useState } from "react";

/** 页面内提示：host.notify 在浏览器里的退化路径也落到这里（监听 ud-toast） */
export function Toasts() {
  const [items, setItems] = useState<{ id: number; title: string; body?: string; kind?: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {}; const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, title: d.title ?? String(d), body: d.body, kind: d.kind }]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
    window.addEventListener("ud-toast", on); return () => window.removeEventListener("ud-toast", on);
  }, []);
  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        /* ⚠️ **`warn` 这一档是 issue #99 加的**：在它之前只有 `error` 和默认（绿/中性）——
           于是「文件挪走了、但有几处引用没改成」这种**一半成功**的事只能报成 ok。
           **只有「成了 / 没成」两档的提示系统，会把「成了一半」说成「成了」。** */
        <div key={t.id} data-ud="toast" className={`rounded-lg border px-3 py-2 text-xs shadow-lg bg-panel ${
          t.kind === "error" ? "border-err text-err"
          : t.kind === "warn" ? "border-warnBorder text-warn"
          : "border-border text-text"}`}>
          <div className="font-semibold">{t.title}</div>{t.body && <div className="text-muted mt-0.5">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
export function toast(title: string, body?: string, kind?: "error" | "warn" | "ok") { window.dispatchEvent(new CustomEvent("ud-toast", { detail: { title, body, kind } })); }


/** `move_file` 的回执里**要看的那几个字段**（issue #99）。
 *  ⚠️ 服务端早就给了 `refused`（引用方被写入口拒绝、**引用没改成**，#92）
 *  和 `unresolved`（解不出来的写法，#76 的注释写着「**不静默**」），
 *  而界面原来只读 `rewrote` —— 于是那两件在界面上**一点痕迹都没有**。 */
export interface MoveOut {
  rewrote?: Array<{ file: string; count?: number }>;
  refused?: Array<{ file: string; reason: string }>;
  unresolved?: Array<{ file: string; line: number; value: string }>;
  /** 引用扫描到 5000 的上限就停了（`moveFile` 的 `truncated`）。
   *  ⚠️ **到上限时不能说「引用都改好了」** —— 没扫到的那些还指着旧路径。 */
  truncated?: boolean;
}

/** 有几处引用「该改而没改成」。 */
export function stuckOf(d: MoveOut | undefined): number {
  return (d?.refused?.length ?? 0) + (d?.unresolved?.length ?? 0);
}

/** 一次移动 / 改名之后该弹什么。**有没改成的就不是绿的。** */
export function moveToast(d: MoveOut | undefined, okTitle: string): void {
  const stuck = stuckOf(d);
  if (!stuck) {
    const n = d?.rewrote?.length ?? 0;
    /* ⚠️⚠️ **2026-10-23（M16-7c-2d）两处改了，而第二处是一句不能说的话。**
       ① 文案「N 份**稿**里的引用」→「N 个文件」：引用方现在是 md / html / css 六种格式。
       ② **到上限时不走这条绿路** —— 扫描停在 5000 个文件上时，
          「挪好了」这句话后面不能跟「引用都改好了」的暗示：没扫到的那些还指着旧路径。
          > 一个有上限的操作，报成功时必须说出自己的上限。 */
    if (d?.truncated) {
      toast(okTitle, `${n ? `顺带改了 ${n} 个文件里的引用。` : ""}⚠️ 这个项目太大，只查了前 5000 个文件 —— 可能还有没改到的引用`, "warn");
      return;
    }
    toast(okTitle, n ? `顺带改了 ${n} 个文件里的引用` : undefined, "ok");
    return;
  }
  /* ⚠️ **把文件名列出来** —— 只说「有 2 处没改成」的话用户不知道去哪看，
     而他下一步一定是去看那几份稿。 */
  const names = [...(d?.refused ?? []).map((x) => x.file), ...(d?.unresolved ?? []).map((x) => x.file)];
  toast(`${okTitle}，但有 ${stuck} 处引用没改成`,
    `${[...new Set(names)].slice(0, 3).join("、")}${new Set(names).size > 3 ? " 等" : ""} —— 那几处现在是断的`
    + (d?.truncated ? "。⚠️ 而且只查了前 5000 个文件" : ""), "warn");
}
