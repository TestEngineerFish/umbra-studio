/** `npm --prefix server run sync-plugins`：把三个内置插件从 umbra-plugins 拉进 `TOOL_ROOT/plugins/<id>/<version>/`（doc/23 §四.1，S4）。
 *
 *  `plugins/` 从这一版起是**构建产物**，不再是源码：插件源码的正本在 umbra-plugins 仓库
 *  （https://github.com/TestEngineerFish/umbra-plugins）。这个脚本是它进 Studio 的唯一入口。
 *
 *  两条来源，**自动选**（`chooseSource`）：
 *  1. 本地检出 —— `UMBRA_PLUGINS_DIR`，缺省试 `<仓库>/../umbra-plugins`：在那边 `pack.mjs` 打三个包，再从 `dist/` 解。
 *  2. GitHub Release —— `UMBRA_PLUGINS_RELEASE`（tag，缺省 `latest`）：经 API 下三个包。**仓库是私有的**，要令牌：
 *     `GH_TOKEN` / `GITHUB_TOKEN` → `<Geek>/.secrets/gh-token` → `gh auth token`，**逐个真问一次**，第一个看得到仓库的才用。
 *     ⚠️ 私有仓库对没权限的令牌也回 404 —— 所以「没有令牌」和「令牌看不到仓库」要分开说，不能一句 404 糊过去。
 *     ⚠️ 下载走资产 API（`assets/<id>` + `Accept: application/octet-stream`），**不走 `browser_download_url`** ——
 *     后者对私有仓库带令牌也是 404（umbra-plugins 的 `sync-studio.mjs` 就是这么写的，所以这里不调它，见 PR 说明）。
 *
 *  解包**不验签**（Release 包本来就没签名；这是出厂件，TOOL_ROOT 是信任边界），但清单与路径逃逸**照 `install.ts` 那一套查**：
 *  `checkManifest` · `pluginVersionDir`（id / version 形状 + 结果在内）· 包内路径不许 `\` / 绝对路径 / 拼完逃出目录。
 *  任何一个包查不过，**一个字节都不写**（先全部查完再落盘）。
 *
 *  顺带：把 SDK 的桥（`umbra.js`）覆盖到 `runtime/umbra-plugin.js` 和 `fixtures/插件/com.umbra.demo/umbra.js`，
 *  头上加一行「由 sync-plugins 拷来，别手改」—— 这样本仓库里的桥永远等于 SDK 正本（原来是四份手工拷贝，issue #97）。
 *
 *  `--check`：不同步，只查三个内置目录在不在（给打包前那道闸用）；缺了退出码 1 并说出缺哪个。
 *  令牌**绝不打印**：日志里只写「用的是哪一路令牌」。 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { TOOL_ROOT } from "./project.js";
import { checkManifest } from "./plugin/manifest.js";
import { decodePackage, type PluginPackage } from "./plugin/pack.js";
import { isInside, pluginIdDir, pluginVersionDir } from "./plugin/paths.js";
import { compareVersion } from "./plugin/version.js";
import { MAX_PACKAGE_BYTES } from "./plugin/acquire.js";

/** 随 Studio 一起发的三个内置插件。少一个 Studio 就打不开那种文件（`.md` 首当其冲）。 */
export const BUILTIN_IDS = ["com.umbra.markdown", "com.umbra.code", "com.umbra.html"] as const;
/** umbra-plugins 在 GitHub 上的位置（私有）。`UMBRA_PLUGINS_REPO` 可改（fork / 测试用）。 */
export const PLUGINS_REPO = process.env.UMBRA_PLUGINS_REPO || "TestEngineerFish/umbra-plugins";
/** 桥的两份落点（相对 TOOL_ROOT）：运行时那份 + 演示插件那份。 */
export const BRIDGE_TARGETS = ["runtime/umbra-plugin.js", "fixtures/插件/com.umbra.demo/umbra.js"] as const;
/** 桥文件头那一行：有它说明是 sync 拷来的。 */
export const BRIDGE_HEADER = "/* 由 sync-plugins 从 umbra-plugins/sdk/umbra.js 拷来，别手改 —— 改 SDK 正本再 npm --prefix server run sync-plugins */\n";

/** 同步从哪来。 */
export type SyncSource = { kind: "local"; dir: string } | { kind: "release"; tag: string };

