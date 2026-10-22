/** 把源码里的注释剥掉，只留会执行的那部分 —— **判据搜源码时用它**。
 *
 *  ### 为什么要有这一份
 *  ⚠️ 「判据分不清『代码』和『解释它的注释』」在本项目**犯过 5 次**
 *  （`doc/00` §107 那一族，最近一次是 2026-10-22 的 issue #134：
 *  判据搜 `stream: false`，而命中的是我写在旁边解释「为什么要改」的那段话 ——
 *  **判据红了而产品是对的**）。
 *
 *  每次的修法都是「在那一处内联一个剥注释的正则」，于是到 2026-10-22 这天，
 *  同一件事有**三份实现**：`captest` 顶层一个 `codeOf`、`apitest` 内联一个、
 *  `multiprojtest` 内联两个。
 *  > **一条教训被修了五次而每次只修一处，它就不是教训，是一个每次都要重新想起来的习惯。**
 *  （geek-99 2026-10-22 定：收成一个共用模块。）
 *
 *  ### 它不是一个 JS 解析器，而这一点要说清
 *  ⚠️ 它**按文本剥**，所以字符串里长得像注释的东西也会被剥掉
 *  （`const s = "http://x"` 里的 `//x` 会没）。
 *  对「判据搜源码」这个用途这是**可接受的**：我们找的是
 *  `stream: true` / `canEncode(` / `data-ud="…"` 这类标识符和字面，
 *  而它们不会长得像注释。
 *  **但别拿它去做需要语义正确的事** —— 要那个就该用真的解析器。
 *  > **一个近似的工具，必须把自己的近似写在脸上** ——
 *  > 不然下一个人会拿它去做它做不到的事（本项目栽过：`hardenXcu` 的「幂等」
 *  > 第一版用「每个名字只出现一次」来近似，而清单里有两个同名项）。
 *
 *  ⚠️ 本文件**不 import 任何东西**（`server/src/shared/` 的纪律），
 *  所以 `.mjs` 的判据可以直接 import 编译产物 `server/dist/shared/stripcomments.js`。
 */

/** 剥掉块注释与行注释。**行号保持不变**（块注释占的行留空），
 *  这样判据报出来的行号还能对得上源码 —— 报一个对不上的行号比不报更费时间。 */
export function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (let ln of src.split("\n")) {
    if (inBlock) {
      const e = ln.indexOf("*/");
      if (e < 0) { out.push(""); continue; }
      ln = ln.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const b = ln.indexOf("/*");
      if (b < 0) break;
      const e = ln.indexOf("*/", b + 2);
      if (e < 0) { ln = ln.slice(0, b); inBlock = true; break; }
      ln = ln.slice(0, b) + ln.slice(e + 2);
    }
    /* ⚠️ **行注释的 `//` 前面不许是 `:`** —— 否则 `"http://x"` 会被剥成 `"http:`。
       这一条是从 `plugintest` 那份变体里**吸收**过来的：收口的时候发现六份实现里
       有的避了 `://`、有的没避。
       > **收成一份的时候，共用的那一份应该是所有变体里最安全的那一个** ——
       > 挑最简单的那一份当标准，等于把别人想到过的坑又丢了一次。 */
    out.push(ln.replace(/(^|[^:])\/\/.*$/, "$1"));
  }
  return out.join("\n");
}
