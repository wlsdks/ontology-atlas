import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesktopHarness, openFolderInApp } from "../../lib/desktop-app/open-folder-in-app.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RAIL_TIMEOUT_MS = 60_000;
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

export const VAULT_DIR_ENV = "UI_LOOK_VAULT_DIR";

/** Every Markdown file under `dir`, keyed by its vault-relative path; dotfiles and dot-directories are skipped. */
export function readVaultFiles(directory) {
  const files = {};
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith(".md")) files[child] = readFileSync(path.join(directory, child), "utf8");
    }
  };
  walk("");
  return files;
}

export function routeLocale(route) {
  const first = route.split(/[/?#]/).find(Boolean);
  return first && existsSync(path.join(ROOT, "messages", `${first}.json`)) ? first : "en";
}

/** `ui:audit --setup` hook: opens a vault in the faked app runtime, then the route. */
export default async function openVault(page, { url, route }) {
  const vaultDir = process.env[VAULT_DIR_ENV];
  const files = vaultDir ? readVaultFiles(vaultDir) : (await loadDesktopHarness()).storefrontFiles();
  await openFolderInApp(page, files, { baseUrl: url, locale: routeLocale(route) });

  await page.goto(`${url}${route}`, { waitUntil: "networkidle" });
  // The folder is read again on this load; the screen is ready once the rail replaces its placeholder.
  await page.getByTestId("app-nav-rail").waitFor({ timeout: RAIL_TIMEOUT_MS });
}
