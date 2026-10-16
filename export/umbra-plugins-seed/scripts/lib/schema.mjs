/** 迷你 JSON Schema 校验器（零依赖）。
 *
 *  只实现 `sdk/manifest.schema.json` 用到的那个子集：
 *  type · enum · const · pattern · minLength · minimum · maximum · minItems · maxItems · uniqueItems ·
 *  items · contains · properties · required · additionalProperties · allOf · anyOf · not · if/then/else ·
 *  `false` 子模式 · `$ref` 到 `#/$defs/…`。
 *  **schema 里别用这之外的关键字** —— 这里对不认识的关键字一律报错，不会静默放过
 *  （静默放过 = schema 写了等于没写，而 Studio 那边照样拒装）。
 */
const KNOWN = new Set(["$schema", "$id", "$comment", "$defs", "title", "description", "examples", "default",
  "type", "enum", "const", "pattern", "minLength", "minimum", "maximum", "minItems", "maxItems", "uniqueItems",
  "items", "contains", "properties", "required", "additionalProperties", "allOf", "anyOf", "not", "if", "then", "else", "$ref"]);

const typeOf = (v) => v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
const typeOk = (v, t) => t === "number" ? typeof v === "number" : t === "integer" ? Number.isInteger(v) : typeOf(v) === t;

export function validateSchema(root, value, schema = root, path = "$", out = []) {
  if (schema === true) return out;
  if (schema === false) { out.push({ path, why: "这里不允许出现" }); return out; }
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`schema 用了迷你校验器不认识的关键字 ${k}（在 ${path}）`);
  if (schema.$ref) {
    const m = /^#\/\$defs\/([^/]+)$/.exec(schema.$ref);
    if (!m || !root.$defs?.[m[1]]) throw new Error(`$ref 只支持 #/$defs/<名>：${schema.$ref}`);
    validateSchema(root, value, root.$defs[m[1]], path, out);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) { out.push({ path, why: `要 ${types.join("|")}，得到 ${typeOf(value)}` }); return out; }
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push({ path, why: `只认 ${schema.enum.map((e) => JSON.stringify(e)).join(" / ")}，得到 ${JSON.stringify(value)}` });
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push({ path, why: `必须是 ${JSON.stringify(schema.const)}` });
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) out.push({ path, why: `不合形状 ${schema.pattern}：${JSON.stringify(value)}` });
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push({ path, why: schema.minLength === 1 ? "不能为空" : `至少 ${schema.minLength} 个字符` });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) out.push({ path, why: `不能小于 ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) out.push({ path, why: `不能大于 ${schema.maximum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push({ path, why: `至少 ${schema.minItems} 项` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push({ path, why: `最多 ${schema.maxItems} 项` });
    if (schema.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) out.push({ path, why: "有重复项" });
    if (schema.items !== undefined) value.forEach((v, i) => validateSchema(root, v, schema.items, `${path}[${i}]`, out));
    if (schema.contains !== undefined && !value.some((v) => validateSchema(root, v, schema.contains, path, []).length === 0)) out.push({ path, why: "缺少必须包含的项" });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const r of schema.required ?? []) if (!(r in value)) out.push({ path: `${path}.${r}`, why: "必填" });
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in value) validateSchema(root, value[k], sub, `${path}.${k}`, out);
    if (schema.additionalProperties !== undefined) {
      for (const k of Object.keys(value)) if (!(k in (schema.properties ?? {}))) validateSchema(root, value[k], schema.additionalProperties, `${path}.${k}`, out);
    }
  }
  for (const s of schema.allOf ?? []) validateSchema(root, value, s, path, out);
  if (schema.anyOf && !schema.anyOf.some((s) => validateSchema(root, value, s, path, []).length === 0)) out.push({ path, why: "不符合任何一种允许的形状" });
  if (schema.not !== undefined && validateSchema(root, value, schema.not, path, []).length === 0) out.push({ path, why: "命中了被禁止的形状" });
  if (schema.if !== undefined) {
    const hit = validateSchema(root, value, schema.if, path, []).length === 0;
    if (hit && schema.then !== undefined) validateSchema(root, value, schema.then, path, out);
    if (!hit && schema.else !== undefined) validateSchema(root, value, schema.else, path, out);
  }
  return out;
}
