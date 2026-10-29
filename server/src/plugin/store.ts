import { readFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { STATE_ROOT, TOOL_ROOT } from "../project.js";
import { checkManifest, type PluginManifest } from "./manifest.js";
import { verifyInstalled } from "./pack.js";
import { PLUGIN_DEFAULT_PRIORITY, isBuiltinKind, isClaimable, registerKind, unregisterKindsFrom } from "../shared/kinds.js";
import { PLUGIN_ID_RE, pluginIdDir } from "./paths.js";
import { compareVersion } from "./version.js";
import { pickBuiltin } from "./builtin_upgrade.js";

/** 插件在盘上住哪、怎么列（M11-4）。
 *
 *  ⚠️ **一定是 `STATE_ROOT`，不能是 `TOOL_ROOT`**（`00` §63.1 栽过）：
 *  打包后 `TOOL_ROOT` 在 `.app` 里是**只读**的，而插件要能装、能删、能更新。
 *  这一类缺陷开发模式下测不出来 —— 开发时两个 root 都可写。
 *
 *  目录形状 `STATE_ROOT/.umbrastudio/plugins/<id>/<version>/`：
 *  版本各占一个目录，**切换是改指针，回退只要把指针改回去**（`doc/20` §6.3）。
 */
export const PLUGINS_DIR = join(STATE_ROOT, ".umbrastudio", "plugins");

/** **内置插件**：跟主程序一起发、免费、卸不掉（`doc/20` §七：「默认我们会提供文本的编辑插件」）。
 *
 *  ⚠️ 它在 `TOOL_ROOT` 而不是 `STATE_ROOT` —— 打包后那是 `.app` 里的**只读**位置，
 *  正好对：内置插件本来就不该能删能改。用户买的插件才进 `STATE_ROOT`（可写）。
 *  **两个 root 混了在开发模式下测不出来**（开发时都可写，`00` §63.1 栽过）。 */
/** ⚠️ **临时注入点，和 `BUNDLED_DIR` 本身同生共死。**
 *
 *  **删除条件**：M16-5 把内置插件这个概念整个去掉的时候，连 `BUNDLED_DIR` 一起删。
 *
 *  为什么要有它：M16-1 要钉住「**没装任何插件时 `.md` 给纯文本**」这条承诺，
 *  而 `TOOL_ROOT` 是从 `server/dist/` 往上**硬算**两级 —— 于是
 *  **「没装任何插件」这个状态在判据里压根造不出来**，除非真去动仓库里的 `plugins/`。
 *  > **要测「没有 X 的时候会怎样」，先得有办法造出「没有 X」。**
 *  > 这条判据缺的不是「有人想到」，是**那个状态没有旋钮**。
 *
 *  形式照 `STATE_ROOT` 的 `UMBRASTUDIO_STATE_DIR`（`project.ts:54`）—— 不是新模式。
 *  ⚠️ 它**不是**「只有测试会走的产品分支」：和 `UMBRASTUDIO_STATE_DIR` / `UMBRASTUDIO_PUBKEY`
 *  一样，它只是把一个本来就该可配的根变成可配的。产品行为一个字不变。 */
export const BUNDLED_DIR = process.env.UMBRASTUDIO_BUNDLED_DIR
  ? resolve(process.env.UMBRASTUDIO_BUNDLED_DIR)
  : join(TOOL_ROOT, "plugins");

export interface InstalledPlugin {
  manifest: PluginManifest;
  /** 这一版在盘上的绝对路径 */
  dir: string;
  /** 内置的（跟主程序一起发）：免费、卸不掉 */
  bundled: boolean;
  /** **未签名**：现在按目录内容重算一遍并验签，验不过就是。
   *
   *  ⚠️ 这个判据挪过两次，两次都是往同一个方向：
   *  「装的时候有没有人标过」→「目录里有没有 `.sig`」→「**签名现在验不验得过**」。
   *  前两版分别被「手动 `cp` 进来的目录」和「随便写一个 `.sig`」绕过。
   *  **「有签名」和「签名验得过」是两件事。**
   *
   *  内置插件不算未签名：它跟主程序一起发，主程序本身的签名就是它的签名。 */
  unsigned: boolean;
  /** 清单有毛病时装不上，但要**列得出来**并说清为什么 —— 
   *  静静不显示的话，用户只会看到「我装的插件不见了」 */
  problems: Array<{ field: string; why: string }>;
  /** 内置插件**正在用 STATE_ROOT 里升级装的那一版**（S4 §3）。`bundled` 仍为 true（免费、能认领内置类型）；
   *  「卸载」它 = 删掉升级那份、退回出厂版本 */
  upgraded?: boolean;
  /** 内置插件出厂（TOOL_ROOT）那一版的版本号 —— 只有内置插件有 */
  factoryVersion?: string;
}

/** 内置 id → 正在用的升级版目录（STATE_ROOT 里）。**由 `listInstalled` 算、`pluginDirOf` 读** ——
 *  后者是同步的、在 http 静态路径上，验签是异步的，不能每个文件请求都验一次；
 *  两处必须用同一个结论，否则会出现「列表里是升级版，加载的是出厂版」这种最难查的错。
 *  启动时 `registerPluginKinds` 会先跑一次 `listInstalled`；装 / 切 / 卸之后也都会再跑。 */
const upgradedDirs = new Map<string, string>();

/** 扫一遍装了什么。坏的也列出来，带上毛病。
 *  **内置的排在前面**，用户装的在后。同 id 时：
 *  - 第三方 id —— 不会和内置撞（撞了就是下面这一条）；
 *  - **内置 id**（S4 §3）—— STATE_ROOT 里有**更高版本、签名验得过（或 dev 模式）、没多认领内置类型**的那一份才用它，
 *    否则用出厂那份（`builtin_upgrade.ts pickBuiltin`；装的时候查过一遍，这里再查一遍 —— 手动拷进来的目录不经安装流程）。 */
export async function listInstalled(): Promise<InstalledPlugin[]> {
  const factory: InstalledPlugin[] = [];
  const user: InstalledPlugin[] = [];
  await scanRoot(BUNDLED_DIR, true, factory);
  await scanRoot(PLUGINS_DIR, false, user);
  const out: InstalledPlugin[] = factory.map((f) => ({ ...f, factoryVersion: f.manifest.version }));
  const nextUpgraded = new Map<string, string>();
  for (const row of user) {
    const at = out.findIndex((x) => x.bundled && x.manifest.id === row.manifest.id);
    if (at < 0) { out.push(row); continue; }
    const f = out[at]!;
    const pick = pickBuiltin({
      factory: f.manifest, upgrade: row.manifest, upgradeProblems: row.problems.length + f.problems.length,
      upgradeSigned: !row.unsigned, dev: process.env.UMBRASTUDIO_PLUGIN_DEV === "1", isBuiltin: isBuiltinKind,
    });
    if (pick.use !== "upgrade") continue;   // 出厂那份照用；升级那份留在盘上，「退回出厂版本」能把它删掉
    out[at] = { ...row, bundled: true, upgraded: true, factoryVersion: f.manifest.version };
    nextUpgraded.set(row.manifest.id, row.dir);
  }
  upgradedDirs.clear();
  for (const [k, v] of nextUpgraded) upgradedDirs.set(k, v);
  return out;
}

async function scanRoot(root: string, bundled: boolean, out: InstalledPlugin[]): Promise<void> {
  if (!existsSync(root)) return;
  for (const id of await readdir(root)) {
    const idDir = join(root, id);
    if (!(await stat(idDir).catch(() => null))?.isDirectory()) continue;
    const v = await pickVersion(idDir);
    if (!v) continue;
    const dir = join(idDir, v);
    let raw: unknown = null;
    try { raw = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")); }
    catch (e) { out.push({ manifest: { id } as PluginManifest, dir, bundled, unsigned: !bundled, problems: [{ field: "manifest.json", why: `读不了或不是合法 JSON：${(e as Error).message}` }] }); continue; }
    const r = checkManifest(raw);
    /* 清单里的 id 必须和目录名一致 —— 不一致的话，同一个插件会按两个身份存在：
       按目录名卸载，按清单 id 注册能力，卸不干净。 */
    const idMismatch = r.ok && r.manifest!.id !== id
      ? [{ field: "id", why: `清单里写的是 ${r.manifest!.id}，但装在 ${id} 目录下` }] : [];
    const row = {
      manifest: (r.manifest ?? { id } as PluginManifest), dir, bundled,
      /* **真验一次**，不是看 `.sig` 在不在 —— 随便写一个文件就能冒充已签名 */
      unsigned: !bundled && !(await verifyInstalled(dir)).ok,
      problems: [...r.problems, ...idMismatch],
    };
    /* 同一个 root 里同 id 只会有一个目录；跨 root（内置 vs 升级）由 `listInstalled` 决定 */
    const at = out.findIndex((x) => x.manifest.id === row.manifest.id);
    if (at >= 0) out[at] = row; else out.push(row);
  }
}

export async function uninstall(id: string): Promise<boolean> {
  /* 内置的卸不掉。**这里要挡住** —— 不挡的话打包后它会去删 `.app` 里的目录，
     在 macOS 上那会毁掉签名，应用下次打开就「已损坏」（`00` §六十三 栽过同类的）。 */
  /* ⚠️ **这个 id 来自调用方，不来自清单**（issue #23，p0）：`uninstall("../..")`
     原来直接 `join` 出 `STATE_ROOT` 再 `rm -rf`，开发模式下就是整个仓库。
     `uninstall_plugin` 在 MCP 面上 —— 任何接入的模型客户端都能调，没确认、没回收站。
     所以这里必须过 `pluginIdDir` 的两道闸（形状 + 结果在内），形状不对就抛。 */
  const dir = pluginIdDir(PLUGINS_DIR, id);
  if (!existsSync(dir)) return false;
  /* 只删插件自己的目录。**插件改过的文件不动** —— 那是用户的东西（`doc/20` §6.4） */
  await rm(dir, { recursive: true, force: true });
  /* ⚠️⚠️ **本机连接的许可要跟着删**（2026-10-30，契约 `doc/S8`）。
     不删的后果很具体：卸掉再装回同一个 id，它**静默继承了上一次的许可** ——
     而用户以为「卸了就等于收回了」。而重装的那一份可以是另一个作者的同名包。
     > **一张按 id 发的许可，在那个 id 可以被别人重新占用时，不能比它的持有者活得更久。**
     ⚠️ 同时断掉连接：许可没了而池子里那条连接是在有许可时建的（同 `revoke_local` 那一处）。 */
  const { dropGrantsOf } = await import("./grants.js");
  const { closeAllLocal } = await import("./localbridge.js");
  if (dropGrantsOf(id) > 0) closeAllLocal();
  return true;
}

/** 一个插件当前用的那一版在哪（静态托管要用）。找不到给 null。
 *  ⚠️ **同步的** —— 它在 http 请求路径上，异步会让每个静态文件多一次事件循环往返。 */
/** 用哪一版：**先看 `current` 指针**，没有就用最新的。
 *  指针是 M11-6 加的 —— 切版本 / 回退靠改它，所以读的地方必须认它，
 *  不认的话「切回上一版」点了没反应（列表显示切了，加载的还是新版）。 */
async function pickVersion(idDir: string): Promise<string | null> {
  const versions = (await readdir(idDir)).filter((x) => x !== "current").sort(compareVersion);
  try {
    const cur = (await readFile(join(idDir, "current"), "utf8")).trim();
    if (cur && versions.includes(cur)) return cur;
  } catch { /* 没指针，用最新 */ }
  return versions[versions.length - 1] ?? null;
}

export function pluginDirOf(id: string): string | null {
  /* 和 `listInstalled` 用**同一个结论**（内置 id 走 `upgradedDirs`）。
     不一致的话会出现「列表里显示新版，实际加载的是内置旧版」这种最难查的错。 */
  /* 形状不对直接说找不到 —— 这个函数的语义是「找得到吗」，它在 http 静态路径上，
     不抛异常。⚠️ 但**不能只靠 `existsSync` 偶然拦住** ——
     原来 `pluginDirOf("../../etc")` 返回 null 是因为那个目录正好不存在，
     换成一个存在的目录（`../../projects`）就能列出它下面的文件名。 */
  if (!PLUGIN_ID_RE.test(id)) return null;
  /* 内置 id：用 `listInstalled` 算好的结论（升级版 or 出厂版），**不在这里自己再挑一次** */
  if (existsSync(join(BUNDLED_DIR, id))) {
    const up = upgradedDirs.get(id);
    if (up && existsSync(up)) return up;
    return pickDirSync(join(BUNDLED_DIR, id));
  }
  return pickDirSync(join(PLUGINS_DIR, id));
}

/** 同步版的「用哪一版」：current 指针 > 最高版本。找不到给 null。 */
function pickDirSync(idDir: string): string | null {
  if (!existsSync(idDir)) return null;
  try {
    const versions = readdirSync(idDir).filter((x) => x !== "current").sort(compareVersion);
    let v = versions[versions.length - 1];
    /* 同步读指针 —— 这个函数在 http 请求路径上，异步会给每个静态文件多一次往返 */
    try {
      const cur = readFileSync(join(idDir, "current"), "utf8").trim();
      if (cur && versions.includes(cur)) v = cur;
    } catch { /* 没指针 */ }
    return v ? join(idDir, v) : null;
  } catch { return null; }
}

/** 把装好的插件加的文件类型注册进**服务端**的类型表（M11-5）。
 *
 *  ⚠️ **这一步漏掉过一次。** 前端和服务端各有一份类型表（`shared/kinds.ts` 是同一份源码，
 *  但跑在两个进程里，是两个实例）。只在前端注册的话：详情区能认出这种文件、
 *  用插件的视图打开，但**目录列里的类型列和图标还是「其他」** ——
 *  因为那一列是服务端 `list_files` 算好给的。
 *  症状是「插件装上了，但文件在列表里看着没变化」。
 */
export async function registerPluginKinds(): Promise<{ id: string; kinds: string[] }[]> {
  /* ⚠️ **必须可重复调**（M11-10）：装完 / 切版本 / 卸完都要再跑一次。
     先把插件加的类型全摘掉再重新注册 —— 不摘的话第二次调用会全部撞「已经有了」，
     而那时新装的插件一种类型都注册不上，症状是「装了没反应」。
     内置类型不受影响（`unregisterKindsFrom` 只摘带 `from` 的）。 */
  for (const p of await listInstalled()) unregisterKindsFrom(p.manifest.id);
  const out: { id: string; kinds: string[] }[] = [];
  for (const p of await listInstalled()) {
    if (p.problems.length) continue;
    const ids: string[] = [];
    for (const k of p.manifest.kinds ?? []) {
      /* **认领**内置类型：类型本来就在表里，不用（也不能）再注册一次。
       *
       *  ⚠️⚠️ **M16-3（2026-10-23）把判准从「是不是 bundled」换成「这个类型允不允许被认领」。**
       *  原来这里写的是 `if (p.bundled) ids.push(k.id)`，理由写在旧注释里：
       *  「只有内置插件能这么做 —— 第三方插件认领 `dc` 就等于劫持设计稿」。
       *  **而那个理由只对 `dc` 成立**，不对 `md` / `json` / `html` / `code` 成立 ——
       *  `dc` 本来就有 `claimable: false` 精确守着（`shared/kinds.ts`）。
       *  > **它用「是不是 bundled」这个粗判准，去守一件 `isClaimable` 已经守住的事。**
       *
       *  撤掉它是 sam 2026-10-23 那条产品边界的要求（`doc/11` Q79）：
       *  「不应该有『内置插件』这个说法」—— 而「只有出厂插件能认领 `.md`」
       *  正是那个说法在代码里最硬的一处。
       *
       *  ⚠️ **换完之后前后端口径才一致**：前端 `loader.ts:64` 一直是按
       *  `isClaimable` 放行的，而这里按 `bundled` 拦。两边不一致的后果是**静默的** ——
       *  一个第三方 md 插件装上去，前端注册成功、服务端不认，
       *  而**没有任何一边会说话**（症状：「插件装上了，但文件在列表里看着没变化」）。
       *
       *  ⚠️ 顺带比原来**更严**：`bundled` 插件现在也认领不了 `dc` 了。
       *  那是对的 —— `claimable: false` 的注释写着「设计稿被接管等于整个产品坏掉」，
       *  而那句话对出厂插件一样成立。已核三个出厂插件认领的是
       *  code/json/csv/source · html · md/mdx/qmd/rmd，**没有一个认领 `dc`**。
       *
       *  ⚠️ 护栏换成了 `PLUGIN_MAX_PRIORITY`(95)：`md` 是 90，所以第三方插件
       *  **可以**用 95 盖过内置的 markdown —— 那正是要的（用户装了就该让它赢）；
       *  而 `dc` 是 100 > 95，抢不走。 */
      if (isBuiltinKind(k.id)) { if (isClaimable(k.id)) ids.push(k.id); continue; }
      try {
        registerKind({
          id: k.id, label: k.label, icon: k.icon, priority: k.priority ?? PLUGIN_DEFAULT_PRIORITY,
          textual: k.textual, match: (n) => k.ext.some((e) => n.endsWith(e)), from: p.manifest.id,
        });
        ids.push(k.id);
      } catch { /* 撞车 / 想劫持内置类型：跳过这一种，别让一个坏插件把整轮注册带崩 */ }
    }
    if (ids.length) out.push({ id: p.manifest.id, kinds: ids });
  }
  return out;
}
