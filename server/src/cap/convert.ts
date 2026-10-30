import { z } from "zod";
import { basename, posix, relative, sep } from "node:path";
import { envelope, err, guarded, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { isToolArtifactPath, recordCreatedFile, resolveProjectFile } from "../files.js";
import { convertEngine, forgetTools, FORMATS, normalizeTarget } from "../convert/index.js";
import { extOf } from "../convert/formats.js";
import { defineCap } from "./registry.js";
import { originOf, type CapCtx } from "./types.js";

/** 格式转换（格式转换二期 · Studio 宿主能力，2026-10-18；方案 `Geek/doc/格式转换-方案调研-2026-10-18.md` §5.1 / §9.3）。
 *
 *  **为什么是宿主能力**：插件不许起子进程（`doc/20` P1 / `11` Q40，manifest 连 `exec` 槽位都不留），
 *  而转换几乎全靠外部程序（sips / ffmpeg / LibreOffice / Pandoc）。所以由宿主跑、插件只递三个参数：
 *  **哪个文件、转成什么、（有损图片的）质量**。命令行、工具路径、成品放哪，插件一样都碰不到。
 *  原名 `media.transcode`（只管音视频），2026-10-18 放宽成通用的 `file.convert` —— 文档 / 表格 / 图片
 *  走的是同一个引擎、同一套成品规矩，分成两件能力只会让白名单多一道要守的口子。
 *
 *  一件能力三个门面：插件经 `plugin/host.ts` 叫它 `file.convert`（白名单里的别名），
 *  MCP / 应用内会话叫它 `convert_file`（Anthropic / OpenAI 的工具名不许带点）。实现只有这一份。
 *
 *  成品规矩照引擎（`convert/output.ts`）：**放在源文件旁边、重名加「 (1)」、永不覆盖**（包括不覆盖源文件自己），
 *  先在临时目录转完、成功了才挪过去，失败不留半截。落盘之后补记一版快照（`recordCreatedFile`），
 *  目录树的刷新走磁盘监听（`serve.ts`），和别的新文件一样。
 */
const p = (c: CapCtx) => c.project!;

const bad = (name: string, message: string, fix?: string): ToolError =>
  new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name }, message, fix ? { fix } : undefined));

/* ⚠️ 路径三道闸（`resolveProjectFile`）与「装回信封」（`guarded`）2026-10-30 搬去了
   `files.ts` / `envelope.ts` —— 图像编辑要问同一个问题，留在这里就得再写一遍。
   判断搬哪儿的依据写在 `files.ts` 那一段：**两处在问同一个问题吗。** */

const KNOWN = FORMATS.map((f) => f.id).join(" / ");

/* ⚠️⚠️ **`forgetTools` 2026-10-24 接上界面（M17 零碎，geek-99 定）。**
   它是「用户装完工具后重新检测（60 秒缓存不等了）」，而在这天之前
   **一处调用方都没有** —— 「未使用的导出」那一轮量出来的 18 条里，
   只有这一条不是垃圾：它是一个**没接线的产品入口**。
   > **「能力在」和「够得着」是两件事**（M14-3 那条，第三次）——
   > 而这一次它连「能力」都只是一个 export，连 MCP 面都上不去。

   ### 为什么用户会需要它
   转换工具（sips / ffmpeg / pandoc / LibreOffice）的探测结果缓存 60 秒。
   用户看到「这台机器上没有能转这种图的工具」→ 去装 → 回来再点，
   **在 60 秒内点的那几次仍然说没装**。而他不知道有这个缓存，
   于是他得到的结论是「装了也没用」。
   > **一个为了省时间而存在的缓存，在用户按提示去做事之后，变成了「它在骗我」。**

   ⚠️ **`scope: "global"`**：装了什么工具是**这台机器**的事，不是某个项目的事。
   ⚠️ 这一件**只清缓存，不自己探测** —— 探测在下一次 `convertEngine()` 时发生，
   而那一次由调用方发起（界面重试一次转换、模型重问一次 `list_convert_targets`）。
   > **把「忘掉」和「重新量」做成一件，就得替调用方决定「量哪一个文件」** ——
   > 而那是它才知道的事。 */
defineCap({
  name: "recheck_convert_tools", title: "重新检测转换工具", scope: "global",
  summary: [
    "**丢掉「这台机器装了哪些转换工具」的缓存**（默认缓存 60 秒）。装完 ffmpeg / pandoc / LibreOffice 之后调它。",
    "它只清缓存，不自己探测 —— 下一次 `list_convert_targets` 或 `convert_file` 会重新探一遍。",
  ].join("\n"),
  input: {},
  http: { route: "convert_recheck", method: "POST" },
  run: async () => { forgetTools(); return envelope({ forgotten: true }, [], { forgotten: true }); },
});

