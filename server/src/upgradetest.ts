/** 内置插件被市场升级的回归（S4 §3，`plugin/builtin_upgrade.ts`）。
 *
 *  原来「覆盖内置」是 M11-6 五路攻击里的一道：包的 id 是内置插件 → 一律拒。S4 改成三条全满足才放行
 *  （验签 · 版本严格更高 · 不多认领内置类型），并且加载时再判一遍、能退回出厂版本。这里钉：
 *  ① 纯函数：版本比较 · 准入规则 · 加载选哪份 · planAcquire 的「内置可更新」
 *  ② 原来那道攻击闸改成的两种情形：**版本不高于出厂**（同版 / 旧版）与**未签名且非 dev 模式** —— 仍然拒
 *  ③ 正向：签过名的更高版本能装上 → 生效（列表 / 静态目录 / 类型认领 / B 面动词都换成升级那份）→ 能退回
 *  ④ 绕过安装流程拷进来的升级目录：非 dev 模式不顶替出厂版（否则拷一份就能白拿「认领 md」的特权）
 *
 *  全程临时状态目录 + 临时钥匙（`UMBRASTUDIO_STATE_DIR` / `UMBRASTUDIO_PUBKEY`，**要在 import 核心模块之前设**）。
 *  出厂那份用 TOOL_ROOT 里真的 `com.umbra.markdown`（`sync-plugins` 拉来的）—— 只读它，不改它。
 *  跑：`npm --prefix server run upgradetest` */
import { mkdtemp, mkdir, cp, writeFile, rm, realpath, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign as edSign } from "node:crypto";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-upgradetest-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
const KEYS = await mkdtemp(join(tmpdir(), "umbra-upgradekeys-"));
const pub = join(KEYS, "publisher.pub");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
await writeFile(pub, publicKey.export({ type: "spki", format: "pem" }));
process.env.UMBRASTUDIO_PUBKEY = pub;
delete process.env.UMBRASTUDIO_PLUGIN_DEV;

