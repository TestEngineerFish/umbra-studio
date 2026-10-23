/** **「没装任何插件时，这个产品还剩什么」的回归**（M16-1，`doc/26` §五，决策 `doc/11` Q79–Q83）。
 *
 *  ⚠️ **为什么单独一套**：sam 2026-10-23 定的产品边界是
 *  「应用只带最基础的查看能力：任何文本都按纯文本展开，图片能显示就显示，其他一律插件」，
 *  而 **Q81 定了出厂什么插件都不带** —— 于是「没装任何插件」从一个边角状态
 *  变成了**每个用户第一次打开时的状态**。
 *
 *  ⚠️⚠️ **这件事今天一条判据都没有，而原因不是没人想到**：
 *  `BUNDLED_DIR = join(TOOL_ROOT, "plugins")`，而 `TOOL_ROOT` 是从 `server/dist/`
 *  往上**硬算**两级 —— **那个状态压根造不出来**，除非真去动仓库里的 `plugins/`。
 *  > **要测「没有 X 的时候会怎样」，先得有办法造出「没有 X」。**
 *  > 可注入性决定了可判据性：`STATE_ROOT` 有 `UMBRASTUDIO_STATE_DIR`，
 *  > 公钥有 `UMBRASTUDIO_PUBKEY`，**凡是有注入点的东西判据都齐**。
 *  所以 M16-1 顺带给 `BUNDLED_DIR` 加了注入点（删除条件写在 `store.ts` 那段注释里）。
 *
 *  这一套还装着 **Q80**（图片编辑搬成插件）的宿主侧那条路：
 *  插件用 `read_file`(base64) 拿原图字节 → 自己 canvas 裁 → `write_file`(base64) 写回。
 *  geek-99 定的路线不开 same-origin、不开新的像素通道，核查结果是**两条都通**，
 *  而**写那一条一条判据都没有**（`gaptest` 那条 base64 写是 `asHuman` 走的），
 *  并且核的过程中挖出**三条真缺陷**（全在这一套里钉着，见 ⑤⑥⑦）。
 *
 *  全程临时项目 + 临时 `STATE_ROOT` + 临时空 `BUNDLED_DIR`，**一个字节都不碰用户的东西**。
 *  用法：`npm --prefix server run plaintest`
 */
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-plaintest-")));
const EMPTY_BUNDLED = join(STATE, "没有插件");
await mkdir(EMPTY_BUNDLED, { recursive: true });
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_BUNDLED_DIR = EMPTY_BUNDLED;
process.env.UMBRASTUDIO_NO_GIT = "1";

await import("./cap/index.js");
const { allCaps } = await import("./cap/registry.js");
const { loadProject, buildProject } = await import("./project.js");
const { kindOf } = await import("./shared/kinds.js");
const { appIdentityName } = await import("./shared/brand.js");
const { listInstalled, BUNDLED_DIR } = await import("./plugin/store.js");
const { hostCall } = await import("./plugin/host.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const cap = (name: string) => {
  const c = allCaps().find((x) => x.name === name);
  if (!c) throw new Error(`没有能力 ${name}`);
  return c;
};

/** ⚠️ 样本名**不含**这一套会去搜的任何词（上一轮的教训：
 *  判据的样本名不该包含任何判据会去搜的词 —— 那会让样本自己命中搜索）。 */
const SAMPLES: Record<string, string> = {
  "甲.md":      "# 一级标题\n\n一段话，带 **加重**。\n",
  "乙.json":    '{\n  "键": 1\n}\n',
  "丙.html":    "<!doctype html><h1>一行</h1>\n",
  "丁.ts":      "export const 数 = 1;\n",
  "戊.txt":     "就一行\n",
  "己.log":     "2026-10-23 起\n",
  "庚.zzz":     "谁也不认识这个扩展名，但里面是文本\n",
  "辛.dc.html": "<!doctype html><x-dc><h1>一张</h1></x-dc>\n",
};
/** 一小段真 PNG 的头 —— 用来验「二进制不给正文」和 Q80 那条路 */
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

console.log("没装任何插件时这个产品还剩什么（M16-1 · Q79–Q83）");

/* ══════════ ① 前提：现在真的没有任何插件 ══════════
   ⚠️ **前提要写进断言本身**（§163.4）。不先钉住这一条，下面每一条测的都是
   「今天恰好没事」——而这一套的全部意义就在于那个前提成立。 */
