/** 文件类型的**唯一出处**（M8-14）。前端和后端都从这里认类型。
 *
 *  为什么要有这一份：在这之前，「一种文件格式」的知识散在六处 ——
 *  前端 `layout.ts` 的 `kindOf`、后端 `files.ts` 的 `kindOf`、`panelsFor`、
 *  `Workbench` 的三元链、`DirView` / `FileTree` 各自的图标表、`FileKind` 联合类型。
 *  加一种新格式要改六个地方，而且**前后端那两份扩展名映射没有任何机制保证一致** ——
 *  它们今天碰巧一致，纯属运气。
 *
 *  这份只管**最底层的那件事：一个路径是什么类型**。
 *  「这种类型用哪个视图、有哪些面板、工具栏长什么样」是前端的事，在 `app/src/kinds/` 里。
 *  分开是因为后端不需要知道 React 组件，前端也不该为了拿个扩展名去 import 服务端模块。
 *
 *  ⚠️ 这个文件被 `app/` 与 `server/` 两个 TS 工程同时引用，所以：
 *  **只用纯 TypeScript，不 import 任何东西，不用 Node 也不用 DOM 的 API。**
 */

/** 文件类型 id。**是 `string` 不是联合类型**（M11-2，Q37）。
 *
 *  以前这里是 `"dir" | "dc" | "md" | …` 的联合类型，编译期就定死了。
 *  插件要能加格式（比如买了视频插件就多一种 `video`），而**插件是装完才存在的** ——
 *  编译期不可能知道它叫什么。所以类型必须放开成字符串，种类表改成运行期注册。
 *
 *  放开的代价是丢了拼写检查（`kindOf(x) === "imgae"` 不再报错）。
 *  补偿是 `BUILTIN` 常量 + `kindtest` 那张对照表：内置的那几种用常量引用，
 *  拼错了编译期照样报；插件加的那些本来也不可能编译期检查。 */
export type FileKind = string;

/** 内置类型的 id。**引用内置类型一律用它，不要写字面量** ——
 *  写字面量的话 `FileKind` 放开成 string 之后拼错不会报错了。 */
export const BUILTIN = {
  dir: "dir", dc: "dc", md: "md", image: "image",
  json: "json", code: "code", html: "html", other: "other",
  /* **矢量图**（2026-10-23，`doc/11` Q84 定甲）。
     ⚠️ **为什么从 `image` 里拆出来**：`.svg` 和 `.png` 除了「都是图」之外几乎处处不同 ——
     它是文本、能用代码编辑器改源码、裁剪它要栅格化（**有损**）。
     而这件事**宿主自己的代码早就自白过两次**：
     ① `image` 那一条原来写着 `textual: (n) => n.endsWith(".svg")` —— 一个**只为一种扩展名存在的例外函数**；
     ② `files.ts` 的 `isTextual` 注释写着「`.svg` 是图片但也是文本，**只看 kind 会误判**」。
     > **一个只为某一个成员存在的例外，就是「这其实是两类东西」的自白。**
     直接起因是 Q84：图片编辑插件要认领 `image`，而**认领内置类型时清单里的 `ext` 不生效**，
     所以不拆的话它会连 `.svg` 一起接管，然后把一张矢量图裁成栅格图。
     ⚠️ **它照旧由宿主的看图模块显示**（sam 的边界是「图片能显示就显示」，而 svg 能显示）——
     拆的是类型，不是「以后 svg 只能看源码」。 */
  svg: "svg",
  /* 2026-10-21（M14-11 / Q76）。⚠️ **加的是「类型」不是「编辑器」** ——
     Studio 只管**通用查看**（浏览器原生 `<video>` / `<audio>` 能播就播），
     逐帧 / 波形 / 频谱这些**专业查看与编辑归插件**（用户 2026-10-21 定的边界）。

     ⚠️ **id 刻意不叫 `video` / `audio`**（2026-10-21 当天改过一次，`umbra-plugins`
     会话核出来的）。那两个名字**太通用了，属于插件**：
     ① 内置类型**只有 bundled 插件能认领**（`store.ts` 的 `if (p.bundled)`、
        `loader.ts` 的 `isBuiltinKind` 分支）—— 占住 `video` 等于**永久关上**
        第三方媒体插件那扇门；
     ② 一个认领 `video` 的第三方插件会**静默坏掉**：服务端一种 kind 都登记不上，
        前端注册 UI 模块时撞上我们的 `media.tsx` 当场抛，而 `loader` 把它
        catch 成「这个插件没能接上」—— **插件装着却不起作用，服务端看一切正常**；
     ③ 内置 priority 80 > 插件默认 50，就算 id 不撞也会把 `.mp4` 抢走。

     > 原来的方案是「等插件来了再把 `media.tsx` 让出去」（像当年的 `code` / `html`）。
     > 那是**一个需要未来的人记得做的事**，而换个 id 不需要任何人记得。
     > **一个需要人记得的方案和一个不需要记得的方案，选后者。**

     于是：id 带 `media-` 前缀 + **priority 压到 5**（比插件默认的 50 低一个量级）。
     装了媒体插件 → 它的 `video`(50) 自然赢；没装 → 落到这里用原生播放器。
     两边都不用改机制，也不用放宽「只有 bundled 能认领内置」那条特权。 */
  /* ⚠️⚠️ **键和值都要改，而这一点是端到端判据当场抓到的**（2026-10-21）：
     `isBuiltinKind` 查的是**这个对象的键**（`!!(BUILTIN as Record<string,string>)[id]`），
     不是值。第一版只把值改成了 `"media-video"` 而键还留着 `video` ——
     于是 `isBuiltinKind("video")` **照旧为真**，插件认领 `video` 照旧被拒，
     `umbra-plugins` 报的那个问题**一点都没解决**。
     而那时**前面 8 条判据全绿**，包括我专门写的「`video` 这个 id 没被内置占掉」——
     它测的是 `BUILTIN.video` 的**值**，而生效的是**键**。
     > **判据测的那个东西，和产品实际用的那个东西，要是同一个。**
     > 救命的是那条「真注册一个插件 kind 看谁赢」的端到端判据：
     > **一条端到端的判据顶十条关于数字和字符串的判据。** */
  mediaVideo: "media-video", mediaAudio: "media-audio",
} as const;

