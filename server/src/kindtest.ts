/** 文件类型表的回归（M11-2，Q37）。
 *
 *  这一批把 `FileKind` 从编译期联合类型改成**运行期字符串表**，动的是
 *  「一个路径算什么类型」这种最底层的判断 —— 它错了，上面所有东西都错，
 *  而且症状是「这个文件打开的样子不对」，很难追回到这里。所以逐条钉死。
 *
 *  ⚠️ 这份**不是** `kindOf` 的单元测试，是**防回归**的对照表：
 *  每一行都对应一条曾经想清楚过的判断（为什么 `.svg` 归图片、为什么 `.json` 不归代码）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILTIN, PLUGIN_MAX_PRIORITY, isTextualPath, isClaimable, kindDef, kindOf, allKinds, registerKind, unregisterKindsFrom,
} from "./shared/kinds.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

console.log("类型表（M11-2）");

/* ── ① 优先级：以前靠数组位置，现在靠 priority。这四条是「为什么要有顺序」的原因本身 ── */
const cases: Array<[string, string, boolean, string]> = [
  // 路径,                      该是什么,        是不是文本, 为什么钉它
  /* ⚠️ **2026-10-23（M16-7 / Q82 = C3）改判**：原来这一行是 `→ dc`，描述是
     「设计稿要压过网页，否则整个设计稿能力凭空消失」。
     而 sam 定了 C3 —— 设计稿那一整套删掉，`.dc.html` **就是一份 HTML**。
     实测确认过它干净地落到 `html`（`html` 的 match 是 `endsWith(".html")`，
     而 `code` / `image` 都不认它），所以这件事不需要额外代码。 */
  ["ui/S2-单稿预览壳.dc.html",  BUILTIN.html,   true,  "`.dc.html` 就是一份 HTML（C3 之后它不再是「设计稿」这种类型）"],
  ["a/b/index.html",            BUILTIN.html,   true,  "普通网页还是网页"],
  /* ⚠️ **2026-10-23（Q84）从 `image` 改成自己一种 kind。**
     这一行原来的描述是「svg 归图片，但它是文本 —— **唯一的跨界情形**」，
     而「唯一的跨界情形」正是拆开它的全部理由：
     一个只有一个成员的例外，不是例外，是**一类还没被命名的东西**。
     拆完它照旧由看图模块显示（`image/index.tsx` 的 `ids` 含 `svg`），
     而 `textual: true` 让它同时够得着源码 —— **两边都不丢**。 */
  ["logo.svg",                  BUILTIN.svg,    true,  "svg 自己一种 kind：既是图（看图模块显示它）又是文本（能看源码）"],
  ["tokens.json",               BUILTIN.json,   true,  "json 要压过代码：它有结构化的看法"],
  ["main.ts",                   BUILTIN.code,   true,  "代码"],
  ["readme.md",                 BUILTIN.md,     true,  "Markdown"],
  ["notes.txt",                 BUILTIN.code,   true,  "纯文本按代码看 —— 归 other 就没了预览和给 AI 读这两样"],
  /* ⚠️ 样本 2026-10-21 从 `clip.mp4` 换成 `scene.glb`（M14-11）：`.mp4` 那天**变成内置 video 了**，
     而这一行要的是「**没人认领**的那一档」—— 样本本身被认领之后，这条判据测的就不是它声称的事了。
     **一个「没人要的扩展名」会在某天被人要走。** */
  ["scene.glb",                 BUILTIN.other,  false, "没人认领的落到 other，且不是文本"],
  ["photo.PNG",                 BUILTIN.image,  false, "大写扩展名也认；图片默认不是文本"],
];
for (const [path, want, textual, why] of cases) {
  ok(kindOf(path) === want, `${path} → ${want}`, why);
  ok(isTextualPath(path) === textual, `${path} 是不是文本 = ${textual}`);
}
ok(kindOf("whatever", true) === BUILTIN.dir, "目录靠 isDir 认，不靠名字");

/* ── ② 插件注册：三道闸，每一道对应一种「装个插件把产品搞坏」的具体方式 ── */
/* ⚠️ **示例类型 2026-10-21 从 `video` 改名成 `model3d`**（M14-11）：
   `video` 那天变成了**内置类型**，而内置类型不许插件重定义 —— 这一节当场抛
   `video 是内置类型，插件不能重定义`。
   > **一个「只是举例用的名字」会在某天变成真名字。**
   换成 `model3d`（`.glb`）：它今天不是内置类型，而且正是「插件该加的那种类型」。 */
registerKind({ id: "model3d", label: "三维模型", icon: "⬡", priority: 50, match: (n) => n.endsWith(".glb"), from: "com.umbra.model3d" });
ok(kindOf("scene.glb") === "model3d", "插件加的类型立刻生效（运行期注册）");
ok(isTextualPath("scene.glb") === false, "插件没声明 textual = 不是文本");
ok(kindDef("model3d").label === "三维模型", "插件类型的标签/图标也进表了");
ok(allKinds().includes("model3d"), "allKinds() 是函数，能看到插件加的种类（以前是常量，看不到）");

let threw = "";
try { registerKind({ id: "model3d", label: "又一个", icon: "?", priority: 50, match: () => false, from: "other" }); }
catch (e) { threw = (e as Error).message; }
ok(threw.includes("已经有了"), "闸①：重名当场抛 —— 静默覆盖的症状是「某种文件莫名换了视图」，很难追");

