/** 插件目录三级回落的回归（2026-10-11）：`plugin/catalog.ts` —— 服务端 > 缓存 > 出厂；形状校验；超时 / 非 2xx / 不合形都回落。
 *  跑：npm --prefix server run catalogtest。网络是注入的假 fetch，一条都不碰真网；文件写在临时目录。 */
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogUrl, fetchServerCatalog, pickCatalog, readCatalogDetailed, validateCatalog, type CatalogEntry } from "./plugin/catalog.js";
import { giftPluginIdsOf } from "./account.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const entry = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry =>
  ({ id, name: id, author: "Umbra", version: "1.0.0", price: 10, brief: "", formats: [".x"], permissions: {}, ...extra });

console.log("插件目录三级回落（plugin/catalog）");

/* ── ① 形状校验 ── */
ok(validateCatalog(null) === null, "null → null（不是目录）");
ok(validateCatalog({}) === null, "没有 plugins → null");
ok(validateCatalog({ plugins: "x" }) === null, "plugins 不是数组 → null");
ok(validateCatalog({ plugins: [] })?.length === 0, "空数组 → 空目录（不是 null：空市场不是错误）");
const v = validateCatalog({ plugins: [entry("a"), { id: "", formats: [] }, { id: "b" }, { id: "c", formats: [1] }, null, { id: " d ", formats: [".md"] }] })!;
ok(v.map((e) => e.id).join(",") === "a,d", "id 空 / formats 缺 / formats 不是字符串数组的条目丢掉；id 去空白", v.map((e) => e.id).join(","));
ok(v[1]?.name === "d" && v[1]?.price === 0 && v[1]?.author === "" && typeof v[1]?.permissions === "object", "缺的字段补缺省（name=id、price=0、permissions={}）");
ok(validateCatalog({ plugins: [entry("n", { price: -5 as number })] })?.[0]?.price === 0, "负价格 → 0");

/* ── ② 回落顺序 ── */
const S = [entry("s")], C = [entry("c")], B = [entry("b")];
ok(pickCatalog(S, C, B).source === "server" && pickCatalog(S, C, B).entries[0]?.id === "s", "有服务端 → server");
ok(pickCatalog(null, C, B).source === "cache", "没服务端有缓存 → cache");
ok(pickCatalog(null, null, B).source === "bundled", "只有出厂 → bundled");
ok(pickCatalog(null, null, null).source === "bundled" && pickCatalog(null, null, null).entries.length === 0, "什么都没有 → 空市场");
ok(pickCatalog([], C, B).source === "server" && pickCatalog([], C, B).entries.length === 0, "服务端回空目录就是空市场，不回落到缓存（下架了就该消失）");

/* ── ③ 地址 ── */
ok(catalogUrl("https://umbra.tingyusha.xyz/") === "https://umbra.tingyusha.xyz/plugins/catalog", "去掉尾斜杠再拼");
ok(catalogUrl("") === "" && catalogUrl("  ") === "", "空地址 → 空串（没配服务端）");

/* ── ④ 注入 fetch 的各种失败都回 null ── */
type Resp = { ok: boolean; status: number; json(): Promise<unknown> };
const resp = (status: number, body: unknown): Resp => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fetchOk = async () => resp(200, { plugins: [entry("srv")] });
const r1 = await fetchServerCatalog("https://x", fetchOk);
ok(!!r1 && r1[0]?.id === "srv", "200 + 合形 → 条目");
ok((await fetchServerCatalog("https://x", async () => resp(500, {}))) === null, "500 → null");
ok((await fetchServerCatalog("https://x", async () => resp(200, { nope: 1 }))) === null, "200 但不合形 → null");
ok((await fetchServerCatalog("https://x", async () => { throw new Error("ECONNREFUSED"); })) === null, "连不上 → null（不抛）");
ok((await fetchServerCatalog("", fetchOk)) === null, "没配服务端 → null，不发请求");
const slow = (_u: string, i: { signal?: AbortSignal }) => new Promise<Resp>((res, rej) => {
  i.signal?.addEventListener("abort", () => rej(new Error("aborted")));
  setTimeout(() => res(resp(200, { plugins: [] })), 2000);
});
const t0 = Date.now();
ok((await fetchServerCatalog("https://x", slow, 50)) === null && Date.now() - t0 < 1000, "超时 → null，而且真的没等满");

/* ── ⑤ 整条路：写缓存、回落缓存、回落出厂 ── */
const dir = mkdtempSync(join(tmpdir(), "umbra-catalog-"));
const cacheFile = join(dir, "cache.json"), bundledFile = join(dir, "bundled.json");
writeFileSync(bundledFile, JSON.stringify({ plugins: [entry("factory")] }));
const base = { serverUrl: "https://x", cacheFile, bundledFile, noMemo: true };
const a = await readCatalogDetailed({ ...base, fetchFn: fetchOk });
ok(a.source === "server" && a.entries[0]?.id === "srv", "联上 → server");
ok(existsSync(cacheFile) && JSON.parse(readFileSync(cacheFile, "utf8")).plugins[0].id === "srv", "联上之后缓存写下来了");
const b = await readCatalogDetailed({ ...base, fetchFn: async () => { throw new Error("offline"); } });
ok(b.source === "cache" && b.entries[0]?.id === "srv", "断网 → 上次的缓存");
rmSync(cacheFile);
const c = await readCatalogDetailed({ ...base, fetchFn: async () => { throw new Error("offline"); } });
ok(c.source === "bundled" && c.entries[0]?.id === "factory", "断网又没缓存 → 出厂清单");
let called = 0;
const d = await readCatalogDetailed({ ...base, serverUrl: "", fetchFn: async () => { called++; return resp(200, { plugins: [] }); } });
ok(d.source === "bundled" && called === 0, "没配服务端：不发请求，直接出厂清单");
writeFileSync(cacheFile, "{not json");
const e = await readCatalogDetailed({ ...base, fetchFn: async () => { throw new Error("offline"); } });
ok(e.source === "bundled", "缓存文件坏了 → 当没有，回落出厂");
rmSync(dir, { recursive: true, force: true });

/* ── ⑥ 赠送插件解析 ── */
ok(giftPluginIdsOf({ gift_plugins: ["com.umbra.markdown", " com.umbra.code ", "", 3, "com.umbra.markdown"] }).join(",") === "com.umbra.markdown,com.umbra.code", "只认字符串、去空、去重");
ok(giftPluginIdsOf({ gift_plugins: "x" }).length === 0 && giftPluginIdsOf(null).length === 0 && giftPluginIdsOf({}).length === 0, "不是数组 / 没有 → []");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
