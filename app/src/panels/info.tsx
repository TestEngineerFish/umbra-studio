import { HEALTH_LABEL, timeAgo } from "../api/types";
import type { ViewContext } from "../kinds/context";
import { definePanel } from "./registry";

/** 这份稿的元信息（M8-17 搬出来）。只读，全部来自索引。 */
function Body({ ctx }: { ctx: ViewContext }) {
  const { store, path: file } = ctx;
  const d = store.drafts.find((x) => x.file === file);
  if (!d) return <div className="p-4 text-muted">找不到稿件信息</div>;
  const rows: Array<[string, string]> = [["文件名", d.file], ["类型", d.kind === "component" ? "组件稿" : "页稿"], ["元素数", String(d.elements ?? "—")], ["版本", d.version ?? "—"], ["更新", timeAgo(d.updatedAt)], ["演示态", d.states.join(", ") || "—"], ["被谁引用", d.importedBy.join(", ") || "无"], ["引用了谁", d.imports.join(", ") || "无"], ["健康", `${HEALTH_LABEL[d.health]} · ${d.healthWhy || "—"}`]];
  return <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 p-3">{rows.map(([k, v]) => <><dt key={k + "k"} className="text-muted">{k}</dt><dd key={k + "v"} className="break-all">{v}</dd></>)}</dl>;
}

definePanel({
  id: "info", icon: "ⓘ", title: "信息",
  Body,
});
