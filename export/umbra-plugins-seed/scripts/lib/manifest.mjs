/** 清单校验：`sdk/manifest.schema.json` + 几条 schema 表达不了的规则。
 *  规则来源逐条写在 `sdk/PLUGIN-SPEC.md` §二；这里的每一条在 Studio `server/src/plugin/manifest.ts`
 *  的 `checkManifest` 里都有对应物，**没有对应物的不加** —— validate 比 Studio 严可以，比它松不行，
 *  但严出来的每一条都要能说出 Studio 那边为什么也会出事。 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateSchema } from "./schema.mjs";

const SDK = join(fileURLToPath(new URL("../../sdk/", import.meta.url)));
let schemaCache = null;
export async function loadSchema() {
  return schemaCache ??= JSON.parse(await readFile(join(SDK, "manifest.schema.json"), "utf8"));
}

/** Studio 内置类型的 id（`server/src/shared/kinds.ts` 的 `BUILTIN`）。
 *  认领它们时 `ext` 可以空着（扩展名由 Studio 说了算）；**第三方插件认领不了 `dc`**（`claimable: false`）。 */
export const BUILTIN_KINDS = ["dir", "dc", "md", "image", "json", "code", "html", "other"];

/** 宿主 API v1 白名单（`server/src/plugin/host.ts` 的 `ALLOWED`）：能力 → 要清单里声明哪种 files 权限。
 *  ⚠️ 这是一份**镜像**，正本在 Studio。对不上时以 Studio 为准，并回来改这里。 */
export const HOST_ALLOWED = {
  list_files: "read", read_file: "read", list_file_versions: "read", read_file_version: "read",
  compare_file_versions: "read", list_file_refs: "read", count_file_types: "read", get_staged_draft: "read",
  stage_draft: "write", clear_staged_draft: "write", write_file: "write", move_file: "write",
  trash_file: "write", revert_file: "write",
};

/** 浮点字面量扫描：JSON 文本里出现 `1.0` / `1e3` 这种数字就拒。
 *  原因在 PACKAGE-FORMAT.md §四：JS 把 `1.0` 串成 `1`，Python 保留 `1.0`，签名就对不上；清单里本来也没有需要小数的字段。 */
export function findFloatLiterals(jsonText) {
  const hits = [];
  /* 只看字符串外面的数字：先把字符串抠掉再找 */
  const stripped = jsonText.replace(/"(?:[^"\\]|\\.)*"/g, (s) => " ".repeat(s.length));
  for (const m of stripped.matchAll(/-?\d+(?:\.\d+|[eE][+-]?\d+)+/g)) hits.push(m[0]);
  return hits;
}

/** 完整校验。返回 `{ ok, problems: [{path, why}], manifest }`；`manifest` 是解析结果（未归一）。 */
export async function checkManifestText(text) {
  const problems = [];
  let manifest;
  try { manifest = JSON.parse(text); }
  catch (e) { return { ok: false, problems: [{ path: "$", why: `不是合法 JSON：${e.message}` }] }; }
  for (const f of findFloatLiterals(text)) problems.push({ path: "$", why: `清单里有浮点字面量 ${f} —— 跨语言 canonical 会分叉，改成整数` });
  const schema = await loadSchema();
  problems.push(...validateSchema(schema, manifest));
  /* schema 表达不了的：认领内置类型时才许 ext 为空 */
  for (const [i, k] of (Array.isArray(manifest.kinds) ? manifest.kinds : []).entries()) {
    if (k && typeof k === "object" && Array.isArray(k.ext) && k.ext.length === 0 && !BUILTIN_KINDS.includes(k.id)) {
      problems.push({ path: `$.kinds[${i}].ext`, why: "至少要认一个扩展名（只有认领 Studio 内置类型时才可以空着）" });
    }
  }
  return { ok: problems.length === 0, problems, manifest };
}
