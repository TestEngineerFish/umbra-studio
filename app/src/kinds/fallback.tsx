import { FileCard } from "./fallback-card";
import type { KindModule } from "./registry";
import type { ViewContext } from "./context";

/** 还没有专门视图的类型：普通网页、其他（`00` §五十九的通用文件卡）。
 *
 *  **`other` 这一条是注册表的兜底**，`moduleFor` 找不到模块时落到它 ——
 *  所以在 `shared/kinds.ts` 里加一种新 kind、忘了写模块，界面不会崩，
 *  只是暂时显示成文件卡。这是有意的：先能打开，再谈怎么编辑。
 *
 *  ⚠️ **`code` 2026-09-28 让出去了**（M10-2），和 `md` 当初一样（M11-9b）：
 *  它归内置插件 `plugins/com.umbra.code/`（CodeMirror 高亮 + 选中行给 AI）。
 *  **一种 kind 只能有一个模块** —— 这里不让出来的话，插件注册时
 *  `register()` 当场抛「被注册了两次」，而 `loader` 把它 catch 成
 *  「这个插件没能接上」。症状是**插件装着却不起作用**，
 *  而服务端那边看一切正常（清单 ok、kinds 认到了），很难想到是前端注册撞了。 */
export const fallback: KindModule = {
  ids: ["html", "other"],
  View: ({ ctx }: { ctx: ViewContext }) => <FileCard core={ctx.core} host={ctx.host} path={ctx.path} onOpen={ctx.open} />,
};
