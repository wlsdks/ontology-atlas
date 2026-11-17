import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { trimToRecentSections } from '@/views/gateway-doc/lib/vault-doc';
// The generator-side implementation — the "same trim" contract below catches drift between the two.
import {
  GATEWAY_CHANGELOG_KEEP_SECTIONS,
  trimToRecentSections as generatorTrim,
} from '../../../scripts/docs-vault/build-docs-vault.mjs';
import { readLedgerSource } from '../../../scripts/lib/records/record-ledgers.mjs';

/**
 * Always-on size gate: data JSON statically imported into the shared chunk is measurable as file
 * size. A change raising the cap must include measured `pnpm build && pnpm desktop:perf` output.
 */

const DATA_DIR = path.join(process.cwd(), 'src', 'entities', 'docs-vault', 'data');

/** Files that static-vault-source.ts **imports statically**, putting them in the shared chunk. */
const STATICALLY_BUNDLED = [
  'manifest.json',
  'gateway-content.json',
  'gateway-changelog.json',
  'sample-storefront.manifest.json',
  'sample-storefront.content.json',
] as const;

const AGGREGATE_BUDGET_BYTES = 1.25 * 1024 * 1024;

describe('standing budget of bundled vault data', () => {
  it('the data JSON total carried in the common chunk is within budget', () => {
    const sizes = STATICALLY_BUNDLED.map((name) => ({
      name,
      bytes: statSync(path.join(DATA_DIR, name)).size,
    }));
    const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
    expect(
      total,
      [
        'The bundled vault data every route parses is over budget.',
        'Move the largest file to a lazy load (an async chunk or a public asset) or cut it down to a preview.',
        ...sizes.map((f) => `  ${f.name}: ${(f.bytes / 1024).toFixed(0)}KB`),
      ].join('\n'),
    ).toBeLessThanOrEqual(AGGREGATE_BUDGET_BYTES);
    // Self-proof for the guard: an unreadable file makes statSync throw, and an
    // absurdly small total (the data having disappeared) means the gate is idling on
    // an empty set.
    expect(total).toBeGreaterThan(500 * 1024);
  });

  it('gateway-content holds guide/* only, and the full CHANGELOG must not flow back in', () => {
    const gateway = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'gateway-content.json'), 'utf8'),
    ) as Record<string, string>;
    const keys = Object.keys(gateway);
    expect(keys.length).toBeGreaterThan(5);
    const offenders = keys.filter((slug) => !slug.startsWith('guide/'));
    expect(
      offenders,
      'a document outside guide/* entered the synchronous bundle; a growing document must go to contentPreviews (truncated previews) or a public asset.',
    ).toEqual([]);
  });

  it('headings of the bundle manifest are empty, keeping the separate chunk split', () => {
    for (const name of ['manifest.json', 'sample-storefront.manifest.json']) {
      const manifest = JSON.parse(
        readFileSync(path.join(DATA_DIR, name), 'utf8'),
      ) as { docs: Array<{ slug: string; headings: unknown[] }> };
      expect(manifest.docs.length).toBeGreaterThan(10);
      const inline = manifest.docs.filter((doc) => doc.headings.length > 0);
      expect(
        inline.map((doc) => doc.slug),
        `headings were inlined again in ${name}, so 263KB goes back to the chunk common to every route. See splitManifestHeadings in scripts/docs-vault/build-docs-vault.mjs.`,
      ).toEqual([]);
    }
    // The extracted map really has content — both being empty is loss, not separation.
    const headings = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'manifest.headings.json'), 'utf8'),
    ) as Record<string, unknown[]>;
    expect(Object.keys(headings).length).toBeGreaterThan(50);
  });
});

describe('gateway CHANGELOG preview contract', () => {
  /*
   * `docs/CHANGELOG.md` is frozen; the current changelog is composed by `readLedgerSource`, the same
   * composer the generator uses, so the drift check compares two implementations of the trim.
   */
  const changelogRaw = readLedgerSource('docs/CHANGELOG.md')?.content ?? '';
  const committed = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'gateway-changelog.json'), 'utf8'),
  ) as { body: string; omittedSections: number };

  it('the generator cut and the screen cut are the same implementation (drift prevention)', () => {
    const fromGenerator = generatorTrim(changelogRaw, GATEWAY_CHANGELOG_KEEP_SECTIONS);
    const fromView = trimToRecentSections(changelogRaw, GATEWAY_CHANGELOG_KEEP_SECTIONS);
    expect(fromGenerator).toEqual(fromView);
  });

  it('the committed preview is the head of the current CHANGELOG as it is', () => {
    const expected = trimToRecentSections(changelogRaw, GATEWAY_CHANGELOG_KEEP_SECTIONS);
    expect(committed.body).toBe(expected.body);
    expect(committed.omittedSections).toBe(expected.omittedSections);
    // The preview really is trimmed — CHANGELOG only grows, so 0 omitted sections
    // means either the trim died or the full text came back.
    expect(committed.omittedSections).toBeGreaterThan(0);
  });

  it('the on-screen display cap does not exceed the bundled section count, otherwise that many are not shown', () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), 'app', '(gateway)', '[locale]', 'changelog', 'page.tsx'),
      'utf8',
    );
    const match = /const RECENT_SECTIONS = (\d+)/.exec(pageSource);
    expect(match, 'could not find the RECENT_SECTIONS declaration of the changelog page').not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(GATEWAY_CHANGELOG_KEEP_SECTIONS);
  });
});
