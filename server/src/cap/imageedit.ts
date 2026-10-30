import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename, join, posix, sep } from "node:path";
import { envelope, err, guarded, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { freeName, resolveProjectFile, writeAnyFile } from "../files.js";
import { getAiConfig, setAiConfig, type ImageEditConfig } from "../ai_config.js";
import { editImage, extOfMime, ImageEditError, imageEditStatus } from "../imageedit/index.js";
import { defineCap } from "./registry.js";
import type { CapCtx } from "./types.js";

/** 「图像编辑」这个角色的能力（2026-10-30，出效果图；sam 定先接国内模型）。
 *
 *  一句话：**给项目里的一张图 + 一句提示 → 项目里多一张图**，而原图一个字节不动。
 *  第一个用处是把 SketchUp 导出的视口底图变成效果图（`export_view` 出底图，这件接着出效果图）。
 *
 *  ### 分层（「适配层可换」的具体含义）
 *  | 这一层（`cap/imageedit.ts`） | 适配层（`imageedit/`） |
 *  | --- | --- |
 *  | 路径三道闸 · 是不是图 · 大小上限 · 落点与重名 · 走写入口 · 装信封与错误码 | 只回答「一张图 + 一句话 → 另一张图」 |
 *  加第二家（万相 / Gemini）只写一个 `ImageEditor`，这个文件一行都不用改。
 *
 *  ### 三个门面 + 插件
 *  MCP / 应用内会话叫 `edit_image`，HTTP 路由 `image_edit`，插件经 `hostCall` 叫 **`image.edit`**
 *  （白名单里的别名，`need: "write"` —— 它往项目里新建了一个文件；
 *  同 `file.convert` 那条：「往盘上写」的权限不按「会不会覆盖」分级）。
 *
 *  ### 为什么成品落在源文件旁边
 *  照 `convert_file` 那套规矩（源文件旁 · 重名顺延 · 永不覆盖），**不另立一条**。
 *  再定一套「效果图都放 renders/」的话，这个工具里就有了两种「生成物放哪」的规矩，
 *  而用户要记住哪件能力按哪一套。
 */
const p = (c: CapCtx) => c.project!;

/** 能当原图的几种。**按扩展名判**（和 `shared/kinds.ts` 一样的口径），认不出就拒 ——
 *  适配器必须给对端一个 MIME，猜错的代价是对端拒收而报错写着「密钥不对」。 */
const INPUT_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};

const bad = (name: string, message: string, fix?: string): ToolError =>
  new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name }, message, fix ? { fix } : undefined));

/** 适配层的四种失败 → 四个错误码。**不合成一个** —— 用户要做的动作不同（`codes.ts` 那段）。 */
const CODE_OF = {
  config: X.IMAGE_EDIT_NOT_CONFIGURED,
  remote: X.IMAGE_EDIT_REMOTE,
  too_big: X.IMAGE_EDIT_TOO_BIG,
  timeout: X.IMAGE_EDIT_TIMEOUT,
} as const;

defineCap({
  name: "image_edit_status", title: "图像编辑（出效果图）配好了没", scope: "global",
  summary: [
    "问这台机器上「图像编辑」这个角色配好了没：哪家、哪个模型、密钥从哪来、认不认 `strength`。",
    "**一个请求都不发**（只读配置）。`configured: false` 时 `why` 是一句能照着做的话 —— 原样转给用户。",
    "⚠️ **要出效果图之前先问它**，别先答应用户再发现没配。`real: false` = 配的是假适配器（不联网、原图照回）。",
  ].join("\n"),
  input: {},
  faces: ["mcp", "http"],
  http: { route: "image_edit_status", method: "GET" },
  run: async () => {
    const st = await imageEditStatus();
    return envelope(st, [], { configured: st.configured });
  },
});

