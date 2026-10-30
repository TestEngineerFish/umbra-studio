#!/usr/bin/env bash
# 演示 SketchUp 助手：一行命令起一个**开发模式**的 Studio，并把还没上架的那个插件装进去。
#
#   ./demo-sketchup.sh                      平时就这一句
#   ./demo-sketchup.sh ~/Desktop/方案        顺手打开这个目录（或者直接给一份 .skp）
#   ./demo-sketchup.sh --no-build            刚编过，只想再开一次
#
# 它和 ./start.sh 的差别只有三件：
#   ① 打包 + 装 com.umbra.sketchup（市场里没有它，只能从文件装）
#   ② 带 UMBRASTUDIO_PLUGIN_DEV=1 —— 未签名的开发包才放得行
#   ③ 用一个**独立的 Electron userData** —— 理由在下面 USER_DATA 那一段，这件是必须的
# 装机版（/Applications 里那个 .app）和它的数据目录**一个字节都不碰**。
set -euo pipefail
cd "$(dirname "$0")"
REPO="$PWD"
ID=com.umbra.sketchup

# 帮助就是文件头那段注释本身。⚠️ 不写成 `sed -n '2,13p'` —— 那个数字会在
# 下一次往头上加一行时静默错位（第一版就已经多打出一行 `set -euo pipefail`）。
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; }

build=1; open_path=""
for a in "$@"; do
  case "$a" in
    --no-build) build=0 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "✗ 不认识的参数：$a"; usage; exit 2 ;;
    *) open_path="$a" ;;
  esac
done
[ -z "$open_path" ] || [ -e "$open_path" ] || { echo "✗ 这个路径不存在：$open_path"; exit 2; }

# 插件源码在哪：`UMBRA_PLUGINS_DIR` 和 sync_plugins 用的是同一个变量（S4），别再起第二个。
PLUGINS_REPO="${UMBRA_PLUGINS_DIR:-$REPO/../umbra-plugins}"

# ⚠️⚠️ **为什么要一个独立的 Electron userData**：**单实例锁就住在 userData 里**，
#   而开发模式和装机版共用同一个（`shell/main.mjs` 的 `LEGACY_DATA_DIR` —— 那个目录名
#   被刻意冻结住了，为的是改产品名不让用户的数据跟着消失）。于是**装机版正开着的时候**，
#   这里起的实例拿不到锁就 `process.exit(0)`，而症状是「双击了没反应」或者一句和真因
#   毫无关系的报错（`packtest` 栽过这一次，main.mjs 里记着）。
#   演示这台机器上装机版通常就是开着的，所以这不是「以防万一」。
#   传了 `--user-data-dir` 之后 main.mjs 会给它让路（它显式检查这个参数）。
SUPPORT="$HOME/Library/Application Support"
[ -d "$SUPPORT" ] || SUPPORT="${XDG_DATA_HOME:-$HOME/.local/share}"
USER_DATA="${UMBRA_DEMO_USER_DATA:-$SUPPORT/Umbra Studio Dev}"

# 状态目录（`ai_config.json` / `account.json` / `records/` / 装进去的插件）
# **用开发模式的默认值，也就是这个仓库的根** —— 不另起一个。两条理由：
#   ① 演示要能对话，而**配好的模型就在这儿**：实测装机版那份
#      `…/Application Support/Umbra Studio/.umbrastudio/` 里只有 `workspace.json` /
#      `records/` / `git/`，**没有 `ai_config.json`、没有 `account.json`**。
#      另起一个空目录 = 要么没模型，要么得把密钥往第二处拷一份（CLAUDE.md：key 只放一处）。
#   ② 它本来就不碰装机版的数据：装机版读它自己的 userData，这边写的是仓库里的
#      `.umbrastudio/`（已 gitignore）。
# 想用一个干净的：`UMBRASTUDIO_STATE_DIR=<目录> ./demo-sketchup.sh`
# （核心认这个变量 —— 但换了之后模型要在那边重新配）。

echo "▸ 核心与前端"
for p in server app shell; do
  [ -d "$p/node_modules" ] || npm --prefix "$p" install
done
if [ "$build" = 1 ]; then
  npm --prefix server run build
  npm --prefix app run build
fi

