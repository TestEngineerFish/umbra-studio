import { z } from "zod";
import { envelope } from "../envelope.js";
/* ⚠️ 注意：`server/src/edit.ts` 是**改一处**的实现，本文件是 `cap/edit.ts`（能力声明）。
   同名不同层，别看串了 —— 实现在 `src/edit.ts`，声明在这儿。 */
import { revertTo } from "../edit.js";
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

/* ⚠️ 这里原来有一个 `const rel = (c, file) => resolveDraft(p(c), file)` ——
   注释写着「稿路径一律走 `resolveDraft`（宽松）；MCP 侧原来直接用 `draftPath`（严格），
   同一件事两种严格度」。**而它一处都没被调过**，所以那条「统一」从来没落地。
   2026-10-24 删掉它，同时把这件事记下来：这个文件里每一件能力自己解析路径。
   > **一个为了「统一两种写法」而写的辅助函数，没有人调它的时候，
   > 它记录的是一个意图，不是一条规则** —— 而读的人会把它当成规则。 */


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

/* ⚠️⚠️ 这里原来有一份 `GUIDES`（写稿规则文档的映射表），而它是**同一个死常量的第 N 份副本**：
   C3（M16-7c-2b）已经在 `index.ts` 里删过它并写清了理由（那件 `get_syntax_guide`
   7b 就删了，`doc/` 也跟着从打包清单里撤了），**而这两个文件里的副本漏下了**。
   2026-10-24 `noUnusedLocals` 那一轮才量到。
   > **一处定义被删掉的时候，它的副本不会报错 —— 副本的全部代价就在这里。**
   > 而「删一处定义」和「删一处定义的所有副本」在当时看起来是同一件事。 */