/* 闸② 对三种内置都要成立。⚠️ `dir` / `other` **不在 REG 里**（它们不靠名字认），
   所以重名那道闸拦不住它们 —— 只有内置这道闸拦得住。判据要把这三种都试到。 */
for (const id of [BUILTIN.dc, BUILTIN.dir, BUILTIN.other]) {
  threw = "";
  try { registerKind({ id, label: "劫持", icon: "!", priority: 100, match: () => true, from: "evil" }); }
  catch (e) { threw = (e as Error).message; }
  ok(threw.includes("内置类型"), `闸②：插件不能重定义内置类型 ${id}`, threw ? "" : "**没抛**");
}

/* 闸③ 是最要紧的一条：插件声明 999 也压不过 .dc.html */
registerKind({ id: "greedy", label: "贪心", icon: "!", priority: 999, match: (n) => n.endsWith(".dc.html"), from: "evil" });
ok(kindDef("greedy").priority <= PLUGIN_MAX_PRIORITY, "闸③：插件优先级被封顶", `声明 999 → 实际 ${kindDef("greedy").priority}`);
/* ⚠️⚠️ 原来这里是「**插件抢不走 .dc.html**」（`dc` 的 100 > 封顶的 95）——
   **C3 之后那句话不但没有对象，而且反过来了**：`.dc.html` 落到 `html`(60)，
   而插件封顶 95 > 60，所以**插件抢得走** —— 而那正是 C3 给的出路
   （「没装插件时看源码，装了 html 插件就能预览」）。
   ⚠️ 第一版我在这里断言「它落到 `html`」，而 `greedy` 这个 priority 95 的样本
   **还注册着** —— 于是读数是 `greedy`，判据红。**那是判据放错了位置，不是产品错**。
   所以这里钉的是新事实本身：**一个 priority 更高的插件现在抢得走它了。** */
ok(kindOf("x.dc.html") === "greedy", "**而 `.dc.html` 现在抢得走** —— C3 之后它是普通 HTML，html 插件就该能认领它（原来 `dc` 的 100 挡着）", kindOf("x.dc.html"));

/* ── ③ 卸载：摘干净，不留半截 ── */
ok(unregisterKindsFrom("evil") === 1, "卸载按插件 id 摘");
/* 卸掉那个插件之后退回 `html` —— **这才是「没装插件时 `.dc.html` 怎么打开」那条承诺** */
ok(kindOf("x.dc.html") === BUILTIN.html, "**摘完退回 `html`**（没装插件时 `.dc.html` 按 HTML 走，不是打不开）", kindOf("x.dc.html"));
ok(unregisterKindsFrom("com.umbra.model3d") === 1, "把三维模型也摘掉");
ok(kindOf("scene.glb") === BUILTIN.other, "插件卸载后退回 other（文件卡），不是打不开");
ok(!allKinds().includes("model3d"), "卸载后种类表里也没了");

/* ── ③.4 只读名单里的每一种，都真的走得到代码插件（M10-2 / 设计侧第十二轮 §一.4）──
   ⚠️ 设计侧给的自动只读名单第一条就是 `*.lock`，而当时 `kindOf("Cargo.lock")` 是
   **`other`**（走通用文件卡）——**那条规则根本到不了代码插件，是死的**。
   **一条规则写在纸上，不等于它能跑到。**
   这几条钉的就是「名单和类型表对得上」。 */
{
  for (const f of ["Cargo.lock", "yarn.lock", "Gemfile.lock", "pnpm-lock.yaml", "a.min.js", "a.min.css"]) {
    ok(kindOf(f) === BUILTIN.code, `只读名单里的 ${f} 走得到代码插件`, kindOf(f));
  }
  /* `package-lock.json` 是**例外，而且是对的**：`json` 有结构化的看法（`json` 70 > `code` 10），
     只读那套由 JSON 那个模块自己管。写在这里是为了**说明它不是漏的**。 */
  ok(kindOf("package-lock.json") === BUILTIN.json, "`package-lock.json` 归 JSON（有结构化的看法，不是漏的）");
}

