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

/** 「这个目录还没接管为设计项目」那道闸（M14-4 收尾，2026-10-22）。
 *
 *  ⚠️⚠️ **「新建稿件」是 B3 那道闸的一条后门，而我原来没看见它。**
 *  B3 让「打开一个普通目录」一个字节都不写；而在同一个目录里建一份稿，
 *  实测会往那里写 **4 个文件 · 约 225 KB** 而且一句话都不说：
 *
 *  | 写什么 | 多大 | 为什么它必须在项目里 |
 *  | --- | --- | --- |
 *  | `support.js` | 69 KB | ⓒ 档：稿自己 `<script src="./support.js">`，没有它双击是白屏 |
 *  | `react.production.min.js` + `react-dom…` | 139 KB | 同上 |
 *  | `.umbradesign/select-bridge.js` | 19 KB | 点选桥 |
 *
 *  落点是对的（`doc/24` §八 的 ⓒ 档 **必须**落在项目里），
 *  **错的是没问过** —— 而且写完还是半残的：预览壳 `S2-单稿预览壳.dc.html` 不在，
 *  于是编辑档那个 iframe **404**。
 *  > **一个写了 225 KB 而编辑档打不开的结果，比直接拦住糟。**
 *
 *  ### 为什么是拦住，而不是「写进去再提醒」
 *  三条理由，第二条是决定性的：
 *  ① 预览壳不在 → 属性面板 / 点选 / 就地编辑全 404，`.dc.html` 一半的意义没了；
 *  ② **「只建这一份」省不下什么** —— 它已经要写 225 KB，而接管总共才多 387 KB
 *     加一行 `project.json`。**那个选项用全部功能换了几乎没有的代价**；
 *  ③ 多一种状态就多一种要解释的半残状态（§23.3 那一族）。
 *
 *  ### 为什么装在这一层
 *  `rebuild_index` 那道闸（`cap/history.ts`）的同一个理由，逐字适用：
 *  **一道闸只守住一条路等于没守**。这里是三个门面（MCP / HTTP / 应用内）
 *  汇到的那一处，装在这里三面一起守住；装在前端的话 AI 一句
 *  「在这个目录里建一份稿」就绕过去了。
 *
 *  ⚠️ **`write_draft` 没装这道闸，故意的**：那是「改用户已有的一份稿」，
 *  拒掉就从「少写了点东西」变成「**这种文件改不了**」。
 *  它那条路上 `ensureRuntimeBeside` 同样会补 225 KB，但那时候
 *  「这份稿要能单独打开」是用户自己要的结果，回执里也有 `runtimeCopied`。
 */
function requireAdopted(dir: string, file: string): void {
  if (isDesignProject(dir)) return;
  throw new ToolError(err(X.BAD_INPUT, file, { kind: "path", name: dir },
    "这个目录还没接管为设计项目，不建稿",
    /* ⚠️ 这个数要和弹窗上那个**一致**：原来写的是「约 600 KB」，而那是我装闸时
       还没量就先写下的 —— 量出来是 **17 个文件 · 约 750 KB**。
       **两处说同一件事而数字不一样，哪个对都不要紧，要紧的是用户会发现我们在猜。** */
    { fix: "设计稿要能预览和编辑，得先往这个目录里放预览壳与运行时副本（17 个文件 · 约 750 KB）。先「接管为设计项目」（界面上工作台顶部那条横条，或 `adopt_project`），再建稿。只看、只改已有的文件不需要接管。" }));
}

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
    requireAdopted(proj.dir, path);
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
    requireAdopted(p(c).dir, path);
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
  name: "get_delete_impact", title: "删之前先看影响面", scope: "project",
  summary: "谁引用了这份稿。**删之前必看** —— 有人引用还删，那些稿会缺资源。",
  input: { path: z.string() },
  http: { route: "delete_impact", method: "GET" },
  run: async ({ path }, c) => {
    const impact = await deleteDraftImpact(p(c), path);
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
