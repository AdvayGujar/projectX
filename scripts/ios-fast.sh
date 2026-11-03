#!/usr/bin/env bash
# Fast simulator loop: build without code signing, install, launch.
# Skips prebuild, pod install and Metro startup; run `pnpm ios` once beforehand,
# and keep `pnpm --filter @projectx/mobile start` running for JavaScript reloads.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app_dir="$root/apps/mobile"
workspace="$app_dir/ios/ProjectX.xcworkspace"
scheme="ProjectX"
bundle_id="app.projectx.mobile"
device="${IOS_DEVICE:-iPhone 18 Pro}"

if [ ! -d "$workspace" ]; then
  echo "Missing $workspace." >&2
  echo "Run 'pnpm ios' once to generate the native project and install pods." >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is not available. Install Xcode and run 'xcode-select --switch'." >&2
  exit 1
fi

if ! xcrun simctl list devices booted | grep -q "Booted"; then
  echo "Booting $device…"
  if ! xcrun simctl boot "$device" >/dev/null 2>&1; then
    echo "Could not boot '$device'. Set IOS_DEVICE to an installed simulator name." >&2
    exit 1
  fi
  xcrun simctl bootstatus "$device" -b >/dev/null 2>&1 || true
fi

if ! curl -s -m 2 http://localhost:8081/status | grep -q "packager-status:running"; then
  echo "Metro is not running. In another terminal: pnpm --filter @projectx/mobile start" >&2
fi

echo "Building $scheme for the simulator without code signing…"
started=$(date +%s)
xcodebuild \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=$device" \
  CODE_SIGNING_ALLOWED=NO \
  build -quiet

built_at=$(date +%s)
app_path="$(
  ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/ProjectX-*/Build/Products/Debug-iphonesimulator/ProjectX.app 2>/dev/null | head -1
)"
if [ -z "$app_path" ] || [ ! -d "$app_path" ]; then
  echo "Build finished but ProjectX.app was not found in DerivedData." >&2
  exit 1
fi

xcrun simctl install booted "$app_path"
xcrun simctl launch booted "$bundle_id" >/dev/null

finished=$(date +%s)
echo "Built in $((built_at - started))s, installed and launched in $((finished - built_at))s."