/* ── ③.5 认领：哪些类型允许被插件接管（M10-2，2026-09-28 改过这道闸）──
   原来是「内置类型一律不许第三方认领」。**实测下来它挡错了东西**：
   第三方只要定义一个新类型匹配 `.ts`、priority 拉到上限，照样抢走 ——
   挡住了正当用法（做一个代码编辑插件），挡不住恶意用法（换个 id 就绕过）。
   真正护住 `.dc.html` 的是 **priority 封顶**（95 < 100）。

   现在改成类型自己声明 `claimable`。这几条钉的是：**放开之后 `dc` 仍然关着**。 */
{
  /* ⚠️⚠️ **原来这一条钉的是 `dc`，而 `dc` 2026-10-23 删掉了**（C3）。
     而 `dc` 曾经是**唯一**一个 `claimable: false` 的 kind —— 于是那道闸
     （`isClaimable` + M16-3 在 `checkManifest` 加的那条校验）**一个样本都没有了**。
     > **判据在没有样本的时候，测的是「今天恰好没事」。**
     所以判据**自己造一个** `claimable: false` 的 kind 来测那个机制 ——
     这样它不再寄生在某一种具体格式上。
     ⚠️ 而「`dc` 消失把这个寄生关系暴露出来」本身值得记：
     一道闸的判据挂在一个会消失的样本上，那它和那个样本一起消失。 */
  registerKind({ id: "shut.kind", label: "关着的", icon: "x", priority: 40,
                 claimable: false, match: (n) => n.endsWith(".shut"), from: "judge" });
  ok(!isClaimable("shut.kind"), "**声明了 `claimable: false` 的类型不许被认领**（机制还在，样本由判据自己造）");
  for (const k of [BUILTIN.code, BUILTIN.md, BUILTIN.json, BUILTIN.html, BUILTIN.image] as const) {
    ok(isClaimable(k), `${k} 允许被插件认领（用户要「发新格式插件不更新 PC 端」）`);
  }
  ok(isClaimable("插件自己定义的"), "插件自己定义的类型当然允许（找不到就当允许）");
  /* ⚠️ 这一条是上面那个「闸挡错东西」的**证据**，留着它免得有人把闸改回去：
     第三方**换个 id** 就能抢走 `.ts`，所以按 id 拦是拦不住的。 */
  registerKind({ id: "冒充代码", label: "冒充", icon: "!", priority: PLUGIN_MAX_PRIORITY, match: (n) => n.endsWith(".ts"), from: "evil2" });
  ok(kindOf("a.ts") === "冒充代码", "**第三方换个 id 就能抢走 `.ts`** —— 所以「按内置 id 拦认领」拦不住什么", kindOf("a.ts"));
  /* ⚠️ 原来这一条是「`.dc.html` 抢不走」，而 C3 之后它**可以**被 html 插件认领。
     换成钉那个 `claimable: false` 的样本：**它才是「抢不走」的那一个**。 */
  registerKind({ id: "冒充关着的", label: "冒充", icon: "!", priority: PLUGIN_MAX_PRIORITY, match: (n) => n.endsWith(".shut"), from: "evil3" });
  ok(!isClaimable("shut.kind"), "**而声明关着的那一种，priority 拉满也认领不了**（护住它的是 `claimable`，priority 管的是另一件事）");
  unregisterKindsFrom("evil2"); unregisterKindsFrom("evil3"); unregisterKindsFrom("judge");
}

/* ── ④ 死接口不许回来（issue #36，`00` §一一四）──
   `KindModule.Status` 在 `7a2fe04` 被摘掉渲染点之后没接回，
   **三个模块还在实现它而没有任何地方画** —— 读代码的人会以为它在工作。
   删掉之后这条钉着它别回来。

   ⚠️ 判据是**源码级**的，因为死接口在界面上什么都不显示 —— uitest 量不到它。
   和 #19 那条「不许再出现 `startsWith(p.dir)`」同一类：
   **有些错误只有从「还有没有人写它」这个角度才看得见。**

   为什么放在 kindtest 而不是 uitest：格式模块的契约是它的题目，而它跑在 Node 端，
   直接读得到源码。放进 uitest 就只能去 grep 编译产物，
   而 `/Status:/` 那种正则会命中 `checkStatus` / `jobStatus` ——
   **过度敏感的判据和漏报的判据一样坏**，它会让人开始忽略红灯。 */
{
  const appSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(e.name)) files.push(f);
    }
  };
  try { walk(appSrc); } catch { /* 没有 app/src（只跑服务端时）就跳过 */ }
  /* 只认「把 Status 当模块字段用」这一种写法，不是任何含 Status 的词 */
  const hits = files.filter((f) => /(^|[^A-Za-z])Status\s*[:?]\s*(FC<|\(|[A-Z])/m.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(appSrc.length + 1));
  if (!files.length) console.log("  · 找不到 app/src，跳过死接口那一关");
  else ok(hits.length === 0, "**没有任何格式模块再声明 `Status`**（读数只有 `meta` 一个出口）", hits.length ? hits.join(", ") : `扫了 ${files.length} 个文件`);
}

