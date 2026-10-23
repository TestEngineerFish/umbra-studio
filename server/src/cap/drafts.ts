import { z } from "zod";
import { join } from "node:path";
import { envelope, err, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { duplicateDraft } from "../project.js";
import { deleteDraftImpact, isDcPath } from "../refs.js";
import { defineCap } from "./registry.js";
import type { CapCtx } from "./types.js";

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

/* ⚠️⚠️ **这个文件 2026-10-24（M16-8 ③④）之后只剩两件，而它们住在这里的理由各不相同：**
 *
 *  | 件 | 为什么还在这儿 |
 *  | --- | --- |
 *  | `get_delete_impact` | 它**真的只对 `.dc.html` 成立**（查 `<dc-import name=…>`）。⑤ 定的：不并进 `list_file_refs` |
 *  | `duplicate_draft` | 它 2026-10-24（②）**已经通用化了**，按问题分该进 `files.ts` —— 而它的**对外名还带 `draft`**，改名要和 UmbraPC 同步，所以搬家要等那一次一起做 |
 *
 *  搬走的：回收站五件 + `create_folder` → `cap/files.ts`（它们和 dc 一点关系都没有，
 *  只是历史上住在这个文件里）。
 *  > **一个文件的名字说的是它当初装了什么，而不是它现在装着什么** ——
 *  > 而「按名字猜这里面是什么」会让下一个人去 `files.ts` 找回收站，找不到。 */

/** 模板名 → 绝对路径。模板存在项目自己的 `.umbrastudio/templates/` 下 */

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


/* ⚠️⚠️ **`create_draft` 2026-10-24 退场**（M16-8 ⑥，geek-99 定）。
   它有四档来源，而其中三档都是**在造设计稿**：空白骨架（`<x-dc>` + 运行时那一套）·
   包装一个组件（`<dc-import>`）· 套模板（`.dc.html` 模板）。
   C3 定的是「`.dc.html` 只留预览，设计稿那一整套删掉」，所以这三档跟着走。
   第四档「复制现有稿」交给 **② `duplicate_draft`**（2026-10-24 已通用化：后缀跟着源走 +
   二进制逐字节复制）—— 两件能力回答同一个问题，留一件。
   ⚠️ 它的 summary 里还写着「`__resources` 注入」，而那一套 2026-10-24 已经删了 ——
   **一句假话随它一起去掉**（而不是改对它：改对一句没人该再读的话没有意义）。

   ⚠️ **界面那个入口没有跟着消失，而是换了**：原来「新建稿件…」调这件；
   现在「新建文件…」调 `write_file`（第二条写入口，本来就是通用的）。
   理由是量出来的：删之前**界面上唯一能新建文件的入口就是它**，
   而 `dir/View.tsx` 的空态文案已经在让用户「用项目菜单里的「新建文件」」——
   **指向一个不存在的入口**。
   > **退场一件 dc 能力，不该顺手把「能新建文件」一起退掉** ——
   > 而这两件事在这个入口上是同一颗按钮。 */

/* ⚠️⚠️ **`rename_draft` / `move_draft` 2026-10-24 并进 `move_file`**（M16-8 ①，geek-99 定）。
   并的理由不是「两件长得像」，是**它们回答的是同一个问题而只有一件被人调**：
   前端的改名 / 移动 / 拖拽走的全是 `file_move`，而这两件的调用方是零。
   ⚠️ 而「并」不等于「删」：它们真正做的那件事（改写 `<dc-import name=…>` 的引用）
   **`move_file` 原来不做** —— 探针读数：`delete_impact` 说 1 处引用它，
   `file_move` 改完名引用方仍写着旧名、回执 `rewrote: []`。
   现在那一段住在 `refs.ts` 的 `dcImportsFollow`，由 `moveFile` 调，
   而且落盘改走第二条写入口（原来是 `writeAtomic` 直写，**没有快照也没有并发闸**）。
   > **并掉一件能力之前要先量它做了什么，而不是看它的名字像不像另一件。**
   闸的对账见 `moveFile` 里逐条的注释：只读闸和目标端的 `isInsideReal` 是**补上的**。 */

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
    if (!isDcPath(rel)) {
      throw new ToolError(err(X.BAD_INPUT, rel, { kind: "file", name: rel },
        "这件只对 `.dc.html` 成立 —— 它查的是 `<dc-import name=…>` 那种按组件名的引用",
        { fix: "按路径的引用（href / src / url()）问 `list_file_refs`；它对 html / css / svg / md 都成立。" }));
    }
    const impact = await deleteDraftImpact(p(c), rel);
    return envelope(impact, [], { affectedCount: impact.affectedCount });
  },
});

/* ⚠️⚠️ **`delete_draft` 2026-10-24 并进 `trash_file`**（M16-8 ③，geek-99 定）。
   两件都是「挪进项目回收站、可恢复」，而回收站的布局本来就是**同一套**
   （`<时间戳>/<原相对路径>`，issue #81 那一轮统一的）。
   调用方：前端走 `file_trash`；`delete_draft` 原来唯一的调用方是 `ui/S1-稿件索引.dc.html`，
   而那份稿 C3（M16-7）已经删了 —— **它的调用方是零**。

   ⚠️ **并掉之后少了一样，照实说**：`delete_draft` 的回执带 `impact`
   （有几处 `<dc-import>` 会断）。那件事现在**单独问** `delete_impact` ——
   M16-8 ⑤ 刚把前端改成这么做，而且必须这么做：
   > **`delete_impact` 要在文件还在盘上的时候问** —— 实测删完再问它抛「找不到稿」。
   把影响面绑在「删」的回执里，看着方便，实际上是让一个破坏性动作同时承担一个查询，
   而两者对「文件还在不在」的要求正好相反。

   ⚠️ `delete_draft` 的 `file` 原来是**宽松的**（给文件名也认，`resolveDraft` 负责找），
   而 `trash_file` 的 `path` 是严格相对路径。那半宽松没有丢 ——
   它搬到了 `restore_trashed_by_name` 那一侧（「我只记得文件名」真正发生在**恢复**的时候）。 */
