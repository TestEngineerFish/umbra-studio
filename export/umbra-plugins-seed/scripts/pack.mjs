#!/usr/bin/env node
/** 打包：`node scripts/pack.mjs <id> [<id>…] | --all [--out dist] [--skip-validate]`。
 *
 *  1. 先校验（同 validate.mjs；有 error 不打）
 *  2. vendor：把 `sdk/umbra.js` 拷进插件目录；`theme.css` = `sdk/theme.css` + 插件的 `plugin.css`
 *     （这两个文件在插件目录里是 .gitignore 掉的生成物）
 *  3. 按 `sdk/PACKAGE-FORMAT.md` 打成 `dist/<id>-<version>.umbraplugin`（**不签名** —— 签名在服务端上传时做）；
 *     `plugin.css` 是打包输入，不进包（它的内容已在生成的 theme.css 里）
 *
 *  零依赖，容器格式和 Studio `server/src/plugin/pack.ts` 字节级一致（测试向量钉着）。 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PACK_EXCLUDE, canonical, encodePackage, packDir, sha256hex } from "./lib/package.mjs";
import { PLUGINS_ROOT, ROOT, SDK_DIR, listPluginIds, validatePlugin } from "./lib/validate-plugin.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const ids = args.includes("--all") ? await listPluginIds() : args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const outDir = resolve(ROOT, opt("--out", "dist"));
const skipValidate = args.includes("--skip-validate");
if (!ids.length) {
  console.error("用法：node scripts/pack.mjs <插件 id> [<id>…] | --all [--out dist] [--skip-validate]");
  process.exit(2);
}

/** 把 SDK 拷进插件目录。返回写了哪些文件。 */
export async function vendorSdk(dir) {
  const umbra = await readFile(join(SDK_DIR, "umbra.js"));
  await writeFile(join(dir, "umbra.js"), umbra);
  const tokens = await readFile(join(SDK_DIR, "theme.css"), "utf8");
  const own = existsSync(join(dir, "plugin.css")) ? await readFile(join(dir, "plugin.css"), "utf8") : "";
  const theme = `/* 由 scripts/pack.mjs 生成：sdk/theme.css + plugin.css。别手改 —— 改 plugin.css 或 sdk/theme.css 再重打 */\n`
    + tokens + (own ? `\n/* ── ${own.startsWith("/*") ? "" : "插件自己的样式 "}plugin.css ── */\n` + own : "");
  await writeFile(join(dir, "theme.css"), theme, "utf8");
  return ["umbra.js", "theme.css"];
}

await mkdir(outDir, { recursive: true });
let bad = 0;
for (const id of ids) {
  const dir = join(PLUGINS_ROOT, id);
  if (!skipValidate) {
    const r = await validatePlugin(dir);
    if (r.errors.length) {
      console.log(`✗ ${id} 没过校验，不打：`);
      for (const e of r.errors) console.log(`    ✗ ${e}`);
      bad++; continue;
    }
    for (const w of r.warnings) console.log(`  ⚠ ${id}: ${w}`);
  }
  await vendorSdk(dir);
  const pkg = await packDir(dir, PACK_EXCLUDE);   // plugin.css 已拼进 theme.css，不进包
  const buf = encodePackage(pkg);
  const name = `${pkg.manifest.id}-${pkg.manifest.version}.umbraplugin`;
  const out = join(outDir, name);
  await writeFile(out, buf);
  const fileSha = sha256hex(buf), canonSha = sha256hex(canonical(pkg));
  await writeFile(out + ".sha256", `${fileSha}  ${name}\ncanonical ${canonSha}\n`, "utf8");
  console.log(`✓ ${pkg.manifest.id} ${pkg.manifest.version} → ${out}`);
  console.log(`  ${Object.keys(pkg.files).length} 个文件 · ${(buf.length / 1024).toFixed(1)} KB · 未签名 · canonical sha256 ${canonSha.slice(0, 16)}…`);
}
if (bad) { console.log(`\n✗ ${bad}/${ids.length} 个没打出来`); process.exit(1); }