/* ── 视频 / 音频两种内置类型（M14-11 / Q76，2026-10-21）────────────────────── */
console.log("\n⑨ 视频 / 音频");
{
  const { kindOf, isTextualPath, VIDEO_EXT, AUDIO_EXT, KINDS, BUILTIN, PLUGIN_DEFAULT_PRIORITY } = await import("./shared/kinds.js");
  ok(VIDEO_EXT.every((e) => kindOf(`a${e}`) === "media-video"), `VIDEO_EXT ${VIDEO_EXT.length} 个全认成 media-video`, VIDEO_EXT.join(" "));
  ok(AUDIO_EXT.every((e) => kindOf(`a${e}`) === "media-audio"), `AUDIO_EXT ${AUDIO_EXT.length} 个全认成 media-audio`, AUDIO_EXT.join(" "));

  /* ⚠️ **这两条是这一节最要紧的，而它们是 2026-10-21 当天补的**（`umbra-plugins` 会话核出来的）。
     第一版把 id 写成了 `video` / `audio`、priority 80 —— 那会**静默弄坏任何认领它们的第三方插件**：
     服务端 `store.ts` 对非 bundled 插件认领内置类型直接 `continue`（一种 kind 都登记不上），
     前端 `loader.ts` 也 `continue` 然后注册 UI 模块时撞上 `media.tsx` 当场抛，
     而 loader 把它 catch 成「这个插件没能接上」——
     **插件装着却不起作用，而服务端看一切正常**。 */
  const vdef = KINDS().find((k) => k.id === BUILTIN.mediaVideo);
  const adef = KINDS().find((k) => k.id === BUILTIN.mediaAudio);
  /* 钉的是**关系不是数字**：priority 具体填几可以变，「兜底必须输给插件」不能变。 */
  ok((vdef?.priority ?? 999) < PLUGIN_DEFAULT_PRIORITY && (adef?.priority ?? 999) < PLUGIN_DEFAULT_PRIORITY,
     `**兜底的 priority 低于插件默认值** —— 兜底的意思是「没有别人的时候才轮到我」，写高了用户买的媒体插件等于白买`,
     `兜底 ${vdef?.priority} / ${adef?.priority} · 插件默认 ${PLUGIN_DEFAULT_PRIORITY}`);
  /* `video` / `audio` 这两个名字**要留给插件**：占住它们等于让插件没法用最自然的 id。
     ⚠️ **2026-10-23 更新理由**：原来这条写的是「内置类型只有 bundled 能认领，
     占住就等于永久关门」—— **M16-3 撤掉了那条特例**（`store.ts registerPluginKinds`
     的判准从 `bundled` 换成 `isClaimable`），所以「永久关门」那半不再成立。
     剩下的理由仍然硬：一个内置条目占着通用 id，插件要用它就只能改名，
     而**改 id 等于换一种类型**（已装的用户那边会变成「这个插件不认这些文件了」）。
     > 一条判据的依据变了，就该把依据改对 —— 而不是靠惯性留着一句过期的理由。 */
  /* ⚠️ 写成 `BUILTIN.mediaVideo !== "video"` 的话 **TS 在编译期就把它判成恒真**并报
     「这个比较没意义」—— 构建失败，而那时人往往会**删掉判据**而不是改代码（§158 同族）。
     过一道 `string[]` 让它变回**运行期**判断：改回去的那一天它红，而不是编译不过。 */
  const taken = (["video", "audio"] as string[]);
  ok(!taken.includes(BUILTIN.mediaVideo) && !taken.includes(BUILTIN.mediaAudio),
     "**`video` / `audio` 这两个 id 没有被内置占掉** —— 它们太通用，属于插件（占住了插件就只能改 id，而改 id 等于换一种类型）",
     `${BUILTIN.mediaVideo} / ${BUILTIN.mediaAudio}`);
  /* ⚠️⚠️ **这一条钉的是真正生效的那个函数**，上面那条钉的是常量的值 —— 它们曾经分道扬镳：
     `isBuiltinKind` 查的是 `BUILTIN` 对象的**键**，而第一版只改了**值**，
     于是「`video` 没被占掉」绿着、而 `isBuiltinKind("video")` 照旧为真，
     插件认领 `video` 照旧被拒。
     > **判据测的那个东西，和产品实际用的那个东西，要是同一个。** */
  const { isBuiltinKind } = await import("./shared/kinds.js");
  ok(!isBuiltinKind("video" as never) && !isBuiltinKind("audio" as never),
     "**`isBuiltinKind(\"video\")` 为假** —— 钉的是那个真正挡住插件的函数，不是常量的值");
  /* ⚠️ **这一条是反面的，而且是最要紧的**：不写 `textual` = 不是文本。
     写成文本的话 `read_file` 会把一个 MP4 整个 `toString("utf8")` 塞进模型的上下文。 */
  ok(!isTextualPath("a.mp4") && !isTextualPath("a.mp3"), "**视频音频不是文本** —— read_file 不会把一个 MP4 塞进模型上下文");
  /* 两组扩展名不许重叠：重叠的话谁赢取决于表里的顺序，而那是**隐式**的 */
  const dup = VIDEO_EXT.filter((e) => AUDIO_EXT.includes(e));
  ok(dup.length === 0, "两组扩展名不重叠（重叠的话谁赢取决于表里的顺序，而那是隐式的）", dup.join(" "));
  /* ⚠️ **只列浏览器真能播的**：列一个播不了的等于把「打不开」包装成「打开了但黑屏」。
     `.mkv` / `.avi` 是最常被想当然加进来的两个，钉住它们。 */
  ok(kindOf("a.mkv") === "other" && kindOf("a.avi") === "other",
     "`.mkv` / `.avi` **不认领** —— 浏览器播不动，落到 other 的纯文本兜底去说实话");
  /* 和图片同档优先级，但都要高过 code —— 免得哪天有人把 .ogg 塞进 CODE_EXT 就被当代码打开 */
  ok(kindOf("a.ogg") === "media-audio", "`.ogg` 归音频兜底，不会被别的内置类型抢走");

  /* ⚠️ **真演一遍「装了媒体插件」** —— 上面两条测的是 priority 这个**数字**和 id 这个**字符串**，
     而要保证的事是「**插件装上之后它赢**」。数字对不等于结果对：
     匹配走的是 `REG` 的顺序，而 `registerKind` 插进去的位置、`kindOf` 的遍历方式
     都可能让一个「看着更高」的优先级不生效。
     **一条端到端的判据顶十条关于数字的判据。** */
  const { registerKind: reg2, unregisterKindsFrom: unreg2 } = await import("./shared/kinds.js");
  reg2({
    id: "video", label: "视频", icon: "▶", priority: 50,          // 插件自己定义，用的就是通用名
    match: (n) => [".mp4", ".m4v", ".mov", ".webm", ".mkv"].some((e) => n.endsWith(e)),
    from: "com.umbra.video",
  });
  ok(kindOf("clip.mp4") === "video", "**装了媒体插件之后 `.mp4` 归插件**（50 赢过兜底的 5）—— 这才是兜底两个字的意思");
  ok(kindOf("clip.mkv") === "video", "连兜底**刻意不认领**的 `.mkv` 也归插件了（插件的扩展名更全）");
  ok(kindOf("song.mp3") === "media-audio", "没被这个插件认领的音频照旧落兜底（两种类型互不干扰）");
  unreg2("com.umbra.video");
  ok(kindOf("clip.mp4") === "media-video", "**卸载插件之后退回兜底**，不是打不开");
  ok(kindOf("clip.mkv") === "other", "而 `.mkv` 退回 other（兜底不认领它，浏览器播不动）");
}

