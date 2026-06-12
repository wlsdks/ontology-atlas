#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/Ontology Atlas.app"
APPLICATIONS_APP_PATH="/Applications/Ontology Atlas.app"
DOGFOOD_APP_PATH="$APP_PATH"
DOGFOOD_DESKTOP_SCREENSHOT="$ROOT_DIR/.tmp/ontology-atlas-dogfood-desktop.png"

cd "$ROOT_DIR"

plist_value() {
  local app_path="$1"
  local key="$2"

  /usr/libexec/PlistBuddy -c "Print :$key" "$app_path/Contents/Info.plist" 2>/dev/null || true
}

sync_existing_applications_copy() {
  [[ -d "$APPLICATIONS_APP_PATH" ]] || return 0

  local built_bundle_id installed_bundle_id executable_name installed_executable

  built_bundle_id="$(plist_value "$APP_PATH" "CFBundleIdentifier")"
  installed_bundle_id="$(plist_value "$APPLICATIONS_APP_PATH" "CFBundleIdentifier")"

  if [[ -z "$built_bundle_id" || "$built_bundle_id" != "$installed_bundle_id" ]]; then
    return 0
  fi

  executable_name="$(plist_value "$APP_PATH" "CFBundleExecutable")"
  if [[ -n "$executable_name" ]]; then
    installed_executable="$APPLICATIONS_APP_PATH/Contents/MacOS/$executable_name"
    pkill -f "$installed_executable" 2>/dev/null || true
  fi

  rm -rf "$APPLICATIONS_APP_PATH"
  ditto "$APP_PATH" "$APPLICATIONS_APP_PATH"
  DOGFOOD_APP_PATH="$APPLICATIONS_APP_PATH"
}

pnpm desktop:build:app
sync_existing_applications_copy
mkdir -p "$ROOT_DIR/.tmp"
pnpm desktop:verify-app -- "$DOGFOOD_APP_PATH" \
  --kill-existing \
  --open-app \
  --require-window \
  --require-owner-name="Ontology Atlas" \
  --min-window-size=1040x720 \
  --require-accessibility-text="Ontology Atlas" \
  --print-window-diagnostics \
  --leave-running
screencapture -x "$DOGFOOD_DESKTOP_SCREENSHOT"
