/** 「拿到插件」那条路的回归（2026-10-11）：`plugin/acquire.ts` —— 安装包地址判据、许可证归属、回包 → 文本、
 *  步骤决策、下载（上限 / 超时 / 非 https）与从 URL 装（失败不落一个字节、临时文件必删）。
 *  跑：npm --prefix server run acquiretest。网络是注入的假 fetch，一条都不碰真网。 */
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buyStep, discountPctOf, downloadPackage, installFromUrl, isHttpsUrl, licenseGrants, licenseIsFor, licenseTextOf, memberPrice, planAcquire, type PackageFetch } from "./plugin/acquire.js";
import { validateCatalog } from "./plugin/catalog.js";
import type { LicenseCheck } from "./plugin/license.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

console.log("拿到插件（plugin/acquire）");

/* ── ⓪ 买这一步走不走（issue #145）：会员信息没问到时不许按价买（会误扣赠送插件的积分） ── */
ok(buyStep({ planBuy: true, perksOk: false, grantedNow: false }) === "refuse", "**会员信息没问到 + 许可证里没有 → 拒绝，不买**（原来当「不是赠送」按价扣积分）");
ok(buyStep({ planBuy: true, perksOk: false, grantedNow: true }) === "skip", "会员信息没问到，但先取的许可证里已有赠送授权 → 跳过购买");
ok(buyStep({ planBuy: true, perksOk: true, grantedNow: true }) === "skip", "许可证里已有授权（赠送 / 以前买过）→ 不买");
ok(buyStep({ planBuy: true, perksOk: true, grantedNow: false }) === "buy", "问到了、确实不是赠送、也没授权 → 才买");
ok(buyStep({ planBuy: false, perksOk: false, grantedNow: false }) === "skip", "计划里本来不买（赠送 / 免费）→ 不买");

/* ── ① 安装包地址：只认 https://主机/路径 ── */
ok(isHttpsUrl("https://dl.umbra.test/p/x.umbraplugin"), "https + 路径 → 认");
ok(!isHttpsUrl("http://dl.umbra.test/p/x.umbraplugin"), "http → 不认");
ok(!isHttpsUrl("https://dl.umbra.test") && !isHttpsUrl("https://dl.umbra.test/"), "只有主机没路径 → 不认");
ok(!isHttpsUrl("") && !isHttpsUrl(undefined) && !isHttpsUrl("not a url") && !isHttpsUrl("file:///x"), "空 / 非串 / 不是 URL / file: → 不认");
const cat = validateCatalog({ plugins: [
  { id: "a", formats: [".a"], package_url: "https://dl.umbra.test/a.umbraplugin" },
  { id: "b", formats: [".b"], package_url: "http://dl.umbra.test/b.umbraplugin" },
  { id: "c", formats: [".c"], package_url: 42 },
] })!;
ok(cat[0]?.package_url === "https://dl.umbra.test/a.umbraplugin" && cat[1]?.package_url === undefined && cat[2]?.package_url === undefined,
  "目录校验：package_url 只留 https 的，http / 非串丢掉");

/* ── ①′ 会员价（草案 §3.3）：折扣百分比的判据 + 实扣算法（与服务端同一条） ── */
ok(discountPctOf({ discount_pct: 95 }) === 95 && discountPctOf({ discount_pct: 100 }) === 100 && discountPctOf({ discount_pct: 1 }) === 1, "discount_pct 1..100 → 原样");
ok(discountPctOf({}) === 100 && discountPctOf(null) === 100 && discountPctOf({ discount_pct: "95" }) === 100, "缺 / 不是数 → 100（拿不到折扣就是不打折）");
ok(discountPctOf({ discount_pct: 0 }) === 100 && discountPctOf({ discount_pct: 101 }) === 100 && discountPctOf({ discount_pct: 95.5 }) === 100 && discountPctOf({ discount_pct: -5 }) === 100,
  "0 / 101 / 小数 / 负数 → 100（不能把价格算成 0 或算多）");
