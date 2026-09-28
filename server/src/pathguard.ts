import path, { type PlatformPath } from "node:path";

/** 「这个路径在不在那个目录里面」——**全项目唯一一份判定**（issue #19，2026-09-28）。
 *
 *  ⚠️ **为什么必须有这一份。** 这条判定原来在六处各写了一遍，写法都是
 *  `resolve(base, rel).startsWith(base)` —— `resolve` 会吃掉 `..`，而 `startsWith`
 *  只比字符串前缀，**不带分隔符**。于是项目目录叫 `Umbra_design` 时：
 *
 *  ```
 *  ../Umbra_design_old/x.dc.html  →  /…/Umbra_design_old/x.dc.html   判为「项目内」✗
 *  ../Umbra_design2               →  /…/Umbra_design2                判为「项目内」✗
 *  ../other/x.dc.html             →  /…/other/x.dc.html              判为「项目外」✓
 *  ```
 *
 *  **任何以项目目录名为前缀的兄弟目录都能穿进去。** `create_folder("../Umbra_design2")`
 *  先把那个兄弟目录建出来，之后 `write_draft` / `create_draft` / `move_draft` 就能往里写 ——
 *  而报错文案承诺的是「路径跨出了项目目录」。**承诺了却不成立的边界比没有边界更糟。**
 *
 *  六处写六遍，就意味着修也要修六遍、而且只要有一处没跟上就等于没修。
 *  和插件那边的 `plugin/paths.ts` 是同一条纪律（`00` §101.2）：**一处定义，处处引用**。
 *  那边的两道闸也改成引用这里的 `isInside`，不再各自实现一份。
 */

/** `abs` 是不是真在 `base` 里面。**判据是 `relative` 的结果，不是字符串前缀。**
 *
 *  `p` 可以传 `path.win32` / `path.posix`，让同一份判定在两个平台的规则下都能测 ——
 *  「在 mac 上验 win 的行为」不需要真机（这一招在 issue #25 上用过）。
 *
 *  `base` 自己**算在里面**（`rel === ""`）：项目根是合法的写入位置（比如在根上建目录）。
 *  ⚠️ 和 `plugin/paths.ts` 那个 `isInside` 的差别就在这一点上，那里要的是「它**下面**」。 */
export function isInside(base: string, abs: string, p: PlatformPath = path): boolean {
  const rel = p.relative(base, abs);
  return rel === "" || (!rel.startsWith("..") && !p.isAbsolute(rel));
}

/** 把相对项目根的路径解成绝对路径，并守住「不许跨出项目目录」。
 *  形状不对就抛 —— 调用方各自包装成自己的错误信封（文案不同，但判据是同一份）。 */
export function resolveInside(baseDir: string, rel: string): string {
  const abs = path.resolve(baseDir, rel);
  if (!isInside(baseDir, abs)) throw new Error(`路径跨出了项目目录：${rel}`);
  return abs;
}
