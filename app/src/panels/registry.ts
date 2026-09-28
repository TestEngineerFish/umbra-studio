import type { FC } from "react";
import type { PanelId } from "../layout/layout";
import type { ViewContext } from "../kinds/context";

/** 一个从属面板的**全部知识**都在一个文件里（M8-17）。
 *
 *  **为什么要有这一层。** 原来 `SidePanels` 里是五条
 *  `active === "props" && <PropsPanel core={…} file={…} picked={…} …/>` 的分叉，
 *  每个面板的 props 各不相同；加一个面板要改 `SidePanels`、改 `layout.ts` 的标题表、
 *  改图标查表，三处。这和 M8-14 之前的格式层是同一个病 ——
 *  **那一轮的结论是「工作台只提供能力，不认识任何具体的东西」**，
 *  面板这一层当时没跟上（M8-17 如实留下）。
 *
 *  现在：一个面板 = 一个 `PanelDef`，`SidePanels` 退化成纯壳（图标轨 + 面板体 + 查表）。
 *  加一个面板 = 新增一个文件 + 在下面数组里加一行，**`SidePanels` 一个字都不用动**。
 *
 *  ⚠️ 面板体统一收 `ctx`（`ViewContext`），不再各要一套 props ——
 *  它们要的东西（core / store / path / picked / ask）`ctx` 里全都有，
 *  而「各要一套」正是那五条分叉长出来的原因。
 */
export interface PanelDef {
  id: PanelId;
  /** 图标轨上那一个字符。插件带来的面板查不到就用通用符号，不会漏画 */
  icon: string;
  title: string;
  /** 图标上的角标数。不写 = 没有角标 */
  badge?: (ctx: ViewContext) => number;
  /** 角标用警示色（诊断那一个）还是主色 */
  badgeWarn?: boolean;
  Body: FC<{ ctx: ViewContext }>;
}

const REG = new Map<PanelId, PanelDef>();
export function definePanel(d: PanelDef): void {
  if (REG.has(d.id)) throw new Error(`面板重名：${d.id}`);
  REG.set(d.id, d);
}
export const panelDef = (id: PanelId): PanelDef | undefined => REG.get(id);
export const allPanels = (): PanelDef[] => [...REG.values()];
