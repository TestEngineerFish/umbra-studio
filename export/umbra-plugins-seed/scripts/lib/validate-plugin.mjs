/** 校验一个插件目录。规则清单与来由见 `sdk/PLUGIN-SPEC.md` §六（每条规则在那里有编号，报错信息带编号）。
 *  返回 `{ errors, warnings, infos, manifest, estimate }`，不抛（一次把所有毛病列全，不是修一条报一条）。 */
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_KINDS, HOST_ALLOWED, checkManifestText } from "./manifest.mjs";
import { PACK_EXCLUDE } from "./package.mjs";

export const SDK_DIR = fileURLToPath(new URL("../../sdk/", import.meta.url));
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const PLUGINS_ROOT = join(ROOT, "plugins");

/** 下载侧硬限（Studio `install_plugin_from_url`：50 MB）；超过 10 MB 要在 RESEARCH.md 里说明（doc/23 §五.2） */
export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
export const WARN_PACKAGE_BYTES = 10 * 1024 * 1024;
/** 打包时由 SDK 提供、插件目录里不该提交的两个文件名 */
export const VENDORED = ["umbra.js", "theme.css"];

const b64len = (n) => Math.ceil(n / 3) * 4;

async function walk(dir, base = dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;                 // 打包时也跳过
    const abs = join(dir, e.name);
    if (e.isDirectory()) { await walk(abs, base, out); continue; }
    out.push({ rel: relative(base, abs).split(sep).join("/"), abs, size: (await stat(abs)).size });
  }
  return out;
}

const insideDir = (root, abs) => { const r = relative(root, abs); return r !== "" && !r.startsWith("..") && !resolve(abs).startsWith("..") && resolve(abs).startsWith(resolve(root) + sep); };

