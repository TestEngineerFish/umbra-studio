/** 内置从属面板的注册入口（M8-17）。
 *
 *  **import 这一个文件就等于把五个面板都注册上了** —— 和 `kinds/index.ts` 同一个套路。
 *  加一个面板 = 新增一个文件 + 在下面加一行，`SidePanels` 一个字都不用动。
 */
import "./props";
import "./diagnostics";
import "./changes";
import "./comments";
import "./info";

export { panelDef, allPanels, definePanel, type PanelDef } from "./registry";
