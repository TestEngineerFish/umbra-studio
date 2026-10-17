#!/usr/bin/env bash
# 一键起桌面版（给人用的，不是给回归用的）：缺依赖就装、编译核心与前端、同步内置插件、起 Electron 壳。
# 用法：./start.sh            —— 平时就这一句
#      ./start.sh --no-build  —— 只起壳，不重新编译（刚编过、只想再开一次）
# 等价的手工步骤见 README「快速启动」§4.5。
set -euo pipefail
cd "$(dirname "$0")"

build=1
[ "${1:-}" = "--no-build" ] && build=0

# 三个 package 各自的 node_modules 缺了才装（壳的 Electron 二进制走 shell/.npmrc 里的镜像）。
for p in server app shell; do
  [ -d "$p/node_modules" ] || npm --prefix "$p" install
done

if [ "$build" = 1 ]; then
  npm --prefix server run build
  npm --prefix app run build
fi

# 内置插件是构建产物（S4）：从 umbra-plugins 拉（本地 ../umbra-plugins 优先，否则 GitHub Release）。
# --no-build 时只在缺了才拉；拉不到而 plugins/ 里三个都在，就用上次那一版照常起。
if [ "$build" = 1 ] || ! node server/dist/sync_plugins.js --check >/dev/null 2>&1; then
  node server/dist/sync_plugins.js || echo "⚠ 同步内置插件失败，用 plugins/ 里现有的那一版"
fi
node server/dist/sync_plugins.js --check >/dev/null || { echo "✗ 内置插件不全，打不开 .md 等格式。先跑 npm --prefix server run sync-plugins"; exit 1; }

exec npm --prefix shell start
