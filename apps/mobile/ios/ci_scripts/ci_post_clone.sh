#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

script_dir="$(cd "$(dirname "$0")" && pwd)"
mobile_root="$(cd "$script_dir/../.." && pwd)"

cd "$mobile_root"

if ! command -v npm >/dev/null 2>&1; then
  brew install node
fi

npm ci

if ! command -v pod >/dev/null 2>&1; then
  gem install cocoapods --no-document
fi

/usr/bin/arch -arm64 /bin/bash --login -c "cd '$mobile_root/ios' && pod install"
