import { useCallback, useRef, useState } from "react";
import { LEAVE, dirtyStore, type LeaveVerb } from "../ui/dirty";
import { toast } from "../ui/Toast";

/** 关页签 / 切文件 / 回退前那一张确认卡（设计侧第十二轮 S18 §一.1）。
 *
 *  **为什么是「离开时才拦」而不是横条常驻**：设计侧的原话 ——
 *  「代码的横条会一直挂着，挂久了用户就不看它了，而且它每次出现都把正文往下推 20px」。
 *  所以平时只在工具条上一颗点，**只在真的要丢东西的时候**出这张卡。
 *
 *  ⚠️ 这一张由**工作台**画，不是插件画的。稿里它在正文区中间，
 *  但触发它的动作（关页签）在工作台 —— 让插件画就得先有一轮「能不能走」的协商，
 *  而那条协议现在还不需要。**落盘这件事仍然归格式模块**（见 `useLeaveGuard` 的注释）。
 */
export function LeaveGuard({ path, verb, onCancel, onDiscard, onSave }: {
  path: string;
  verb: LeaveVerb;
  onCancel: () => void; onDiscard: () => void; onSave: () => void;
}) {
  const name = path.split("/").pop() ?? path;
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-14 bg-black/25"
      onClick={onCancel}>
      <div role="alertdialog" aria-label="还没落盘"
        className="w-[360px] p-4 rounded-lg border border-border bg-panel shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-1 truncate" title={path}>{name} 还没落盘</div>
        <div className="text-xs leading-relaxed text-muted mb-3">{verb.long}以后这些改动不会留。</div>
        <div className="flex items-center gap-1.5">
          {/* 「不要了」放最左、描边而不是红色 —— 它是个正当选择，不是危险操作 */}
          <button className="btn sm" onClick={onDiscard}>不要了</button>
          <span className="flex-1" />
          <button className="btn sm ghost" onClick={onCancel}>回去接着改</button>
          <button className="btn sm primary" onClick={onSave}>落盘再{verb.short} ⌘S</button>
        </div>
      </div>
    </div>
  );
}

/** 「这份文件有没落盘的改动，先问一句」—— **一处实现，所有会丢内容的入口共用**。
 *
 *  ⚠️ 为什么要收成一个 hook：这套「发合成 ⌘S → 轮询 `dirtyStore` → 6 秒不落就不走」
 *  的逻辑原来抄了**两份**（关页签、切文件），而设计侧数出来的触发有**三种**。
 *  抄到第三份时，三份里任意一份改了而另两份没改，就是一个只在某条路上出现的缺陷。
 *
 *  `askLeave` 返回「能不能继续」：
 *  - 本来就没改动 → **同步** resolve(true)，调用点的时序一个字不变
 *  - 「不要了」→ 丢掉改动，resolve(true)
 *  - 「回去接着改」/ 落盘等超时 → resolve(false)
 */
export function useLeaveGuard() {
  const [pending, setPending] = useState<{ path: string; verb: LeaveVerb } | null>(null);
  const done = useRef<((ok: boolean) => void) | null>(null);
  const timer = useRef<number | null>(null);

  const settle = useCallback((ok: boolean) => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null; }
    const f = done.current; done.current = null;
    setPending(null);
    f?.(ok);
  }, []);

  const askLeave = useCallback((path: string, verb: LeaveVerb) => new Promise<boolean>((resolve) => {
    /* ⚠️ 不脏就**同步**放行 —— 别让「干净时也走一趟 microtask」这种时序变化
       渗进十来个打开入口里。那类变化不会报错，只会让某一处双击变成单击。 */
    if (!path || !dirtyStore.has(path)) { resolve(true); return; }
    if (done.current) { resolve(false); return; }   // 已经在问了，不叠第二张卡
    done.current = resolve;
    setPending({ path, verb });
  }), []);

  const guardNode = pending ? (
    <LeaveGuard
      path={pending.path}
      verb={pending.verb}
      onCancel={() => settle(false)}
      onDiscard={() => { dirtyStore.drop(pending.path); settle(true); }}
      onSave={() => {
        /* ⚠️ **不自己落盘 —— 让那个格式模块自己落。**
           内容在它手里（插件在自己的 iframe 里，工作台读不到），
           而「怎么算落盘」也是它的事（`.dc.html` 走 `write_draft`，代码走 `write_file`）。
           复用已有的 ⌘S 转发那条路：发一个合成的 ⌘S 出去，谁接谁落。 */
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
        const { path, verb } = pending;
        /* ⚠️ **等它落完，但要有上限**（纪律 3.4）。
           落盘是异步的（写盘 + 快照），而「落完了」的信号就是 `dirtyStore` 变干净。
           等不到就**不走**，并说一句 —— 悄悄走掉等于把改动丢了。 */
        let n = 0;
        timer.current = window.setInterval(() => {
          if (!dirtyStore.has(path)) { settle(true); return; }
          if (++n > 40) {                     // 40 × 150ms = 6 秒
            toast(`还没落完，先没${verb.short}`, "这个文件的改动还在，你可以再按一次 ⌘S", "error");
            settle(false);
          }
        }, 150);
      }}
    />
  ) : null;

  return { askLeave, guardNode };
}

export { LEAVE };
