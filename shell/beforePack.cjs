/** 打包前先同步内置插件，并在三个内置插件缺任何一个时**拒绝打包**（S4，doc/23 §四.1）。
 *
 *  为什么要闸：S4 起 `plugins/<id>/` 是 `sync-plugins` 从 umbra-plugins 拉来的构建产物，不在仓库里。
 *  新 clone 一份不跑 sync 就打包，打出来的 Studio **打开 .md 只有通用文件卡** ——
 *  而这在开发模式下照样测不出来（开发时你多半同步过）。所以缺了就停，不悄悄打出一个残废包。
 *
 *  做法：每次打包进程只同步一次（`dist:all` 一次进程会为四个目标各调一次 beforePack）。
 *  同步失败（断网 / 没令牌）时：三个目录都在 → 警告「用的是上次同步的那一版」后继续；有缺的 → 抛错停下。
 *  `UMBRA_SKIP_SYNC=1` 跳过同步只做检查（离线打包、或刚手动同步过）。
 *  依赖 `server/dist`（`npm --prefix server run build` 产物，打包本来就要它）。
 */
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const SERVER = join(__dirname, "..", "server");
let synced = false;

/** 跑 server/dist/sync_plugins.js（带参数），把输出原样打到终端，回退出码。 */
function runSync(args) {
  const r = spawnSync(process.execPath, [join(SERVER, "dist", "sync_plugins.js"), ...args], { cwd: SERVER, stdio: "inherit" });
  return r.status ?? 1;
}

exports.default = async function beforePack() {
  if (!synced && process.env.UMBRA_SKIP_SYNC !== "1") {
    synced = true;
    console.log("  • 同步内置插件（sync-plugins）");
    if (runSync([]) !== 0) console.warn("  ⚠ 同步内置插件失败 —— 下面检查一遍 plugins/ 里现有的；都在就用上次同步的那一版继续打包");
  }
  if (runSync(["--check"]) !== 0) {
    throw new Error("内置插件不全，拒绝打包：缺了的那种格式（.md / 代码 / 网页）打包版打不开。先跑 npm --prefix server run sync-plugins");
  }
};
