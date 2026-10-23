/** 落盘前的确定性改写。doc/00 §5.2
 *
 * 三条保证里的第一条：归一化落盘。现在做两件事，顺序固定：
 *   ① 归一化编码与换行   ② @ds 别名展开
 *
 * ② 的道理是 **源头写抽象，落盘写具体**：设计稿里不写真实 ds 路径，由工具在落盘那一刻填。
 *
 * ⚠️⚠️ **原来还有 ③ `__resources` 注入 和 ④ 运行时副本分发，两件都删了。**
 * ④ 在 C3（M16-7c-2a）删的；③ 在 2026-10-24 删的 —— 而**③ 的删除条件正是 ④ 的删除**：
 * `window.__resources` 的唯一读者是 `support.js`，而 `support.js` 连往哪拷都没有了。
 * 核过才删（纪律④，别拿一台被消音的仪器量）：
 * `git grep __resources` 在 `server/src` 之外**零命中** —— `runtime/support.js` 7c-2b 删了，
 * `ui/` 与 `fixtures/渲染/` 已不在仓库里（`git ls-files` 两个都空，盘上那几份是未跟踪的残留）。
 * 而留着它比删掉更糟：`RESOURCE_MAP` 把一个**能下载的 unpkg URL** 改写成
 * `./react.production.min.js` —— 一个**没有任何代码会再拷过去**的本地路径。
 * > **一个改写规则的两端，一端还活着、另一端已经没了，它就从「离线兜底」变成了「制造死链」。**
 *
 * ⚠️ **已经写进用户稿里的那段标记不去动它**（用户的东西，纪律⑥）。
 * 所以 `stripResourceBlock` 和 `injectResources` **一起**删 —— 只删注入、留着剥，
 * 下一次落盘就会把用户稿里那段**删掉**，那才叫动了它。
 */
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expandDsAlias, fixDsDepth, type Project } from "./project.js";
import { NODE_ATTR, stampNodes } from "./nodeid.js";
import { sweepTmpIn, tmpNameFor } from "./tmpfiles.js";   // 临时文件的唯一出处（M14-9）

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

/** ①② 一起做。返回改写后的内容与做了什么。 */
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

  // ⚠️ 节点地址必须是**最后一步**。
  // 地址是「规范化后的开标签」的哈希，而 @ds 展开会改 helmet link 的 href ——
  // 也就是改开标签。放在展开之后打，盘上那份重新算一遍才能得到同一个 id
  // （幂等的前提）。这里只有一份文件：落盘副本就是后面 locate_node 要读的那份。
  const st = stampNodes(out, ...templateRange(out));
  if (st.count) { out = st.out; steps.push(`打节点地址 ${st.count} 处（${NODE_ATTR}）`); }

  /* ⚠️ 返回里原来还有 `injected`（`__resources` 注过没有）—— 跟着一起删。
     核过：`git grep injected` 在 `server/src` 里**零个读者**（`serve.ts` 那个同名变量是别的事）。
     > 留一个没人读的字段，下一个人会以为它有意义。 */
  return { content: out, steps, nodes: st.count };
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
