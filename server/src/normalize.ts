/** 落盘前的确定性改写。doc/00 §5.2
 *
 * 三条保证里的第一条：归一化落盘。做四件事，顺序固定：
 *   ① 归一化编码与换行   ② @ds 别名展开   ③ __resources 注入   ④ 运行时副本分发
 *
 * ②③ 是同一类事 —— **源头写抽象，落盘写具体**。设计稿里不写真实 ds 路径、
 * 不写 React 的本地映射；这两件由工具在落盘那一刻填。
 */
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expandDsAlias, fixDsDepth, type Project } from "./project.js";
import { NODE_ATTR, stampNodes } from "./nodeid.js";
import { sweepTmpIn, tmpNameFor } from "./tmpfiles.js";   // 临时文件的唯一出处（M14-9）

export const MARK_OPEN = "<!-- umbradesign:resources -->";
export const MARK_CLOSE = "<!-- /umbradesign:resources -->";

/** support.js 里硬编码的 CDN URL（doc/05 §1.2）→ 同层本地副本 */
export const RESOURCE_MAP: Record<string, string> = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "./react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "./react-dom.production.min.js",
};

/* ⚠️⚠️ **`RUNTIME_FILES` / `ensureRuntimeBeside` / `missingRuntime` 三件
   2026-10-23（M16-7c-2a / C3）删了，而它们是一整串的源头。**

   它们把 `support.js` + 两个 React UMD（**225 KB**）拷到每一份稿旁边，
   让 `.dc.html` 双击也能打开。C3 之后 `.dc.html` 落 `html` kind、不再由 dc 模块预览，
   那三个文件**没有任何读者**。

   ⚠️ **删掉它之后，下游一串闸的理由自动消失**（和 7a「删掉 kind 条目就等于撤了那两道拒」同形）：
   · `create_draft` 的 `requireAdopted`（三条理由全是 dc 的：预览壳 404 ·
     「225 KB vs 接管 387 KB」的对比 · 半残状态）
   · `adopt_project`（它部署的就是这些）
   · 工作台那条「接管为设计项目」横条（7c-1 已删）
   > **从源头删，下游的理由自动倒下** —— 比一条条手动撤可靠，因为手动撤会漏。

   ⚠️ **盘上已有的那些副本不删**（硬约束同族）：它们在用户的目录里，是他的文件。
   这里删掉的只是「以后还会不会再拷一份」。 */


/** ① UTF-8 无 BOM、LF、末尾恰好一个换行 */
export function normalizeSource(s: string): string {
  return s.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\n*$/, "\n");
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripResourceBlock(src: string): string {
  const re = new RegExp(`[ \\t]*${esc(MARK_OPEN)}[\\s\\S]*?${esc(MARK_CLOSE)}\\n?`, "g");
  return src.replace(re, "");
}

function resourceBlock(): string {
  const json = JSON.stringify(RESOURCE_MAP, null, 2).replace(/\n/g, "\n  ");
  return `${MARK_OPEN}\n<script>window.__resources = ${json};</script>\n${MARK_CLOSE}\n`;
}

export interface InjectResult { out: string; injected: boolean; reason?: string }

/** ③ 在第一个引 support.js 的 <script> 之前插入映射块。幂等：先删旧块再写新块。 */
export function injectResources(src: string): InjectResult {
  const body = stripResourceBlock(src);
  const m = body.match(/[ \t]*<script[^>]*\bsrc\s*=\s*["'][^"']*support\.js["'][^>]*>\s*<\/script>/i);
  if (!m || m.index === undefined) {
    return { out: body, injected: false, reason: "找不到引 support.js 的 script 标签，没有注入点" };
  }
  return { out: body.slice(0, m.index) + resourceBlock() + body.slice(m.index), injected: true };
}

/** ①②③ 一起做。返回改写后的内容与做了什么。 */
/** 模板区 `<x-dc>…</x-dc>` 的范围。打地址只走这里 —— head 里的 script/link 不是设计节点。 */
function templateRange(src: string): [number, number] {
  const open = /<x-dc(?:\s(?:"[^"]*"|'[^']*'|[^>"'])*)?>/i.exec(src);
  if (!open) return [0, 0];
  const start = open.index + open[0].length;
  const close = src.toLowerCase().indexOf("</x-dc>", start);
  return [start, close < 0 ? src.length : close];
}

export function prepareForDisk(p: Project, content: string, relPath?: string) {
  const steps: string[] = [];
  let out = normalizeSource(content);
  steps.push("归一化（UTF-8 无 BOM / LF / 末尾单换行）");

  // relPath 决定 @ds 展开出来的相对深度（子目录里的稿要 ../）
  const depth = relPath ? relPath.split("/").length - 1 : 0;
  const expanded = expandDsAlias(p, out, relPath);
  if (expanded !== out) { out = expanded; steps.push(`@ds → ${p.dsDir}`); }
  // 存量稿：上一版展开时没算深度，盘上留着指向 /<子目录>/_ds/… 的死链
  const fixed = fixDsDepth(p, out, depth);
  if (fixed !== out) { out = fixed; steps.push(`修正 @ds 相对深度（子目录稿，补 ${"../".repeat(depth)}）`); }

  const r = injectResources(out);
  out = r.out;
  steps.push(r.injected ? "注入 __resources 离线映射" : `未注入 __resources（${r.reason}）`);

  // ⚠️ 节点地址必须是**最后一步**。
  // 地址是「规范化后的开标签」的哈希，而 @ds 展开会改 helmet link 的 href ——
  // 也就是改开标签。放在展开之后打，盘上那份重新算一遍才能得到同一个 id
  // （幂等的前提）。这里只有一份文件：落盘副本就是后面 locate_node 要读的那份。
  const st = stampNodes(out, ...templateRange(out));
  if (st.count) { out = st.out; steps.push(`打节点地址 ${st.count} 处（${NODE_ATTR}）`); }

  return { content: out, steps, injected: r.injected, nodes: st.count };
}


/** 原子写：先写临时文件再 rename，避免半截文件被浏览器读到。 */
/** 原子写。
 *
 *  ⚠️ **`content` 可以是字节**（#108，2026-10-07）：图片编辑要把一张 PNG 写回盘，
 *  而 `writeFile(tmp, content, "utf8")` 对二进制是**静默损坏** ——
 *  非法 utf8 序列被替换成 U+FFFD，文件还在、还能打开、只是花了。
 *  **「写坏了」和「没写」长得完全不一样，而前者更难发现。** */
export async function writeAtomic(abs: string, content: string | Uint8Array): Promise<void> {
  const dir = dirname(abs);
  await mkdir(dir, { recursive: true });
  /* 顺手把这个目录里上一轮留下的孤儿清掉（每进程每目录一次，失败不抛）。
     ⚠️ **不 await 在落盘前面** —— 清垃圾慢了不该让用户的保存等着。 */
  void sweepTmpIn(dir);
  const tmp = tmpNameFor(abs);
  if (typeof content === "string") await writeFile(tmp, content, "utf8");
  else await writeFile(tmp, content);
  const { rename, rm } = await import("node:fs/promises");
  try { await rename(tmp, abs); }
  catch (e) { await rm(tmp, { force: true }); throw e; }
}

export async function readIfExists(abs: string): Promise<string | null> {
  try { return await readFile(abs, "utf8"); } catch { return null; }
}

export function resolveInProject(p: Project, path: string): string {
  return resolve(p.dir, path);
}
