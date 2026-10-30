/** 图像编辑（出效果图）回归（2026-10-30）。
 *
 *  **一条真网络请求都不发**，而两条路各自是真的：
 *  | 测什么 | 怎么不联网 |
 *  | --- | --- |
 *  | 能力这一层（路径三道闸 · 是不是图 · 落点与重名 · 走写入口 · 错误码） | `provider: "fake"` 打桩适配器 |
 *  | 方舟适配器这一层（请求形状 · 回包两种形状 · 对端拒 · 超时 · 上限） | **注入一个假 `fetch`** |
 *
 *  ⚠️ 临时状态目录 + 临时项目（`UMBRASTUDIO_STATE_DIR` / `UMBRASTUDIO_NO_GIT`
 *  **要在 import 核心之前设**）—— 这一套会写 `ai_config.json`，而真的那一份**是用户的密钥**。
 *  收尾第 ⑪ 节专门证明真的那一份一个字节没被碰（同 `prefstest` 从 `filetest` 分出来的理由）。
 *
 *  跑：`npm --prefix server run imageedittest`
 */
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, stat } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-imageedit-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "1";
await import("./cap/index.js");
const { allCaps } = await import("./cap/registry.js");
const { loadProject, TOOL_ROOT } = await import("./project.js");
const { hostCall } = await import("./plugin/host.js");
const { getAiConfig, setAiConfig } = await import("./ai_config.js");
const { editImage, IMAGE_IN_MAX } = await import("./imageedit/index.js");
const { arkEditor, ARK_DEFAULT_BASE } = await import("./imageedit/ark.js");
const { ImageEditError } = await import("./imageedit/types.js");
type FetchLike = import("./imageedit/types.js").FetchLike;

/** 真的那份配置（用户的密钥）在哪 —— 第 ⑪ 节要证明它没被碰。
 *  ⚠️ 用 `TOOL_ROOT` 不是 `process.cwd()`：npm 跑脚本时 cwd 是 `server/`，
 *  查错文件 = 一条**永远绿**的自检（`identitytest` 栽过这一条）。 */