/** 一种类型的底层定义：怎么认出它、叫什么、用什么图标 */
export interface KindDef {
  id: FileKind;
  /** 界面上的中文名（目录视图的「类型」列、状态行都用它） */
  label: string;
  /** **允不允许插件「认领」它**（画它的界面），默认允许（M10-2，2026-09-28）。
   *
   *  ⚠️ 原来这道闸是「内置类型一律不许第三方认领」，实测下来**它挡住了正当用法、
   *  挡不住恶意用法**：第三方插件只要定义一个新类型匹配 `.ts`、priority 拉到
   *  `PLUGIN_MAX_PRIORITY`，照样抢走 —— 实测 `a.ts` 从 `code` 变成了那个新类型。
   *  真正护住 `.dc.html` 的是 **priority 封顶**（95 < dc 的 100），不是那道闸。
   *
   *  所以改成**类型自己声明**：只有 `dc` 关上（它是产品的核心格式，
   *  被接管等于整个产品坏掉 —— 虽然 priority 已经护住，这是第二道）。
   *  其余内置类型（`code` / `md` / `json` / `html`）放开，因为**这是用户要的**：
   *  他要「发布新格式编辑插件时不更新 PC 端」，而认领不开放的话
   *  那些插件只能做成内置插件、跟 `.app` 一起发（`00` §一一七）。 */
  claimable?: boolean;
  /** 单字符图标，树和列表共用一套 */
  icon: string;
  /** 按小写文件名判断 */
  match: (lowerName: string) => boolean;
  /** **匹配优先级，大的先匹配**（M11-2）。
   *
   *  以前顺序靠数组位置，那在插件面前会塌 —— **运行时注册的插件插在数组哪儿是没有定义的**。
   *  比如装了个「网页编辑插件」，如果它排到了 `dc` 前面，`.dc.html` 会被当成普通网页打开，
   *  整个设计稿能力凭空消失。所以顺序必须显式。
   *
   *  内置取值见 `KINDS`。插件不给就是 `PLUGIN_DEFAULT_PRIORITY`，
   *  而且**封顶 `PLUGIN_MAX_PRIORITY`，抢不走 `.dc.html`**（见 `registerKind`）。 */
  priority: number;
  /** 这种类型的文件**是不是文本**（能读正文、能给 AI 读、能做摘录）。
   *
   *  给函数是因为同一种 kind 里可能只有部分是文本：`.svg` 的 kind 是 `image`
   *  （它该用图片视图看，能无损缩放），但它本身是文本，读得出正文也能让 AI 改。
   *  不写 = 不是文本。 */
  textual?: boolean | ((lowerName: string) => boolean);
  /** 哪个插件加的。内置的不写。卸载插件时按它把种类摘掉 */
  from?: string;
}

