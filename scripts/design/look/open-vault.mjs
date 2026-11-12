import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIRST_RUN_SEEN_ENTRIES } from "../../../src/shared/lib/preferences/first-run-seen.ts";
import { FIXTURE_VAULT } from "../../../tests/e2e/fixture-vault.ts";
import { stubDirectoryPicker } from "../../../tests/e2e/vault-picker-stub.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ATTACH_TIMEOUT_MS = 30_000;
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

export const VAULT_DIR_ENV = "UI_LOOK_VAULT_DIR";

/** Every Markdown file under `dir`, keyed by its vault-relative path; dotfiles and dot-directories are skipped. */
export function readVaultFiles(dir) {
  const files = {};
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith(".md")) files[child] = readFileSync(path.join(dir, child), "utf8");
    }
  };
  walk("");
  return files;
}

export function routeLocale(route) {
  const first = route.split(/[/?#]/).find(Boolean);
  return first && existsSync(path.join(ROOT, "messages", `${first}.json`)) ? first : "en";
}

/** `ui:audit --setup` hook: attaches a vault through the map's folder picker, then opens the route. */
export default async function openVault(page, { url, route }) {
  const vaultDir = process.env[VAULT_DIR_ENV];
  await stubDirectoryPicker(page, vaultDir ? readVaultFiles(vaultDir) : FIXTURE_VAULT);
  await page.addInitScript((entries) => {
    for (const [key, value] of entries) window.localStorage.setItem(key, value);
  }, FIRST_RUN_SEEN_ENTRIES);

  await page.goto(`${url}/${routeLocale(route)}/topology/?guides=off`, { waitUntil: "networkidle" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: ATTACH_TIMEOUT_MS });

  await page.goto(`${url}${route}`, { waitUntil: "networkidle" });
}
