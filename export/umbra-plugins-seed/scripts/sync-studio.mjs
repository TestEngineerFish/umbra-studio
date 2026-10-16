#!/usr/bin/env node
/** 给 Umbra Studio 用：把内置插件的包解到 Studio 的 `plugins/<id>/<version>/`（doc/23 §四.1）。
 *
 *    node scripts/sync-studio.mjs --studio <Studio 仓库路径> --release <v0.1.0 | 本地 dist 目录>
 *                                 [--repo owner/umbra-plugins] [--ids com.umbra.markdown,com.umbra.code,com.umbra.html]
 *
 *  `--release` 给一个存在的目录就用里面的 `*.umbraplugin`；否则当成 GitHub Release 的 tag，
 *  经 `api.github.com` 列资产再下载（公开仓库不用令牌；私有仓库设 `GITHUB_TOKEN`）。
 *
 *  只做三件事：解包（gzip → JSON，format 必须为 1）→ 逐条查路径逃逸 → 写到 `<studio>/plugins/<id>/<version>/`。
 *  **整个 `<id>/` 目录先清掉再写** —— Studio 的内置插件目录没有「多版本并存」这一说，
 *  旧版留着会被 `pickVersion`（按字典序取最大）选错。签名若有也落成 `.sig`（Studio 对内置的不验，留着不碍事）。 */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, normalize, relative, resolve, sep } from "node:path";
import { decodePackage } from "./lib/package.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const studio = opt("--studio");
const release = opt("--release");
const repo = opt("--repo", process.env.UMBRA_PLUGINS_REPO ?? "TestEngineerFish/umbra-plugins");
const ids = new Set(opt("--ids", "com.umbra.markdown,com.umbra.code,com.umbra.html").split(",").map((s) => s.trim()).filter(Boolean));
if (!studio || !release) {
  console.error("用法：node scripts/sync-studio.mjs --studio <Studio 路径> --release <tag | dist 目录> [--repo owner/name] [--ids a,b,c]");
  process.exit(2);
}
const studioRoot = resolve(studio);
if (!existsSync(join(studioRoot, "server", "src", "plugin", "store.ts"))) {
  console.error(`✗ ${studioRoot} 看起来不是 Umbra Studio 仓库（找不到 server/src/plugin/store.ts）`);
  process.exit(2);
}
const pluginsDir = join(studioRoot, "plugins");

/** 找到要装的包文件（本地目录或 Release 下载到临时目录） */
async function collectPackages() {
  if (existsSync(release) && statSync(release).isDirectory()) {
    const names = (await readdir(release)).filter((n) => n.endsWith(".umbraplugin"));
    return names.map((n) => join(release, n));
  }
  const headers = { accept: "application/vnd.github+json", "user-agent": "umbra-plugins-sync" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(release)}`;
  const res = await fetch(api, { headers });
  if (!res.ok) throw new Error(`取 Release ${release} 失败：${res.status} ${res.statusText}（${api}）`);
  const rel = await res.json();
  const assets = (rel.assets ?? []).filter((a) => a.name.endsWith(".umbraplugin"));
  if (!assets.length) throw new Error(`Release ${release} 里没有 .umbraplugin 资产`);
  const tmp = await mkdtemp(join(tmpdir(), "umbra-plugins-"));
  const out = [];
  for (const a of assets) {
    const wanted = [...ids].some((id) => a.name.startsWith(id + "-"));
    if (!wanted) continue;
    const r = await fetch(a.browser_download_url, { headers: { ...headers, accept: "application/octet-stream" } });
    if (!r.ok) throw new Error(`下载 ${a.name} 失败：${r.status}`);
    const file = join(tmp, a.name);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    out.push(file);
  }
  return out;
}

const isInside = (base, abs) => { const r = relative(base, abs); return r !== "" && !r.startsWith("..") && !r.includes(".." + sep); };

async function unpackTo(file) {
  const pkg = decodePackage(await readFile(file));
  const raw = pkg.files["manifest.json"];
  if (!raw) throw new Error(`${basename(file)} 里没有 manifest.json`);
  const man = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  if (!ids.has(man.id)) return null;
  if (!/^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/.test(man.id) || !/^[0-9]+(\.[0-9]+){0,2}(-[0-9a-z.]+)?$/.test(man.version)) {
    throw new Error(`${basename(file)} 的 id / version 形状不对：${man.id} ${man.version}`);
  }
  const idDir = join(pluginsDir, man.id);
  const target = join(idDir, man.version);
  /* 先把所有路径查一遍再落盘 —— 任何一步失败都不留半个目录 */
  const writes = [];
  for (const [rel, b64] of Object.entries(pkg.files)) {
    if (rel.includes("\\") || rel.startsWith("/")) throw new Error(`${basename(file)} 里有逃出插件目录的路径：${rel}`);
    const abs = join(target, normalize(rel));
    if (!isInside(target, abs)) throw new Error(`${basename(file)} 里有逃出插件目录的路径：${rel}`);
    writes.push([abs, Buffer.from(b64, "base64")]);
  }
  await rm(idDir, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const [abs, buf] of writes) { await mkdir(dirname(abs), { recursive: true }); await writeFile(abs, buf); }
  if (pkg.signature) await writeFile(join(target, ".sig"), pkg.signature, "utf8");
  return { id: man.id, version: man.version, files: writes.length, dir: target, signed: !!pkg.signature };
}

const pkgs = await collectPackages();
const done = [];
for (const f of pkgs) {
  const r = await unpackTo(f);
  if (r) { done.push(r); console.log(`✓ ${r.id} ${r.version} → ${relative(studioRoot, r.dir)}（${r.files} 个文件${r.signed ? "，已签名" : "，未签名"}）`); }
}
const missing = [...ids].filter((id) => !done.some((d) => d.id === id));
if (missing.length) { console.error(`✗ 没找到这些插件的包：${missing.join(", ")}`); process.exit(1); }
console.log(`\n✓ ${done.length} 个内置插件已同步到 ${pluginsDir}`);
