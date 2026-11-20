// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BundledVaultDoc } from '../lib/bundled-vault/bundled-manifest';
import type { VaultHeading } from '../model/types';
import dogfoodContent from '../data/content.json';
import dogfoodHeadings from '../data/manifest.headings.json';
import dogfoodManifest from '../data/manifest.json';
import { deriveDocumentDetail } from './document-detail';

describe('deriveDocumentDetail equals the detail the bundling script wrote', () => {
  it('matches the headings and word count of every document of the bundled dogfood sample', () => {
    const content = dogfoodContent as Record<string, string>;
    const headings = dogfoodHeadings as Record<string, VaultHeading[]>;
    const docs = (dogfoodManifest as unknown as { docs: BundledVaultDoc[] }).docs;
    expect(docs.length).toBeGreaterThan(100);
    for (const doc of docs) {
      const raw = content[doc.slug];
      expect(raw, doc.slug).toBeTypeOf('string');
      const derived = deriveDocumentDetail(raw);
      // The script cuts excerpts with its own copy of the extractor, so a bundled sample serves
      // its inline excerpt; its headings and word count are an independent oracle.
      expect([derived.headings, derived.wordCount], doc.slug).toEqual([headings[doc.slug] ?? [], doc.wordCount]);
    }
  });
});
