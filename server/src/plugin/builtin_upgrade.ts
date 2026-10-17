/** 内置插件被市场升级（S4 §3，`doc/23` D2 的目的）：准入规则 + 加载时用哪一份。**全是纯函数**，`upgradetest` 逐条钉。
 *
 *  原来（M11-6 五路攻击里「覆盖内置」那一道）：包的 id 是内置插件 → 一律拒。那一道防的是
 *  **「借内置的身份拿特权」** —— 内置插件免费、卸不掉、能认领内置类型（`md` / `html` / `code` …），
 *  第三方插件三样都没有。S4 要让内置插件也能走市场更新，但这道闸不能简单拆掉，改成三条全满足才放行：
 *
 *  ① **验签通过**（`verifyPackage` 已经在前面做了；dev 模式的未签名包也放行，但照常标 `unsigned`）
 *  ② **版本严格高于出厂那份** —— 等于或更低的一律拒：「装一个同版本 / 旧版本的内置包」唯一的用途是替换内容
 *  ③ **认领的内置类型是出厂那份的子集**（可以相等）—— 升级不能顺便多抢内置类型。
 *     ⚠️ 只限「认领内置类型」，**不限它自己定义的新类型**：核过 `shared/kinds.ts` 与 `store.registerPluginKinds`，
 *     认领内置类型（`isBuiltinKind`）是**只有 bundled 才有的特权**，而定义新类型（`registerKind`，有重名闸、priority 封顶）
 *     第三方插件本来就能做 —— 限它不挡任何特权，只会挡住「code 插件发新版多支持一种语言」这种正常升级（D2 要的就是它）。
 *     `dc`（设计稿）在内置表里是 `claimable: false`，出厂那份本来就不认领它，所以 ③ 顺带也挡住了升级包去认领 `dc`。
 *
 *  加载（`pickBuiltin`）同一套规则**再算一遍**，不信「装的时候查过」：手动拷进 STATE_ROOT 的目录不经安装流程。
 *  所以加载时还要求升级那份**签名现在验得过**（或 dev 模式）—— 否则谁往 `.umbrastudio/plugins/com.umbra.markdown/9.9.9/`
 *  拷一份就能顶替内置插件、白拿「认领 md」的特权。不满足就**静默用出厂那份**（出厂那份永远在，退回它不会让任何东西坏掉）。
 *
 *  `builtin: true` 的语义不变：升级后的那份照样免费、能认领内置类型；「卸载」它 = 删 STATE_ROOT 那份、退回出厂版本。 */
import { compareVersion } from "./version.js";
import type { PluginManifest } from "./manifest.js";

/** 判一个清单认领了哪些内置类型（注入 `isBuiltin`，测试不依赖类型表的运行期状态）。 */
export function builtinClaims(man: Pick<PluginManifest, "kinds">, isBuiltin: (id: string) => boolean): string[] {
  return [...new Set((man.kinds ?? []).map((k) => k.id).filter(isBuiltin))].sort();
}

/** 装一个 id 为内置的包能不能进：回空串 = 放行，否则回拒绝原因（人话）。
 *  前提：`verifyPackage` 已经过了（①）—— 这里只判 ② ③。 */
export function builtinUpgradeRefusal(pkg: Pick<PluginManifest, "id" | "version" | "kinds">, factory: Pick<PluginManifest, "version" | "kinds">, isBuiltin: (id: string) => boolean): string {
  if (compareVersion(pkg.version, factory.version) <= 0) {
    return `${pkg.id} 是内置插件，出厂版本 ${factory.version}；这个包是 ${pkg.version}，不比它高 —— 内置插件只能升级，不能用同版本或旧版本覆盖`;
  }
  const allowed = new Set(builtinClaims(factory, isBuiltin));
  const extra = builtinClaims(pkg, isBuiltin).filter((k) => !allowed.has(k));
  if (extra.length) {
    return `${pkg.id} 的升级包多认领了内置类型 ${extra.join(" / ")}（出厂那份只认领 ${[...allowed].join(" / ") || "无"}）—— 升级不能顺便多抢内置类型`;
  }
  return "";
}

/** 加载时同一个内置 id 用哪一份：`"upgrade"` = STATE_ROOT 那份，`"factory"` = TOOL_ROOT 那份，附原因（给日志 / 判据）。 */
export function pickBuiltin(p: {
  factory: Pick<PluginManifest, "version" | "kinds">;
  upgrade: Pick<PluginManifest, "id" | "version" | "kinds"> | null;
  /** 升级那份清单有没有毛病（`checkManifest` 的 problems + id 与目录名不一致） */
  upgradeProblems: number;
  /** 升级那份签名**现在**验不验得过 */
  upgradeSigned: boolean;
  /** 开发模式（`UMBRASTUDIO_PLUGIN_DEV=1`）：未签名的也用，界面照常标未签名 */
  dev: boolean;
  isBuiltin: (id: string) => boolean;
}): { use: "upgrade" | "factory"; why: string } {
  if (!p.upgrade) return { use: "factory", why: "没有升级版" };
  if (p.upgradeProblems > 0) return { use: "factory", why: "升级那份清单有毛病" };
  if (!p.upgradeSigned && !p.dev) return { use: "factory", why: "升级那份没有验得过的签名（不是开发模式）" };
  const refuse = builtinUpgradeRefusal(p.upgrade, p.factory, p.isBuiltin);
  if (refuse) return { use: "factory", why: refuse };
  return { use: "upgrade", why: "" };
}