/** 自动选来源：本地检出（有 `scripts/pack.mjs`）优先，否则 Release。**纯函数**（`exists` 可注入）。 */
export function chooseSource(env: Record<string, string | undefined>, toolRoot: string, exists: (p: string) => boolean = existsSync): SyncSource {
  const dir = resolve(toolRoot, env.UMBRA_PLUGINS_DIR || join("..", "umbra-plugins"));
  if (exists(join(dir, "scripts", "pack.mjs"))) return { kind: "local", dir };
  return { kind: "release", tag: env.UMBRA_PLUGINS_RELEASE || "latest" };
}

/** 一个内置插件包查过之后要写的东西：目录 + 文件列表。 */
export interface CheckedPackage { id: string; version: string; idDir: string; target: string; writes: Array<[string, Buffer]>; signature?: string }

/** 照 `install.ts` 的那一套查一个包（不验签）。查不过抛人话；过了回「要写什么」，**这一步不写盘**。 */
export function checkBuiltinPackage(pkg: PluginPackage, pluginsDir: string, label: string): CheckedPackage {
  const raw = pkg.files["manifest.json"];
  if (!raw) throw new Error(`${label} 里没有 manifest.json`);
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch (e) { throw new Error(`${label} 的 manifest.json 不是合法 JSON：${(e as Error).message}`); }
  const m = checkManifest(parsed);
  if (!m.ok) throw new Error(`${label} 清单不合法：` + m.problems.map((x) => `${x.field} ${x.why}`).join("；"));
  const man = m.manifest!;
  /* 形状闸 + 结果在内（issue #23 那两道）：id / version 都兼做目录名 */
  const idDir = pluginIdDir(pluginsDir, man.id);
  const target = pluginVersionDir(pluginsDir, man.id, man.version);
  const writes: Array<[string, Buffer]> = [];
  for (const [rel, b64] of Object.entries(pkg.files)) {
    if (rel.includes("\\") || rel.startsWith("/")) throw new Error(`${label} 里有逃出插件目录的路径：${rel}`);
    const abs = join(target, normalize(rel));
    if (!isInside(target, abs)) throw new Error(`${label} 里有逃出插件目录的路径：${rel}`);
    writes.push([abs, Buffer.from(b64, "base64")]);
  }
  return { id: man.id, version: man.version, idDir, target, writes, signature: pkg.signature };
}

/** 落盘：**整个 `<id>/` 先清掉再写** —— 内置目录没有多版本并存，旧版留着会被选版本时挑中。 */
export async function writeChecked(c: CheckedPackage): Promise<void> {
  await rm(c.idDir, { recursive: true, force: true });
  await mkdir(c.target, { recursive: true });
  for (const [abs, buf] of c.writes) { await mkdir(dirname(abs), { recursive: true }); await writeFile(abs, buf); }
  if (c.signature) await writeFile(join(c.target, ".sig"), c.signature, "utf8");
}

/** 三个内置目录现在各是哪一版；缺的给 null。 */
export function builtinState(pluginsDir: string): Array<{ id: string; version: string | null }> {
  return BUILTIN_IDS.map((id) => {
    const idDir = join(pluginsDir, id);
    if (!existsSync(idDir)) return { id, version: null };
    const vs = readdirSync(idDir).filter((v) => v !== "current" && existsSync(join(idDir, v, "manifest.json")) && statSync(join(idDir, v)).isDirectory()).sort(compareVersion);
    return { id, version: vs[vs.length - 1] ?? null };
  });
}

/** 某个内置插件当前同步下来的那一版目录（测试要直接 import 插件里的 .mjs 时用）。
 *  没同步过就抛人话 —— 不然报的是一句看不出原因的「Cannot find module」。 */
export function builtinDirOf(id: (typeof BUILTIN_IDS)[number], pluginsDir: string = join(TOOL_ROOT, "plugins")): string {
  const v = builtinState(pluginsDir).find((x) => x.id === id)?.version;
  if (!v) throw new Error(`内置插件 ${id} 还没同步进 plugins/ —— 先跑 npm --prefix server run sync-plugins`);
  return join(pluginsDir, id, v);
}

/** 一个令牌候选：从哪来（给日志）+ 值。 */
interface TokenCandidate { from: string; value: string }

/** 列出能试的令牌（不判断能不能用）。值**不打印**。 */
export function tokenCandidates(env: Record<string, string | undefined>, toolRoot: string, ghCli: () => string = defaultGhCli): TokenCandidate[] {
  const out: TokenCandidate[] = [];
  if (env.GH_TOKEN?.trim()) out.push({ from: "环境变量 GH_TOKEN", value: env.GH_TOKEN.trim() });
  if (env.GITHUB_TOKEN?.trim()) out.push({ from: "环境变量 GITHUB_TOKEN", value: env.GITHUB_TOKEN.trim() });
  const file = resolve(toolRoot, "..", ".secrets", "gh-token");
  try { const v = readFileSync(file, "utf8").trim(); if (v && !/\s/.test(v)) out.push({ from: "../.secrets/gh-token", value: v }); } catch { /* 没有这个文件 */ }
  const cli = ghCli().trim();
  if (cli && !/\s/.test(cli)) out.push({ from: "gh auth token", value: cli });
  return out;
}