console.log("\n① 前提：把「没装任何插件」这个状态造出来");
ok(BUNDLED_DIR === EMPTY_BUNDLED, "`BUNDLED_DIR` 的注入点生效了（否则下面全在测别的东西）", BUNDLED_DIR);
const installed = await listInstalled();
ok(installed.length === 0, "**一个插件都没有**", installed.length ? installed.map((x) => x.manifest.id).join(" · ") : "0 个");
ok((await readdir(EMPTY_BUNDLED)).length === 0, "而那个目录本身是空的（不是「扫到了但没认出来」）");

/* ══════════ ② 那句承诺：任何文本都给正文 ══════════ */
const projDir = join(STATE, "有project的");
const plainDir = join(STATE, "随手的目录");
for (const d of [projDir, plainDir]) {
  await mkdir(d, { recursive: true });
  for (const [n, c] of Object.entries(SAMPLES)) await writeFile(join(d, n), c, "utf8");
  await writeFile(join(d, "壬.png"), PNG);
}
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "有project的", title: "判据用" }));

const proj = await loadProject(projDir);
/* ⚠️ 普通目录走 `buildProject` —— `loadProject` 要 `project.json`（M14-4 B3 之后两条路分开了）。
   **而「打开一个随手的目录看一份 .md」正是 Q81 之后最常见的那条路**，所以两条都要测：
   只测设计项目的话，测的是一条用户多半走不到的路。 */
const plain = await buildProject(plainDir);

for (const [label, p] of [["设计项目", proj], ["普通目录（没有 project.json）", plain]] as const) {
  console.log(`\n② ${label}：没装插件时，每一种文本都给得出正文`);
  for (const [n, want] of Object.entries(SAMPLES)) {
    const r = await cap("read_file").run({ path: n } as never, { project: p, via: "http" });
    const d = (r.data ?? {}) as { content?: string | null; why?: string };
    ok(r.ok && d.content === want,
      `\`${n}\`（kind=${kindOf(n)}）**正文一个字不少**`,
      r.ok ? (d.content === want ? `${want.length} 字` : `对不上：${JSON.stringify(String(d.content).slice(0, 20))}`)
           : (d.why ?? r.errors?.[0]?.message ?? "读不出来"));
  }
  /* ⚠️ **反面**：二进制不给正文。
     少了这一条，上面那八条可能只是因为「它对什么都给正文」—— 那是另一个缺陷，
     而两者在读数里长得一样（§142.4 那一族）。 */
  const rb = await cap("read_file").run({ path: "壬.png" } as never, { project: p, via: "http" });
  const db = (rb.data ?? {}) as { content?: string | null; why?: string };
  ok(db.content === null && /不是文本/.test(db.why ?? ""),
    "**而二进制不给正文**（否则上面那八条可能只是「它对什么都给正文」）", db.why ?? JSON.stringify(db.content).slice(0, 24));
}

/* ══════════ ③ Q80：插件读原图 → 裁 → 写回 ══════════
   geek-99 定的路线：不开 same-origin、不开新的像素通道，
   插件用白名单里现成的 `read_file`(base64) 拿字节，自己 canvas 解码裁剪，`write_file`(base64) 写回。 */
console.log("\n③ Q80 图片编辑搬成插件：那条路通不通（整条端到端）");
const mf = {
  id: "com.判据.图片", name: "判据用的假插件", version: "1.0.0",
  permissions: { files: ["read", "write"], scope: "project" },
} as never;
const asPlugin = { manifest: mf, project: proj } as never;
const asPluginPlain = { manifest: mf, project: plain } as never;

await writeFile(join(projDir, "癸.png"), PNG);
const rd = await hostCall(asPlugin, "read_file", { path: "癸.png" });
const dd = (rd.data ?? {}) as { content?: null; encoding?: string; base64?: string; sha256?: string };
const bytes = dd.base64 ? Buffer.from(dd.base64, "base64") : Buffer.alloc(0);
ok(rd.ok && dd.content === null && dd.encoding === "base64" && bytes.equals(PNG),
  "**插件经 hostCall 读原图：拿到原样字节**（这是「自己 canvas 解码」的前提）", `${bytes.length}/${PNG.length} 字节`);
/* ⚠️ 覆盖原图要 `expectSha256`，而**范围读不给 sha256** —— 所以要覆盖就必须整份读。
   这一条写进插件文档，不然插件作者会拿范围读的回包去覆盖，然后发现没凭据可给。 */
ok(typeof dd.sha256 === "string" && dd.sha256.length === 64,
  "**整份读给 sha256**（覆盖原图要它；范围读不给，所以要覆盖就得整份读）", dd.sha256?.slice(0, 12));

