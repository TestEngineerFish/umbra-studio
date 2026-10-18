// 来源：UmbraPC electron/core/convert/output.ts（2026-10-18 a72ac3a），改动：相对 import 补 .js
// 格式转换：成品放哪 —— 引擎统一分配，转换器拿不到「随便写哪」的能力（照 Filee 的 Output.Allocate）。
//
// 规矩（doc/格式转换-方案调研-2026-10-18.md §4.1）：
//   1. 默认放在原文件旁边，同名换扩展名；
//   2. 重名就加「 (1)」「 (2)」…，**永不覆盖** —— 包括永不覆盖原文件自己；
//   3. 先在任务临时目录里写完，成功了才挪到最终位置，失败不留半截。
// 占位用 `wx`（独占创建）：两个任务同时想要「报告.pdf」时，只有一个拿得到，另一个自动顺延到「报告 (1).pdf」。

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { extOf } from "./formats.js";

const MAX_TRIES = 200;

/** 第 n 个候选名（n = 0 是原名）。 */
export function candidateName(base: string, ext: string, n: number): string {
  return n === 0 ? `${base}.${ext}` : `${base} (${n}).${ext}`;
}

/** 占下一个不重名的成品路径（创建一个空的占位文件），回绝对路径。`dir` 不给就是源文件所在目录。 */
export async function reserveOutput(source: string, to: string, dir?: string): Promise<string> {
  const outDir = dir || path.dirname(source);
  const base = path.basename(source).replace(/\.[^./\\]+$/, "");
  const ext = extOf(to);
  const src = path.resolve(source);
  for (let n = 0; n < MAX_TRIES; n++) {
    const p = path.join(outDir, candidateName(base, ext, n));
    if (path.resolve(p) === src) continue;
    try {
      const fh = await fs.open(p, "wx");
      await fh.close();
      return p;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
  }
  throw new Error(`「${base}」重名的文件太多了，没找到空位`);
}

/** 把临时目录里转好的文件挪到占好的位置上（换掉空占位）。跨盘时 rename 不成，退回复制。 */
export async function settleOutput(tmp: string, reserved: string): Promise<void> {
  try {
    await fs.rename(tmp, reserved);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await fs.copyFile(tmp, reserved);
    await fs.rm(tmp, { force: true });
  }
}

/** 失败时收回占位：只删**还是空的**那个占位，万一它已经被换成了成品（不该发生）也不删。 */
export async function releaseOutput(reserved: string): Promise<void> {
  const st = await fs.stat(reserved).catch(() => null);
  if (st && st.isFile() && st.size === 0) await fs.rm(reserved, { force: true }).catch(() => {});
}