function defaultGhCli(): string {
  try {
    const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5000 });
    return r.status === 0 ? r.stdout : "";
  } catch { return ""; }
}

/** GitHub API 的 fetch 形状（可注入测试）。 */
type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

interface ReleaseAsset { id: number; name: string; size: number; url: string }

/** 选第一个看得到这个 Release 的令牌，回 Release 的资产表。全不行抛人话（分「没有令牌」和「看不到」）。 */
export async function openRelease(tag: string, cands: TokenCandidate[], fetchFn: Fetch, repo = PLUGINS_REPO): Promise<{ token: TokenCandidate; tag: string; assets: ReleaseAsset[] }> {
  if (!cands.length) {
    throw new Error(`没有令牌，下不了私有 Release（${repo} 是私有仓库）。设 GH_TOKEN，或放一份到 ../.secrets/gh-token，或先 gh auth login；` +
      "也可以把 umbra-plugins 检出到 ../umbra-plugins 走本地来源");
  }
  const api = `https://api.github.com/repos/${repo}/releases/${tag === "latest" ? "latest" : "tags/" + encodeURIComponent(tag)}`;
  const tried: string[] = [];
  for (const c of cands) {
    const r = await fetchFn(api, { headers: ghHeaders(c.value), signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const body = await r.json() as { tag_name?: string; assets?: ReleaseAsset[] };
      return { token: c, tag: body.tag_name ?? tag, assets: (body.assets ?? []).filter((a) => a.name.endsWith(".umbraplugin")) };
    }
    tried.push(`${c.from} → ${r.status}`);
  }
  throw new Error(`试过的令牌都看不到 ${repo} 的 Release ${tag}（${tried.join("；")}）。` +
    "私有仓库对没权限的令牌也回 404：换一个对这个仓库有读权限的令牌，或确认 tag 存在");
}

function ghHeaders(token: string): Record<string, string> {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "umbrastudio-sync-plugins", "X-GitHub-Api-Version": "2022-11-28" };
}

/** 资产表里某个插件的包：`<id>-<version>.umbraplugin`，多个版本取最高的。 */
export function pickAsset(assets: ReleaseAsset[], id: string): ReleaseAsset | null {
  const mine = assets.filter((a) => a.name.startsWith(id + "-") && /^[0-9]/.test(a.name.slice(id.length + 1)));
  mine.sort((a, b) => compareVersion(a.name.slice(id.length + 1, -".umbraplugin".length), b.name.slice(id.length + 1, -".umbraplugin".length)));
  return mine[mine.length - 1] ?? null;
}