const cropped = Buffer.concat([PNG, Buffer.from("裁过了")]);   // 假装裁了一刀
const wOver = await hostCall(asPlugin, "write_file",
  { path: "癸.png", content: cropped.toString("base64"), encoding: "base64", expectSha256: dd.sha256 });
ok(wOver.ok, "**覆盖原图写得进去**", wOver.ok ? "" : JSON.stringify(wOver.errors?.[0]?.message));
const onDisk = await readFile(join(projDir, "癸.png"));
ok(onDisk.equals(cropped), "**盘上真的是裁过的那些字节**（不是「回执说成了而内容没变」）", `${onDisk.length} 字节`);
/* 覆盖走的是第二条写入口，所以它**自动**有快照与回退 —— 插件不用自己管历史 */
const vers = await cap("list_file_versions").run({ path: "癸.png" } as never, { project: proj, via: "http" });
/* ⚠️ 字段叫 `snapshots` 不是 `versions` —— 第一版我凭记忆写了 `versions`，
   于是量到 0 版、报了一条**假红**（产品是对的）。§172.7 的反面：
   > **判据测的那个东西，和产品实际用的那个东西，要是同一个。** */
const nv = ((vers.data ?? {}) as { snapshots?: unknown[] }).snapshots?.length ?? 0;
ok(nv >= 1, "**覆盖留下了快照**（走第二条写入口 = 自动有历史与回退，插件不用自己管）", `${nv} 版`);

const wNew = await hostCall(asPlugin, "write_file",
  { path: "癸-另存.png", content: cropped.toString("base64"), encoding: "base64", expectSha256: "0" });
ok(wNew.ok, "**另存一份也写得进去**", wNew.ok ? "" : JSON.stringify(wNew.errors?.[0]?.message));

/* ⚠️ 并发闸：拿**过期的** sha256 再覆盖一次要被拒。
   少了这一条，「覆盖能写」这件事可能是因为**写前校验压根没生效**（§161.5 那一族：
   读数完全符合预期，而拒的是另一道闸 / 根本没拒）。 */
const wStale = await hostCall(asPlugin, "write_file",
  { path: "癸.png", content: cropped.toString("base64"), encoding: "base64", expectSha256: dd.sha256 });
ok(!wStale.ok && /被改过/.test(wStale.errors?.[0]?.message ?? ""),
  "**拿过期的 sha256 再覆盖被拒**（否则「能写」可能只是写前校验没生效）",
  (wStale.errors?.[0]?.message ?? "居然让它写了").slice(0, 30));

/* ══════════ ④ 真缺陷一：`encoding` 的白名单 ══════════
   ⚠️ **插件这条路不跑 zod**（`hostCall` 最后一行是 `cap.run(input as never, …)`），
   于是 `write_file` 的 `encoding: z.enum(["utf8","base64"])` 对插件**形同不存在**，
   而原来的实现是 `if (encoding !== "base64") return content` ——
   **插件给一个拼错的 encoding 会被静默当 utf8 文本写进去：一张花掉的图片，而回执说写成功。**
   > **「写坏了」和「没写」长得完全不一样，而前者更难发现**（#108 自己记着的那条）。 */
console.log("\n④ 真缺陷一：拼错的 `encoding` 要当场拒，不能静默当 utf8");
/* ⚠️ 文件名用**序号**，不用 `encoding` 的字面值。
   第一版写的是 `子-${String(enc)}.png` —— 而 macOS 文件系统**默认大小写不敏感**，
   于是 `"base64"` 和 `"BASE64"` 落到**同一个文件**上：第二次写带 `expectSha256: "0"`
   （期望新建）撞上「文件已存在」，被**写前校验**拒掉。
   结果是那一条**在缺陷存在时照样「通过」**，而通过的原因完全不是它声称的那个 ——
   反向验证才抓到（装回缺陷后它是唯一没红的一条）。
   > **撞在别的机制上**（§142.4）：正向跑时它是绿的、读数是对的、理由是错的。
   > **判据的绿和红都要追问「它还可能因为什么原因这么说」。** */
let encN = 0;
for (const [enc, want] of [["base64", true], ["utf8", true], [undefined, true],
                           ["BASE64", false], ["b64", false], ["gbk", false], [0, false], [null, false]] as const) {
  const r = await hostCall(asPlugin, "write_file",
    { path: `子${++encN}.png`, content: PNG.toString("base64"), encoding: enc, expectSha256: "0" });
  ok(r.ok === want,
    `encoding = ${JSON.stringify(enc)} → ${want ? "写得进去" : "**拒**"}`,
    r.ok ? "" : (r.errors?.[0]?.message ?? "").slice(0, 26));
}
/* ⚠️ 判准要是**白名单**（列出认的）而不是黑名单（列出不认的）：
   黑名单的话「以后多一种 encoding」会被静默当 utf8，而**没有判据会红**（M14-3 那条）。
   钉法：拒因里要出现那个值本身，说明它是被「认不出」拒的，不是撞上别的闸。 */
