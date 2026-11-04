#!/usr/bin/env bash
# End-of-session cleanup. Removes generated artifacts only; never source or user data.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ -f "$root/scripts/android-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$root/scripts/android-env.sh"
fi

free_before="$(df -h / | awk 'NR==2 {print $4}')"

if command -v adb >/dev/null 2>&1; then
  adb emu kill >/dev/null 2>&1 || true
fi
if command -v xcrun >/dev/null 2>&1; then
  xcrun simctl shutdown booted >/dev/null 2>&1 || true
fi
if [ -x apps/mobile/android/gradlew ]; then
  (cd apps/mobile/android && ./gradlew --stop >/dev/null 2>&1 || true)
fi

# apps/mobile/ios/build holds React Native's codegen output, which only `pod install`
# regenerates. Expo skips pod install when Pods are current, so deleting it breaks the
# next build with "Build input file cannot be found" in ReactCodegen.
rm -rf \
  apps/mobile/android/app/build \
  apps/mobile/android/build \
  apps/mobile/android/.gradle \
  apps/mobile/android/app/.cxx \
  dist \
  dist-ios \
  spikes/out

if command -v pnpm >/dev/null 2>&1; then
  pnpm store prune >/dev/null 2>&1 || true
fi

free_after="$(df -h / | awk 'NR==2 {print $4}')"
printf 'Free before: %s\nFree after:  %s\n' "$free_before" "$free_after"