/* ══════════ ⑧ M16-3：第三方（非出厂）插件认领内置类型 ══════════
 *
 *  ⚠️ **这一节必须走 `registerPluginKinds()`，不能只调 `registerKind`。**
 *  上面第 ⑦ 节演的是「插件**自己定义**一种新类型」，走的是 `registerKind`；
 *  而「**认领**一种已有的内置类型」走的是完全另一条路 —— `store.ts` 的
 *  `registerPluginKinds()`，而那条路上原来有一道**只认出厂插件**的闸：
 *
 *      if (isBuiltinKind(k.id)) { if (p.bundled) ids.push(k.id); continue; }
 *
 *  撤掉它是 sam 2026-10-23 那条产品边界的要求（`doc/11` Q79 / M16-3）。
 *  ⚠️ 而**撤之前这件事一条判据都没有** —— 第 ⑦ 节那套（priority 的数字、id 的字符串、
 *  `isBuiltinKind` 的返回值）**一条都碰不到这道闸**，因为它们压根不经过
 *  `registerPluginKinds`。
 *  > **一条端到端的判据顶十条关于数字和字符串的判据**（§172.7）。
 *
 *  ⚠️ 两道闸要分开钉，因为**它们失败的样子一样而原因相反**：
 *  ① `md` 这种 `claimable` 的 → 第三方插件**认领得到**（M16-3 要的）
 *  ② `dc` 这种 `claimable: false` 的 → **谁都认领不到**，连出厂插件也不行
 *  只钉 ① 的话，把判准写成「一律放行」也会绿；只钉 ② 的话，写回 `bundled` 也会绿。 */
/* ⚠️⚠️ **这个临时目录是第 ⑧ 和第 ⑨ 两节共用的，而那不是为了省事。**
 *  `plugin/store.js` 在**首次 import 时**就算出 `BUNDLED_DIR` / `PLUGINS_DIR` ——
 *  所以第二节再设一遍 `UMBRASTUDIO_STATE_DIR` **根本不生效**，store 还指着第一节那个目录。
 *  第一版我让两节各自建、各自 `rm`，于是第 ⑨ 节的夹具搭在一个**已经被删掉的目录**上，
 *  症状是「插件一种 kind 都没登记上」—— **看起来完全像产品的问题**。
 *  > **模块级的环境变量快照，让「每节自带夹具」这个好习惯失效。**
 *  这是 verbtest 那条「环境变量要在 import 之前设」的变体，而且更阴：
 *  第一节设对了，第二节照着做反而错。 */
const { mkdtemp, mkdir, writeFile, rm, realpath } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-kindtest-")));
const EMPTY_BUNDLED = join(STATE, "没有出厂插件");
await mkdir(EMPTY_BUNDLED, { recursive: true });
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_BUNDLED_DIR = EMPTY_BUNDLED;

/** 造一个「用户自己装的」插件：`PLUGINS_DIR/<id>/<version>/manifest.json`
 *
 *  ⚠️ **清单必须是真的合法清单。** 第一版我只写了 `id` / `name` / `version` / `kinds`，
 *  而 `checkManifest` 还要 `hostApi` / `surfaces` / `permissions`，id 也必须是
 *  小写反写域名式（我当时用了中文）—— 于是那个插件**压根装不上**，
 *  「第三方插件认领得到 md」那条判据红了，**而它红的原因是夹具不是产品**。
 *  > **夹具的问题和产品的问题报出来的样子一样**（§144.4：攻击样本四个全红而一个都没打中）。 */
const fakePlugin = async (id: string, kinds: unknown[]) => {
  const dir = join(STATE, ".umbrastudio", "plugins", id, "1.0.0");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    id, name: id, version: "1.0.0", hostApi: "^1",
    surfaces: ["ui"], ui: "index.html",
    permissions: { files: ["read"], scope: "project", net: [] },
    kinds,
  }), "utf8");
  await writeFile(join(dir, "index.html"), "<!doctype html><p>判据用</p>", "utf8");
};

/* ⚠️ `fakePlugin` 和 `STATE` 一样提到块外 —— 第 ⑧⑨⑩ 三节都用它。
   第一版它在第 ⑧ 节的块作用域里，第 ⑩ 节拿不到（`Cannot find name 'fakePlugin'`）。 */

