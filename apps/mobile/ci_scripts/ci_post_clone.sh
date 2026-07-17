#!/bin/zsh

set -euo pipefail

repository_root="${CI_PRIMARY_REPOSITORY_PATH:-$(git rev-parse --show-toplevel)}"
mobile_root="$repository_root/apps/mobile"

if [[ ! -f "$mobile_root/package.json" ]]; then
  mobile_root="$repository_root"
fi

cd "$mobile_root"
npm ci

cd ios
pod install
