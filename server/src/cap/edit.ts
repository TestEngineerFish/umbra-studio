import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { envelope } from "../envelope.js";
import { draftPath, TOOL_ROOT } from "../project.js";
import { locateNode, resolveDraft } from "../locate.js";
/* ⚠️ 注意：`server/src/edit.ts` 是**改一处**的实现，本文件是 `cap/edit.ts`（能力声明）。
   同名不同层，别看串了 —— 实现在 `src/edit.ts`，声明在这儿。 */
import { revertTo, setProp, type SlotKind } from "../edit.js";
import { patchDraft, writeDraft } from "../write.js";
import { validateDraft } from "../validate.js";
import { readCheck, sha256 } from "../check.js";
import { workspaceState } from "../history.js";
import { defineCap } from "./registry.js";
import { originOf, type CapCtx } from "./types.js";

/** 稿件的读 / 校验 / 写 / 改一处 / 回退（M11-7 第四批）。
 *
 *  **这一组是核心中的核心** —— `write_draft` 就是纪律① 那条唯一写入口：
 *  归一化 → `@ds` 展开 → `__resources` 注入 → 校验 → 落盘 → 快照 → changelog。
 *  绕过它写出来的页会因为缺 `__resources` 而在断网时白屏（`00` §十五 实测踩过）。
 *
 *  ⚠️ 搬这一组时**整段读了两侧实现**，没有用 grep 拼 —— 上一批就是按片段读把
 *  首页的缩略图搬丢了（`00` §92.1）。
 */
const p = (c: CapCtx) => c.project!;

/** 稿路径：**一律走 `resolveDraft`**（宽松，认相对路径也认文件名）。
 *  MCP 侧原来直接用 `draftPath`（严格），HTTP 侧用 `resolveDraft` ——
 *  同一件事两种严格度，而宽松那种是超集，没有理由不统一。 */
const rel = (c: CapCtx, file: string) => resolveDraft(p(c), file);


defineCap({
  name: "revert_to", title: "把一份稿退回某一版", scope: "project",
  summary: [
    "把 v<N> 的源码作为**新的一版**落盘。**历史只增不改** ——",
    "changelog 会照常记下这次回退，实现侧看得见「退回到了哪一版」。悄悄改历史等于变更交付有个洞（doc/07）。",
    "先用 list_versions 看有哪些版本。",
  ].join("\n"),
  input: { file: z.string(), version: z.string().describe("如 v3") },
  http: { route: "revert", method: "POST" },
  run: async ({ file, version }, c) => {
    const r = await revertTo(p(c), file, version, originOf(c.via));
    return envelope(r, [], { written: r.write.written, newVersion: r.write.version, restored: r.restored });
  },
});

/** 写稿规则的出处。**不属于任何项目** —— 它是工具自带的文档 */
const GUIDES: Record<string, { file: string; note: string }> = {
  template: { file: "02-dc-html 格式说明.md", note: "模板语法与结构" },
  logic: { file: "03-渲染与交互逻辑.md", note: "逻辑类、渲染期与交互期" },
  interaction: { file: "03-渲染与交互逻辑.md", note: "同 logic" },
  checklist: { file: "06-写稿规则.md", note: "写稿前后的自查清单" },
  tokens: { file: "06-写稿规则.md", note: "取值怎么用 tokens" },
};