defineCap({
  name: "set_image_edit_config", title: "配图像编辑模型", scope: "global",
  summary: [
    "设「图像编辑」这个角色：`provider`（ark / fake）、`model`、密钥、端点、尺寸。",
    "密钥只存本地（`.umbrastudio/ai_config.json`），不进日志、不进项目、不进仓库，**回包里也不回显**。",
    "密钥给 `apiKey`：方舟控制台「**API Key 管理**」里那把 —— **图像走按量端点 `/api/v3`**。",
    "⚠️ `keyFrom: \"c\"` = 复用通道 C 那把、文件里不另存一份，**只有通道 C 配的也是按量 key 时才能用**：",
    "Agent Plan 订阅那把（`ark-` 开头）这条接口回 401（2026-10-30 实测）。**两样都填时 `keyFrom` 优先**。",
    "只改你点名的那几项，没传的原样保留；三条会话通道一个都不碰。",
  ].join("\n"),
  input: {
    provider: z.enum(["ark", "fake"]).optional().describe("哪家适配器。fake 是打桩：不联网、原图照回，只用来验链路"),
    model: z.string().optional().describe("模型 id，以对端控制台的模型列表为准（我们不硬编码）"),
    apiKey: z.string().optional().describe("API 密钥（只存本地、不回显）"),
    baseUrl: z.string().optional().describe("端点，留空用适配器默认（方舟 https://ark.cn-beijing.volces.com/api/v3）"),
    keyFrom: z.enum(["c"]).nullish().describe("密钥取自哪条通道：\"c\" = 通道 C 那把方舟密钥（⚠️ 仅当它也是按量 key；订阅域那把图像接口不认）；给 null 清掉这项，改用自己填的 apiKey"),
    size: z.string().optional().describe("回包尺寸，写法随各家（方舟按模型给可选值：Seedream 4.5 是 2K / 4K；也能写「宽x高」如 2048x1024）"),
  },
  faces: ["mcp", "http"],
  http: { route: "image_edit_config", method: "POST" },
  run: async (i) => {
    const cur = await getAiConfig();
    const prev = cur.imageEdit;
    const provider = i.provider ?? prev?.provider;
    if (!provider) throw bad("provider", "第一次配要给 provider", "provider=ark（火山方舟 · 豆包 Seedream）或 provider=fake（打桩，不联网）");
    /* ⚠️ **合并写，不手工拼整份。** issue #34 就是这里栽过的那一条：MCP 那条路手工拼
       `AiConfig`，于是「调一次就把通道 C 整条清空」。这里只动 `imageEdit` 一个键，
       三条通道靠 `...cur` 原样过去；同一条里没传的字段靠 `...prev` 原样过去。 */
    const next: ImageEditConfig = {
      ...(prev ?? { provider, model: "" }),
      provider,
      ...(i.model !== undefined ? { model: i.model.trim() } : {}),
      ...(i.apiKey !== undefined ? { apiKey: i.apiKey.trim() } : {}),
      ...(i.baseUrl !== undefined ? { baseUrl: i.baseUrl.trim() } : {}),
      ...(i.size !== undefined ? { size: i.size.trim() } : {}),
      ...(i.keyFrom !== undefined ? (i.keyFrom === null ? { keyFrom: undefined } : { keyFrom: i.keyFrom }) : {}),
    };
    await setAiConfig({ ...cur, imageEdit: next });
    /* ⚠️ **回包不回显密钥** —— 回执会进会话记录，而会话记录会被看、被导出。
       只说「有没有」。 */
    const st = await imageEditStatus();
    return envelope({ provider: next.provider, model: next.model, hasKey: !!(next.apiKey ?? "").trim(), keyFrom: next.keyFrom ?? null, status: st }, [], {});
  },
});

