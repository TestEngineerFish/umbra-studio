/** 插件版本号比较（S4，2026-10-17）。形状由 `paths.ts PLUGIN_VERSION_RE` 卡死：`1` / `1.2` / `1.2.3`，可带 `-预发布`。
 *
 *  ⚠️ 原来各处挑「最新一版」用的是字符串 `.sort()` —— 字典序下 `1.10.0` < `1.9.0`，
 *  插件出到第十个小版本那天就会挑错。内置插件升级的准入是「**严格高于**出厂版本」，
 *  这一条拿字典序判是错的，所以单独起一个按段比数字的比较器。
 *
 *  规则（semver 的子集）：主 / 次 / 补丁逐段按数字比，缺的段当 0（`1.2` == `1.2.0`）；
 *  段相等时，**不带预发布的高于带的**（`1.0.0` > `1.0.0-beta`）；两个都带就按 `.` 分段比，纯数字段按数字、其余按字符串。 */

/** a < b 回负数，a == b 回 0，a > b 回正数。**纯函数**，可直接给 `Array.prototype.sort` 用。 */
export function compareVersion(a: string, b: string): number {
  const [ca, pa] = split(a), [cb, pb] = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (ca[i] ?? 0) - (cb[i] ?? 0);
    if (d) return d;
  }
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  const xa = pa.split("."), xb = pb.split(".");
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const s = xa[i], t = xb[i];
    if (s === undefined) return -1;
    if (t === undefined) return 1;
    const ns = /^\d+$/.test(s), nt = /^\d+$/.test(t);
    if (ns && nt) { const d = Number(s) - Number(t); if (d) return d; continue; }
    if (ns !== nt) return ns ? -1 : 1;
    if (s !== t) return s < t ? -1 : 1;
  }
  return 0;
}

/** 拆成 [数字段, 预发布]。不认的段当 0 —— 形状早在 `checkManifest` / 目录名那两道闸卡过了。 */
function split(v: string): [number[], string] {
  const i = v.indexOf("-");
  const core = i >= 0 ? v.slice(0, i) : v;
  return [core.split(".").map((x) => Number(x) || 0), i >= 0 ? v.slice(i + 1) : ""];
}

/** 一组版本里最高的那个（空数组给 undefined）。 */
export function highestVersion(vs: string[]): string | undefined {
  return [...vs].sort(compareVersion).pop();
}
