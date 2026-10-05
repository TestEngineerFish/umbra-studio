/** 稿件模板管理：把稿存为模板，新建时能选。
 *
 * 模板存在项目的 .umbrastudio/templates/ 目录下。
 */

import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Project, draftPath as draftPathOf } from "./project.js";
import { resolveInside } from "./pathguard.js";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";

const TEMPLATES_DIR = ".umbrastudio/templates";

export interface TemplateInfo {
  /** 模板名 */
  name: string;
  /** 文件名 */
  file: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 稿的元素数 */
  elementCount: number;
}

/** 模板目录的绝对路径 */
function templatesDir(p: Project): string {
  return join(p.dir, TEMPLATES_DIR);
}

/** 列出项目的所有模板 */
export async function listTemplates(p: Project): Promise<TemplateInfo[]> {
  const dir = templatesDir(p);
  if (!existsSync(dir)) return [];

  const files = await readdir(dir);
  const templates: TemplateInfo[] = [];

  for (const file of files) {
    if (!file.endsWith(".dc.html")) continue;
    const abs = join(dir, file);
    try {
      const content = await readFile(abs, "utf-8");
      // 解析 meta 信息（如果有的话）
      const createdAtMatch = content.match(/<!--\s*template-created-at:\s*(.+?)\s*-->/);
      const elementMatch = content.match(/<!--\s*template-element-count:\s*(\d+)\s*-->/);
      templates.push({
        name: file.replace(/\.dc\.html$/, ""),
        file,
        createdAt: createdAtMatch?.[1] ?? "unknown",
        elementCount: parseInt(elementMatch?.[1] ?? "0", 10),
      });
    } catch {
      // 读不到跳过
    }
  }

  return templates;
}

/** 把一份稿存为模板 */
/** 模板名 → 模板文件的绝对路径。**存和删都走这一个函数**（issue #63，2026-10-05）。
 *
 *  ### 原来的样子：两个函数对同一个名字的处理**不对称**
 *  | | 做了什么 | `a/b` 落到 |
 *  | --- | --- | --- |
 *  | `saveAsTemplate` | `name.replace(/[\/\\]/g, "_")` | `templates/a_b.dc.html` |
 *  | `deleteTemplate` | **什么都不做** | `templates/a/b.dc.html` |
 *
 *  所以 `a/b` 存进去之后**删不掉自己存的那份** —— 这是不对称本身的代价，
 *  而它掩护了更严重的那一半：`deleteTemplate` 连分隔符都不管，
 *  而 **`join` 会折叠 `..`**。实测：
 *
 *  ```
 *  join("/p/.umbrastudio/templates", "../../index" + ".dc.html") → /p/index.dc.html
 *  ```
 *
 *  于是 `delete_template({ name: "../../index" })` **永久删掉项目根的 `index.dc.html`** ——
 *  不经写入口、没有快照、没有 changelog、没有回收站（纪律① 的「删除」侧）。
 *  层数够多时项目外任意 `.dc.html` 也删得掉。
 *
 *  ⚠️ **调用方是 AI**（MCP 的 `delete_template` 和会话通道都 import 了它）——
 *  模型把名字拼错一次、或者被稿里的文字诱导一次，就够了。
 *
 *  ### 两道闸，一处定义
 *  形状（不许有分隔符、冒号、通配符、控制字符，不许是 `.` / `..`）+
 *  结果（`resolveInside` 兜底）。和 `plugin/paths.ts`（issue #23）、
 *  `sessionFile`（issue #57）是同一套做法 —— **参数也是攻击面**。
 */
function templateFile(p: Project, templateName: string): string {
  const name = String(templateName ?? "");
  const bad = !name
    || name === "." || name === ".."
    // eslint-disable-next-line no-control-regex
    || /[\/\\:*?"<>|\x00-\x1f]/.test(name);
  if (bad) {
    throw new ToolError(err(X.BAD_INPUT, "(template)", { kind: "key", name: "name" },
      `模板名不合法：${JSON.stringify(name.slice(0, 60))}`,
      { fix: "模板名是一个普通名字，不能带路径分隔符、`..`、冒号或通配符。" }));
  }
  /* 第二道：算出来的路径必须还在模板目录里面。
     形状那一道已经把分隔符挡掉了，这一道是**不依赖我对形状想得全不全**。 */
  return resolveInside(templatesDir(p), `${name}.dc.html`);
}

export async function saveAsTemplate(
  p: Project,
  draftPathArg: string,
  templateName: string,
): Promise<{ saved: boolean; path: string }> {
  const dir = templatesDir(p);
  await mkdir(dir, { recursive: true });

  /* ⚠️ **源稿路径走 `draftPath()` 守卫**（issue #63）。
     原来是 `join(p.dir, draftPath)` 直接 `readFile` —— 而 `join` 折叠 `..`，
     于是 `save_as_template({ draftPath: "../../../../.ssh/config" })`
     会把**项目外任意可读文件**原样拷进 `.umbrastudio/templates/t.dc.html`，
     之后从模板建稿 / 读稿，内容就进了 AI 上下文。
     `draftPath()` 自带 `isInside` + 存在性检查（`project.ts:188`），现成的。
     ⚠️ 顺带要求 `.dc.html` —— 模板就是稿，不是任意文件。 */
  if (!/\.dc\.html$/i.test(draftPathArg)) {
    throw new ToolError(err(X.BAD_INPUT, draftPathArg, { kind: "path", name: draftPathArg },
      "只能把设计稿存成模板", { fix: "draftPath 要指向一份 .dc.html" }));
  }
  const abs = draftPathOf(p, draftPathArg);
  const content = await readFile(abs, "utf-8");

  // 加模板元数据注释
  const now = new Date().toISOString();
  const elementCount = (content.match(/<[\w-]+/g) ?? []).length;
  const metaComment = `<!-- template-created-at: ${now} -->\n<!-- template-element-count: ${elementCount} -->\n`;

  // 如果源稿没有 meta，加到开头
  let finalContent = content;
  if (!content.includes("template-created-at:")) {
    finalContent = metaComment + content;
  }

  /* 存和删走同一个函数 —— 不对称是上面那条⚠️ 的一半 */
  const templatePath = templateFile(p, templateName);
  await writeFile(templatePath, finalContent, "utf-8");

  return { saved: true, path: templatePath };
}

/** 删除一个模板 */
export async function deleteTemplate(
  p: Project,
  templateName: string,
): Promise<{ deleted: boolean }> {
  const abs = templateFile(p, templateName);

  if (!existsSync(abs)) {
    return { deleted: false };
  }

  await rm(abs);
  return { deleted: true };
}