/** 从 JS 源码里抠出 import / require 的说明符。`import("x")` 也算。 */
function importSpecs(src) {
  const specs = [];
  const re = /\b(?:import|export)\s*(?:[\w*\s{},$]*?\s*from\s*)?["'`]([^"'`]+)["'`]|\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? m[2] ?? m[3];
    specs.push({ spec, kind: m[3] !== undefined ? "require" : m[2] !== undefined ? "dynamic" : "static" });
  }
  return specs;
}

export async function validatePlugin(dir) {
  const errors = [], warnings = [], infos = [];
  const E = (rule, why) => errors.push(`[${rule}] ${why}`);
  const W = (rule, why) => warnings.push(`[${rule}] ${why}`);
  const I = (rule, why) => infos.push(`[${rule}] ${why}`);
  dir = resolve(dir);
  if (!existsSync(dir)) { E("V0", `目录不存在：${dir}`); return { errors, warnings, infos }; }

  /* ── V1 清单 ── */
  const manPath = join(dir, "manifest.json");
  if (!existsSync(manPath)) { E("V1", "没有 manifest.json"); return { errors, warnings, infos }; }
  const manText = await readFile(manPath, "utf8");
  const mc = await checkManifestText(manText);
  for (const p of mc.problems) E("V1", `manifest ${p.path}：${p.why}`);
  const man = mc.manifest ?? {};
  if (!mc.manifest) return { errors, warnings, infos };

  /* ── V2 目录名 == id ── */
  if (basename(dir) !== man.id) E("V2", `目录名 ${basename(dir)} ≠ manifest.id ${man.id}`);
  if (man.hostApi !== "^1") W("V1", `hostApi 建议写成 "^1"（现在是 ${JSON.stringify(man.hostApi)}）`);

  /* ── V3 文件名 ── */
  const files = await walk(dir);
  for (const f of files) {
    if (!/^[\x21-\x7e]+$/.test(f.rel) || /\s/.test(f.rel)) E("V3", `文件名只许可见 ASCII、不含空格：${f.rel}（非 ASCII 的键排序 JS / Python 不一致，签名会分叉）`);
    for (const seg of f.rel.split("/")) if (/^(0|[1-9][0-9]*)$/.test(seg)) E("V3", `路径段不能是纯数字：${f.rel}（JS 对象会把整数样的键排到前面，签名会分叉）`);
    if (f.rel.includes("\\")) E("V3", `路径里不许有反斜杠：${f.rel}`);
  }
  const dotEntries = (await readdir(dir)).filter((n) => n.startsWith(".") && n !== ".gitignore");
  for (const n of dotEntries) I("V3", `以 . 开头的 ${n} 不进包（打包时跳过）`);

  /* ── V4 vendor 副本 ── */
  for (const v of VENDORED) {
    const p = join(dir, v);
    if (!existsSync(p)) continue;
    if (v === "umbra.js") {
      const same = (await readFile(p)).equals(await readFile(join(SDK_DIR, "umbra.js")));
      if (!same) W("V4", "umbra.js 是过期副本（和 sdk/umbra.js 不同）—— pack 会用 SDK 那份覆盖；别手改它");
    } else {
      I("V4", `${v} 是打包生成物（sdk/theme.css + plugin.css），pack 会重写它`);
    }
  }
  const hasPluginCss = existsSync(join(dir, "plugin.css"));

  /* ── V5 A 面：入口存在 + HTML 里引用的本地文件存在 ── */
  const surfaces = man.surfaces ?? [];
  const htmlEntries = [];
  if (surfaces.includes("ui") && man.ui) htmlEntries.push(["ui", man.ui]);
  for (const [i, pl] of (man.panels ?? []).entries()) if (pl?.entry) htmlEntries.push([`panels[${i}].entry`, pl.entry]);
  for (const [what, rel] of htmlEntries) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) { E("V5", `${what} 指向的 ${rel} 不存在`); continue; }
    const html = await readFile(abs, "utf8");
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const ref = m[1];
      if (/^(https?:|data:|blob:|#|\/__shared\/|\/__preview\/|\/__plugin\/|mailto:)/.test(ref)) {
        if (/^https?:/.test(ref)) W("V5", `${rel} 引用了外部地址 ${ref} —— A 面 CSP 是 default-src 'none'，加载不到`);
        continue;
      }
      const clean = ref.replace(/[?#].*$/, "");
      const target = resolve(dirname(abs), clean);
      if (!target.startsWith(dir + sep)) { E("V5", `${rel} 引用了插件目录外的 ${ref}`); continue; }
      if (VENDORED.includes(basename(clean)) && dirname(target) === dir) {
        if (basename(clean) === "theme.css" && !hasPluginCss) I("V5", "没有 plugin.css：theme.css 只会有 SDK 的 token 和底样式");
        continue;                                            // 打包时拷入
      }
      if (!existsSync(target)) E("V5", `${rel} 引用的 ${ref} 不存在`);
    }
  }
  if (surfaces.includes("ui") && !(man.kinds ?? []).length) W("V5", "声明了 ui 面但没有 kinds —— Studio 不会给它任何文件（有 ui 必须认领至少一种类型才会挂视图）");

  /* ── V6 B 面：入口存在 · 只 import 自己目录下的文件 · 不用 QuickJS 里没有的东西 ── */
  const bSide = [];
  if (surfaces.includes("tools") && man.tools) {
    const entry = join(dir, man.tools);
    if (!existsSync(entry)) E("V6", `tools 指向的 ${man.tools} 不存在`);
    else {
      const seen = new Set();
      const queue = [entry];
      while (queue.length) {
        const f = queue.shift();
        if (seen.has(f)) continue;
        seen.add(f);
        const src = await readFile(f, "utf8");
        bSide.push({ abs: f, rel: relative(dir, f).split(sep).join("/"), src });
        for (const { spec, kind } of importSpecs(src)) {
          if (kind === "require") { E("V6", `${relative(dir, f)} 用了 require(${JSON.stringify(spec)}) —— QuickJS 里没有 require，B 面只能用 ESM import`); continue; }
          if (!spec.startsWith("./") && !spec.startsWith("../")) { E("V6", `${relative(dir, f)} import 了外部模块 ${JSON.stringify(spec)} —— B 面只能 import 插件自己目录下的文件（没有 node 内置模块、没有 npm）`); continue; }
          const target = resolve(dirname(f), spec);
          if (!target.startsWith(dir + sep)) { E("V6", `${relative(dir, f)} import 了插件目录外的 ${spec}`); continue; }
          if (!existsSync(target)) { E("V6", `${relative(dir, f)} import 的 ${spec} 不存在`); continue; }
          queue.push(target);
        }
        for (const bad of ["fetch(", "process.", "WebAssembly", "Buffer.", "setTimeout(", "XMLHttpRequest", "localStorage"]) {
          if (src.includes(bad)) W("V6", `${relative(dir, f)} 用到 ${bad.replace(/[.(]$/, "")} —— QuickJS 沙箱里它是 undefined（没有网络、没有定时器、没有 Node 全局）`);
        }
      }
    }
  }

  /* ── V7 能力名带插件 id 前缀 ── */
  if (surfaces.includes("tools")) {
    let found = 0;
    for (const { rel, src } of bSide) {
      for (const m of src.matchAll(/defineCap\s*\(\s*\{([\s\S]*?)\bname\s*:\s*["'`]([^"'`]+)["'`]/g)) {
        found++;
        const name = m[2];
        if (!name.startsWith(man.id + ".")) E("V7", `${rel} 声明的能力 ${name} 没有以 ${man.id}. 开头 —— 宿主按前缀归属能力，不带前缀的调不到`);
        else if (!/^[a-z0-9_]+$/.test(name.slice(man.id.length + 1))) W("V7", `${rel} 的能力 ${name}：动词建议只用小写字母数字下划线（对外名会把别的字符换成 _）`);
      }
    }
    if (!found) W("V7", "声明了 tools 面但没找到任何 host.defineCap({ name: \"…\" }) —— B 面对 AI 不可见");
  }

  /* ── V8 host.call 用到的能力：在白名单里、清单声明过对应权限 ── */
  const allSrc = [];
  for (const f of files) if (/\.(m?js|html)$/.test(f.rel)) allSrc.push({ rel: f.rel, src: await readFile(f.abs, "utf8") });
  const have = man.permissions?.files ?? [];
  const seenCap = new Set();
  for (const { rel, src } of allSrc) {
    for (const m of src.matchAll(/\.call\s*\(\s*["']([a-z_]+)["']/g)) {
      const cap = m[1];
      if (seenCap.has(rel + cap)) continue;
      seenCap.add(rel + cap);
      const need = HOST_ALLOWED[cap];
      if (!need) { E("V8", `${rel} 调了 ${cap} —— 不在宿主 API v1 白名单里（见 PLUGIN-SPEC.md §三），插件调不到`); continue; }
      if (!have.includes(need)) E("V8", `${rel} 调了 ${cap}，但 manifest.permissions.files 里没有 "${need}" —— 运行时会被宿主拒`);
    }
  }

  /* ── V9 kinds：认领内置类型的提醒 ── */
  for (const [i, k] of (man.kinds ?? []).entries()) {
    if (k.id === "dc") E("V9", `kinds[${i}] 认领了 dc —— 设计稿类型谁都认领不了（claimable: false）`);
    else if (BUILTIN_KINDS.includes(k.id)) I("V9", `kinds[${i}] 认领的是 Studio 内置类型 ${k.id}：ext 以 Studio 为准；非内置插件也能认领，但 priority 封顶 95`);
  }

  /* ── V10 体积估算（base64 后 + vendor 进来的两份）── */
  let raw = 0, b64 = 0;
  for (const f of files) { if (VENDORED.includes(f.rel) || PACK_EXCLUDE.includes(f.rel)) continue; raw += f.size; b64 += b64len(f.size); }
  const sdkJs = (await stat(join(SDK_DIR, "umbra.js"))).size;
  const sdkCss = (await stat(join(SDK_DIR, "theme.css"))).size + (hasPluginCss ? (await stat(join(dir, "plugin.css"))).size : 0);
  raw += sdkJs + sdkCss; b64 += b64len(sdkJs) + b64len(sdkCss);
  const estimate = { rawBytes: raw, base64Bytes: b64 };
  if (b64 > MAX_PACKAGE_BYTES) E("V10", `包体积估算 ${(b64 / 1048576).toFixed(1)} MB（base64 后）超过下载侧硬限 50 MB`);
  else if (b64 > WARN_PACKAGE_BYTES) W("V10", `包体积估算 ${(b64 / 1048576).toFixed(1)} MB（base64 后）超过 10 MB —— 在 RESEARCH.md 里说明为什么`);

  return { errors, warnings, infos, manifest: man, estimate, files: files.length };
}

export async function listPluginIds() {
  const out = [];
  for (const e of await readdir(PLUGINS_ROOT, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith(".")) out.push(e.name);
  return out.sort();
}
