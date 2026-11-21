#!/usr/bin/env node
/**
 * Copies the static export into the folder Tauri embeds (`build.frontendDist`), leaving out what only
 * the public website serves: Tauri compiles every file into the executable and the updater ships it whole.
 * Everything not named here is kept, so a new route reaches the app without touching this file. A path
 * the app requests but the folder lacks falls back to the root `index.html`, which sends the window to
 * `/<locale>/`. Reasons per entry live in `tests/contract/desktop/desktop-frontend-paths.contract.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listLocales } from "../i18n/build-messages.mjs";

export const WEB_ONLY_ROOT_ENTRIES = [
  "demo",
  "gateway",
  "og",
  "og-image.png",
  "llms.txt",
  "llms-full.txt",
  "robots.txt",
  "sitemap.xml",
];

export const WEB_ONLY_LOCALE_ROUTES = ["download"];

/**
 * The `/project/<slug>` pages the export pre-renders exist for the bundled samples. The app opens
 * every project through these two, which read the slug from the query.
 */
export const APP_PROJECT_PAGES = ["fallback", "new"];

export const DESKTOP_FRONTEND_SOURCE = "out";
export const DESKTOP_FRONTEND_TARGET = path.join("src-tauri", "target", "desktop-frontend");

/** `relativePath` uses `/` on every platform. */
export function isDesktopFrontendPath(relativePath, { locales = listLocales() } = {}) {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return true;
  if (parts.length === 1 || !locales.includes(parts[0])) {
    return !WEB_ONLY_ROOT_ENTRIES.includes(parts[0]);
  }
  const [, route, page] = parts;
  if (WEB_ONLY_LOCALE_ROUTES.includes(route)) return false;
  if (route === "project" && page !== undefined) return APP_PROJECT_PAGES.includes(page);
  return true;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function sizeOf(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
    files += 1;
  }
  return { bytes, files };
}

export function stageDesktopFrontend({
  root = process.cwd(),
  source = path.join(root, DESKTOP_FRONTEND_SOURCE),
  target = path.join(root, DESKTOP_FRONTEND_TARGET),
  locales = listLocales(root),
} = {}) {
  for (const required of ["index.html", "_next"]) {
    if (!fs.existsSync(path.join(source, required))) {
      throw new Error(`${path.join(source, required)} is missing; run pnpm build first.`);
    }
  }
  if (locales.length === 0) throw new Error("no locale under messages/; cannot tell locale routes apart");

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const dropped = [];
  fs.cpSync(source, target, {
    recursive: true,
    filter: (from) => {
      const relative = toPosix(path.relative(source, from));
      const keep = isDesktopFrontendPath(relative, { locales });
      if (!keep) dropped.push(relative);
      return keep;
    },
  });
  return { source: sizeOf(source), staged: sizeOf(target), dropped: dropped.sort() };
}

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const report = stageDesktopFrontend();
    console.log(
      `[desktop-frontend] staged ${report.staged.files} files (${mib(report.staged.bytes)}) of ` +
        `${report.source.files} (${mib(report.source.bytes)}) into ${DESKTOP_FRONTEND_TARGET}; ` +
        `left out ${report.dropped.length} web-only paths`,
    );
  } catch (error) {
    console.error(`[desktop-frontend] ${error.message}`);
    process.exitCode = 1;
  }
}
