#!/usr/bin/env node
/** 校验插件：`node scripts/validate.mjs <id> [<id>…]` 或 `--all`。
 *  查什么、为什么，见 `sdk/PLUGIN-SPEC.md` §六。有一条 error 就退出码 1；warning 不拦。 */
import { join } from "node:path";
import { PLUGINS_ROOT, listPluginIds, validatePlugin } from "./lib/validate-plugin.mjs";

const args = process.argv.slice(2);
const ids = args.includes("--all") ? await listPluginIds() : args.filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("用法：node scripts/validate.mjs <插件 id> [<id>…] | --all");
  process.exit(2);
}

let bad = 0;
for (const id of ids) {
  const r = await validatePlugin(join(PLUGINS_ROOT, id));
  const mark = r.errors.length ? "✗" : "✓";
  const size = r.estimate ? ` · 估 ${(r.estimate.base64Bytes / 1024).toFixed(0)} KB（base64 后）` : "";
  console.log(`${mark} ${id}${r.manifest ? ` ${r.manifest.version}` : ""}${r.files !== undefined ? ` · ${r.files} 个文件` : ""}${size}`);
  for (const e of r.errors) console.log(`    ✗ ${e}`);
  for (const w of r.warnings) console.log(`    ⚠ ${w}`);
  for (const i of r.infos) console.log(`    · ${i}`);
  if (r.errors.length) bad++;
}
console.log(bad ? `\n✗ ${bad}/${ids.length} 个插件没过` : `\n✓ ${ids.length} 个插件全过`);
process.exit(bad ? 1 : 0);