ok(memberPrice(100, 95) === 95 && memberPrice(100, 100) === 100 && memberPrice(10, 95) === 10 && memberPrice(11, 95) === 10, "实扣 = (price*pct+50)//100：100→95、10→10（9.5 进位）、11→10（10.45 舍）");
ok(memberPrice(1, 50) === 1 && memberPrice(1, 1) === 1 && memberPrice(2, 1) === 1, "price > 0 时至少 1");
ok(memberPrice(0, 95) === 0 && memberPrice(-3, 95) === 0 && memberPrice(100, 120) === 100, "0 / 负 → 0；pct ≥ 100 → 原价");

/* ── ② 许可证归属：sub 要等于当前账号 id ── */
const lic = (sub: string, okv = true): LicenseCheck => okv ? { ok: true, license: { sub, grants: [] } } : { ok: false, why: "bad" };
ok(licenseIsFor(lic("7"), 7) && licenseIsFor(lic("7"), "7"), "sub '7' 对 id 7（数字 / 串都行）");
ok(!licenseIsFor(lic("7"), 8), "别人的许可证 → 不是");
ok(!licenseIsFor(null, 7) && !licenseIsFor(lic("7", false), 7), "没有 / 验不过 → 不是（要重新取）");
ok(!licenseIsFor(lic("7"), null) && !licenseIsFor(lic("7"), ""), "没登录（id 空）→ 不是");

/* ── ③ 服务端回包 → 可落盘文本：payload 原样，不重新序列化 ── */
const payload = '{"sub":"7","grants":[],  "iat":"x"}';
const t = licenseTextOf({ payload, signature: "c2ln", grants: [] });
ok(t === JSON.stringify({ payload, signature: "c2ln" }) && JSON.parse(t!).payload === payload, "payload 字符串一字不差（键序 / 空格都保留）");
ok(licenseTextOf({ payload: 1, signature: "x" }) === null && licenseTextOf({ payload: "x" }) === null && licenseTextOf(null) === null && licenseTextOf({ payload: "", signature: "x" }) === null,
  "缺 / 空 / 不是串 → null");

/* ── ④ 许可证里有没有这个插件现在有效的授权 ── */
const now = new Date("2026-10-11T00:00:00Z");
const L = { sub: "7", grants: [
  { plugin: "p.forever", from: "2026-01-01", until: null, src: "purchase" },
  { plugin: "p.gift", from: "2026-10-01", until: "2026-11-01", src: "membership" },
  { plugin: "p.expired", from: "2026-01-01", until: "2026-09-01", src: "promo" },
  { plugin: "p.notyet", from: "2027-01-01", until: null, src: "purchase" },
] };
ok(licenseGrants(L, "p.forever", now) && licenseGrants(L, "p.gift", now), "买断 / 会员赠送在期内 → 有");
ok(!licenseGrants(L, "p.expired", now) && !licenseGrants(L, "p.notyet", now) && !licenseGrants(L, "p.none", now) && !licenseGrants(null, "p.forever", now),
  "过期 / 未生效 / 没这条 / 没许可证 → 没有");