/** 后缀集合，拿出来是为了让「支持哪些扩展名」一眼看全、也方便别处复用 */
/** **栅格图**（2026-10-23 Q84：`.svg` 搬去 `SVG_EXT` 了）。这几种都是像素，裁剪无损。 */
export const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".ico"];
/** **矢量图**。单独一条是因为它同时是文本（见 `BUILTIN.svg` 那段注释）。 */
export const SVG_EXT = [".svg"];
/** 「这个 kind 是一张图」—— 看图模块认领它们，而**按文件头读尺寸那条路也要认它们**。
 *
 *  ⚠️ **一处定义，别在调用点写 kind 字面量。** 原来 `files.ts` 有**两处**
 *  `if (kind === "image")` 才去读尺寸（`imageSize`）—— 而 Q84 把 `svg` 拆出来之后，
 *  那两处会**静默**不再为 svg 读尺寸：不报错，只是图片视图里的「宽 × 高」变成「? × ?」，
 *  而 `imageSize` 里专门为 svg 写的那段（解析 width/height/viewBox）变成死代码。
 *  > **一个按 kind 字面量分支的判断，在 kind 被拆开时静默失效。** */
export const IMAGE_LIKE_KINDS: readonly string[] = ["image", "svg"];
/** 浏览器原生 `<video>` 放得动的那些（M14-11）。**只列能播的** ——
 *  列一个播不了的（`.mkv` / `.avi`）等于把「打不开」包装成「打开了但黑屏」，
 *  而后者更难判断是文件坏了还是我们不支持。拿不准的留给 `other` 的纯文本兜底去说实话。 */
export const VIDEO_EXT = [".mp4", ".m4v", ".webm", ".ogv", ".mov"];
/** 浏览器原生 `<audio>` 放得动的那些（M14-11）。同上，只列能播的。 */
export const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".flac", ".opus"];
export const CODE_EXT = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".less",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".xml",
  ".py", ".rb", ".rs", ".go", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".cs", ".php",
  ".sh", ".bash", ".zsh", ".sql", ".graphql", ".vue", ".svelte",
  ".txt",   // 纯文本按代码看：它能预览、能给 AI 读，归到 other 反而少了这两样
  /* ⚠️ `.lock` 2026-09-29 补的。设计侧第十二轮给的自动只读名单里第一条就是 `*.lock`，
     而实测 `kindOf("Cargo.lock")` 是 **`other`** —— 它根本到不了代码插件，
     **那条只读规则是死的**。`Cargo.lock` / `yarn.lock` / `Gemfile.lock` 都是纯文本配置，
     归 `code` 才能被看、被只读、被带给 AI。
     **一条规则写在纸上，不等于它能跑到。** */
  ".lock",
];

const endsWithAny = (name: string, exts: string[]) => exts.some((e) => name.endsWith(e));

/** 插件没声明优先级时给它的值。落在 `html`(60) 和 `code`(10) 之间 ——
 *  插件能接管代码和未知类型，但接管不了我们有专门视图的那几种，除非它明说。 */
export const PLUGIN_DEFAULT_PRIORITY = 50;
/** 插件优先级的上限。**`dc`(100) 在它之上，插件永远抢不走 `.dc.html`** ——
 *  那是产品的核心格式，被插件劫持等于整个产品坏掉。 */
export const PLUGIN_MAX_PRIORITY = 95;

/** 内置类型。**优先级显式写出来**，不再靠数组位置：
 *  - `dc` 100 > `html` 60：否则设计稿被当成普通网页
 *  - `image` 80 > `code` 10：`.svg` 归图片（能无损缩放，看图更有用）
 *  - `json` 70 > `code` 10：`CODE_EXT` 里也有 `.json`，但 JSON 有结构化的看法
 */