const { compareVersion } = await import("./plugin/version.js");
const { builtinUpgradeRefusal, pickBuiltin, builtinClaims } = await import("./plugin/builtin_upgrade.js");
const { planAcquire } = await import("./plugin/acquire.js");
const { packDir, canonical } = await import("./plugin/pack.js");
const { installPackage } = await import("./plugin/install.js");
const { listInstalled, pluginDirOf, registerPluginKinds, BUNDLED_DIR, PLUGINS_DIR } = await import("./plugin/store.js");
const { allVerbs, stopAllVerbSandboxes } = await import("./plugin/verbs.js");
const { STATE_ROOT } = await import("./project.js");
const { isBuiltinKind } = await import("./shared/kinds.js");
await import("./cap/index.js");
const { allCaps } = await import("./cap/registry.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const ID = "com.umbra.markdown";

console.log("内置插件被市场升级（S4 §3）");
ok(STATE_ROOT === STATE, "状态目录是临时的（没碰用户的插件目录）", STATE_ROOT);

/* ── ① 纯函数 ── */
console.log("\n ① 纯函数");
ok(compareVersion("1.10.0", "1.9.0") > 0, "1.10.0 > 1.9.0（字典序会判反）");
ok(compareVersion("1.2", "1.2.0") === 0 && compareVersion("1.0.0", "1.0.0-beta") > 0 && compareVersion("1.0.0-beta.2", "1.0.0-beta.10") < 0,
  "缺段当 0 · 正式版高于预发布 · 预发布按段比数字");
const fac = { version: "1.0.0", kinds: [{ id: "md", label: "", ext: [".md"] }] } as never;
const isB = (k: string) => isBuiltinKind(k);
ok(builtinUpgradeRefusal({ id: ID, version: "1.0.0", kinds: [] } as never, fac, isB).includes("不比它高"), "同版本 → 拒");
ok(builtinUpgradeRefusal({ id: ID, version: "0.9.9", kinds: [] } as never, fac, isB).includes("不比它高"), "旧版本 → 拒");
ok(builtinUpgradeRefusal({ id: ID, version: "1.0.1", kinds: [{ id: "md", label: "", ext: [".md"] }] } as never, fac, isB) === "", "更高版本、认领相同 → 放行");
ok(builtinUpgradeRefusal({ id: ID, version: "1.0.1", kinds: [{ id: "md", label: "", ext: [".md"] }, { id: "html", label: "", ext: [] }] } as never, fac, isB).includes("多认领了内置类型 html"),
  "**更高版本但多认领了内置类型 → 拒**（升级不能顺便多抢）");
ok(builtinUpgradeRefusal({ id: ID, version: "1.0.1", kinds: [{ id: "md", label: "", ext: [".md"] }, { id: "mdx", label: "MDX", ext: [".mdx"] }] } as never, fac, isB) === "",
  "更高版本、多定义一种**新**类型 → 放行（第三方本来就能定义新类型，不是特权）");
ok(builtinUpgradeRefusal({ id: ID, version: "1.0.1", kinds: [] } as never, fac, isB) === "", "认领变少 → 放行（子集）");
ok(builtinClaims({ kinds: [{ id: "dc", label: "", ext: [] }] } as never, isB).join() === "dc" &&
   builtinUpgradeRefusal({ id: ID, version: "2.0.0", kinds: [{ id: "dc", label: "", ext: [] }] } as never, fac, isB).includes("dc"),
  "想借升级去认领设计稿 dc → 拒");
const up101 = { id: ID, version: "1.0.1", kinds: [{ id: "md", label: "", ext: [".md"] }] } as never;
ok(pickBuiltin({ factory: fac, upgrade: up101, upgradeProblems: 0, upgradeSigned: true, dev: false, isBuiltin: isB }).use === "upgrade", "加载：签名过 + 更高 → 用升级版");
ok(pickBuiltin({ factory: fac, upgrade: up101, upgradeProblems: 0, upgradeSigned: false, dev: false, isBuiltin: isB }).use === "factory", "加载：没签名且非 dev → 用出厂版");
ok(pickBuiltin({ factory: fac, upgrade: up101, upgradeProblems: 0, upgradeSigned: false, dev: true, isBuiltin: isB }).use === "upgrade", "加载：dev 模式未签名 → 用升级版（界面标未签名）");
ok(pickBuiltin({ factory: fac, upgrade: up101, upgradeProblems: 1, upgradeSigned: true, dev: false, isBuiltin: isB }).use === "factory", "加载：升级那份清单有毛病 → 用出厂版");
ok(pickBuiltin({ factory: { version: "1.1.0", kinds: [] } as never, upgrade: up101, upgradeProblems: 0, upgradeSigned: true, dev: false, isBuiltin: isB }).use === "factory",
  "加载：出厂版后来比升级版还新（Studio 自己更新了）→ 用出厂版");
const pa = (o: Partial<Parameters<typeof planAcquire>[0]>) => planAcquire({ signedIn: false, builtin: true, installed: true, entitled: false, gift: false, price: 0, ...o });
ok(pa({ update: true, packageUrl: "https://x/p/com.umbra.markdown/package" }).install === true && pa({ update: true, packageUrl: "https://x/p" }).refuse === "",
  "planAcquire：内置可更新 + https 包 → 直接装，不要登录");
ok(pa({ update: true }).refuse.includes("还没放安装包") && pa({ update: false, packageUrl: "https://x/p" }).refuse.includes("不用买也不用装"),
  "planAcquire：可更新但没包 → 照实说；没新版本 → 照旧拒");

/* ── 夹具：用出厂那份 markdown 打包，改版本 / 认领 / B 面标题 ── */
const FACTORY_DIR = pluginDirOf(ID);
ok(!!FACTORY_DIR && FACTORY_DIR.startsWith(BUNDLED_DIR), "出厂那份在 TOOL_ROOT（sync-plugins 拉来的）", FACTORY_DIR ?? "没有 —— 先跑 sync-plugins");
if (!FACTORY_DIR) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
const factoryVersion = JSON.parse(await readFile(join(FACTORY_DIR, "manifest.json"), "utf8")).version as string;
const MARK = "（升级版标记）";

/** 从出厂目录打一个包：版本 / 额外 kinds / 给 outline 的标题打标记，签不签由 `signed` 定。 */
async function makePkg(version: string, opts: { signed: boolean; extraKinds?: unknown[] } ) {
  const work = await mkdtemp(join(tmpdir(), "umbra-upgradepkg-"));
  await cp(FACTORY_DIR!, work, { recursive: true });
  await rm(join(work, ".sig"), { force: true });
  const mf = JSON.parse(await readFile(join(work, "manifest.json"), "utf8"));
  mf.version = version;
  if (opts.extraKinds) mf.kinds = [...mf.kinds, ...opts.extraKinds];
  await writeFile(join(work, "manifest.json"), JSON.stringify(mf, null, 2));
  const tools = await readFile(join(work, "tools.mjs"), "utf8");
  await writeFile(join(work, "tools.mjs"), tools.replace('title: "列出一份 Markdown 的章节"', `title: "列出一份 Markdown 的章节${MARK}"`));
  const pkg = await packDir(work);
  if (opts.signed) pkg.signature = edSign(null, canonical(pkg), privateKey).toString("base64");
  await rm(work, { recursive: true, force: true });
  return pkg;
}
const tryInstall = async (p: Awaited<ReturnType<typeof makePkg>>) => { try { await installPackage(p); return ""; } catch (e) { return (e as Error).message; } };
const higher = factoryVersion.replace(/(\d+)$/, (n) => String(Number(n) + 1));
const outlineTitle = async () => (await allVerbs()).find((v) => v.plugin === ID && v.cap.endsWith(".outline"))?.title ?? "";

/* ── ② 原来那道攻击闸，改成的两种情形 ── */
console.log("\n ② 仍然拒的（原「覆盖内置」那道闸）");
const e1 = await tryInstall(await makePkg(factoryVersion, { signed: true }));
ok(e1.includes("不比它高"), `**签过名、但版本等于出厂（${factoryVersion}）→ 拒**`, e1.slice(0, 40));
const e2 = await tryInstall(await makePkg("0.0.1", { signed: true }));
ok(e2.includes("不比它高"), "**签过名、版本低于出厂 → 拒**", e2.slice(0, 40));
const e3 = await tryInstall(await makePkg(higher, { signed: false }));
ok(e3.includes("没有签名"), `**更高版本、但未签名且非 dev 模式 → 拒**`, e3.slice(0, 40));
const e4 = await tryInstall(await makePkg(higher, { signed: true, extraKinds: [{ id: "html", label: "网页", icon: "◻", ext: [".html"] }] }));
ok(e4.includes("多认领了内置类型"), "**签过名、更高版本、但多认领内置类型 → 拒**", e4.slice(0, 40));
ok(!existsSync(join(PLUGINS_DIR, ID)), "拒了的一个字节都没落盘");

/* ── ③ 正向：装上 → 生效 → 退回 ── */
console.log("\n ③ 签过名的更高版本：装上 → 生效 → 退回");
ok(!(await outlineTitle()).includes(MARK), "装之前 B 面动词是出厂那份", await outlineTitle());
const r = await installPackage(await makePkg(higher, { signed: true }));
ok(r.id === ID && r.version === higher && r.unsigned === false, `装上了 ${higher}（已签名）`);
let row = (await listInstalled()).find((x) => x.manifest.id === ID);
ok(!!row && row.bundled && row.upgraded === true && row.manifest.version === higher && row.factoryVersion === factoryVersion && !row.unsigned,
  "列表：仍是内置（bundled）、标升级、版本是新的、记得出厂版本、不标未签名", row ? `${row.manifest.version} / 出厂 ${row.factoryVersion}` : "没有");
ok(pluginDirOf(ID)?.startsWith(PLUGINS_DIR) === true, "**静态目录指向升级那份**（和列表同一个结论）", pluginDirOf(ID) ?? "");
const reg = await registerPluginKinds();
ok(reg.find((x) => x.id === ID)?.kinds.includes("md") === true, "**升级那份照样能认领内置类型 md**（builtin 语义不变）");
ok((await outlineTitle()).includes(MARK), "**B 面动词换成升级那份了**", await outlineTitle());
/* 已经升过级，再装更高一版：比的仍是**出厂版**（不是正在用的那一版），而且能装上 */
const higher2 = higher.replace(/(\d+)$/, (n) => String(Number(n) + 1));
const r2 = await installPackage(await makePkg(higher2, { signed: true }));
row = (await listInstalled()).find((x) => x.manifest.id === ID);
ok(r2.previous === higher && row?.manifest.version === higher2 && row?.factoryVersion === factoryVersion,
  `升过级再装 ${higher2}：装上、记得上一版 ${higher}、出厂版仍是 ${factoryVersion}`, `previous=${r2.previous}`);
const capUninstall = allCaps().find((c) => c.name === "uninstall_plugin")!;
const rev = await capUninstall.run({ id: ID } as never, { project: null, via: "http" } as never) as { data?: { reverted?: boolean; version?: string } };
ok(rev.data?.reverted === true && rev.data?.version === factoryVersion, `「卸载」升级过的内置插件 = **退回出厂版本 ${factoryVersion}**`, JSON.stringify(rev.data));
row = (await listInstalled()).find((x) => x.manifest.id === ID);
ok(!!row && row.bundled && !row.upgraded && row.manifest.version === factoryVersion && pluginDirOf(ID)?.startsWith(BUNDLED_DIR) === true,
  "退回后列表与静态目录都回到出厂那份");
ok(!(await outlineTitle()).includes(MARK), "退回后 B 面动词也回到出厂那份");
const again = await capUninstall.run({ id: ID } as never, { project: null, via: "http" } as never) as { ok?: boolean; errors?: Array<{ code: string }> };
ok(again.errors?.[0]?.code === "E_PLUGIN_BUNDLED", "没升级过的内置插件仍然卸不掉");

/* ── ④ 绕过安装流程拷进来的 ── */
console.log("\n ④ 手动拷进 STATE_ROOT 的升级目录");
{
  const fake = join(PLUGINS_DIR, ID, "9.9.9");
  await mkdir(join(PLUGINS_DIR, ID), { recursive: true });
  await cp(FACTORY_DIR, fake, { recursive: true });
  const mf = JSON.parse(await readFile(join(fake, "manifest.json"), "utf8"));
  mf.version = "9.9.9";
  await writeFile(join(fake, "manifest.json"), JSON.stringify(mf));
  row = (await listInstalled()).find((x) => x.manifest.id === ID);
  ok(!!row && !row.upgraded && row.manifest.version === factoryVersion && pluginDirOf(ID)?.startsWith(BUNDLED_DIR) === true,
    "**没签名、非 dev：拷一份更高版本进来也顶替不了出厂版**（否则拷一份就白拿内置特权）");
  process.env.UMBRASTUDIO_PLUGIN_DEV = "1";
  row = (await listInstalled()).find((x) => x.manifest.id === ID);
  ok(!!row && row.upgraded === true && row.unsigned === true, "dev 模式：用它，但照常标未签名");
  delete process.env.UMBRASTUDIO_PLUGIN_DEV;
  await rm(join(PLUGINS_DIR, ID), { recursive: true, force: true });
  await listInstalled();
}

/* ── dev 模式装未签名的更高版本 ── */
process.env.UMBRASTUDIO_PLUGIN_DEV = "1";
const rd = await installPackage(await makePkg(higher, { signed: false }));
ok(rd.unsigned === true && (await listInstalled()).find((x) => x.manifest.id === ID)?.unsigned === true, "dev 模式装未签名的更高版本：放行，**标未签名**");
delete process.env.UMBRASTUDIO_PLUGIN_DEV;

stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
await rm(KEYS, { recursive: true, force: true });
console.log(`\n${fail ? "✗" : "✓"} 内置插件升级 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
