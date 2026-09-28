import path, { type PlatformPath } from "node:path";
import { isInside as insideOrSelf } from "../pathguard.js";

/** 插件目录路径的两道闸（issue #23 / #25，2026-09-27）。
 *
 *  为什么要单独一个文件：`id` 和 `version` **兼做目录名**，而拼目录的地方有六处
 *  （卸载 / 列版本 / 切版本 / 找目录 / 装包 / 静态托管）。原来每处各自拼，
 *  于是 `checkManifest` 卡住的那道正则只护住了「装」这一条路 ——
 *  **卸载那条路的 id 来自调用方，不来自清单**，一次 `uninstall("../..")`
 *  就能递归删掉 `STATE_ROOT`（开发模式下等于整个仓库）。
 *
 *  ⚠️ 两道闸**都要**，不是重复：
 *  ① 形状：`id` / `version` 必须长成它该有的样子；
 *  ② 结果：拼完的路径必须真在根目录里面 —— **现场算一遍**，不靠①的结论。
 *  ①是「记住的结论」（有人放宽正则它就失效），②是「现在去算」。
 *  §100.2 那条判据挪了三次才对，方向就是从①走向② —— 这里两道一起上。
 */

/** 反写域名式 id。**和 `checkManifest` 用的是同一个常量** ——
 *  原来清单里写一份、别处心里想一份，放宽了其中一处就出现分叉。 */
export const PLUGIN_ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/;

/** 版本号也兼做目录名，所以一样要卡死。
 *  ⚠️ 原来 `checkManifest` 对 `version` 只查「非空字符串」，
 *  而 `installPackage` 拿它拼 `target` 后先 `rm(target, recursive)` ——
 *  `version = "../../.."` 就是删掉 `STATE_ROOT`，而且之后写文件时的逃逸检查
 *  以这个**已经逃出去的** target 为基准，形同虚设。 */
export const PLUGIN_VERSION_RE = /^[0-9]+(\.[0-9]+){0,2}(-[0-9a-z.]+)?$/;

/** `abs` 是不是真在 `base` 里面。**平台无关** —— 判据是 `relative` 的结果，
 *  不是字符串前缀。
 *
 *  ⚠️ 原来 install.ts 写的是 `abs.startsWith(target + "/")`，硬编码了 posix 分隔符。
 *  Windows 上 `join` 产出 `\`，于是**包里每一个正常文件都被判成「逃出插件目录」**，
 *  第一份文件就抛错 —— win 上任何插件都装不上（issue #25）。
 *  现有回归测不出来：`packtest` 对 win 产物只验结构。
 *
 *  `p` 可以传 `path.win32` / `path.posix`，让一份判定函数在两个平台的规则下都能测
 *  —— 这样「在 mac 上验 win 的行为」不需要真机。
 *
 *  `base` 自己不算在里面：要写的是它**下面**的文件，写到目录自己身上没有意义。 */
export function isInside(base: string, abs: string, p: PlatformPath = path): boolean {
  /* 借项目那一份做「在不在里面」的判定，**这里额外要求「在它下面」** ——
     `base` 自己不算（要写的是它里面的文件，写到目录身上没有意义）。
     判定本身只有一份：`pathguard.ts`（issue #19 把它收拢到那里）。 */
  return p.relative(base, abs) !== "" && insideOrSelf(base, abs, p);
}

/** 一个插件在某个根下的 id 目录。形状不对就**抛**，不返回 null ——
 *  返回 null 会被上游当成「没装过」而静静走过去（`uninstall` 原来就返回 false），
 *  而调用方传了 `../..` 这种东西时，我们要说出来。 */
export function pluginIdDir(root: string, id: string): string {
  if (!PLUGIN_ID_RE.test(id)) throw new Error(`插件 id 形状不对，拒绝用它拼路径：${JSON.stringify(id)}`);
  const dir = path.join(root, id);
  if (!isInside(root, dir)) throw new Error(`插件 id 拼出来的路径跑到插件目录外面了：${JSON.stringify(id)}`);
  return dir;
}

/** 一个插件某一版的目录。id 和 version 两段都过闸。 */
export function pluginVersionDir(root: string, id: string, version: string): string {
  const idDir = pluginIdDir(root, id);
  if (!PLUGIN_VERSION_RE.test(version)) throw new Error(`插件版本号形状不对，拒绝用它拼路径：${JSON.stringify(version)}`);
  const dir = path.join(idDir, version);
  if (!isInside(idDir, dir)) throw new Error(`版本号拼出来的路径跑到插件目录外面了：${JSON.stringify(version)}`);
  return dir;
}
