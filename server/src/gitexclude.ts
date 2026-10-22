/** 把我们生成的那些文件**排除在用户的 git 之外，而不碰他的 `.gitignore`**
 *  （B3，geek-99 2026-10-22 拍板；起因见 `doc/24` §24.1）。
 *
 *  ### 为什么需要第三条路
 *  接管一个目录会往里放 **17 个生成物**（预览壳、运行时副本、入口页…）。
 *  两条显而易见的做法都有问题：
 *
 *  | | 做法 | 问题 |
 *  | --- | --- | --- |
 *  | 原来 | 往他项目里的 `.gitignore` **追加一段** | **我们在改他的文件**，而这一批的起因之一正是这件事 |
 *  | 设计侧提的 | 什么都不写 | 他的 `git status` 里多 17 个未跟踪文件，一屏红 |
 *
 *  B3：写进**那个仓库的 `.git/info/exclude`**。它
 *  **只在本机生效、不进版本、不是用户的文件** ——
 *  和 M14-6 我们在兜底仓库里用的是同一招（`gitkeep.ts` 那段注释的理由逐字适用）。
 *  > **「不要改用户的文件」和「不要让他的 git 变脏」不是一对矛盾** ——
 *  > git 自己就留了一个本机专用的排除位置。
 *
 *  ### 三条边界（拿不准就不写）
 *  ① 不在 git 仓库里 → **什么都不写**；
 *  ② `.git` 是**文件**而不是目录（worktree / submodule）→ 按它里面的
 *     `gitdir: <路径>` 指向去找；指不到 → **不写**；
 *  ③ 写不下去（只读、权限） → **不写，并照实回**。
 *  > 这三条的共同形状：**它是一件「顺手帮个忙」的事，所以失败一律是「没帮」，
 *  > 不是「报错」** —— 排除规则写不进去不该让接管失败。
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { writeAtomic } from "./normalize.js";

/** 整段的起止标记。**带标记才认得出、才撤得掉**（geek-99 的要求）。 */
const OPEN = "# <umbra-studio> 这一段由 Umbra Studio 维护（接管那个目录时写的），别手改";
const CLOSE = "# </umbra-studio>";

/** 要排除的那几样 = 接管真的会往项目里放的东西。
 *
 *  ⚠️ **和 `indexpage.ts` 那份部署清单是同一件事的两头**，所以它要跟着变。
 *  实测接管写 17 个文件，按名字归成下面这几条（`S*.dc.html` 一条通配就够）。
 *  ⚠️ 这里**不列 `project.json`** —— 那是「这个目录是设计项目」的标记，
 *  **它该进版本**（同事 clone 下来才知道这是个设计项目）。
 *  > 排除清单和部署清单不是同一张：**有一样东西我们放进去、而且希望它留下**。 */
export const EXCLUDE_LINES: readonly string[] = [
  "# 工具产物：预览壳、入口页、索引数据、皮肤、运行时副本。都可由稿件重算。",
  "index.dc.html",
  "index-data.js",
  "S*.dc.html",
  "IconGlyph.dc.html",
  "icons.js",
  "_ds-tool/",
  "support.js",
  "react.production.min.js",
  "react-dom.production.min.js",
  ".umbradesign/",
  ".umbrastudio/",
];

export interface ExcludeResult {
  /** 写到哪个 `info/exclude`（相对或绝对，给回执看）。`null` = 没写 */
  file: string | null;
  /** 没写的原因。**写了也给，便于回执照实说** */
  why?: string;
}

/** 从 `dir` 往上找包住它的那个 git 仓库的 **GIT_DIR**。
 *
 *  ⚠️ **`.git` 可能是一个文件**（worktree / submodule）：内容是
 *  `gitdir: /abs/or/relative/path`。按它指向去找，指不到就当没有。
 *  ⚠️ **只往上找，不往下找** —— 往下找会把子模块当成「这个目录的仓库」。 */
export function gitDirFor(dir: string): { gitDir: string | null; why?: string } {
  let cur = resolve(dir);
  for (;;) {
    const dot = join(cur, ".git");
    if (existsSync(dot)) {
      let st;
      try { st = readFileSync(dot, "utf8"); } catch { return { gitDir: dot }; }   // 读不出来 = 它是目录
      /* 目录读成文本会抛（EISDIR），所以走到这里说明它是文件 */
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(st);
      if (!m) return { gitDir: null, why: `${dot} 是个文件，但里面没有 gitdir: 那一行 —— 认不出来，不写` };
      const target = isAbsolute(m[1]!) ? m[1]! : resolve(cur, m[1]!);
      if (!existsSync(target)) {
        return { gitDir: null, why: `${dot} 指向 ${target}，而那个路径不在 —— 认不出来，不写` };
      }
      return { gitDir: target };
    }
    const up = dirname(cur);
    if (up === cur) return { gitDir: null, why: "这个目录不在任何 git 仓库里 —— 什么都不写" };
    cur = up;
  }
}

/** 把那一段写进（或更新）`<GIT_DIR>/info/exclude`。**幂等**：整段替换。
 *
 *  ⚠️ 回 `file: null` 的每一种情况都带 `why` —— 调用方要能照实转告，
 *  而「没写」在这里是**正常结果之一**，不是错误。 */
export async function ensureExcluded(projectDir: string): Promise<ExcludeResult> {
  const { gitDir, why } = gitDirFor(projectDir);
  if (!gitDir) return { file: null, why };
  const file = join(gitDir, "info", "exclude");
  const block = [OPEN, ...EXCLUDE_LINES, CLOSE].join("\n");
  try {
    const cur = existsSync(file) ? await readFile(file, "utf8") : "";
    const a = cur.indexOf(OPEN);
    const z = cur.indexOf(CLOSE);
    let next: string;
    if (a >= 0 && z > a) next = cur.slice(0, a) + block + cur.slice(z + CLOSE.length);
    else next = (cur ? cur.replace(/\s*$/, "") + "\n\n" : "") + block + "\n";
    if (next === cur) return { file, why: "已经是最新的，没动" };
    await mkdir(dirname(file), { recursive: true });
    await writeAtomic(file, next);
    return { file };
  } catch (e) {
    /* ⚠️ 写不下去**不抛** —— 这是「顺手帮个忙」，失败就是没帮上。
       让接管因为排除规则写不进去而失败，是把主次关系搞反了。 */
    return { file: null, why: `写不进 ${file}：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 把那一段撤掉（「忘掉这个项目」时顺手清）。回有没有真撤掉。
 *
 *  ⚠️ **只删我们标记的那一段**，`info/exclude` 里别人写的东西一个字不动。 */
export async function dropExcluded(projectDir: string): Promise<{ file: string | null; removed: boolean }> {
  const { gitDir } = gitDirFor(projectDir);
  if (!gitDir) return { file: null, removed: false };
  const file = join(gitDir, "info", "exclude");
  if (!existsSync(file)) return { file, removed: false };
  try {
    const cur = await readFile(file, "utf8");
    const a = cur.indexOf(OPEN);
    const z = cur.indexOf(CLOSE);
    if (a < 0 || z <= a) return { file, removed: false };
    const next = (cur.slice(0, a) + cur.slice(z + CLOSE.length)).replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
    await writeAtomic(file, next);
    return { file, removed: true };
  } catch { return { file, removed: false }; }
}