const REAL_CFG = join(TOOL_ROOT, ".umbrastudio", "ai_config.json");
const realBefore = existsSync(REAL_CFG) ? statSync(REAL_CFG).mtimeMs : null;

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail: unknown = undefined) => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail === undefined ? "" : " — " + String(detail)}`); }
  else { fail++; console.log(`  ✗ ${what}${detail === undefined ? "" : " — " + String(detail)}`); }
};
const cap = (name: string) => { const c = allCaps().find((x) => x.name === name); if (!c) throw new Error(`没有能力 ${name}`); return c; };
type Env = { ok: boolean; data: Record<string, unknown> | null; errors?: Array<{ code: string; message: string; fix?: string }>; warnings?: Array<{ code: string; message: string }> };
const run = async (name: string, input: unknown, project: unknown = null): Promise<Env> =>
  await cap(name).run(input as never, { project, via: "mcp" } as never) as Env;

const cleanup = () => { try { rm(STATE, { recursive: true, force: true }); } catch { /* 尽力 */ } };
process.on("uncaughtException", (e) => {
  console.log(`\n✗ 抛出来了 —— 下面是紧急清理\n   ${String((e as Error)?.stack ?? e).split("\n").slice(0, 3).join("\n   ")}`);
  cleanup(); console.log("   · 紧急清理：临时目录已清"); process.exit(1);
});
process.on("unhandledRejection", (e) => { throw e instanceof Error ? e : new Error(String(e)); });

/** 一张真的 1×1 PNG（字节头是真的 —— 适配器按字节头认类型） */
const PNG1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAAMBAQAY3Y2wAAAAAElFTkSuQmCC", "base64");
const JPG1 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

const projDir = join(STATE, "proj");
const OUTSIDE = join(STATE, "外面");
await mkdir(join(projDir, "图"), { recursive: true });
await mkdir(join(projDir, ".git"), { recursive: true });
await mkdir(OUTSIDE, { recursive: true });
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "proj", title: "图像编辑回归" }));
await writeFile(join(projDir, "图", "视口.png"), PNG1);
await writeFile(join(projDir, "图", "说明.txt"), "我不是图");
await writeFile(join(projDir, ".git", "config"), "[core]\n");
await writeFile(join(OUTSIDE, "秘密.png"), PNG1);
await symlink(join(OUTSIDE, "秘密.png"), join(projDir, "图", "链.png"));
const project = await loadProject(projDir);

const deps = (fetchFn: FetchLike, over: { timeoutMs?: number; outMax?: number } = {}) =>
  ({ fetchFn, timeoutMs: over.timeoutMs ?? 5_000, outMax: over.outMax ?? 20 * 1048576 });
/** 一个假 `fetch`：按次给回包，并把每次的请求记下来。 */
function recorder(replies: Array<{ ok?: boolean; status?: number; body?: string; bytes?: Buffer }>) {
  const seen: Array<{ url: string; init: Record<string, unknown> }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    seen.push({ url, init: (init ?? {}) as Record<string, unknown> });
    const r = replies[seen.length - 1] ?? { ok: false, status: 500, body: "{}" };
    return {
      ok: r.ok ?? true, status: r.status ?? 200,
      headers: { get: () => null },
      text: async () => r.body ?? "",
      arrayBuffer: async () => (r.bytes ?? Buffer.alloc(0)),
    } as never;
  };
  return { fetchFn, seen };
}

console.log("\n① 还没配的时候（**不许偷偷走假的**）");
{
  const st = await run("image_edit_status", {});
  ok(st.data?.configured === false, "image_edit_status 说没配", st.data?.configured);
  ok(typeof st.data?.why === "string" && String(st.data.why).includes("set_image_edit_config"),
    "`why` 是一句能照着做的话（点名了那件能力）", String(st.data?.why ?? "").slice(0, 40));
  const r = await run("edit_image", { image: "图/视口.png", prompt: "改成黄昏效果图" }, project);
  ok(r.ok === false && r.errors?.[0]?.code === "E_IMAGE_EDIT_NOT_CONFIGURED", "出效果图被拒，码是「没配」", r.errors?.[0]?.code);
  ok(!existsSync(join(projDir, "图", "视口-效果图.png")) && !existsSync(join(projDir, "图", "视口-效果图（假适配器）.png")),
    "**盘上一个字节都没落** —— 没配不等于用假的");
}

console.log("\n② 配置是合并写的（issue #34 那个形状）");
{
  await setAiConfig({ channelA: { baseUrl: "https://a.example", apiKey: "ka", model: "ma" }, channelB: null,
    channelC: { baseUrl: "https://ark.example/api/plan/v1", apiKey: "k-ark", model: "mc" }, defaultChannel: "c" });
  const r = await run("set_image_edit_config", { provider: "fake", model: "m-fake" });
  ok(r.ok === true && r.data?.provider === "fake", "配上了", r.data?.provider);
  const cfg = await getAiConfig();
  ok(cfg.channelC?.apiKey === "k-ark" && cfg.channelA?.model === "ma" && cfg.defaultChannel === "c",
    "**三条会话通道与缺省通道一个都没被动**（手工拼整份就是这里出事的）");
  const r2 = await run("set_image_edit_config", { apiKey: "k-img" });
  ok((await getAiConfig()).imageEdit?.model === "m-fake", "只传 apiKey 时，同一条里没传的 model 原样保留", (await getAiConfig()).imageEdit?.model);
  ok(!JSON.stringify(r2).includes("k-img"), "**回包里不回显密钥**（回执会进会话记录）");
  const raw = await readFile(join(STATE, ".umbrastudio", "ai_config.json"), "utf8");
  ok(raw.includes("k-img"), "（样本有效性）密钥确实落在了本地配置文件里");
}

console.log("\n③ keyFrom=c：复用通道 C 那把，文件里不另存");
{
  await run("set_image_edit_config", { provider: "ark", model: "doubao-x", apiKey: "", keyFrom: "c" });
  const st = await run("image_edit_status", {});
  ok(st.data?.configured === true && st.data?.keySource === "通道 C（火山方舟）那把", "密钥取自通道 C", st.data?.keySource);
  const cfg = await getAiConfig();
  ok(!(cfg.imageEdit?.apiKey ?? ""), "配置文件里**没有**第二份密钥", JSON.stringify(cfg.imageEdit?.apiKey ?? ""));
  /* 通道 C 的密钥被清掉 → 明确报错，**不偷偷回落到 apiKey** */
  await setAiConfig({ ...cfg, channelC: { baseUrl: "https://ark.example", apiKey: "", model: "mc" } });
  const st2 = await run("image_edit_status", {});
  ok(st2.data?.configured === false && String(st2.data?.why ?? "").includes("通道 C"), "通道 C 没密钥时照实说，不静默回落", String(st2.data?.why ?? "").slice(0, 30));
  await setAiConfig({ ...(await getAiConfig()), channelC: { baseUrl: "https://ark.example", apiKey: "k-ark", model: "mc" } });
}

console.log("\n④ 假适配器：整条链路（打桩的意义就在这里）");
{
  await run("set_image_edit_config", { provider: "fake", model: "m-fake" });
  const before = await readFile(join(projDir, "图", "视口.png"));
  const r = await run("edit_image", { image: "图/视口.png", prompt: "改成黄昏时的室内效果图", strength: 0.4 }, project);
  ok(r.ok === true && r.data?.path === "图/视口-效果图（假适配器）.png", "成品落在源文件旁边，**名字里带「假适配器」**", r.data?.path);
  ok(r.data?.real === false, "`real: false` 一路带到回执上", r.data?.real);
  ok(!!r.warnings?.some((w) => w.code === "W_IMAGE_EDIT_FAKE"), "回执带一条「这是假的」告警", r.warnings?.[0]?.code);
  ok(String(r.data?.note ?? "").includes("strength=0.4"), "`strength` 这家用不上，**照实说**而不是悄悄忽略", String(r.data?.note ?? "").slice(0, 50));
  ok(existsSync(join(projDir, "图", "视口-效果图（假适配器）.png")), "盘上真有这个文件");
  ok(Buffer.compare(before, await readFile(join(projDir, "图", "视口.png"))) === 0, "**原图一个字节没动**");
  /* 走的是第二条写入口 → 该有一版快照（不然「退回上一版」在它身上永远是空的） */
  const snaps = join(STATE, ".umbrastudio", "records");
  const found = existsSync(snaps);
  ok(found, "走了写入口：状态目录里有记录（快照仓）", found);
  /* ⚠️ 这一条第一版是**红的，而且红错了**：它读的是 `data.versions`，而那件能力回的字段叫
     `snapshots`（`cap/files.ts`）。读一个不存在的字段永远是 `[]`，于是读数是「0 版」，
     而我差点据此去给产品加一次 `recordCreatedFile`（那会变成第二份快照）。
     > **判据要先确认自己读的那个字段真的存在** —— 不然它的红和绿都在说别的事。 */
  const v = await run("list_file_versions", { path: "图/视口-效果图（假适配器）.png" }, project);
  const snaps2 = (v.data as { snapshots?: Array<{ version: string; src: string }> })?.snapshots ?? [];
  ok(v.ok === true && snaps2.length >= 1 && /^s\d+$/.test(snaps2[0]?.version ?? ""),
    "**它有版本历史**（走裸 writeFile 的话这里是空的）", `${snaps2.length} 版 · ${snaps2[0]?.version ?? "-"}`);
}

console.log("\n⑤ 重名顺延，永不覆盖");
{
  const r = await run("edit_image", { image: "图/视口.png", prompt: "再来一张" }, project);
  ok(r.data?.path === "图/视口-效果图（假适配器） (1).png", "第二次顺延成 (1)", r.data?.path);
  ok(existsSync(join(projDir, "图", "视口-效果图（假适配器）.png")), "第一张还在（没被盖）");
}

console.log("\n⑥ 路径三道闸（和 convert 同一份实现）");
{
  const a = await run("edit_image", { image: "../外面/秘密.png", prompt: "x" }, project);
  ok(a.ok === false, "`../` 跨出项目：拒", a.errors?.[0]?.message?.slice(0, 30));
  const b = await run("edit_image", { image: "图/链.png", prompt: "x" }, project);
  ok(b.ok === false && String(b.errors?.[0]?.message ?? "").includes("项目外面"), "软链真身在项目外：拒", b.errors?.[0]?.message?.slice(0, 30));
  ok(!existsSync(join(OUTSIDE, "秘密-效果图（假适配器）.png")), "项目外面没多出任何文件");
  const c = await run("edit_image", { image: ".git/config", prompt: "x" }, project);
  ok(c.ok === false, "`.git/` 里的东西：拒", c.errors?.[0]?.message?.slice(0, 24));
  const d = await run("edit_image", { image: "图/没有这张.png", prompt: "x" }, project);
  ok(d.ok === false && d.errors?.[0]?.code === "E_DRAFT_NOT_FOUND", "不存在的文件：拒", d.errors?.[0]?.code);
}

console.log("\n⑦ 不是图 / 太大");
{
  const t = await run("edit_image", { image: "图/说明.txt", prompt: "x" }, project);
  ok(t.ok === false && String(t.errors?.[0]?.fix ?? "").includes("convert_file"), "`.txt` 拒，而且给出路（先转一张 png）", t.errors?.[0]?.message?.slice(0, 30));
  await writeFile(join(projDir, "图", "巨图.png"), Buffer.concat([PNG1, Buffer.alloc(IMAGE_IN_MAX)]));
  const big = await run("edit_image", { image: "图/巨图.png", prompt: "x" }, project);
  ok(big.ok === false && big.errors?.[0]?.code === "E_IMAGE_EDIT_TOO_BIG", "超过 10 MB：拒，码是「太大」", big.errors?.[0]?.code);
  await rm(join(projDir, "图", "巨图.png"));
}

console.log("\n⑧ 方舟适配器：请求形状（注入假 fetch，一条真网络都没有）");
{
  const okBody = JSON.stringify({ data: [{ b64_json: JPG1.toString("base64") }] });
  const rec = recorder([{ body: okBody }]);
  const out = await arkEditor.edit({ bytes: PNG1, mime: "image/png", prompt: "黄昏效果图", strength: 0.3 },
    { apiKey: "k-ark", model: "doubao-x" }, deps(rec.fetchFn));
  const req = rec.seen[0]!;
  const body = JSON.parse(String(req.init.body)) as Record<string, unknown>;
  ok(req.url === `${ARK_DEFAULT_BASE}/images/generations`, "端点留空时用方舟默认地址", req.url);
  ok((req.init.headers as Record<string, string>).Authorization === "Bearer k-ark", "密钥走 Authorization 头");
  ok(body.model === "doubao-x" && body.prompt === "黄昏效果图", "model / prompt 原样带过去");
  ok(String(body.image).startsWith("data:image/png;base64,"), "原图按 data URL 递过去", String(body.image).slice(0, 26));
  ok(body.watermark === false, "**水印关掉**（带水印的效果图没法给客户看）");
  ok(body.size === undefined, "没配 size 就不发这个字段（少一个对端可能不认的键）");
  ok(out.real === true && Buffer.compare(out.bytes, JPG1) === 0 && out.mime === "image/jpeg",
    "回包 b64_json 认得，而且**按字节头认出是 jpeg**（不是照扩展名瞎写 png）", out.mime);
  ok(String(out.note ?? "").includes("没用上"), "这家没有 strength，照实说", out.note);
}

console.log("\n⑨ 方舟适配器：回包的另一种形状与四种失败");
{
  /* 只给 URL 那一支：跟着下载 */
  const rec = recorder([{ body: JSON.stringify({ data: [{ url: "https://cdn.example/a.png" }] }) }, { bytes: PNG1 }]);
  const out = await arkEditor.edit({ bytes: PNG1, mime: "image/png", prompt: "x" }, { apiKey: "k", model: "m" }, deps(rec.fetchFn));
  ok(rec.seen.length === 2 && rec.seen[1]!.url === "https://cdn.example/a.png" && Buffer.compare(out.bytes, PNG1) === 0,
    "对端只给 URL 时跟着下载（**两样都认**）", rec.seen.length);

  /* 对端拒：原话要在错误里 */
  const r2 = recorder([{ ok: false, status: 400, body: JSON.stringify({ error: { message: "The model doubao-x does not exist" } }) }]);
  let caught: unknown = null;
  try { await arkEditor.edit({ bytes: PNG1, mime: "image/png", prompt: "x" }, { apiKey: "k", model: "doubao-x" }, deps(r2.fetchFn)); }
  catch (e) { caught = e; }
  ok(caught instanceof ImageEditError && (caught as InstanceType<typeof ImageEditError>).kind === "remote"
    && (caught as Error).message.includes("does not exist"),
    "对端 400：kind=remote，而且**对端那句原话原样带着**", (caught as Error)?.message?.slice(0, 44));

  /* 回包不是图片字节 → 拒，不默认当 png */
  const r3 = recorder([{ body: JSON.stringify({ data: [{ b64_json: Buffer.from("<html>错误页</html>").toString("base64") }] }) }]);
  caught = null;
  try { await arkEditor.edit({ bytes: PNG1, mime: "image/png", prompt: "x" }, { apiKey: "k", model: "m" }, deps(r3.fetchFn)); }
  catch (e) { caught = e; }
  ok(caught instanceof ImageEditError, "回包不是认得的图片格式：拒（**不默认写成 .png**）", (caught as Error)?.message?.slice(0, 30));

  /* 回包超上限 */
  const r4 = recorder([{ body: JSON.stringify({ data: [{ b64_json: Buffer.concat([PNG1, Buffer.alloc(2048)]).toString("base64") }] }) }]);
  caught = null;
  try { await arkEditor.edit({ bytes: PNG1, mime: "image/png", prompt: "x" }, { apiKey: "k", model: "m" }, deps(r4.fetchFn, { outMax: 512 })); }
  catch (e) { caught = e; }
  ok(caught instanceof ImageEditError && (caught as InstanceType<typeof ImageEditError>).kind === "too_big", "回包超上限：kind=too_big", (caught as Error)?.message?.slice(0, 30));

  /* 超时：假 fetch 一直不回，等 abort */
  const hang: FetchLike = (_u, init) => new Promise((_res, rej) => {
    init?.signal?.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
  });
  caught = null;
  try { await arkEditor.edit({ bytes: PNG1, mime: "image/png", prompt: "x" }, { apiKey: "k", model: "m" }, deps(hang, { timeoutMs: 120 })); }
  catch (e) { caught = e; }
  ok(caught instanceof ImageEditError && (caught as InstanceType<typeof ImageEditError>).kind === "timeout",
    "**超时真的会到**（没有超时的网络调用会把一轮会话永久挂住）", (caught as Error)?.message?.slice(0, 24));
}

console.log("\n⑩ 换一家只改一行：`editImage` 按 provider 选适配器");
{
  await run("set_image_edit_config", { provider: "ark", model: "doubao-x", keyFrom: "c" });
  const rec = recorder([{ body: JSON.stringify({ data: [{ b64_json: PNG1.toString("base64") }] }) }]);
  const out = await editImage({ bytes: PNG1, mime: "image/png", prompt: "x" }, { fetchFn: rec.fetchFn, timeoutMs: 3000 });
  ok(out.provider === "ark" && out.real === true, "配 ark 就走 ark，`real: true`", out.provider);
  ok((rec.seen[0]!.init.headers as Record<string, string>).Authorization === "Bearer k-ark",
    "**用的是通道 C 那把密钥**（keyFrom 这条路真的通到了请求头）");
  await run("set_image_edit_config", { provider: "fake" });
  const out2 = await editImage({ bytes: PNG1, mime: "image/png", prompt: "x" });
  ok(out2.provider === "fake" && out2.real === false, "配 fake 就走 fake，一个请求都不发", out2.provider);
}

console.log("\n⑪ 插件那条路（白名单四道关）");
{
  const mk = (files: string[]) => ({ manifest: { id: "com.umbra.imgtest", name: "t", version: "1.0.0", hostApi: "^1", surfaces: ["ui"], permissions: { files, scope: "project" } } as never, project });
  const ro = await hostCall(mk(["read"]), "image.edit", { image: "图/视口.png", prompt: "x" });
  ok(ro.ok === false && String(ro.errors?.[0]?.message ?? "").includes('files:"write"'), "只声明了 read 的插件调 image.edit：拒", ro.errors?.[0]?.message?.slice(0, 40));
  const st = await hostCall(mk(["read"]), "image.status", {});
  ok(st.ok === true, "`image.status` 只要 read（面板要先说「还没配」）", st.ok);
  const rw = await hostCall(mk(["read", "write"]), "image.edit", { image: "图/视口.png", prompt: "插件出的图" });
  ok(rw.ok === true && String((rw.data as { path?: string })?.path ?? "").startsWith("图/视口-效果图"), "声明了 write 就能调，成品照同一套规矩", (rw.data as { path?: string })?.path);
  const nope = await hostCall(mk(["read", "write"]), "image.generate", {});
  ok(nope.ok === false && String(nope.errors?.[0]?.message ?? "").includes("调不到"), "没列进白名单的名字一律调不到（白名单不是黑名单）");
}

console.log("\n⑫ 收尾：真的那份配置（用户的密钥）一个字节没碰");
{
  const after = existsSync(REAL_CFG) ? statSync(REAL_CFG).mtimeMs : null;
  ok(after === realBefore, "真 `ai_config.json` 的 mtime 没变", `${realBefore} → ${after}`);
  const st = await stat(join(STATE, ".umbrastudio", "ai_config.json"));
  ok(st.size > 0, "（样本有效性）这一轮确实写过配置，只是写在临时目录里", `${st.size} 字节`);
}

/** ⚠️ **总数本身也是一条判据**（本仓库栽过两次：加了判据而总数只多了一条 = 有一节静默没跑）。
 *  只拦变少、不拦变多。 */
const EXPECT_AT_LEAST = 38;
cleanup();
const short = pass + fail < EXPECT_AT_LEAST;
console.log(`\n${fail || short ? "✗" : "✓"} 图像编辑 ${pass}/${pass + fail}${fail ? ` —— ${fail} 条红` : ""}${short ? `（**少跑了**：至少该有 ${EXPECT_AT_LEAST} 条）` : ""}`);
process.exit(fail || short ? 1 : 0);
