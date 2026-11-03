#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/android-env.sh"

exec pnpm --filter @projectx/mobile android