const rBad = await hostCall(asPlugin, "write_file",
  { path: "丑.png", content: PNG.toString("base64"), encoding: "BASE64" as never, expectSha256: "0" });
ok(/认不出的 encoding/.test(rBad.errors?.[0]?.message ?? "") && /BASE64/.test(rBad.errors?.[0]?.message ?? ""),
  "**拒因里带上那个值本身**（说明是「认不出」拒的，不是撞上别的闸）", (rBad.errors?.[0]?.message ?? "").slice(0, 34));
/* ⚠️ **反面**：拒的时候一个字节都没写。
   「拒了」和「拒了但已经写了一半」在回执里长得一样，而后者就是静默损坏。 */
let wroteAnyway = true;
try { await stat(join(projDir, "丑.png")); } catch { wroteAnyway = false; }
ok(!wroteAnyway, "**而且拒的时候一个字节都没写**（「拒了」和「拒了但写了一半」在回执里长得一样）");

/* ══════════ ⑤ 真缺陷二：`ToolError` 要原样传给插件 ══════════
   ⚠️ 原来 `hostCall` 的 catch 一律 `err(X.IO, …, e.message)`，把 `e.diagnostic` 整个丢掉 ——
   而它装着 `code`（具体错误码）、`locator` 和 `fix`（出路）。
   两层后果，第二层更糟：① 错误码一律降级成 `E_IO`，**插件没法按错误码分支**；
   ② **`fix` 丢了，插件没法把出路转述给用户**。
   > **一个 catch 重新包装异常的时候，它决定了下游还能知道多少。**
   > 这里的下游是插件，插件的下游是用户。 */
console.log("\n⑤ 真缺陷二：插件被拒时，拿得到错误码和出路");
const rPlain = await hostCall(asPluginPlain, "write_file",
  { path: "寅.png", content: PNG.toString("base64"), encoding: "base64", expectSha256: "0" });
const e0 = rPlain.errors?.[0];
ok(!rPlain.ok, "普通目录里插件写文件被拒（B3 那道闸）", (e0?.message ?? "").slice(0, 24));
ok(e0?.code !== "E_IO",
  "**错误码不是被降级成 `E_IO` 的那个**（降级了插件就没法按码分支：「不让写」和「磁盘满了」会长得一样）", String(e0?.code));
ok(typeof e0?.fix === "string" && e0.fix.length > 0,
  "**出路跟着传过来了**（那道闸在界面上有出路 —— 插件要能把它转述给用户）", (e0?.fix ?? "（空的）").slice(0, 40));
/* ⚠️ 这一条顺带钉住一件产品事实：解锁**不需要**接管整个目录（那要写约 750 KB）——
   M14-7 做的是「只读 → 可编辑 → 接管」**三段**，而写文件只要中间那一段。
   出路里要说的是那一段，不是接管。 */
ok(/开始编辑/.test(e0?.fix ?? ""),
  "**而出路指的是「开始编辑」那一段，不是「接管」**（接管要写约 750 KB，和「改一个文件」不成比例）",
  (e0?.fix ?? "").slice(0, 30));

/* ══════════ ⑥ 收尾：自己造的东西自己清，真实的东西没碰 ══════════ */
console.log("\n⑥ 收尾");
/* ⚠️ 这个名字**读常量**，不硬写 —— 第一版硬写了 `"Umbra Studio"`，
   被 `captest` 那道品牌闸当场抓到（而那个值是**对的**：userData 目录就叫它，
   因为 `productName` / `appId` 是冻结的身份）。
   > **闸抓的不是值错，是来源错。** 一个「值对了但硬写着」的串下次改名照样过期。 */
const realState = process.env.HOME ? join(process.env.HOME, "Library", "Application Support", appIdentityName) : null;
let touchedReal = false;
if (realState) { try { await stat(join(realState, ".umbrastudio", "寅.png")); touchedReal = true; } catch { /* 没碰，对 */ } }
ok(!touchedReal, "真的状态目录里没有这一套的样本");
await rm(STATE, { recursive: true, force: true });
let gone = false;
try { await stat(STATE); } catch { gone = true; }
ok(gone, "临时目录清掉了", STATE);

console.log(`\n${fail === 0 ? "✓" : "✗"} plaintest：${pass} 过 / ${fail} 不过`);
process.exit(fail === 0 ? 0 : 1);
