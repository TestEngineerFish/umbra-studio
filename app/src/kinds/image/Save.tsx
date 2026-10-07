/** 保存裁剪结果的那张卡（issue #108，2026-10-07 用户拍板「两档都给，默认另存一份」）。
 *
 *  **为什么默认另存。** 图片编辑是**破坏性**的：覆盖了原图，被裁掉的那些像素就没了。
 *  快照能把**整份文件**退回去，但退不回「我只想要裁剪前那一块」——
 *  而用户按下「保存」那一刻多半还没想清楚要不要留原件。
 *  所以默认不毁原件，想覆盖的人多点一下。
 *
 *  ⚠️ 形制抄 `LeaveGuard` / `ui/Ask.tsx` 那张卡（居中、`bg-black/25` 垫底、`role="dialog"`）
 *  —— **不新造一种浮层**，并排一眼就能看出不是一套。
 *  （现在手写的这种卡有三份了：`LeaveGuard` / `Ask` / 这一张。
 *   再多一份就该抽成 `ui/Modal.tsx` —— 记在这儿，别等到第五份。）
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

export type SaveChoice = { how: "as"; name: string } | { how: "over" } | null;

function Card({ o, done }: { o: SaveOpts; done: (v: SaveChoice) => void }) {
  const [how, setHow] = useState<"as" | "over">("as");
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); done(null); }
      if (e.key === "Enter") { e.stopPropagation(); done(how === "as" ? { how: "as", name: o.asName } : { how: "over" }); }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [how, o.asName, done]);
  const Row = ({ v, label, sub }: { v: "as" | "over"; label: string; sub: string }) => (
    <label className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer ${how === v ? "bg-accentSoft" : "hover:bg-hover"}`}>
      <input type="radio" name="how" checked={how === v} onChange={() => setHow(v)} className="mt-0.5" />
      <span className="min-w-0">
        <span className="text-xs">{label}</span>
        <span className="block text-[11px] text-muted font-mono truncate">{sub}</span>
      </span>
    </label>
  );
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-14 bg-black/25" onClick={() => done(null)}>
      <div role="dialog" aria-label="保存裁剪结果" data-ud="img-save"
        className="w-[340px] p-4 rounded-lg border border-border bg-panel shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-2 text-[13px]">保存</div>
        <div className="space-y-0.5 mb-2">
          <Row v="as" label="另存为" sub={o.asName} />
          {/* ⚠️ 「覆盖原图」那一行**要说出改前那版去哪了** —— 不说的话它看着像个不可逆的动作，
              而它其实可逆（快照 + 变更卡）。少说一句话会让人不敢点。 */}
          <Row v="over" label="覆盖原图" sub={o.path.split("/").pop() ?? o.path} />
        </div>
        <div className="text-[11px] text-muted leading-relaxed mb-3">
          原图 {o.from.w}×{o.from.h} · 裁后 <span className="text-text font-mono">{o.to.w}×{o.to.h}</span>
          {how === "over" && <><br />改前那一版留在「变更」里，能一键回退。</>}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn sm" onClick={() => done(null)}>取消</button>
          <button className="btn sm primary" data-ud="img-save-ok"
            onClick={() => done(how === "as" ? { how: "as", name: o.asName } : { how: "over" })}>保存</button>
        </div>
      </div>
    </div>
  );
}

export interface SaveOpts {
  path: string;
  /** 已经算好的、盘上还没被占用的那个名字 */
  asName: string;
  from: { w: number; h: number };
  to: { w: number; h: number };
}

/** 弹卡并等一个答案。`null` = 用户取消了。 */
export function askSave(o: SaveOpts): Promise<SaveChoice> {
  return new Promise((res) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: SaveChoice) => { root.unmount(); host.remove(); res(v); };
    root.render(<Card o={o} done={done} />);
  });
}

/** 算一个盘上还没被占用的「另存为」名字：`头图.png` → `头图-1.png` → `头图-2.png`…
 *  ⚠️ 要**真去问盘上有什么**，不能只试第一个 —— 连点两次保存会覆盖掉第一次的结果，
 *  而那种丢失一句话都不会说。 */
export function freeName(path: string, taken: string[]): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const n = `${stem}-${i}${ext}`;
    if (!taken.includes(n)) return n;
  }
  return `${stem}-${Date.now()}${ext}`;
}
