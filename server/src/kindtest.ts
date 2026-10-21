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
  ["ui/S2-单稿预览壳.dc.html",  BUILTIN.dc,     true,  "设计稿要压过网页，否则整个设计稿能力凭空消失"],
  ["a/b/index.html",            BUILTIN.html,   true,  "普通网页还是网页"],
  ["logo.svg",                  BUILTIN.image,  true,  "svg 归图片（能无损缩放），但它是文本 —— 唯一的跨界情形"],
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
ok(kindOf("x.dc.html") === BUILTIN.dc, "**插件抢不走 .dc.html** —— 那是产品的核心格式，被劫持等于整个产品坏掉");

/* ── ③ 卸载：摘干净，不留半截 ── */
ok(unregisterKindsFrom("evil") === 1, "卸载按插件 id 摘");
ok(kindOf("x.dc.html") === BUILTIN.dc, "摘完还是对的");
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
  ok(!isClaimable(BUILTIN.dc), "**`dc` 不许被认领**（设计稿被接管等于整个产品坏掉）");
  for (const k of [BUILTIN.code, BUILTIN.md, BUILTIN.json, BUILTIN.html, BUILTIN.image] as const) {
    ok(isClaimable(k), `${k} 允许被插件认领（用户要「发新格式插件不更新 PC 端」）`);
  }
  ok(isClaimable("插件自己定义的"), "插件自己定义的类型当然允许（找不到就当允许）");
  /* ⚠️ 这一条是上面那个「闸挡错东西」的**证据**，留着它免得有人把闸改回去：
     第三方**换个 id** 就能抢走 `.ts`，所以按 id 拦是拦不住的。 */
  registerKind({ id: "冒充代码", label: "冒充", icon: "!", priority: PLUGIN_MAX_PRIORITY, match: (n) => n.endsWith(".ts"), from: "evil2" });
  ok(kindOf("a.ts") === "冒充代码", "**第三方换个 id 就能抢走 `.ts`** —— 所以「按内置 id 拦认领」拦不住什么", kindOf("a.ts"));
  ok(kindOf("a.dc.html") === BUILTIN.dc, "**而 `.dc.html` 抢不走** —— 护住它的是 priority 封顶，不是那道闸");
  unregisterKindsFrom("evil2");
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
  /* `video` / `audio` 这两个名字**要留给插件**：内置类型只有 bundled 能认领，占住就等于永久关门。 */
  /* ⚠️ 写成 `BUILTIN.mediaVideo !== "video"` 的话 **TS 在编译期就把它判成恒真**并报
     「这个比较没意义」—— 构建失败，而那时人往往会**删掉判据**而不是改代码（§158 同族）。
     过一道 `string[]` 让它变回**运行期**判断：改回去的那一天它红，而不是编译不过。 */
  const taken = (["video", "audio"] as string[]);
  ok(!taken.includes(BUILTIN.mediaVideo) && !taken.includes(BUILTIN.mediaAudio),
     "**`video` / `audio` 这两个 id 没有被内置占掉** —— 它们太通用，属于插件（内置类型只有 bundled 能认领）",
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

console.log(fail === 0 ? `\n✓ 类型表 ${pass}/${pass + fail}` : `\n✗ 类型表 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
