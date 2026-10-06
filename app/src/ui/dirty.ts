/** 哪几份文件「改了还没落盘」（M8-22）。
 *
 *  页签上那颗点要的就是这个。**为什么要一个全局登记处**：
 *  未保存是**每种格式各自知道**的事（Markdown 看文本和盘上的差异，设计稿看壳报上来的状态），
 *  而要显示它的地方在页签条 —— 那儿不属于任何一种格式。
 *
 *  ⚠️ 这里只记「进度」，不记「质量」。体检状态是另一回事，它在树、诊断角标、诊断面板三处，
 *  **不上页签**（设计侧第八轮 §六：页签是「开着哪几份」，不是「这几份怎么样」）。
 */
const set = new Set<string>();
const subs = new Set<() => void>();

export const dirtyStore = {
  subscribe(f: () => void): () => void { subs.add(f); return () => subs.delete(f); },
  /** 给 `useSyncExternalStore` 用的快照：内容变了这个串就变 */
  snapshot(): string { return [...set].sort().join("|"); },
  has(path: string): boolean { return set.has(path); },
  set(path: string, dirty: boolean): void {
    const had = set.has(path);
    if (dirty === had) return;
    if (dirty) set.add(path); else set.delete(path);
    for (const f of subs) f();
  },
  /** 关掉页签时清掉，免得一个已经不在的文件永远挂着点 */
  drop(path: string): void { if (set.delete(path)) for (const f of subs) f(); },
  /** 改名 / 移动之后把登记迁过去（issue #105）。
   *
   *  ⚠️ **这个登记处以路径为键**，而改名正是「键变了」—— 不迁的话那颗「未落盘」的点
   *  会挂在一个**已经不存在的路径**上：页签上看不见它（页签已经是新名了），
   *  而 `count()` 里它还在，于是**刷新时拦一下、用户却找不到是哪一份**。
   *
   *  ⚠️ **目录改名要连它底下的一起迁** —— 判据是 `from + "/"` 前缀，
   *  不是 `startsWith(from)`：后者会把同前缀的兄弟（`src2/` 对 `src`）一起卷进来，
   *  和 #19 项目根那条是同一个错法。 */
  rename(from: string, to: string): void {
    const hit = [...set].filter((p) => p === from || p.startsWith(from + "/"));
    if (!hit.length) return;
    for (const p of hit) { set.delete(p); set.add(to + p.slice(from.length)); }
    for (const f of subs) f();
  },
  /** 现在有几份没落盘。`beforeunload` 要它 —— 那一刻只需要「有没有」和「几份」。 */
  count(): number { return set.size; },
  list(): string[] { return [...set].sort(); },
};

/** ⚠️ **刷新 / 关窗前拦一下**（2026-09-29，设计侧第十二轮反问出来的）。
 *
 *  实测过：代码插件里改了几行没落盘，**刷新就没了，而且没有任何提示**。
 *  根因是内容只在编辑器的内存里 —— 而**插件自己存不了**：
 *  它在不透明源的 iframe 里，`localStorage` 访问会抛。
 *
 *  所以这一层由宿主兜。`beforeunload` 只能弹浏览器自己那句（文案不由我们定），
 *  但它挡住的是**最坏的那一下**：手滑按了 ⌘R，几十行改动无声消失。
 *
 *  ⚠️ 这**不是**「草稿自动保存」。真要做到「刷新回来改动还在」得由宿主替插件
 *  暂存草稿（一件新能力）。在那之前，拦一下比什么都不做强得多 ——
 *  **而「什么都不做」恰恰是最容易被当成「已经处理了」的状态**。
 *
 *  在 `App` 里挂一次即可；返回解绑函数。 */
export function guardUnsaved(): () => void {
  const on = (e: BeforeUnloadEvent) => {
    if (set.size === 0) return;
    /* 现代浏览器只认 preventDefault + returnValue，文案一律忽略 */
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", on);
  return () => window.removeEventListener("beforeunload", on);
}

/** 「离开」这个动作的说法。**三种触发共用一张卡，但话要说准** ——
 *  「关掉以后这些改动不会留」「切走以后…」「退回以后…」，
 *  设计侧原话：后两种用户更容易以为「我一会儿回来它还在」。
 *
 *  ⚠️ 放在这里而不是 `workbench/` —— 从属面板（变更卡的「回退」）也要用它，
 *  而面板不该反过来依赖工作台。 */
export type LeaveVerb = { long: string; short: string };
export const LEAVE: { close: LeaveVerb; switch: LeaveVerb; revert: LeaveVerb; rename: LeaveVerb } = {
  close: { long: "关掉", short: "关" },
  switch: { long: "切走", short: "切" },
  revert: { long: "退回", short: "退" },
  /** 改名（issue #105）。⚠️ **改名原来根本不经过这道闸** ——
   *  那份改动还在插件的内存里、以**旧路径**为键，改完名插件按新路径重读，
   *  改动就这么没了。而「改名」这个动作听起来完全无害，所以更要说一句。 */
  rename: { long: "改名", short: "改名" },
};