{

  /* 认领内置 `md`，不给 ext（`manifest.ts` 允许认领型插件空着）、不给 priority（默认 50） */
  await fakePlugin("com.third.markdown", [{ id: BUILTIN.md, label: "别人的 Markdown", icon: "M" }]);

  const { registerPluginKinds, listInstalled } = await import("./plugin/store.js");
  const inst = await listInstalled();
  /* ⚠️ **前提写进断言本身**：装着的必须是「一个、而且不是出厂的」。
     少了这一条，下面那条在「压根没扫到插件」时会以另一种方式失败而原因说不清。 */
  ok(inst.length === 1 && inst[0]!.bundled === false,
     "**前提：装着一个「用户自己装的」插件，出厂目录是空的**",
     `${inst.length} 个 · bundled=${inst[0]?.bundled}`);
  ok((inst[0]?.problems ?? []).length === 0,
     "而且它的清单没毛病（认领型插件允许不写 ext）", JSON.stringify(inst[0]?.problems ?? []));

  const got = await registerPluginKinds();
  const mdRow = got.find((r) => r.id === "com.third.markdown");
  ok(!!mdRow && mdRow.kinds.includes(BUILTIN.md),
     "**第三方插件认领得到内置的 `md`** —— M16-3 撤掉的就是这里那道「只认出厂插件」的闸",
     mdRow ? `kinds = ${JSON.stringify(mdRow.kinds)}` : "它一种 kind 都没登记上");

  /* ── 反面：`dc` 谁都认领不到，连出厂插件也不行 ── */
  const { checkManifest } = await import("./plugin/manifest.js");
  /* ⚠️ 这份清单**其余部分全合法** —— 只有「认领 dc」这一处违规。
     不然它会因为别的原因被拒，而判据看起来照样绿（§142.4：撞在别的机制上）。 */
  /* ⚠️⚠️ **「认领一个关着的内置 kind 会在装的时候被拒」这一条今天测不到，照实说。**
   *
   *  那道闸（`manifest.ts`）的条件是 `isBuiltinKind(id) && !isClaimable(id)`，
   *  而 C3 删掉 `dc` 之后**没有任何 kind 同时满足这两条** ——
   *  `dc` 曾经是唯一一个 `claimable: false` 的。
   *  判据也造不出替代样本：「内置」是 `BUILTIN` 对象的**键**，不是运行期能加的。
   *  > **这是「没验到」，不是「过了」**（纪律③：不能让没验到冒充过了）。
   *
   *  ⚠️ 那个前置条件**不是多余的**（我一度以为是）：非内置且关着的 kind 走
   *  `registerKind`，**撞「已经有了」就被拒了** —— 重名闸已经兜住。
   *  所以能测的是**重名闸那一条**，它测的是另一件事，不能冒充这一条。
   *
   *  ⚠️ **所以这里只钉「`isClaimable` 这个机制本身」**（上面那一节已经做了），
   *  并把「安装期那道闸没有对象」这件事写在读数里 —— 让它在日志里看得见，
   *  而不是静静地从判据里消失。 */
  /* ⚠️ **这里刻意用 `console.log` 而不是 `ok(true, …)`。**
     一条 ✓ 在日志里**就是**「过了」—— 不管它的文字说什么。
     有人扫一眼读数只看那一列，就会以为这件事被钉着。
     > **不能让「没验到」冒充「过了」**（纪律③）—— 包括不能用一条 ✓ 来说「我没验到」。
     所以它是一条**不计入 pass / fail 的警告**：在日志里照样看得见，
     但不占用「通过」那个词，也不虚增总数。 */
  console.log("  ⚠ 没验到：「认领一个关着的内置 kind 在装的时候被拒」—— `dc` 是唯一 `claimable: false` 的 kind，");
  console.log("           C3 删掉它之后那道闸进不去，而判据造不出「内置的 kind」（那是 `BUILTIN` 的键）。");

  /* ⚠️⚠️ **这一条原来声称自己钉着「第二道闸」，而反向验证证明它没有。**
   *
   *  第一版写的是「就算它绕过安装校验直接拷进来，注册这一层照样不给它 `dc`（两道闸，不是一道）」。
   *  装回「一律放行」（`if (isBuiltinKind(k.id)) { ids.push(k.id); continue; }`）之后
   *  **一条都没红** —— 查下去是：那个假插件的清单认领 `dc`，于是被上面刚加的
   *  `checkManifest` 判了一条 problem，而 `registerPluginKinds` 开头就是
   *  `if (p.problems.length) continue`，**把它整个跳过了**。
   *  两条判据测的是**同一道闸**，而我以为它们测了两道。
   *
   *  更要紧的推论：**加了安装期校验之后，注册期那道闸在任何正常路径上都不会被触发** ——
   *  它成了纯粹的纵深防御（手动 `cp` 进来的目录、将来 `checkManifest` 改了）。
   *  而 `registerPluginKinds` 只读 `listInstalled()` 的结果、不接受注入，
   *  所以**在当前架构下它测不到**。
   *  > **「没验到」不许冒充「过了」**（纪律③）—— 所以这条判据改成只声称它真能保证的那件事：
   *  > 「认领 `dc` 的插件最终拿不到 `dc`，不管它被哪一道闸挡住」。
   *  > 那仍然是用户关心的那个结果，只是它**不证明**第二道闸存在。 */
  /* ⚠️ 同上：这一条原来用 `dc` 当样本，而它没有对象了。
     能测的那一半（**重名闸**挡住「定义一个已有的 kind」）在第 ② 节已经钉着。 */

  /* ⚠️ 这里**不清理** —— 第 ⑨ 节要用同一个目录（见上面那段） */
}

