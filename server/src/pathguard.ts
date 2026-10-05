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
  if (rel === "") return true;
  if (p.isAbsolute(rel)) return false;
  /* ⚠️ **按段比，不是 `startsWith("..")`**（2026-10-05 反向验证顺带挖出来的）。
     `startsWith` 那种写法会把**项目内的合法文件**判成跨出去的：
     `relative()` 对一份叫 `...dc.html` 的稿回的就是 `"...dc.html"`，
     它也以 `..` 开头 —— 实测 `duplicate_draft({ newName: ".." })` 走到写入口时
     报的是「路径跨出了项目目录」，而那个文件其实在项目里。
     方向是**过度拦截**（不是漏放），所以不是安全洞，但 `isInside` 是 #19 收口后
     全项目唯一那道闸，于是「任何以两个点开头的文件名都打不开，而报错说的是假话」。
     **一道闸拦错了东西，和它漏放东西一样是缺陷 —— 只是症状跑到了别的地方。** */
  return rel.split(p.sep)[0] !== "..";
}

/** 把相对项目根的路径解成绝对路径，并守住「不许跨出项目目录」。
 *  形状不对就抛 —— 调用方各自包装成自己的错误信封（文案不同，但判据是同一份）。 */
export function resolveInside(baseDir: string, rel: string): string {
  const abs = path.resolve(baseDir, rel);
  if (!isInside(baseDir, abs)) throw new Error(`路径跨出了项目目录：${rel}`);
  return abs;
}

/** 「这是一个普通名字，不是一段路径」—— **全项目唯一一份判定**（issue #70，2026-10-05）。
 *
 *  ### 为什么要抽出来
 *  这条判定我在**三个地方**各写过一遍，而且每次都是因为踩了同一类 bug：
 *
 *  | 哪里 | issue | 当时的后果 |
 *  | --- | --- | --- |
 *  | `plugin/paths.ts` | #23（p0） | `uninstall("../..")` 把 `STATE_ROOT` 整个 `rm -rf` |
 *  | `chat.ts` 的 `CHAT_ID_RE` | #57（p0） | 读到 `ai_config.json`，**apiKey 明文进回包** |
 *  | `templates.ts` 的 `templateFile` | #63（p1） | 永久删掉项目外任意 `.dc.html` |
 *
 *  **第四次（#70 的 `newName`）就该停下来抽一份。** 各写一遍的代价不是重复，
 *  是**每一份都要独立地想全**，而「想全」这件事我已经失败过三次。
 *
 *  ### 判什么
 *  一个「名字」不该含路径分隔符、不该是 `.` / `..`、不该含文件系统的保留字符。
 *  ⚠️ 两种分隔符**都要拦**：代码在 mac 上跑也可能处理从 Windows 拿来的输入，
 *  而 `path.join` 在 mac 上不认 `\` —— 那意味着 `..\..\x` 在 mac 上不是逃逸，
 *  在 Windows 上是。**拦掉两种，判定就和平台无关。**
 *  ⚠️ 控制字符也拦：`a\0b` 在某些系统调用里会被截断成 `a`。
 *
 *  回 `null` = 合法；否则回一句**说得出哪里不对**的话（调用方包进自己的错误信封）。
 *  ⚠️ **不自己抛** —— 各处的错误码和 `fix` 文案不同（「模板名」/「会话 ID」/「副本名」），
 *  而那句话是给人看的，不该统一成一句含糊的「名字不合法」。
 */
export function plainNameProblem(name: unknown): string | null {
  const s = String(name ?? "");
  if (!s) return "名字是空的";
  if (s === "." || s === "..") return `名字不能是 ${JSON.stringify(s)}`;
  if (/[/\\]/.test(s)) return "名字里不能有路径分隔符（`/` 或 `\\`）";
  // eslint-disable-next-line no-control-regex
  if (/[:*?"<>|\x00-\x1f]/.test(s)) return "名字里不能有 `: * ? \" < > |` 或控制字符";
  /* ⚠️ 单独拦一句「不许以点开头」—— `.git` / `.umbrastudio` 这种名字
     会和我们自己的状态目录撞，而撞上的后果是「用户建的东西和工具的状态混在一起」。
     这一条比上面几条弱（不是安全问题），但它防的是一类很难查的混乱。 */
  if (s.startsWith(".")) return "名字不要以点开头（那是给工具自己的目录留的）";
  return null;
}
