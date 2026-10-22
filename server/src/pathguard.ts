import path, { type PlatformPath } from "node:path";
import { realpathSync } from "node:fs";

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
 *  形状不对就抛 —— 调用方各自包装成自己的错误信封（文案不同，但判据是同一份）。
 *  ⚠️ 这一件走**字面**判定；要连符号链接一起守的用 `resolveInsideReal`（见下）。 */
export function resolveInside(baseDir: string, rel: string): string {
  const abs = path.resolve(baseDir, rel);
  if (!isInside(baseDir, abs)) throw new Error(`路径跨出了项目目录：${rel}`);
  return abs;
}

/* ══════════════════════════════════════════════════════════════════════
   符号链接那一半（issue #140，geek-99 2026-10-22 裁定口径）

   ⚠️⚠️ **上面那道闸只比字面路径，全程不碰文件系统。** 于是 #19 修好的是
   「`..` 和同前缀兄弟目录」那一半，而**链接**从来没有闸：
   项目里放一个 `docs/notes.md -> ~/.umbrastudio/ai_config.json`，
   `relative()` 回的是 `"docs/notes.md"` → 判「项目内」→ 之后 `readFile` /
   `writeFile` / `rm` **都跟随链接**，落到项目外的真实文件上。
   报错文案承诺的「只能读写项目目录里的文件」**在有链接时不成立**。

   能串起来的链路（issue 里列的）：别人给的设计项目里带一个指向
   `~/.umbrastudio/ai_config.json` 的链接，名字看着像普通 md →
   应用内 AI `read_file` 它 → **密钥进模型上下文、进对话记录**；
   或者预览里的稿 `fetch("./docs/notes.md")`（静态服务不要令牌、同源）。

   **裁定的口径**：解析后落在项目外的，**读 / 写 / 删 / 预览一律拒**；
   文件树里**照常列出来**但标「指向项目外」、打不开；指向项目**内部**的链接不受影响。
   > **「列出来但打不开」比「不列出来」好** —— 用户看得见那个文件，
   > 才知道为什么它打不开，而不是以为软件丢了他的东西。
   ══════════════════════════════════════════════════════════════════════ */

/** `abs` 解析完符号链接之后的真实路径。**目标还不存在也要能用**。
 *
 *  ⚠️ 不能直接 `realpathSync(abs)` —— 写一份新文件时目标还不在，那会抛。
 *  做法：从自身往上找**第一个存在的祖先**，`realpath` 它，再把剩下那几段拼回去。
 *  ⚠️ 走到根都 `realpath` 不了（极端情况）就**原样回**，让字面那道闸去判 ——
 *  这里的职责是「解析」，不是「拒绝」。 */
export function realOf(abs: string, p: PlatformPath = path): string {
  let cur = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpathSync(cur);
      /* ⚠️ `[...tail]` 再 `reverse()` —— `tail.reverse()` 是**就地**反转，
         在循环里调用会把数组本身改掉（第一版就这么写的，第二次迭代顺序就错了）。 */
      return tail.length ? p.join(real, ...[...tail].reverse()) : real;
    } catch { /* 这一段不存在，往上一层 */ }
    const up = p.dirname(cur);
    if (up === cur) return abs;
    tail.push(p.basename(cur));
    cur = up;
  }
}

/** 和 `isInside` 同一个问题，但**先把符号链接解开**（issue #140）。
 *
 *  ⚠️ `base` 自己也要 `realpath`：项目目录本身可能在一条链接下
 *  （macOS 的 `/var` → `/private/var` 就是，而临时目录都在那下面）——
 *  不解 base 的话，**一个完全正常的项目**会被判成「全都在项目外」。 */
export function isInsideReal(base: string, abs: string): boolean {
  let realBase: string;
  try { realBase = realpathSync(base); } catch { return false; }
  return isInside(realBase, realOf(abs));
}

/** 这个路径是不是「一条指向项目外的链接」—— 给文件树标记用。
 *  字面在项目里、而解析之后不在 = 就是它。 */
export function isOutsideLink(base: string, abs: string): boolean {
  return isInside(base, abs) && !isInsideReal(base, abs);
}


/* ══════════════════════════════════════════════════════════════════════
   硬编码 `"/"` 那一族（issue #188 / #161 / #160）

   ⚠️ 三处各自写了一遍「按 `/` 切路径」，而 Windows 上原生分隔符是 `\`：
   · `records.ts` 的 `dir.startsWith(root + "/")` → **一条都匹配不上** →
     回归每跑一轮就在状态目录里多留一条记录 + 一个目录，
     而收尾自检「清完必须是 0」**永远绿**（`deadRecordsUnder` 也回 `[]`）；
   · `index.ts` 的 `abs.lastIndexOf("/")` → 回 `-1` → `slice(0, -1)` 变成
     「**文件名去掉最后一个字母**」，于是同目录的稿各算一条；
   · `api.ts` 的 `dir.split("/").pop()` → 回**整条盘符路径**，
     新建项目面板的建议名变成 `C-Users-sam-Projects-Demo`。

   这三条的共同形状：**它们都在 mac 上恰好正确**，所以没有任何读数会异常。
   > **一个只在另一个平台上错的判定，在本机永远量不到** ——
   > 所以修法里最要紧的那一半是「**让它能在 mac 上被测**」：
   > 每个函数都收一个 `PlatformPath`，判据传 `path.win32`（issue #25 用过这招）。
   ══════════════════════════════════════════════════════════════════════ */

/** `dir` 在 `root` 里面（或就是它）—— 平台无关。
 *  ⚠️ 这是 `isInside` 的别名级包装，存在的理由是**调用点的语气**：
 *  那几处问的是「这条记录属于这个根吗」，而不是「这个路径安全吗」。 */
export const isUnderRoot = (root: string, dir: string, p: PlatformPath = path): boolean =>
  isInside(root, dir, p);

/** 这个绝对路径所在目录相对项目根的那一段（`.` = 项目根自己）。平台无关。 */
export function dirKeyOf(abs: string, projectDir: string, p: PlatformPath = path): string {
  const rel = p.relative(projectDir, p.dirname(abs));
  return rel === "" ? "." : rel;
}

/** 从一个目录路径算「建议的项目名」。平台无关。
 *  ⚠️ **HTTP 版和 MCP 版原来是两份实现**（前者 `split("/")`、后者 `basename`）——
 *  同一件事两份实现，没有任何机制保证它们一致，而**实测它们在 Windows 上就不一致**。 */
export function suggestedNameOf(dir: string, p: PlatformPath = path): string {
  return (p.basename(dir) || "project").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
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
