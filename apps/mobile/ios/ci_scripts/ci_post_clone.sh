#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
mobile_root="$(cd "$script_dir/../.." && pwd)"

cd "$mobile_root"
npm ci

cd ios
pod install