/* ── ⑤ 步骤决策 ── */
const base = { signedIn: true, builtin: false, installed: false, entitled: false, gift: false, price: 30, packageUrl: "https://dl.umbra.test/x.umbraplugin" };
let p = planAcquire(base);
ok(p.buy && p.license && p.install && !p.refuse, "没授权的付费插件：买 → 取许可证 → 装");
p = planAcquire({ ...base, gift: true });
ok(!p.buy && p.license && p.install, "会员赠送：不买，取许可证，装");
p = planAcquire({ ...base, price: 0 });
ok(!p.buy && p.license && p.install, "免费（0 积分）：不买，取许可证，装");
p = planAcquire({ ...base, entitled: true });
ok(!p.buy && !p.license && p.install, "已有授权没装（换机器）：只装");
p = planAcquire({ ...base, packageUrl: undefined });
ok(p.buy && p.license && !p.install, "没有安装包地址：买 + 许可证，不装（回包说明）");
p = planAcquire({ ...base, packageUrl: "http://x/y" });
ok(!p.install, "http 的安装包地址等于没有");
ok(!!planAcquire({ ...base, signedIn: false }).refuse && /登录/.test(planAcquire({ ...base, signedIn: false }).refuse), "没登录 → 拒绝，话里说登录");
ok(!!planAcquire({ ...base, builtin: true }).refuse, "内置 → 拒绝");
ok(!!planAcquire({ ...base, installed: true, entitled: true }).refuse, "装着且有授权 → 拒绝（没事可做）");
p = planAcquire({ ...base, installed: true, entitled: false });
ok(p.buy && p.license && !p.install && !p.refuse, "装着但没授权（过期）：买 + 取许可证，不重装");

/* ── ⑥ 下载：非 https、HTTP 错、太大、超时、空；成功后临时文件存在 ── */
type R = Awaited<ReturnType<PackageFetch>>;
const resp = (status: number, bytes: Buffer, len?: number): R => ({ ok: status < 300, status, headers: { get: (n) => n === "content-length" ? String(len ?? bytes.length) : null }, arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer });
const err = async (fn: () => Promise<unknown>): Promise<string> => { try { await fn(); return ""; } catch (e) { return (e as Error).message; } };
const U = "https://dl.umbra.test/x.umbraplugin";
ok(/https/.test(await err(() => downloadPackage("http://dl.umbra.test/x", async () => resp(200, Buffer.from("x"))))), "http 地址不下载");
ok(/HTTP 404/.test(await err(() => downloadPackage(U, async () => resp(404, Buffer.alloc(0))))), "404 → 报 HTTP 状态");
ok(/太大/.test(await err(() => downloadPackage(U, async () => resp(200, Buffer.from("x"), 99_999_999)))), "content-length 超上限 → 不下");
ok(/太大/.test(await err(() => downloadPackage(U, async () => resp(200, Buffer.alloc(200)), { maxBytes: 100 }))), "实际字节超上限 → 拒");
ok(/空/.test(await err(() => downloadPackage(U, async () => resp(200, Buffer.alloc(0))))), "空包 → 拒");
const slow: PackageFetch = (_u, i) => new Promise((_res, rej) => { i.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); }); });
const t0 = Date.now();
ok(/超时/.test(await err(() => downloadPackage(U, slow, { timeoutMs: 50 }))) && Date.now() - t0 < 1000, "超时 → 报超时，而且真的没等满");
const file = await downloadPackage(U, async () => resp(200, Buffer.from("hello")));
ok(existsSync(file) && file.startsWith(tmpdir()) && file.endsWith(".umbraplugin"), "成功 → 临时文件在系统临时目录里", file);
const tmpDir = join(file, "..");

/* ── ⑦ 从 URL 装：不是合法的包 → 装不上，临时文件也删了；插件目录不多一个字节 ── */
const { PLUGINS_DIR } = await import("./plugin/store.js");
const before = existsSync(PLUGINS_DIR) ? readdirSync(PLUGINS_DIR).sort().join(",") : "";
const m = await err(() => installFromUrl(U, async () => resp(200, Buffer.from("this is not a gzip json package"))));
ok(!!m, "不是合法的包 → 抛（人话）", m);
const after = existsSync(PLUGINS_DIR) ? readdirSync(PLUGINS_DIR).sort().join(",") : "";
ok(before === after, "插件目录没有多出任何东西");
const leftovers = readdirSync(tmpdir()).filter((x) => x.startsWith("umbrastudio-pkg-"));
ok(!leftovers.some((x) => join(tmpdir(), x) !== tmpDir), "失败那次的临时目录已经删了（只剩 ⑥ 那个没走安装流程的）");
await import("node:fs/promises").then((f) => f.rm(tmpDir, { recursive: true, force: true }));

console.log(`\n${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
