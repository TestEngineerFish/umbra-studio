/** 设计系统 token 编辑：只改取值，不改结构。
 *
 * 改之前自动分析影响面（哪些稿引用了这个 token）。
 * 改完后受影响的稿会在下一次渲染时反映新值。
 */

import { readFile } from "node:fs/promises";
import { Project } from "./project.js";
import { globalSearch } from "./search.js";
import { writeAtomic } from "./normalize.js";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";

export interface TokenEditResult {
  /** 被改的 token 路径 */
  path: string;
  /** 旧值 */
  oldValue: string;
  /** 新值 */
  newValue: string;
  /** 受影响的稿数 */
  affectedDrafts: number;
  /** 受影响稿的文件列表 */
  affectedFiles: string[];
  /** 是否真的改了（旧值 != 新值） */
  changed: boolean;
}

/** 按路径设置 token 值，返回影响面 */
export async function setTokenValue(
  p: Project,
  tokenPath: string,
  newValue: string,
): Promise<TokenEditResult> {
  if (!p.tokensPath) {
    throw new Error("项目没有配置 tokens 文件");
  }

  // 读取 tokens JSON
  const jsonStr = await readFile(p.tokensPath, "utf-8");
  const tokens = JSON.parse(jsonStr);

  /* 按点号路径取值。
   *
   * ⚠️ **`obj[part] === undefined` 不是「这个键存在」的判据**（issue #64，2026-10-05）。
   * `JSON.parse` 出来的普通对象上 `obj["__proto__"]` 就是 `Object.prototype`，
   * 而 `Object.prototype["toString"]` 也不是 undefined —— **两步都通过了「存在」检查**。
   * 实测：`set_token_value({ path: "__proto__.toString", value: "x" })`
   * 真的执行 `Object.prototype.toString = "x"`，于是**整个常驻服务进程里
   * 所有对象的 `toString` 都变成一个字符串**，后续请求大面积异常直到重启。
   * `constructor.prototype.xxx` 同理。
   *
   * 两道判据换掉一道：
   * ① 原型链上那三个名字**一律拒**（不管它在不在）——
   *    它们永远不该是 token 名，拒掉没有误伤；
   * ② 「存在」改用 `hasOwnProperty` —— 它只看**自己身上有没有**，
   *    不会被原型链上的东西骗过去。
   *
   * ⚠️ 这和 #57（会话 ID）、#63（模板名）是同一天的同一族：
   * **参数也是攻击面**，而这一条的特别之处是它不碰文件系统 ——
   * 它污染的是**我们自己进程里的内存**，重启才好。
   */
  const parts = tokenPath.split(".");
  const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
  let obj: any = tokens;
  for (const [i, part] of parts.slice(0, -1).entries()) {
    if (FORBIDDEN.has(part)) {
      throw new ToolError(err(X.BAD_INPUT, "(tokens)", { kind: "key", name: tokenPath },
        `token 路径里不能有 ${part}`, { fix: "这几个名字会改掉 JavaScript 的原型链，不是 token。" }));
    }
    if (!Object.prototype.hasOwnProperty.call(obj, part)) {
      throw new ToolError(err(X.BAD_INPUT, "(tokens)", { kind: "key", name: tokenPath },
        `token 路径不存在：${parts.slice(0, i + 1).join(".")}`, { fix: "用 get_design_system 看现有的 token 树。" }));
    }
    obj = obj[part];
    /* 中间段必须是对象 —— 不然下一轮 `hasOwnProperty.call(字符串, …)` 会给出
       意料之外的结果（字符串也有自己的属性，比如 `length`）。 */
    if (typeof obj !== "object" || obj === null) {
      throw new ToolError(err(X.BAD_INPUT, "(tokens)", { kind: "key", name: tokenPath },
        `token 路径中间那一段不是对象：${parts.slice(0, i + 1).join(".")}`,
        { fix: "只能改叶子上的值，不能把一个值当成一层。" }));
    }
  }
  const lastPart = parts[parts.length - 1]!;
  if (FORBIDDEN.has(lastPart)) {
    throw new ToolError(err(X.BAD_INPUT, "(tokens)", { kind: "key", name: tokenPath },
      `token 名不能是 ${lastPart}`, { fix: "这几个名字会改掉 JavaScript 的原型链，不是 token。" }));
  }
  if (!Object.prototype.hasOwnProperty.call(obj, lastPart)) {
    throw new ToolError(err(X.BAD_INPUT, "(tokens)", { kind: "key", name: tokenPath },
      `token 不存在：${tokenPath}`, { fix: "用 get_design_system 看现有的 token 树。" }));
  }

  const oldValue = String(obj[lastPart]);

  // 如果值没变，直接返回
  if (oldValue === newValue) {
    return {
      path: tokenPath,
      oldValue,
      newValue,
      affectedDrafts: 0,
      affectedFiles: [],
      changed: false,
    };
  }

  // 分析影响面：搜索引用了这个 token 的稿
  // token 在稿里通常以 var(--kebab-name) 或 @ds.dot.path 形式出现
  // 我们用 token 路径的最后一段作为搜索词
  const searchQuery = parts[parts.length - 1]!;
  const searchResult = await globalSearch(p, searchQuery, 500);
  const affectedFiles = searchResult.hits.map((h) => h.file);

  // 改值
  obj[lastPart] = newValue;

  // 写回
  /* ⚠️ `writeAtomic` 而不是 `writeFile`（issue #64 顺带）：
     写到一半崩溃的话 tokens 文件会被**截断**，而整个设计系统都依赖它。
     末尾补一个换行 —— 和 `normalize` 的「末尾单换行」约定一致，
     不补的话每次改 token 都会让 git diff 多出一行「\ No newline at end of file」。 */
  await writeAtomic(p.tokensPath, JSON.stringify(tokens, null, 2) + "\n");

  return {
    path: tokenPath,
    oldValue,
    newValue,
    affectedDrafts: affectedFiles.length,
    affectedFiles,
    changed: true,
  };
}
