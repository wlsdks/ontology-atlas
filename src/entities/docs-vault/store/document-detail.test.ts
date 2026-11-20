// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateScaleVault } from '../../../../scripts/perf/gen-scale-vault.mjs';
import { buildMdEntry } from '../lib/local-manifest/build-local-manifest';
import type { WalkEntry } from '../lib/local-manifest/walk-vault';
import type { VaultDoc, VaultHeading } from '../model/types';
import dogfoodContent from '../data/content.json';
import dogfoodHeadings from '../data/manifest.headings.json';
import dogfoodManifest from '../data/manifest.json';
import { deriveDocumentDetail } from './document-detail';

const identity = (value: string) => value;

function inlineDetail(doc: Pick<VaultDoc, 'headings' | 'excerpt' | 'wordCount'>) {
  return { headings: doc.headings, excerpt: doc.excerpt, wordCount: doc.wordCount };
}

function builtDoc(relativePath: string, raw: string): VaultDoc {
  const entry = { relativePath, kind: 'md', handle: {} as FileSystemFileHandle } satisfies WalkEntry;
  const { doc } = buildMdEntry(entry, raw, 1, identity);
  if (!doc) throw new Error(`no document built for ${relativePath}`);
  return doc;
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('deriveDocumentDetail equals the manifest it replaces', () => {
  const work = mkdtempSync(join(tmpdir(), 'atlas-detail-oracle-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it('matches every document of the bundled dogfood sample opened as a local folder', () => {
    const content = dogfoodContent as Record<string, string>;
    const headings = dogfoodHeadings as Record<string, VaultHeading[]>;
    const docs = (dogfoodManifest as { docs: VaultDoc[] }).docs;
    expect(docs.length).toBeGreaterThan(100);
    for (const doc of docs) {
      const raw = content[doc.slug];
      expect(raw, doc.slug).toBeTypeOf('string');
      const derived = deriveDocumentDetail(raw);
      expect(derived, doc.slug).toEqual(inlineDetail(builtDoc(doc.path, raw)));
      // The bundling script cuts excerpts with its own copy of the extractor, so a bundled sample
      // serves its inline excerpt; its headings and word count agree with the derivation.
      expect([derived.headings, derived.wordCount], doc.slug).toEqual([headings[doc.slug] ?? [], doc.wordCount]);
    }
  });

  it('matches every document of a generated 2,000-document key folder', () => {
    generateScaleVault(work, 2000, 'key');
    const files = markdownFiles(work);
    expect(files.length).toBeGreaterThanOrEqual(2000);
    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const path = relative(work, file);
      expect(deriveDocumentDetail(raw), path).toEqual(inlineDetail(builtDoc(path, raw)));
    }
  });
});
