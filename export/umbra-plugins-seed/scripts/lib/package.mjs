/** `.umbraplugin` 容器：打包 / 编码 / 解码 / canonical。
 *
 *  **零依赖、和 Studio `server/src/plugin/pack.ts` 字节级一致** —— 规则正本在 `sdk/PACKAGE-FORMAT.md`，
 *  改这里之前先改那份，再用 `scripts/verify-test-vectors.mjs` 证明测试向量还对得上。
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const FORMAT = 1;
/** 没写 `priority` 的 kind 在容器的 manifest 副本里会被补成这个值（Studio `checkManifest` 的行为） */
export const PLUGIN_DEFAULT_PRIORITY = 50;

/** 打包输入、不进包的文件（相对插件根）。**这不是容器格式的规则，是本仓库 pack.mjs 的规则**：
 *  `plugin.css` 已经被拼进生成的 `theme.css`，再装一份只是浪费体积、还让 Studio 侧多出一个它不认识的文件。 */
export const PACK_EXCLUDE = ["plugin.css"];

/** 读一个目录成 `路径 → base64`。规则同 pack.ts：跳过以 `.` 开头的名字（文件和目录都跳），
 *  路径用 `/` 分隔，相对插件根。返回时**按键排好序** —— 签名不要求这一点（canonical 自己会排），
 *  但排了之后同一台机器上两次打包字节相同，便于比对。`exclude` 是额外不进包的相对路径。 */
export async function readDirAsFiles(dir, exclude = []) {
  const files = {};
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const abs = join(d, e.name);
      if (e.isDirectory()) { await walk(abs); continue; }
      const rel = relative(dir, abs).split(sep).join("/");
      if (exclude.includes(rel)) continue;
      files[rel] = (await readFile(abs)).toString("base64");
    }
  };
  await walk(dir);
  return sortKeys(files);
}

export function sortKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

/** 容器里那份 manifest 副本 = `files["manifest.json"]` 解析后经 `checkManifest` 归一的结果。
 *  归一只做一件事：`kinds[i].priority ??= 50`（键追加在那个 kind 对象的末尾）。
 *  ⚠️ 这一步**影响签名字节**（副本参与 canonical），跨语言实现必须照做。 */
export function normalizeManifest(manifest) {
  const m = JSON.parse(JSON.stringify(manifest));
  for (const k of m.kinds ?? []) if (k.priority === undefined) k.priority = PLUGIN_DEFAULT_PRIORITY;
  return m;
}

/** 确定性序列化：**签的是这个**。`files` 键排序，`manifest` 保持副本里的键序，无空格，非 ASCII 不转义。 */
export function canonical(pkg) {
  return Buffer.from(JSON.stringify({ format: pkg.format, manifest: pkg.manifest, files: sortKeys(pkg.files) }), "utf8");
}

export const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

/** 目录 → 未签名的包对象。`checkManifest` 由调用方先做（validate 那边有完整规则），这里只做结构。 */
export async function packDir(dir, exclude = []) {
  const files = await readDirAsFiles(dir, exclude);
  const raw = files["manifest.json"];
  if (!raw) throw new Error(`${dir} 里没有 manifest.json`);
  const manifest = normalizeManifest(JSON.parse(Buffer.from(raw, "base64").toString("utf8")));
  return { format: FORMAT, manifest, files };
}

/** 包对象 → `.umbraplugin` 字节（gzip 过的 JSON）。键序 format / manifest / files / signature。 */
export function encodePackage(pkg) {
  const ordered = { format: pkg.format, manifest: pkg.manifest, files: pkg.files };
  if (pkg.signature) ordered.signature = pkg.signature;
  return gzipSync(Buffer.from(JSON.stringify(ordered), "utf8"));
}

export function decodePackage(buf) {
  let json;
  try { json = gunzipSync(buf).toString("utf8"); }
  catch { throw new Error("这不是一个 .umbraplugin 包（gzip 解不开）"); }
  const pkg = JSON.parse(json);
  if (pkg.format !== FORMAT) throw new Error(`包格式版本 ${pkg.format} 认不了，这一版只认 ${FORMAT}`);
  if (!pkg.files || typeof pkg.files !== "object") throw new Error("包里没有 files");
  return pkg;
}
