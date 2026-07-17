#!/bin/zsh

set -euo pipefail

workspace_root="${CI_WORKSPACE:-$(git rev-parse --show-toplevel)}"

cd "$workspace_root/apps/mobile"
npm ci

cd ios
pod install