defineCap({
  name: "edit_image", title: "按一句提示把一张图改成另一张（出效果图）", scope: "project",
  summary: [
    "把项目里的一张图交给图像编辑模型，按 `prompt` 出一张新图，**存在源文件旁边**：",
    "`<原名>-效果图.png`，重名顺延「 (1)」，**永不覆盖**，原图一个字节不动。返回新图的项目内路径。",
    "`strength` 0–1 是「改多狠」：**不是每家接口都有这一档**，没有的那家会在 `note` 里说「没用上」。",
    "⚠️ 先用 `image_edit_status` 问配好了没；`real: false` 的回包说明走的是假适配器（原图副本，不是模型出的图）。",
    "能当原图的：png / jpg / webp，上限 10 MB（更大的先用 convert_file 转小）。",
  ].join("\n"),
  input: {
    image: z.string().describe("相对项目根的图片路径"),
    prompt: z.string().describe("要改成什么样，一句话。越具体越好（材质、光线、时间、风格）"),
    strength: z.number().min(0).max(1).optional().describe("改多狠 0–1，不给用对端默认"),
  },
  faces: ["mcp", "http"],
  http: { route: "image_edit", method: "POST" },
  run: ({ image, prompt, strength }, c) => guarded(async () => {
    const proj = p(c);
    const say = (prompt ?? "").trim();
    if (!say) throw bad("prompt", "没说要改成什么样", "给一句话，比如「改成黄昏时的室内效果图，木地板，暖光」");
    /* 路径三道闸（字面不出项目 → 真身不出项目 → 不是工具自己的地方），和 convert 同一份 */
    const src = await resolveProjectFile(proj, image);
    const ext = (src.rel.match(/\.[^./]+$/)?.[0] ?? "").toLowerCase();
    const mime = INPUT_MIME[ext];
    if (!mime) {
      throw bad("image", `${src.rel} 不是能当原图的格式（按扩展名判）`,
        `能用的：${Object.keys(INPUT_MIME).join(" / ")}。别的格式先用 convert_file 转一张 png。`);
    }
    const bytes = await readFile(src.abs);

    let out: Awaited<ReturnType<typeof editImage>>;
    try {
      out = await editImage({ bytes, mime, prompt: say, ...(strength !== undefined ? { strength } : {}) });
    } catch (e) {
      /* 适配层的失败 → 错误码 + 出路。**对端那句话原样带着**（改写它等于把真因丢掉）。 */
      if (e instanceof ImageEditError) {
        throw new ToolError(err(CODE_OF[e.kind], src.rel, { kind: "file", name: basename(src.rel) }, e.message,
          e.fix ? { fix: e.fix } : undefined));
      }
      /* `getImageEdit()` 的「还没配」是普通 Error，它那句话本身就是出路 */
      throw new ToolError(err(X.IMAGE_EDIT_NOT_CONFIGURED, src.rel, { kind: "file", name: basename(src.rel) },
        (e as Error).message, { fix: "配好之后再来一次；先用 image_edit_status 确认" }));
    }

    /* 落点：源文件旁边。⚠️ **假适配器的产物把「假」写进文件名** ——
       `real: false` 只在回执里，而文件会留在用户的项目里被以后的人看到，
       那时候回执已经不在了。 */
    const stem = basename(src.rel).replace(/\.[^./]+$/, "");
    const want = `${stem}-效果图${out.real ? "" : "（假适配器）"}.${extOfMime(out.mime)}`;
    const dirRel = posix.dirname(src.rel) === "." ? "" : posix.dirname(src.rel);
    const dirAbs = dirRel ? join(src.root, dirRel.split(posix.sep).join(sep)) : src.root;
    const name = freeName(dirAbs, want);
    const rel = dirRel ? `${dirRel}/${name}` : name;
    /* **走第二条写入口**（纪律①）：写前校验、v1 快照、能回退、changelog 记「谁改的」。
       裸 `writeFile` 的话这张图在版本历史里不存在，而「退回上一版」在它身上永远是空的。 */
    await writeAnyFile(proj, rel, out.bytes);

    const diags = out.real ? [] : [{
      level: "warning", code: "W_IMAGE_EDIT_FAKE",
      message: "走的是**假适配器**：没有调用任何模型，这张图是原图的副本",
      where: rel, at: { kind: "file", name },
      fix: "要真出图：set_image_edit_config provider=ark model=<方舟模型 id> apiKey=<方舟控制台「API Key 管理」里那把按量的>",
    } as never];
    return envelope({
      path: rel, from: src.rel, provider: out.provider, model: out.model, real: out.real,
      bytes: out.bytes.length, ...(out.note ? { note: out.note } : {}),
    }, diags, { real: out.real, bytes: out.bytes.length });
  }),
});
