#!/usr/bin/env bash
# 一键起桌面版（给人用的，不是给回归用的）：缺依赖就装、编译核心与前端、起 Electron 壳。
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

exec npm --prefix shell start