const BUILTIN_KINDS: readonly KindDef[] = [
  /* ⚠️⚠️ **`dc` 这一条 2026-10-23 删了**（M16-7 / Q82 = C3，sam 定的产品边界）。
     `.dc.html` 现在**落到 `html`** —— 实测确认过：`html` 的 match 是 `endsWith(".html")`，
     而 `.dc.html` 的最后一段正是 `.html`；`code` / `image` 都不认它。
     所以这件事**不需要额外代码**，删掉条目就落对了。
     ⚠️ 顺带修掉 M14-5 那条「`.dc.html` = Owner 多半不成立」的尾巴：
     LaunchServices 也是按**最后一段扩展名**匹配，**现在我们和系统口径一致了**。
     ⚠️ `claimable: false` 这个字段**留着**（`isClaimable` 还在用，默认允许）——
     它是「某种 kind 不许被插件接管」这个机制，而不是「dc 专用」。 */
  { id: BUILTIN.md, label: "Markdown", icon: "≡", priority: 90, textual: true, match: (n) => n.endsWith(".md") || n.endsWith(".markdown") },
  /* ⚠️ **`textual` 那个例外函数 2026-10-23 删了**（Q84）：原来写的是
     `textual: (n) => n.endsWith(".svg")` —— 而 `.svg` 现在是自己一种 kind，
     于是这里回到它本来的样子：**栅格图不是文本**。
     > 删掉一个例外，比记住一个例外可靠。 */
  { id: BUILTIN.image, label: "图片", icon: "▣", priority: 80, match: (n) => endsWithAny(n, IMAGE_EXT) },
  /* 矢量图：和栅格图**同档优先级**（它们扩展名不重叠，所以同档不会打架），
     而 `textual: true` 让它**既能看图也能看源码** —— 纯文本兜底和代码插件都够得着它。 */
  { id: BUILTIN.svg, label: "矢量图", icon: "◇", priority: 80, textual: true, match: (n) => endsWithAny(n, SVG_EXT) },
  /* ⚠️ **priority 5 是这一条的要害，不是随手填的**：它必须**低于 `PLUGIN_DEFAULT_PRIORITY`(50)**，
     这样装了媒体插件之后插件自然赢，而这是「兜底」两个字的全部含义 ——
     兜底的意思是**没有别人的时候才轮到我**。
     写 80（和图片同档）的话，装了插件也抢不过我们，用户买的插件等于白买。
     `kindtest` 有一条判据钉着这个不等式，**钉的是关系不是数字**。
     ⚠️ **不写 `textual`** = 不是文本：`read_file` 不会把一个 MP4 塞进模型的上下文。 */
  { id: BUILTIN.mediaVideo, label: "视频", icon: "▷", priority: 5, match: (n) => endsWithAny(n, VIDEO_EXT) },
  { id: BUILTIN.mediaAudio, label: "音频", icon: "♪", priority: 5, match: (n) => endsWithAny(n, AUDIO_EXT) },
  { id: BUILTIN.json, label: "JSON", icon: "{}", priority: 70, textual: true, match: (n) => n.endsWith(".json") || n.endsWith(".jsonc") },
  { id: BUILTIN.html, label: "网页", icon: "◻", priority: 60, textual: true, match: (n) => n.endsWith(".html") || n.endsWith(".htm") },
  { id: BUILTIN.code, label: "代码", icon: "⟨⟩", priority: 10, textual: true, match: (n) => endsWithAny(n, CODE_EXT) },
];

/** 活的种类表。内置的先进来，插件装上之后往里加。**按 priority 降序维护** */
const REG: KindDef[] = [...BUILTIN_KINDS];

/** 当前全部可匹配的种类（不含 dir / other 这两个不靠名字认的） */
export const KINDS = (): readonly KindDef[] => REG;

/** 注册一种类型。插件装上时调；内置的已经在表里了。
 *
 *  ⚠️ 三道闸，每一道都对应一种「装个插件把产品搞坏」的具体方式：
 *  ① 重名 —— 后注册的静默覆盖，症状是「某种文件莫名其妙换了视图」，很难想到是撞了
 *  ② 优先级封顶 —— 见 `PLUGIN_MAX_PRIORITY`
 *  ③ 不许动内置 —— 插件不能重定义 `dc` / `dir` / `other` 这些
 */
