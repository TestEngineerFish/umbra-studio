/** 问用户一行字 —— **应用自己画的输入框**（issue #103，2026-10-06）。
 *
 *  ⚠️ **为什么非要它：Electron 不实现 `window.prompt`。**
 *  桌面壳里 `prompt()` 直接抛（Electron 自己的二进制里就有现成的报错串
 *  `prompt() is not supported`），而我们四处都写的是
 *  ```ts
 *  const name = window.prompt("新目录的名字", "新建目录");
 *  if (!name) return;          // ← 桌面壳里永远走到这里
 *  ```
 *  于是「新建目录」「存为模板」「改名」「移到…」在桌面版里
 *  **没有输入框、什么都不发生、也不说为什么**。
 *  而**用户真正在用的是桌面版**；「新建目录」「存为模板」在那里**只有这一个入口**。
 *
 *  ⚠️ 这一类在回归里测不出来：`uitest` 走的是**浏览器模式**（Chromium 原生有 `prompt`），
 *  `shelltest` 里没覆盖这四个入口。
 *  **同族：#44 的 `beforeunload`** —— 「依赖浏览器原生行为的 Web API 在 Electron 壳里表现不同」。
 *  下一个人要加交互时，先问一句「这件事在 Electron 里也成立吗」。
 *
 *  形制照 `LeaveGuard` 那张卡（同一种浮层：居中、`bg-black/25` 垫底、`role="dialog"`）——
 *  **不新造一种**，不然两张卡并排一眼看出不是一套。
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

interface AskOpts {
  title: string;
  initial?: string;
  /** 说明文字（第二行，可选）—— 比如「相对项目根，留空 = 项目根」 */
  hint?: string;
  /** 确认那颗钮上写什么。默认「确定」 */
  okLabel?: string;
  /** 打开时只选中「扩展名之前」那一段（改名用）。默认整段选中 */
  selectBase?: boolean;
}

function Dialog({ o, done }: { o: AskOpts; done: (v: string | null) => void }) {
  const [v, setV] = useState(o.initial ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    /* ⚠️ **改名时只选中基名** —— 整段选中的话用户一打字就把扩展名也冲掉了，
       而那是 Finder / VS Code 都会特意处理的一件小事。 */
    const s = o.initial ?? "";
    const cut = o.selectBase ? s.replace(/\.[^.]*$/, "").length : s.length;
    el.setSelectionRange(0, cut);
  }, [o.initial, o.selectBase]);
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-14 bg-black/25"
      onClick={() => done(null)}>
      <div role="dialog" aria-label={o.title}
        className="w-[360px] p-4 rounded-lg border border-border bg-panel shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-1">{o.title}</div>
        {o.hint && <div className="text-xs leading-relaxed text-muted mb-2">{o.hint}</div>}
        {/* ⚠️ 样式**抄目录列里就地改名那个输入框**（`FileTree.tsx:163`）——
            全项目没有 `.inp` 这种类，样式是行内 Tailwind。
            不抄的话这张卡里的输入框和别处长得不一样，而那种不一致最显眼。 */}
        <input ref={ref} value={v}
          className="w-full h-7 px-2 mb-3 rounded border border-border bg-bg outline-none text-xs focus:border-accent"
          onChange={(e) => setV(e.target.value)}
          /* ⚠️ 回车 = 确定、Esc = 取消。**键盘能走完**是这类卡的底线 ——
             原来的 `window.prompt` 本来就是键盘友好的，换掉它不能把这一点丢了。
             ⚠️ Esc 要 `stopPropagation`：不拦的话它会一路冒泡到工作台的快捷键层，
             顺手把别的东西也关掉（§八十一 那一族）。 */
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); done(v.trim() ? v : null); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
          }} />
        <div className="flex items-center gap-1.5">
          <span className="flex-1" />
          <button className="btn sm ghost" onClick={() => done(null)}>取消</button>
          <button className="btn sm primary" disabled={!v.trim()}
            onClick={() => done(v.trim() ? v : null)}>{o.okLabel ?? "确定"}</button>
        </div>
      </div>
    </div>
  );
}

/** 问一行字。取消 / 空 → `null`。**和 `window.prompt` 同形，所以四处调用点几乎不用改。** */
export function askText(o: AskOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    /* 挂在 body 上而不是某个区域里 —— 这张卡要盖住整个窗口（和 `LeaveGuard` 一样） */
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: string | null) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(<Dialog o={o} done={done} />);
  });
}
