#!/usr/bin/env bash
# 本地快速编译并运行（仅 macOS）：
#   - 只构建 .app，跳过 dmg（避免挂载磁盘镜像失败/残留卷）与 updater 签名
#   - 构建前自动停止正在运行的应用、清理残留的 dmg 挂载卷
#   - 构建完成后自动启动
#
# 用法：./scripts/run-app.sh   （或 pnpm app）
set -euo pipefail

cd "$(dirname "$0")/.."

APP_BUNDLE="target/release/bundle/macos/ClashMorden.app"
APP_BIN="ClashMorden.app/Contents/MacOS/ClashMorden"

echo "==> 停止正在运行的应用"
pkill -f "$APP_BIN" 2>/dev/null || true
sleep 1

echo "==> 清理残留的 dmg 挂载卷"
for v in /Volumes/dmg.*; do
  [ -d "$v" ] || continue
  pkill -f "$v" 2>/dev/null || true
  sleep 1
  diskutil eject "$v" >/dev/null 2>&1 || true
done

echo "==> 编译（仅 .app，无 dmg、无签名）"
# 服务模式使用的是打包进 App 的 sidecar。每次运行前都重新构建并复制
# clashmorden-service，避免继续使用旧的服务安装器。
echo "==> 编译服务 sidecar"
pnpm build:service

pnpm tauri build --config '{"bundle":{"targets":["app"],"createUpdaterArtifacts":false}}'

echo "==> 启动 $APP_BUNDLE"
open "$APP_BUNDLE"

echo "==> 完成"