# 内置插件是构建产物（S4）：`.md` 这些格式靠它。照 start.sh 那条路来。
if [ "$build" = 1 ] || ! node server/dist/sync_plugins.js --check >/dev/null 2>&1; then
  node server/dist/sync_plugins.js || echo "⚠ 同步内置插件失败，用 plugins/ 里现有的那一版"
fi
node server/dist/sync_plugins.js --check >/dev/null || { echo "✗ 内置插件不全，打不开 .md 等格式。先跑 npm --prefix server run sync-plugins"; exit 1; }

echo "▸ 打包 $ID"
[ -d "$PLUGINS_REPO/plugins/$ID" ] || {
  echo "✗ 找不到 $PLUGINS_REPO/plugins/$ID"
  echo "  → 它在 umbra-plugins 的 feat/sketchup 分支上：git -C \"$PLUGINS_REPO\" switch feat/sketchup"
  echo "  → 或者 UMBRA_PLUGINS_DIR=<你的 umbra-plugins 检出> $0"
  exit 1
}
VER="$(node -p "require('$PLUGINS_REPO/plugins/$ID/manifest.json').version")"
( cd "$PLUGINS_REPO" && node scripts/pack.mjs "$ID" )
PKG="$PLUGINS_REPO/dist/$ID-$VER.umbraplugin"
[ -f "$PKG" ] || { echo "✗ 打包没产出 $PKG"; exit 1; }

echo "▸ 装进去（开发模式放行未签名包）"
UMBRASTUDIO_PLUGIN_DEV=1 node server/dist/installplugin.js "$PKG"

# 模型配置体检：**离线**，判断用的是产品自己那个 `getOpenAiChannel()`（见 aicheck.ts）。
echo "▸ 体检"
node server/dist/aicheck.js

cat <<EOF

────────────────────────────────────────────────
演示前还有三件要人做的（顺序别换）：

 1. 先把 **SketchUp 2027 开起来**，装好桥接扩展，并**进到一个模型窗口**
    （停在欢迎窗时扩展不加载 —— 扩展装法见 umbra-plugins 的
     extensions/sketchup/DEMO.md 第 1 步）
 2. 再在 Studio 里：**设置** →（往下翻）**本机连接** → 「SketchUp 助手 → SketchUp …」
    那一行点「允许…」，再点一次「确定允许」
    ⚠️ 这一步要 1 做完才点得了：SketchUp 没在跑时那一行显示的是「没在跑」，**没有按钮**
    （SketchUp 重启不用再确认，换了大版本才再问一次）
 3. 打开一个项目，点开里面的 .skp —— 右侧出现「SketchUp 助手」面板，连接条是绿点
    ⚠️ 对话时让这个 .skp 一直开着：AI 只有在上下文里有 .skp 时才拿得到 SketchUp 那些工具

对话脚本（6 句 + 演砸了怎么办）：$PLUGINS_REPO/extensions/sketchup/DEMO.md
要重置这个演示实例：rm -rf "$USER_DATA"
────────────────────────────────────────────────

EOF

# ⚠️ `${…}` 不是风格偏好：`$VAR` 紧跟一个**全角字符**时，bash 3.2（macOS 自带的那个，
#   `#!/usr/bin/env bash` 在这台机器上解析到的就是它）会把那个字符的**首字节吃进变量名** ——
#   `"$USER_DATA）"` 报的是 `USER_DATA\xef: unbound variable`。第一版就栽在这里：
#   前面每一步都跑完了、读数全对，**只有最后那句起 Studio 没执行**。
#   > **一个中文仓库里，「变量后面紧跟一个中文标点」是默认写法 —— 而它在 bash 里是个坑。**
echo "▸ 起 Studio（状态目录 ${REPO} · userData ${USER_DATA}）"
# 直接起 electron 二进制，不经 `npm start` —— userData 的路径里有空格，
# 多一层 npm 就多一层要靠它转义的引号。
ELECTRON="$REPO/shell/node_modules/.bin/electron"
[ -x "$ELECTRON" ] || { echo "✗ 没有 ${ELECTRON}，先跑 npm --prefix shell install"; exit 1; }
mkdir -p "$USER_DATA"
exec env UMBRASTUDIO_PLUGIN_DEV=1 "$ELECTRON" "$REPO/shell" --user-data-dir="$USER_DATA" ${open_path:+"$open_path"}
