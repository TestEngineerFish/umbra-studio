/** 在**当前显示的那个工作台**里找元素（M15-1 S2，2026-10-22）。
 *
 *  ### 为什么需要这个
 *  并存的做法是「**全部挂上、只显示一个**」（隐藏的那几个用 `display:none`，不卸载）。
 *  于是 `document.getElementById(...)` / `document.querySelector(...)` 这类**全局查找**
 *  会在**所有**工作台里找，而它返回的是**文档顺序第一个** ——
 *  很可能是一个你现在看不见的项目里的那一个。
 *
 *  实际撞到的那几处（审出来一共 7 处）：
 *
 *  | 查的什么 | 选错了会怎样 |
 *  | --- | --- |
 *  | `#chatInput` | 「带进会话」之后**焦点落在看不见的输入框里**，打的字进了另一个项目的会话 |
 *  | `iframe[data-shell="1"]` | 往**另一个项目**的预览壳发 postMessage（换主题、切预设、点选） |
 *  | `#present` | 全屏演示进的是另一个项目那一份 |
 *  | `[data-path=...]` | 滚动定位滚的是另一个项目的树 |
 *  | `iframe[data-plugin=...]` | 给另一个项目的插件 iframe 发消息 |
 *
 *  ⚠️ **这一类查找在单项目下不可能错**，所以从来没人给它们加过范围 ——
 *  它们和 `Workbench` 里那 32 处 `project.*` 是同一回事的两面：
 *  **都靠「同时只有一个」这个不变量活着**，而 32 处那一面我们用 `key=` 保住了，
 *  这一面保不住（DOM 是全局的），只能逐处加范围。
 *  > **「全部挂上」把每一个全局 DOM 查找都变成了一次「选到哪一个」的赌博。**
 *
 *  ### 为什么不改成「隐藏的那几个不渲染内容」
 *  那等于卸载，而不卸载正是这个设计的全部目的（state 留着、正在跑的轮次有人收尾）。
 *
 *  ### 为什么有兜底
 *  首页 / 市场那两页没有 slot 外壳；而壳里也可能在 slot 还没挂好的那一帧查。
 *  **查不到就退回全局查一次** —— 这时候全局只有一个候选，和原来的行为一样。
 */

/** 当前那个工作台的外壳。`null` = 现在不在工作台（首页 / 市场）。 */
const activeSlot = (): Element | null =>
  document.querySelector('[data-ud="workbench-slot"][data-active]');

/** 在当前那个工作台里找一个。找不到就退回全局（见文件头「为什么有兜底」）。 */
export function inActive<T extends Element = Element>(selector: string): T | null {
  const root = activeSlot();
  return (root ? root.querySelector<T>(selector) : null) ?? document.querySelector<T>(selector);
}

/** 在当前那个工作台里找全部。
 *  ⚠️ 这一件**不退回全局** —— 「全部」退回全局就等于把别的项目的也一起拿上了，
 *  而调用方（给插件 iframe 发消息那一处）会对每一个都发一遍。
 *  **一个会「对每一个都做点什么」的查找，宁可少拿，不能多拿。** */
export function allInActive<T extends Element = Element>(selector: string): T[] {
  const root = activeSlot();
  return Array.from((root ?? document).querySelectorAll<T>(selector));
}

/** 「把会话输入框聚焦起来」—— 四处在做同一件事（带文件进会话 · ⌘L · 插件请求 · 目录视图）。
 *  收成一处，顺带保证它们都只找当前那个工作台的那一个。 */
export function focusChatInput(delay = 50): void {
  setTimeout(() => (inActive<HTMLElement>("#chatInput"))?.focus(), delay);
}
