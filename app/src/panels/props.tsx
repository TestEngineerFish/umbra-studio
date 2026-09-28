import type { ViewContext } from "../kinds/context";
import { definePanel } from "./registry";
import { PropsPanel } from "./props-body";

/** 属性面板（M8-17 从 `workbench/` 搬进 `panels/`）。
 *
 *  ⚠️ 它**只有设计稿用得上**（改节点的字面量），以前却住在 `workbench/` ——
 *  和 `FileCard`（只有文件卡用）一样，是「工作台里住着只有一种格式才用的东西」。
 *  M8-14 把格式层理清了，这一层当时没跟上（M8-17 如实留下的第二半）。
 *
 *  面板体本身没动，这里只把 `ctx` 拆成它要的那几个 props ——
 *  拆在这一层而不是改它的签名：它 139 行、逻辑不该在搬家时一起动。 */
function Body({ ctx }: { ctx: ViewContext }) {
  return (
    <PropsPanel
      core={ctx.core} file={ctx.path} picked={ctx.picked} onPicked={ctx.setPicked}
      writeTick={String(ctx.store.fileTick(ctx.path))}
      onWritten={() => { void ctx.store.fetchDrafts(); void ctx.store.fetchDiagnostics(ctx.path); void ctx.store.fetchChanges(ctx.path); }}
    />
  );
}

definePanel({ id: "props", icon: "⚙", title: "属性", Body });
