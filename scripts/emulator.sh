#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/android-env.sh"

AVD="${1:-Pixel_9}"
if [ "$#" -gt 0 ]; then
  shift
fi

exec "$ANDROID_HOME/emulator/emulator" -avd "$AVD" -no-audio -no-boot-anim -no-snapshot-load "$@"
