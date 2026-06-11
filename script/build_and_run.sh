#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/Ontology Atlas.app"

cd "$ROOT_DIR"

pnpm desktop:build:app
pnpm desktop:verify-app -- "$APP_PATH" \
  --kill-existing \
  --open-app \
  --require-window \
  --require-owner-name="Ontology Atlas" \
  --min-window-size=1040x720 \
  --require-accessibility-text="Ontology Atlas" \
  --leave-running
