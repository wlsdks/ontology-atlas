import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **The product's own vault (`docs/ontology`) as a flat file map**, for specs that open it
 * through the installed-app runtime (`installDesktopRailRuntime(..., { replaceFixture: true })`).
 *
 * Files only: no Git answers, so evidence reads as "not readable here" — the state a person
 * sees when the app cannot walk the history. Specs that measure evidence build their own map
 * with `gitPathChanges` (`map-territories-view.spec.ts`).
 */
const VAULT = path.resolve(__dirname, "../../docs/ontology");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".md")) out.push(abs);
  }
  return out;
}

export function dogfoodVaultFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const abs of walk(VAULT)) files[path.relative(VAULT, abs)] = readFileSync(abs, "utf8");
  return files;
}