defineCap({
  name: "list_convert_targets", title: "一个文件能转成什么格式", scope: "project",
  summary: [
    "列这个文件在这台电脑上能转成哪些格式。每项 `available` 说能不能转；",
    "**不能时给 `reason`（「没装 LibreOffice」）和 `hint`（一行安装命令）** —— 照实转告用户，别说成「不支持」。",
    "能转但有损 / 有出入时给 `note`（「只转第 1 页」），`via` 是走哪几个工具。转之前先问它，别猜。",
  ].join("\n"),
  input: { path: z.string().describe("相对项目根的文件路径") },
  http: { route: "convert_targets", method: "GET" },
  run: ({ path }, c) => guarded(async () => {
    const src = await resolveProjectFile(p(c), path);
    const r = await convertEngine().targets([src.abs]);
    if (!r.from.length) {
      return envelope({ path: src.rel, from: null, targets: [] }, [err(X.BAD_INPUT, src.rel, { kind: "file", name: basename(src.rel) },
        "不认识这个文件的格式（按扩展名判，不猜文件头）", { fix: `认得的格式：${KNOWN}` })]);
    }
    return envelope({ path: src.rel, from: r.from[0], targets: r.targets },
      [], { available: r.targets.filter((t) => t.available).length, total: r.targets.length });
  }),
});

defineCap({
  name: "convert_file", title: "把一个文件转成另一种格式", scope: "project",
  summary: [
    "把项目里的一个文件转成别的格式（图片 / 文档 / 表格 / 演示 / 音视频），**成品放在源文件旁边**：",
    "同名换扩展名，重名就加「 (1)」「 (2)」…，**永远不覆盖任何文件**（包括源文件）。源文件只读不动。",
    "`to` 写格式名或扩展名都行（pdf / .jpeg / JPG）。先用 list_convert_targets 看能不能转、为什么不能。",
    "返回 `state`（done / failed / skipped）、`output`（成品的项目内路径）、失败时 `error`、有损时 `note`、`via`（走了哪几个工具）。",
    "视频转码可能要好几分钟，这一件会等到转完才返回。",
  ].join("\n"),
  input: {
    path: z.string().describe("相对项目根的源文件路径"),
    to: z.string().describe("目标格式，如 pdf / jpg / mp4 / docx"),
    quality: z.number().int().min(1).max(100).optional().describe("有损图片格式（jpg / heic / avif / webp）的质量 1–100；不给用工具默认值"),
  },
  http: { route: "file_convert", method: "POST" },
  run: ({ path, to, quality }, c) => guarded(async () => {
    const proj = p(c);
    const target = normalizeTarget(to);
    if (!target) throw bad("to", `不认识目标格式「${to}」`, `能写的：${KNOWN}`);
    const src = await resolveProjectFile(proj, path);
    /* 预判成品的名字（第 0 个候选）：落在工具自己的名字上（`index.dc.html` 这种）就不转 ——
       引擎的占位只保证不覆盖，不知道哪些名字是工具留给自己的。 */
    const predicted = posix.join(posix.dirname(src.rel), `${basename(src.rel).replace(/\.[^./\\]+$/, "")}.${extOf(target)}`);
    if (isToolArtifactPath(predicted)) throw bad("to", `成品会叫 ${predicted}，那是工具自己用的名字`, "先把源文件改个名再转。");
    /* ⚠️⚠️ **这里原来有一道「成品不许是一份设计稿」的拒（issue #173），
       2026-10-23（M16-7c-2c / C3）删了 —— 而它和 7a 那两道一样，是「自动失效」的。**
       判准是 `kindOf(predicted) === "dc"`，而 C3 删掉 `dc` 这个 kind 条目之后
       `kindOf` **永不回 `"dc"`**，这个 `if` 已经进不去了。

       它当初修的那件事值得整段留着：源文件叫 `首页.dc.txt` 转 html 时
       `predicted = "首页.dc" + ".html" = "首页.dc.html"` —— 于是一份**没走 `write_draft`**
       的设计稿落进项目（没有归一化 / `@ds` 展开 / `__resources` 注入 / 节点地址 / 语义快照），
       **正是纪律① 点名的那种页**（断网白屏）。
       > **纪律① 说「一个都不例外」，而「例外」从来不是谁故意开的口子，
       > 是一条新路径没走到那道闸前面。**
       这句话本身没有过期 —— 它对以后任何「新开一条写文件的路」都成立。

       ⚠️ **上面 `isToolArtifactPath(predicted)` 那道拒还在工作**，别一起删：
       它认的是 `index.dc.html` 和几个壳，而**那些文件在用户的项目里还躺着**
       （硬约束：不删），成品撞上它们的名字照样是个问题。 */


    const [r] = await convertEngine().convert({ files: [src.abs], to: target, options: quality ? { quality } : {} });
    const base = { path: src.rel, to: target };
    if (!r || r.state !== "done" || !r.output) {
      const why = r?.error ?? "没有转出结果";
      return envelope({ ...base, state: r?.state ?? "failed", error: why, ...(r?.via ? { via: r.via } : {}) },
        [err(X.IO, src.rel, { kind: "file", name: basename(src.rel) }, `转换没成：${why}`)]);
    }
    const output = relative(src.root, r.output).split(sep).join(posix.sep);
    /* 成品照引擎的规矩落了盘，这里补记一版（谁转的 = 谁改的，和 write_file 同一套 `originOf`）。
       记不上（太大）不算转换失败 —— 文件已经在了，照实说一句就行。 */
    const rec = await recordCreatedFile(proj, output, originOf(c.via), `由 ${src.rel} 转换（${r.via ?? "?"}）`)
      .catch((e) => ({ snapshot: null, why: `版本没记上：${(e as Error).message}` }));
    return envelope({
      ...base, state: "done", output,
      ...(r.note ? { note: r.note } : {}),
      ...(r.via ? { via: r.via } : {}),
      snapshot: rec.snapshot,
      ...(rec.why ? { snapshotNote: rec.why } : {}),
    });
  }),
});
