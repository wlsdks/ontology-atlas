import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Every node in a shipped manifest carries a computed `meaningFindings` list.
 *
 * `VaultDoc.meaningFindings` has three states: absent (not a node), `null`
 * (the rule could not run) and an array (the rule ran). The app reads `null`
 * as "not computed" and must never show it as clean, but the Insights verdict
 * still reads zero counts as healthy, so a manifest built without the rule
 * would look clean by silence. The build script records `null` only when
 * `mcp/` is missing from the checkout; the shipped manifests are built from a
 * full checkout, so `null` there is a broken build, not a state to tolerate.
 * Independent review asked for this invariant to be enforced rather than
 * promised (2026-09-22).
 */
const DATA_DIR = path.join(process.cwd(), 'src', 'entities', 'docs-vault', 'data');
const SHIPPED_MANIFESTS = ['manifest.json', 'sample-storefront.manifest.json'];

describe('shipped manifests carry computed meaning findings', () => {
  for (const file of SHIPPED_MANIFESTS) {
    it(`${file}: no node document records meaningFindings as null`, () => {
      const manifest = JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8')) as {
        docs: Array<{ slug: string; frontmatter?: { kind?: unknown }; meaningFindings?: unknown }>;
      };
      const nodes = manifest.docs.filter((doc) => typeof doc.frontmatter?.kind === 'string');
      expect(nodes.length).toBeGreaterThan(0);
      const notComputed = nodes.filter((doc) => doc.meaningFindings === null);
      expect(notComputed.map((doc) => doc.slug)).toEqual([]);
      const missing = nodes.filter((doc) => !Array.isArray(doc.meaningFindings));
      expect(missing.map((doc) => doc.slug)).toEqual([]);
    });
  }
});