/** 这个 id 是不是**内置类型**。
 *
 *  ⚠️ 「定义一种新类型」和「**认领**一种已有类型」是两件事（M11-9b 分清的）：
 *  `md` 这种类型应该**一直是内置的** —— 就算 Markdown 插件没装，
 *  应用也该知道 `.md` 是 Markdown（显示图标、判断是文本、目录里归类）。
 *  搬去插件的只是**模块**（怎么看、怎么改），不是**类型**。 */
export const isBuiltinKind = (id: FileKind): boolean => !!(BUILTIN as Record<string, string>)[id];

export function registerKind(def: KindDef & { from: string }): void {
  /* ⚠️ **内置这道闸要排在重名前面**（kindtest 抓到的）：
     内置的 `dc` 本来就在表里，重名那道闸会先拦下，插件收到的提示是「已经有了」——
     听起来像是别的插件占了位置，而真相是「这个你永远不许动」。
     而 `dir` / `other` 压根不在 REG 里，**只有内置这道闸拦得住**。 */
  if ((BUILTIN as Record<string, string>)[def.id]) throw new Error(`${def.id} 是内置类型，插件不能重定义`);
  if (REG.some((k) => k.id === def.id)) throw new Error(`文件类型 ${def.id} 已经有了 —— 一种类型只能注册一次`);
  const priority = Math.min(def.priority ?? PLUGIN_DEFAULT_PRIORITY, PLUGIN_MAX_PRIORITY);
  REG.push({ ...def, priority });
  REG.sort((a, b) => b.priority - a.priority);
}

/** 卸载插件时把它加的类型摘掉。返回摘掉了几种 */
export function unregisterKindsFrom(pluginId: string): number {
  const before = REG.length;
  for (let i = REG.length - 1; i >= 0; i--) if (REG[i]!.from === pluginId) REG.splice(i, 1);
  return before - REG.length;
}

/** 这个类型允不允许被插件认领（画它的界面）。**默认允许** ——
 *  显式关上的只有 `dc`。找不到的类型（插件自己定义的）当然允许。 */
export function isClaimable(id: FileKind): boolean {
  const d = REG.find((k) => k.id === id);
  return d ? d.claimable !== false : true;
}

export const DIR_DEF: KindDef = { id: BUILTIN.dir, label: "目录", icon: "▤", priority: -1, match: () => false };
export const OTHER_DEF: KindDef = { id: BUILTIN.other, label: "其他", icon: "▢", priority: -2, match: () => true };

/** 一个路径是什么类型。传 `isDir` 是因为目录光看名字认不出来。 */
export function kindOf(path: string | null | undefined, isDir = false): FileKind {
  if (isDir) return "dir";
  if (!path) return "dir";
  const name = path.toLowerCase().split("/").pop() ?? "";
  /* REG 始终按 priority 降序，所以第一个匹配上的就是优先级最高的那个 */
  return REG.find((k) => k.match(name))?.id ?? BUILTIN.other;
}

export function kindDef(id: FileKind): KindDef {
  if (id === BUILTIN.dir) return DIR_DEF;
  return REG.find((k) => k.id === id) ?? OTHER_DEF;
}

/** 全部种类。**是函数不是常量了**（M11-2）——
 *  以前是个模块加载时算好的数组，插件装上之后它不会变，
 *  前端那条「每种 kind 都有模块认领」的自检就会漏掉插件加的种类。 */
export const allKinds = (): readonly FileKind[] => [...REG.map((k) => k.id), BUILTIN.dir, BUILTIN.other];

export const KIND_LABEL = (id: FileKind): string => kindDef(id).label;
export const KIND_ICON = (id: FileKind): string => kindDef(id).icon;

/** 是不是**文本**：决定能不能读正文、能不能做摘录。
 *
 *  M11-2 改成**问种类表**，不再在这里硬写一串扩展名 —— 插件加的格式是不是文本，
 *  只有插件自己知道。原来那串硬编码和 `KINDS` 是同一件知识的两份拷贝，
 *  加一种文本格式要改两处，而且**没有任何机制保证两处一致**（M8-14 修掉的正是这个病，这里漏了一处）。
 *
 *  `textual` 给函数是因为同一种 kind 里可能只有部分是文本 —— `.svg` 是 image 里唯一的那个。 */
export function isTextualPath(path: string): boolean {
  const name = path.toLowerCase().split("/").pop() ?? "";
  const def = REG.find((k) => k.match(name));
  if (!def) return false;
  return typeof def.textual === "function" ? def.textual(name) : !!def.textual;
}
