import { z } from "zod";
import { join } from "node:path";
import { envelope, err, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { createDraft, createFolder, duplicateDraft, isDesignProject } from "../project.js";
import { resolveDraft } from "../locate.js";
import {
  deleteDraft, deleteDraftImpact, emptyTrash, listTrash, moveDraft, purgeTrash, renameDraft, restoreDraft,
} from "../refs.js";
import { defineCap } from "./registry.js";
import type { CapCtx } from "./types.js";
import { assetDir } from "../statedirs.js";

/** 稿件生命周期（M11-7 第一批搬）。
 *
 *  ⚠️ **搬这一组当场抓到一个真缺陷**：HTTP 侧的 `create_draft` **不认 `source: "template"`** ——
 *  前端选模板新建时发的正是它，于是掉进 `blank` 分支，**建出来是空白稿**，
 *  而界面只说「已新建」。实测返回里明写着 `source: "空白骨架"`。
 *  MCP 侧一直是对的 —— 两个门面各写一遍，只有一边补了模板这一档。
 *
 *  这就是 Q36 要解决的病：不是「文件太长」，是**同一件事有两份实现，只有一份被修过**。
 */
const p = (c: CapCtx) => c.project!;

/** 模板名 → 绝对路径。模板存在项目自己的 `.umbrastudio/templates/` 下 */
const tplPath = (dir: string, name: string) => join(assetDir(dir, "templates"), `${name}.dc.html`);

/* ⚠️⚠️ **`requireAdopted`（「这个目录还没接管为设计项目，不建稿」）2026-10-23
 *  （M16-7c-2a / C3）删了，而它是「从源头删、下游理由自动倒下」的一个样本。**
 *
 *  它三条理由全是 dc 的：① 预览壳不在 → 属性面板 / 点选 / 就地编辑全 404 ·
 *  ② 「只建这一份」省不下什么（**已经要写 225 KB**，而接管总共才多 387 KB）·
 *  ③ 多一种半残状态。
 *
 *  而②里那个 225 KB 就是 `ensureRuntimeBeside` 往稿旁边拷的运行时副本 ——
 *  **那一件删掉之后，`create_draft` 在普通目录里只写一个 1 KB 的稿文件**，
 *  也就是用户点「新建稿件」时明确要的那一个。于是这道闸守的那件事不存在了。
 *
 *  > **一道闸该不该留，看它守的那件坏事还在不在，而不是看「多一道闸更安全」。**
 *  > 留着它的话，「新建稿件」在普通目录里会变成一个**没有出路的拒**
 *  > （接管那条路同一批删了）—— 那比它防的那件事更糟。 */


defineCap({
  name: "create_draft", title: "新建一份设计稿", scope: "project",
  summary: [
    "按四种来源之一建稿：空白骨架 / 复制现有稿 / 包装一个组件 / 套模板。",
    "走的是唯一写入口（归一化 → @ds 展开 → __resources 注入 → 快照），所以断网也能打开。",
  ].join("\n"),
  input: {
    path: z.string().describe("相对项目根的路径，必须以 .dc.html 结尾"),
    source: z.enum(["blank", "copy", "component", "template"]).describe("稿的来源"),
    title: z.string().optional().describe("空白稿或组件包装稿的标题，不给时用文件名"),
    sourceFile: z.string().optional().describe("source=copy 时的源稿路径（相对项目根）"),
    componentName: z.string().optional().describe("source=component 时的组件名（dc-import name）"),
    templatePath: z.string().optional().describe("source=template 时的模板绝对路径"),
    templateName: z.string().optional().describe("source=template 时的模板名（list_templates 可查）"),
  },
  http: { method: "POST" },
  run: async ({ path, source, title, sourceFile, componentName, templatePath, templateName }, c) => {
    const proj = p(c);
    let src;
    switch (source) {
      case "copy":
        if (!sourceFile) throw new Error("source=copy 时必须传 sourceFile");
        src = { kind: "copy" as const, sourceFile };
        break;
      case "component":
        if (!componentName) throw new Error("source=component 时必须传 componentName");
        src = { kind: "component" as const, componentName, title };
        break;
      case "template": {
        /* ⚠️ **这一档 HTTP 侧原来没有**（见文件头）。两个门面合成一份之后，
           两边都有了 —— 这正是搬过来的意义。 */
        const t = templatePath ?? (templateName ? tplPath(proj.dir, templateName) : undefined);
        if (!t) throw new Error("source=template 时必须传 templatePath 或 templateName");
        src = { kind: "template" as const, templatePath: t };
        break;
      }
      default:
        src = { kind: "blank" as const, title };
    }
    return envelope(await createDraft(proj, path, src));
  },
});

defineCap({
  name: "rename_draft", title: "给稿改名", scope: "project",
  summary: "改名并**把引用它的稿一起改写**。所以不要用系统的文件管理器改名 —— 那样引用会断。",
  input: { path: z.string().describe("当前稿的相对路径"), newName: z.string().describe("新基名，不用加 .dc.html") },
  http: { method: "POST" },
  run: async ({ path, newName }, c) => {
    const r = await renameDraft(p(c), path, newName);
    return envelope(r, [], { referencesUpdated: r.referencesUpdated });
  },
});

defineCap({
  name: "duplicate_draft", title: "复制一份稿", scope: "project",
  summary: "复制成新稿。不给新名就是「<原名> 副本」。",
  input: { path: z.string(), newName: z.string().optional() },
  http: { method: "POST" },
  run: async ({ path, newName }, c) => {
    const r = await duplicateDraft(p(c), path, newName ? { newName } : {});
    return envelope(r, [], { newPath: r.newPath });
  },
});

defineCap({
  name: "move_draft", title: "把稿移到别的目录", scope: "project",
  summary: "移动并**把引用它的稿一起改写**。同 rename_draft：不要用文件管理器搬。",
  input: { path: z.string(), targetDir: z.string().describe("目标目录相对项目根的路径") },
  http: { method: "POST" },
  run: async ({ path, targetDir }, c) => {
    const r = await moveDraft(p(c), path, targetDir);
    return envelope(r, [], { referencesUpdated: r.referencesUpdated });
  },
});

defineCap({
  name: "create_folder", title: "新建目录", scope: "project",
  summary: "在项目里建一个目录。稿按目录分组，目录本身不是稿。",
  input: { path: z.string().describe("目录相对项目根的路径，如 Components 或 Pages/子目录") },
  /* HTTP 侧原来叫 `dir_create`（资源在前），前端在用，保留 */
  http: { route: "dir_create", method: "POST" },
  run: async ({ path }, c) => envelope(await createFolder(p(c), path)),
});

defineCap({
  name: "get_delete_impact", title: "删之前先看影响面（只看 `<dc-import>` 那种引用）", scope: "project",
  summary: [
    "**哪些 `.dc.html` 用 `<dc-import name=…>` 引了这个组件。** 删 / 改名之前看它 —— 那几处会缺组件。",
    "⚠️ **它只回答按「组件名」引用的那一种，而且只对 `.dc.html` 成立**（别的扩展名回 `E_BAD_INPUT`）。",
    "⚠️ **按路径的引用（`href` / `src` / `url()`）请问 `list_file_refs`** —— 那是另一个问题，两件都要问。",
  ].join("\n"),
  input: { path: z.string() },
  http: { route: "delete_impact", method: "GET" },
  run: async ({ path }, c) => {
    /* ⚠️⚠️ **非 `.dc.html` 不许回 `affectedCount: 0`，也不许抛「找不到稿」**（2026-10-24，geek-99 定）。
       实测对同一份 `PC 行操作.dc.html`：这件回 `affectedCount: 4`（4 处 `<dc-import>`），
       而 `list_file_refs` 回 `referencedBy: []` —— **两件都叫「谁引用了它」，
       而「引用」在它们嘴里是两种关系**：这件认**组件名**，那件认**路径**。
       所以它们**不能并成一件**：并了之后「删一份组件稿之前问一句」会回「没人引用」，
       而实际上有 4 处会断。
       > **一个更弱的答案冒用了一个更强的名字。**

       而对非 dc 文件回 `0` 是同一个病的另一种长相：`0` 读起来是「查过了，没人引用」，
       而真相是「**这件答不了这个问题**」。原来它抛 `找不到稿 "x.md"` —— 那句话也不对：
       文件在、只是这件能力不管它。
       ⚠️ 用**已有的** `E_BAD_INPUT`，不新造码（和门面那道 `safeParse` 同一条口径）。 */
    const rel = path;
    if (!/\.dc\.html$/i.test(rel)) {
      throw new ToolError(err(X.BAD_INPUT, rel, { kind: "file", name: rel },
        "这件只对 `.dc.html` 成立 —— 它查的是 `<dc-import name=…>` 那种按组件名的引用",
        { fix: "按路径的引用（href / src / url()）问 `list_file_refs`；它对 html / css / svg / md 都成立。" }));
    }
    const impact = await deleteDraftImpact(p(c), rel);
    return envelope(impact, [], { affectedCount: impact.affectedCount });
  },
});

defineCap({
  name: "delete_draft", title: "把稿移进回收站", scope: "project",
  summary: "不是真删 —— 进项目的回收站，可以恢复。建议先用 get_delete_impact 看影响面。",
  /* ⚠️ `file` 是**宽松的**：可以给相对路径，也可以只给文件名 —— `resolveDraft` 负责认。
     S1 稿件索引的行内删除就只有文件名（`ui/S1` 第 759 行）。
     M11-7 第一批把入参改成了严格的 `path`，**当场把 S1 弄坏了**（见 `00` §九十）。 */
  input: { file: z.string().describe("稿的相对路径或文件名") },
  http: { method: "POST" },
  run: async ({ file }, c) => {
    const proj = p(c);
    const r = await deleteDraft(proj, await resolveDraft(proj, file));
    return envelope(r, [], { trashPath: r.trashPath });
  },
});

defineCap({
  name: "list_trash", title: "回收站里有什么", scope: "project",
  summary: "列回收站：原路径、删除时间、回收站路径。恢复要用它给的 trashPath。",
  input: {},
  http: { route: "trash", method: "GET" },
  run: async (_i, c) => {
    const items = await listTrash(p(c));
    return envelope({ items }, [], { count: items.length });
  },
});

/* ⚠️ **恢复有两件，不是重叠**（M11-7 第一批误判过，`00` §九十）：
   - `restore_draft`（按**文件名**）：给**行内撤销**用 —— 用户刚删完点「撤销」，
     他手上只有文件名，没有 trashPath。S1 稿件索引就是这么用的。
   - `restore_trashed`（按 **trashPath**）：给**回收站列表**用 —— 那里每一项都带着自己的
     trashPath，按它恢复才不会在同名多次删除时选错。
   合成一条就得二选一，而两边都有真实用途。 */
defineCap({
  name: "restore_draft", title: "撤销刚才的删除（按文件名）", scope: "project",
  summary: "在回收站里按文件名找**最近删的那一份**恢复。行内撤销用它 —— 那时用户手上只有文件名。要精确恢复某一版请用 restore_trashed。",
  input: { file: z.string().describe("被删的稿的文件名") },
  http: { method: "POST" },
  run: async ({ file }, c) => {
    const proj = p(c);
    const base = file.split("/").pop() ?? file;
    /* listTrash 按时间倒序，`find` 拿到的就是**最近删的那一份** ——
       同名删过多次时这是唯一合理的语义（用户点的是「撤销刚才那一下」）。 */
    const hit = (await listTrash(proj)).find((t) => t.originalName === base);
    if (!hit) return envelope(null, [{ level: "error", code: "E_TRASH_NOT_FOUND",
      message: `回收站里没有 ${base}`, where: "(trash)", at: { kind: "key", name: base } } as never]);
    const r = await restoreDraft(proj, hit.trashPath);
    return envelope(r, [], { restored: r.originalPath });
  },
});

defineCap({
  name: "restore_trashed", title: "从回收站恢复指定的那一份", scope: "project",
  summary: "按 list_trash 给的 trashPath 恢复。原位置已被占用时会换个名字，不会覆盖。",
  input: { trashPath: z.string().describe("回收站路径，list_trash 给的那个") },
  http: { route: "trash_restore", method: "POST" },
  run: async ({ trashPath }, c) => {
    const r = await restoreDraft(p(c), trashPath);
    return envelope(r, [], { restored: r.originalPath });
  },
});

defineCap({
  name: "purge_trash", title: "永久删掉回收站里的一项", scope: "project",
  summary: "**真删，退不回来**。删之前想清楚。",
  input: { trashPath: z.string() },
  http: { route: "trash_purge", method: "POST" },
  run: async ({ trashPath }, c) => envelope(await purgeTrash(p(c), trashPath)),
});

defineCap({
  name: "empty_trash", title: "清空回收站", scope: "project",
  summary: "**真删，全部退不回来**。",
  input: {},
  http: { route: "trash_empty", method: "POST" },
  run: async (_i, c) => envelope(await emptyTrash(p(c))),
});
