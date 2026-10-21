/** 界面偏好（2026-10-21，`doc/11` Q77）。
 *
 *  第一项是**文件树里显不显示点文件**，而它的默认值是 **显示** —— 用户 2026-10-21 定的
 *  （原话的意思：点文件也是文件，默认要显示）。
 *
 *  存于 `STATE_ROOT/.umbrastudio/ui_prefs.json`。**属于机器，不随项目走**
 *  （同 `ai_config.json` / `plugin_limits.json`）：「我想不想看见点文件」是看的人的偏好，
 *  换个项目不该重新设一次。
 *
 *  ⚠️ **每次现读**，照 `plugin/limits.ts` 的理由：文件很小，而「改了设置要生效」靠的
 *  就是下一次读到新值 —— 缓存一份的话，还得再想「谁来让它失效」。
 *
 *  读和写的口径**故意不一样**（同 `plugin/limits.ts`）：
 *  · 读：手改坏了的文件（写成字符串、多了键）**回落默认**，不让一份坏配置把文件树弄空；
 *  · 写：不认的键直接拒 —— 界面上以为存进去了而其实没有，比报错糟。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";
import { writeAtomic } from "./normalize.js";
import { STATE_ROOT } from "./project.js";

const PREFS_FILE = join(STATE_ROOT, ".umbrastudio", "ui_prefs.json");

/** 存盘的形状。加一项要同时加到 `PREF_DEFAULTS` —— 那张表是**唯一出处**，
 *  「有哪些偏好」「默认是什么」都从它来，界面也不另抄一份。 */
export interface UiPrefs {
  /** 文件树里显不显示以 `.` 开头的文件与目录。**默认 true。**
   *
   *  ⚠️ 它**管不着我们自己产的东西**（`.umbrastudio/` / `_runtime` / `.DS_Store` …）——
   *  那些由 `isOurArtifact` 一律隐藏，和这个开关无关。开关只管「用户的点文件」。
   *  理由见 `files.ts` 那三条判准的注释：**「以 . 开头」是语法，「这是谁的东西」是归属。** */
  showHiddenFiles: boolean;
}

/** 每一项的默认值。**唯一出处。** */
export const PREF_DEFAULTS: UiPrefs = {
  showHiddenFiles: true,
};

const KEYS = Object.keys(PREF_DEFAULTS) as Array<keyof UiPrefs>;

/** 读偏好。读不到 / 读坏了一律回落默认 —— **一份坏配置不该让文件树变空**。 */
export async function getUiPrefs(): Promise<UiPrefs> {
  const out: UiPrefs = { ...PREF_DEFAULTS };
  let raw: unknown;
  try { raw = JSON.parse(await readFile(PREFS_FILE, "utf8")); } catch { return out; }
  if (!raw || typeof raw !== "object") return out;
  for (const k of KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    /* 只认真正的布尔。`"false"` 这种字符串**不当 false 用** —— 它是真值，
       照 JS 的真假规则会变成 `true`，而写的人想的是 false。回落默认更老实。 */
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** 写偏好（只改点名的那几项，其余保持）。不认的键**当场拒**。 */
export async function setUiPrefs(patch: Record<string, unknown>): Promise<UiPrefs> {
  const unknown = Object.keys(patch).filter((k) => !(KEYS as string[]).includes(k));
  if (unknown.length) {
    throw new ToolError(err(X.BAD_INPUT, unknown[0] as string, { kind: "key", name: unknown[0] as string },
      `不认识这一项界面偏好：${unknown.join(" / ")}`,
      { fix: `认的只有：${KEYS.join(" / ")}` }));
  }
  const next = { ...(await getUiPrefs()) };
  for (const k of KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v !== "boolean") {
      throw new ToolError(err(X.BAD_INPUT, k, { kind: "key", name: k },
        `${k} 要给 true 或 false，给的是 ${typeof v}`, { fix: "传布尔值，不是字符串。" }));
    }
    next[k] = v;
  }
  await writeAtomic(PREFS_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}
