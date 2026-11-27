import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **The Online Store sample (`samples/storefront`) as a flat file map**, for specs that measured
 * the sample the website's browser used to bundle (`domains/order`, `capabilities/cart`,
 * `domains/fulfillment`). The harness's own `storefrontFiles()` is the smaller shared fixture
 * vault, which names other domains, so a spec that reads a sample node by id opens this folder:
 * `installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true })`.
 */
const SAMPLE = path.resolve(__dirname, "../../../samples/storefront");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".md")) out.push(abs);
  }
  return out;
}

export function storefrontSampleFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const abs of walk(SAMPLE)) files[path.relative(SAMPLE, abs)] = readFileSync(abs, "utf8");
  return files;
}
