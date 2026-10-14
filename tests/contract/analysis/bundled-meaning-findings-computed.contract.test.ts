import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `meaningFindings` is null only when `mcp/` is missing from the checkout. Shipped manifests are
 * built from a full checkout, so null there is a broken build; Insights reads zero counts as
 * healthy, so a null would look clean by silence.
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