/* ══════════ ⑨ Q84：`.svg` 从 `image` 里拆出来（2026-10-23）══════════
 *
 *  起因是图片编辑插件要认领 `image`，而**认领内置类型时清单里的 `ext` 不生效** ——
 *  不拆的话它会连 `.svg` 一起接管，然后把一张矢量图裁成栅格图（有损）。
 *  geek-99 定甲：拆出独立 kind，**而宿主的看图模块照样显示它**
 *  （sam 的边界是「图片能显示就显示」，svg 能显示，就不能让它退化成源码）。 */
{
  console.log("\n⑨ Q84：矢量图自己一种 kind");
  const { BUILTIN: B2, IMAGE_EXT, SVG_EXT, IMAGE_LIKE_KINDS } = await import("./shared/kinds.js");

  ok(kindOf("图标.svg") === B2.svg, "**`.svg` 落到新的矢量图 kind**", kindOf("图标.svg"));
  ok(kindOf("照片.png") === B2.image && kindOf("照片.jpg") === B2.image,
     "栅格图照旧归 `image`（拆的是 svg，不是把图片都拆了）", `${kindOf("照片.png")} / ${kindOf("照片.jpg")}`);
  /* ⚠️ **这一条是「拆完还能看图」的那一半** —— 光拆开不够，看图模块得认领它。
     前端 `app/src/kinds/image/index.tsx` 的 `ids` 要含 `svg`，
     而这里能钉的是服务端这一侧：它**不许**落到 `other`（那就是退化成文件卡了）。 */
  ok(kindOf("图标.svg") !== B2.other && kindOf("图标.svg") !== B2.code,
     "**而且它没退化成 `other` 或 `code`** —— 拆的是类型，不是「以后 svg 只能看源码」", kindOf("图标.svg"));

  /* `textual` 两面都要钉：svg 是文本（能看源码），而栅格图**不是**。 */
  ok(isTextualPath("图标.svg"), "**矢量图是文本** —— 纯文本兜底和代码插件都够得着它的源码");
  ok(!isTextualPath("照片.png") && !isTextualPath("照片.webp"),
     "**而栅格图不是文本** —— 原来 `image` 那条 `textual` 是个只为 `.svg` 存在的例外函数，拆完删掉了");

  /* 两组扩展名不许重叠（同 VIDEO/AUDIO 那条：重叠了谁赢取决于表里的顺序，而那是隐式的） */
  ok(!IMAGE_EXT.includes(".svg"), "`IMAGE_EXT` 里不再有 `.svg`（否则两条都 match，谁赢看顺序）");
  ok(SVG_EXT.every((e) => !IMAGE_EXT.includes(e)), "两组扩展名不重叠");
  /* 同档优先级：它们不重叠，所以同档不会打架 —— 而「同档」本身要钉住，
     不然哪天有人把 svg 调低，它就会被某个 priority 更高的插件顺手抢走。 */
  /* ⚠️ 用 `kindDef` 而不是上一节那个局部的 `KINDS()` —— 它在另一个块的作用域里 */
  const imgDef = kindDef(B2.image as never), svgDef = kindDef(B2.svg as never);
  ok(imgDef?.priority === svgDef?.priority,
     "两种图**同档优先级**（不重叠所以不打架；调低的那个会被插件顺手抢走）", `${imgDef?.priority} / ${svgDef?.priority}`);

  /* ⚠️⚠️ **这一条钉的是拆 kind 最容易漏的那一处**：`files.ts` 有两处原来写
     `if (kind === "image")` 才去读图片尺寸 —— 拆完它们会**静默**不再为 svg 读，
     症状是图片视图里「宽 × 高」变成「? × ?」，而 `imageSize` 里专门为 svg 写的
     那段（解析 width/height/viewBox）变成死代码。**不报错，只是读数空了。**
     收口成 `IMAGE_LIKE_KINDS` 之后，这条判据钉的是那个集合**两种都在**。 */
  ok(IMAGE_LIKE_KINDS.includes(B2.image) && IMAGE_LIKE_KINDS.includes(B2.svg),
     "**`IMAGE_LIKE_KINDS` 两种图都在** —— 按文件头读尺寸那条路按它分支（原来是两处 `kind === \"image\"` 字面量）",
     IMAGE_LIKE_KINDS.join(" / "));

  /* ── 图片编辑插件认领 `image`：装了它赢，卸了退回宿主看图 ── */
  /* ⚠️ **复用第 ⑧ 节那个临时目录**（理由见它上面那段注释：store 的路径是首次 import 时定的，
     这里另起一个目录 + 重设环境变量**不生效**）。 */
  const dir2 = join(STATE, ".umbrastudio", "plugins", "com.umbra.imageedit", "1.0.0");
  await mkdir(dir2, { recursive: true });
  await writeFile(join(dir2, "manifest.json"), JSON.stringify({
    id: "com.umbra.imageedit", name: "图片编辑", version: "1.0.0", hostApi: "^1",
    surfaces: ["ui"], ui: "index.html",
    permissions: { files: ["read", "write"], scope: "project", net: [] },
    /* 按 Q84 甲：**直接认领内置的 `image`**，不自己定义 `image-edit`。
       ⚠️ 认领型插件的 `ext` 不生效，所以这里空着 —— 它认的就是 `IMAGE_EXT` 那一组。 */
    kinds: [{ id: B2.image, label: "图片编辑", icon: "✎" }],
  }), "utf8");
  await writeFile(join(dir2, "index.html"), "<!doctype html><p>判据用</p>", "utf8");

  const { registerPluginKinds: rpk2 } = await import("./plugin/store.js");
  const got3 = await rpk2();
  const row3 = got3.find((r) => r.id === "com.umbra.imageedit");
  ok(!!row3 && row3.kinds.includes(B2.image),
     "**图片编辑插件认领得到 `image`**（Q84 甲 —— M16-3 撤掉那条特例才成立的）",
     row3 ? JSON.stringify(row3.kinds) : "一种都没登记上");
  /* ⚠️ **而 `.svg` 不跟着被它接管** —— 这正是拆 kind 的全部目的。 */
  ok(!(row3?.kinds ?? []).includes(B2.svg) && kindOf("图标.svg") === B2.svg,
     "**而 `.svg` 不跟着被它接管** —— 这就是拆开的全部目的（认领型插件的 ext 不生效，不拆就连 svg 一起要了）");
  /* ⚠️ **卸掉插件之后 `.png` 要退回宿主看图** ——「认领」只是让插件画 UI，
     kind 本身一直是 `image`，所以卸了之后宿主模块自然接回去。
     钉它是因为这一条正是 Q84 选甲（而不是插件自己定义 `image-edit`(90)）换来的保证：
     **插件挂了 / 卸了，用户照样看得到图。** */
  ok(kindOf("照片.png") === B2.image,
     "**装着插件时 `.png` 的 kind 仍然是 `image`**（认领不改类型，所以卸了就退回宿主看图）", kindOf("照片.png"));
  /* ══════════ ⑩ 商城里已有的 `com.umbra.svg` 和新的内置 `svg` id 撞上了 ══════════
   *
   *  ⚠️⚠️ **这是 §172.6 那次的同形，而我在 Q84 里没核这一点就起了 `svg` 这个 id。**
   *  那条教训原文：**内置 id 正好落在第三方插件已经在用的名字上**
   *  （当时是 `video` / `audio`，这次是 `svg`）。
   *  `plugins` 报：商城里本来就有 **`com.umbra.svg` 1.2.1**，它的清单**自己定义** kind
   *  `id: "svg"`、`ext: [".svg"]`、`priority: 85`。
   *  > **起一个内置 id 之前，要先查商城里有没有插件在用这个名字。**
   *
   *  期望的结果（geek-99 定的）：新 Studio 上它**算认领 `svg`**，装了它就由它打开 `.svg`，
   *  卸了退回宿主看图；**旧 Studio 照它自己写的 ext 走**（旧版没有内置 `svg`，
   *  所以它走 `registerKind`，ext 和 priority 都生效）—— 所以**不许改插件的清单**。 */
  console.log("\n⑩ 商城已有的 com.umbra.svg 撞上新的内置 svg id");
  /* ⚠️ 清单**逐字照 plugins 报的那一份**（含 `ext` 和 `priority: 85`）——
     照抄而不是写一个「差不多的」：差异正好可能落在被测的那一点上。 */
  await fakePlugin("com.umbra.svg", [{ id: "svg", label: "SVG", icon: "◇", ext: [".svg"], priority: 85 }]);
  const { listInstalled: li3 } = await import("./plugin/store.js");
  const svgPlug = (await li3()).find((x) => x.manifest.id === "com.umbra.svg");
  /* ① 它在新版里会不会突然变成 problem 被跳过 —— M16-3 刚加的那条
     「认领不许认领的类型就在 checkManifest 拒」要连着核。 */
  ok(!!svgPlug && svgPlug.problems.length === 0,
     "**① 已装的 svg 插件在新版里没有变成 problem**（M16-3 那条新校验只拦 `claimable: false` 的，而 `svg` 是允许认领的）",
     JSON.stringify(svgPlug?.problems ?? "压根没扫到"));
  const got4 = await rpk2();
  const svgRow = got4.find((r) => r.id === "com.umbra.svg");
  ok(!!svgRow && svgRow.kinds.includes("svg" as never),
     "**① 服务端把它当成「认领 svg」而不是「重定义内置类型」**（`store.ts` 那一支走 `isClaimable`，不抛）",
     svgRow ? JSON.stringify(svgRow.kinds) : "一种都没登记上");
  /* ③ priority 85 对 80 谁赢 —— ⚠️ **这个问题在这里其实不适用**，而「不适用」本身要钉住：
     认领内置 kind 走的是 `continue`，**不调 `registerKind`**，所以插件的 `priority` 和 `ext`
     都**不生效**，匹配仍由 `shared/kinds.ts` 的那一条说了算。
     priority 决定的是「一个文件名匹配**多个 kind** 时选哪个 kind」，
     而认领的是**同一个 kind** —— 没有竞争对象。 */
  ok(kindDef("svg" as never).priority === 80,
     "**③ 插件的 priority 85 不生效，仍是内置那条的 80** —— 认领走的路不调 `registerKind`，而它认的是同一个 kind，没有竞争",
     String(kindDef("svg" as never).priority));
  ok(kindOf("图标.svg") === "svg", "**③ 而结果不受影响**：`.svg` 照旧落到 `svg`");
  /* ⚠️ **而 ext 不生效这件事有一个真实后果，要说出来**：插件声明的 ext 比内置多的那些
     **不会被认领**。这一份正好一样（都是 `[".svg"]`），所以今天没差别 ——
     **但这是「今天恰好一样」，不是「机制保证一样」**。 */
  const svgExtSame = JSON.stringify(SVG_EXT) === JSON.stringify([".svg"]);
  ok(svgExtSame,
     "**③b 插件的 ext 和内置的恰好一致，所以 ext 不生效没造成差别** —— ⚠️ 这是「今天恰好一样」不是机制保证（插件多声明一个 `.svgz` 就不会被认领）",
     `内置 ${JSON.stringify(SVG_EXT)} · 插件 [".svg"]`);

  await rm(STATE, { recursive: true, force: true });   // ⑧⑨⑩ 共用，统一在这里清
}

console.log(fail === 0 ? `\n✓ 类型表 ${pass}/${pass + fail}` : `\n✗ 类型表 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
