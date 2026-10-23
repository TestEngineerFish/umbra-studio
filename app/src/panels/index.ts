/** 从属面板的注册入口（M8-17）。
 *
 *  ⚠️⚠️ **五个内置面板 2026-10-23（M16-7b / C3）全删了。**
 *  它们（props / diagnostics / changes / comments / info）**全是设计稿的**：
 *  属性面板改的是节点属性、诊断读的是 `validate_draft`、变更清单是稿的语义版本、
 *  评论挂在节点地址上、info 那一份「全部来自索引」（`build_index` 生成的）。
 *  C3 之后它们一件对象都没有了。
 *
 *  ⚠️ **而这一层的机制留着**：`registry.ts` 的 `definePanel` / `panelDef` 还在 ——
 *  **插件带来的面板走同一条路**（`kinds/plugin/loader.ts` 的 `registerPanelTitle`）。
 *  `SidePanels.tsx` 的注释早就写明它「不认识任何具体面板」，
 *  所以删掉这五个它一个字都不用改 —— **那正是 M8-17 那次解耦换来的**。
 *  > 一个「加一个面板只要新增一个文件」的注册表，
 *  > 删掉全部内置成员时也只要删那几个文件。
 *
 *  加一个面板 = 这个目录下一个文件 + 在下面加一行 import。 */

export { panelDef, allPanels, definePanel, type PanelDef } from "./registry";
