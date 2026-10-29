/** 本机桥接的授权标记：用户在设置里允许过「这个插件连这个端点」没有。
 *
 *  契约见 `doc/S8` §五。这里只有一件事：**一个只有那颗开关会写的文件。**
 *
 *  ⚠️⚠️ **为什么是一个专门的标记文件，而不是「某个目录在不在」**：
 *  M14-7 / Q70 原来的判准正是后者（`records/<key>/` 在不在），而 `stage_draft`
 *  顺手把那个目录建出来了 —— **用户在只读状态下打几个字就把自己解锁了**。
 *  > **一个「存在性」判准，会被任何顺手建出那个东西的代码路径悄悄满足。**
 *  所以这里的文件只有 `grantLocal()` 会写，而它只有那颗开关会调。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { STATE_ROOT } from "../project.js";
import { majorOf } from "./localbridge.js";

/** 授权记下来的东西。`major` 是确认那一刻对端的主版本号。 */
export interface LocalGrant {
  at: string;
  app: string;
  major: string | null;
}

const grantsDir = (): string => join(STATE_ROOT, ".umbrastudio", "local", "grants");

/** 一个 `(plugin, endpoint)` 一个文件。
 *  ⚠️ 插件 id 里有点（`com.umbra.sketchup`），端点名只许 `[a-z0-9_]` —— 用 `__` 连，
 *  两边都不可能产生歧义（点不会出现在端点名里，`__` 不会出现在插件 id 里）。 */
const grantFile = (pluginId: string, endpoint: string): string =>
  join(grantsDir(), `${pluginId}__${endpoint}.json`);

/** 用户点了那颗开关。**幂等**：再点一次只是刷新 `at`。 */
export function grantLocal(pluginId: string, endpoint: string, app: string, version: string | undefined): LocalGrant {
  const g: LocalGrant = { at: new Date().toISOString(), app, major: majorOf(version) };
  const f = grantFile(pluginId, endpoint);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(g, null, 1) + "\n", "utf8");
  return g;
}

/** 用户把开关关了。 */
export function revokeLocal(pluginId: string, endpoint: string): boolean {
  const f = grantFile(pluginId, endpoint);
  if (!existsSync(f)) return false;
  rmSync(f, { force: true });
  return true;
}

/** 授权还算不算。
 *
 *  ⚠️⚠️ **SketchUp 重启不重新确认**（geek-99 2026-10-30 定）：端口和令牌每次启动都变，
 *  **拿它们当身份的一部分只会每次都弹一次窗，而用户会直接关掉这个功能**。
 *  > 这是 M14-2 那条的同一句：`dev` 只记不比 —— **把每次都变的东西算进等号，只会误伤**。
 *  只有 `app` 变了、或者 `version` 的**主版本号**变了，才要重新问。
 *  ⚠️ 主版本认不出来时（对端没报 `version`）**不拿它当否决条件** ——
 *  读不到不等于不一样（同 `tokentest` 那条「读不到一律不算失效」的方向）。 */
export function localGranted(pluginId: string, endpoint: string, app: string, version: string | undefined): { ok: true } | { ok: false; why: string } {
  const f = grantFile(pluginId, endpoint);
  if (!existsSync(f)) return { ok: false, why: "还没允许过这个插件连它" };
  let g: LocalGrant;
  try { g = JSON.parse(readFileSync(f, "utf8")) as LocalGrant; }
  catch { return { ok: false, why: "授权记录读不出来，请重新允许一次" }; }
  if (g.app !== app) return { ok: false, why: `上次允许的是 ${g.app}，这次在跑的是 ${app} —— 请重新允许一次` };
  const now = majorOf(version);
  if (g.major !== null && now !== null && g.major !== now) {
    return { ok: false, why: `上次允许的是 ${app} ${g.major}.x，这次是 ${now}.x —— 大版本换了，请重新允许一次` };
  }
  return { ok: true };
}

/** 列出已有的授权（设置页那一块要显示「允许过哪些」）。 */
export function listLocalGrants(): Array<{ plugin: string; endpoint: string; grant: LocalGrant }> {
  const d = grantsDir();
  if (!existsSync(d)) return [];
  const out: Array<{ plugin: string; endpoint: string; grant: LocalGrant }> = [];
  for (const name of readdirSync(d)) {
    if (!name.endsWith(".json")) continue;
    const stem = name.slice(0, -5);
    const i = stem.lastIndexOf("__");
    if (i < 0) continue;
    try {
      out.push({ plugin: stem.slice(0, i), endpoint: stem.slice(i + 2), grant: JSON.parse(readFileSync(join(d, name), "utf8")) as LocalGrant });
    } catch { /* 坏文件当没有 —— 不要因为一条读不出来就让整张表空掉（§九十二 那条） */ }
  }
  return out.sort((a, b) => (a.plugin + a.endpoint).localeCompare(b.plugin + b.endpoint));
}

/** 清掉指向某个插件的全部授权（卸插件时）。 */
export function dropGrantsOf(pluginId: string): number {
  let n = 0;
  for (const g of listLocalGrants()) if (g.plugin === pluginId && revokeLocal(g.plugin, g.endpoint)) n++;
  return n;
}