/** 下一个资产（资产 API + octet-stream；重定向到存储时 fetch 会自己去掉 Authorization）。 */
async function downloadAsset(a: ReleaseAsset, token: string, fetchFn: Fetch): Promise<Buffer> {
  if (a.size > MAX_PACKAGE_BYTES) throw new Error(`${a.name} 太大（${a.size} 字节）`);
  const r = await fetchFn(a.url, { headers: { ...ghHeaders(token), Accept: "application/octet-stream" }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`下载 ${a.name} 失败：HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** 本地来源：在 umbra-plugins 里打三个包，读回 `dist/` 下的三个文件。 */
function packLocal(dir: string): Map<string, Buffer> {
  const r = spawnSync(process.execPath, ["scripts/pack.mjs", ...BUILTIN_IDS], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`在 ${dir} 打包失败（退出码 ${r.status}）：\n${(r.stdout ?? "") + (r.stderr ?? "")}`.trim());
  const dist = join(dir, "dist");
  const out = new Map<string, Buffer>();
  for (const id of BUILTIN_IDS) {
    const names = readdirSync(dist).filter((n) => n.startsWith(id + "-") && n.endsWith(".umbraplugin"))
      .sort((a, b) => compareVersion(a.slice(id.length + 1, -".umbraplugin".length), b.slice(id.length + 1, -".umbraplugin".length)));
    const name = names[names.length - 1];
    if (!name) throw new Error(`${dist} 里没有 ${id} 的包`);
    out.set(id, readFileSync(join(dist, name)));
  }
  return out;
}

/** 桥文件：给 SDK 原文加头。已经带头的不重复加。 */
export function bridgeWithHeader(src: string): string {
  return src.startsWith(BRIDGE_HEADER) ? src : BRIDGE_HEADER + src;
}

/** 跑一次同步。回每个插件落到哪一版 + 桥从哪来。 */
export async function syncPlugins(opts: { env?: Record<string, string | undefined>; toolRoot?: string; fetchFn?: Fetch; log?: (s: string) => void } = {}): Promise<{ source: string; plugins: Array<{ id: string; version: string }> }> {
  const env = opts.env ?? process.env;
  const toolRoot = opts.toolRoot ?? TOOL_ROOT;
  const log = opts.log ?? ((s: string) => console.log(s));
  const fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i) as unknown as ReturnType<Fetch>);
  const pluginsDir = join(toolRoot, "plugins");
  const src = chooseSource(env, toolRoot);
  let bufs: Map<string, Buffer>;
  let sourceLabel: string;
  let sdkBridge: string | null = null;
  if (src.kind === "local") {
    log(`来源：本地检出 ${src.dir}`);
    bufs = packLocal(src.dir);
    sourceLabel = `本地 ${src.dir}`;
    /* 本地来源的桥直接读 SDK 正本 */
    try { sdkBridge = await readFile(join(src.dir, "sdk", "umbra.js"), "utf8"); } catch { /* 下面从包里取 */ }
  } else {
    const rel = await openRelease(src.tag, tokenCandidates(env, toolRoot), fetchFn);
    log(`来源：GitHub Release ${rel.tag}（${PLUGINS_REPO}，令牌：${rel.token.from}）`);
    bufs = new Map();
    for (const id of BUILTIN_IDS) {
      const a = pickAsset(rel.assets, id);
      if (!a) throw new Error(`Release ${rel.tag} 里没有 ${id} 的包`);
      bufs.set(id, await downloadAsset(a, rel.token.value, fetchFn));
    }
    sourceLabel = `Release ${rel.tag}`;
  }
  /* 先全部查完，再落盘 —— 一个不过就一个都不写 */
  const checked: CheckedPackage[] = [];
  for (const id of BUILTIN_IDS) {
    const c = checkBuiltinPackage(decodePackage(bufs.get(id)!), pluginsDir, `${id} 的包`);
    if (c.id !== id) throw new Error(`拿到的 ${id} 包，清单里写的却是 ${c.id}`);
    checked.push(c);
  }
  for (const c of checked) { await writeChecked(c); log(`✓ ${c.id} ${c.version} → plugins/${c.id}/${c.version}/（${c.writes.length} 个文件）`); }
  /* 桥：SDK 正本（本地）或包里 vendor 进去的那份（Release；pack.mjs 打包时原样拷进去的，就是 SDK 那一份） */
  if (!sdkBridge) {
    const md = checked.find((c) => c.id === "com.umbra.markdown")!;
    const hit = md.writes.find(([abs]) => abs.endsWith(join(md.target, "umbra.js")));
    if (hit) sdkBridge = hit[1].toString("utf8");
  }
  if (sdkBridge) {
    for (const rel of BRIDGE_TARGETS) {
      const abs = join(toolRoot, rel);
      if (!existsSync(dirname(abs))) continue;
      await writeFile(abs, bridgeWithHeader(sdkBridge), "utf8");
      log(`✓ 桥 → ${rel}`);
    }
  } else log("⚠ 没拿到 SDK 的 umbra.js，桥没更新");
  return { source: sourceLabel, plugins: checked.map((c) => ({ id: c.id, version: c.version })) };
}

/* ── 命令行入口 ── */
const isMain = process.argv[1] && resolve(process.argv[1]).endsWith(join("dist", "sync_plugins.js"));
if (isMain) {
  const pluginsDir = join(TOOL_ROOT, "plugins");
  if (process.argv.includes("--check")) {
    const st = builtinState(pluginsDir);
    const missing = st.filter((x) => !x.version).map((x) => x.id);
    for (const x of st) console.log(x.version ? `✓ ${x.id} ${x.version}` : `✗ ${x.id} 缺`);
    if (missing.length) {
      console.error(`\n✗ 内置插件不全（缺 ${missing.join(", ")}）。缺了的那种格式（.md / 代码 / 网页）Studio 就打不开，不能打包。先跑 npm --prefix server run sync-plugins`);
      process.exit(1);
    }
  } else {
    try {
      const r = await syncPlugins();
      console.log(`\n✓ ${r.plugins.length} 个内置插件已同步（${r.source}）`);
    } catch (e) {
      console.error(`✗ sync-plugins 失败：${(e as Error).message}`);
      process.exit(1);
    }
  }
}
