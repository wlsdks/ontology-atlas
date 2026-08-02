#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

export function cleanTauriMacosApps({ root: workspaceRoot = root } = {}) {
  // Tauri embeds `frontendDist` in the Rust executable. Removing only the old
  // `.app` lets Cargo reuse a binary that still contains yesterday's web build.
  // Keep dependency artifacts, but force the cheap final crate relink so the
  // bundle always receives the `out/` that `beforeBuildCommand` just produced.
  fs.rmSync(
    path.join(workspaceRoot, "src-tauri", "target", "release", "ontology-atlas"),
    { force: true },
  );

  const macosBundleDir = path.join(
    workspaceRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
  );

  if (!fs.existsSync(macosBundleDir)) {
    return [];
  }

  const removed = [];
  for (const entry of fs.readdirSync(macosBundleDir)) {
    if (!entry.endsWith(".app")) continue;

    const appPath = path.join(macosBundleDir, entry);
    const stat = fs.lstatSync(appPath);
    if (!stat.isDirectory()) continue;

    fs.rmSync(appPath, { recursive: true, force: true });
    removed.push(entry);
  }

  return removed.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const removed = cleanTauriMacosApps();
  if (removed.length === 0) {
    console.log("[desktop-clean] no stale macOS app bundles to remove");
  } else {
    console.log(`[desktop-clean] removed stale macOS app bundles: ${removed.join(", ")}`);
  }
}
