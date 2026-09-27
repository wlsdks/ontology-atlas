import { describe, expect, it } from 'vitest';
import { readLedgerSource } from '../../../../scripts/lib/record-ledgers.mjs';
import {
  extractEntries,
  separateCategoryLines,
  normalizeHeadingKey,
  readVaultDoc,
  readVaultDocOmittedSections,
  trimToRecentSections,
} from './vault-doc';

/**
 * The gateway's reading material **takes its content from the vault** — this test holds that contract.
 *
 * The most plausible regression is reverting to a hand-written copy ("just inline the string when in a
 * hurry"). That splits the document a visitor sees from the document the repository reviews, and nobody
 * finds out that it split.
 */
describe('gateway reading comes from vault documents', () => {
  it('finds the first guide page and the changelog in the vault', () => {
    // The guide split from one page (`GUIDE`) into six (`guide/*`) on 2026-07-31. Verifying the full list
    // is `tests/contract/gateway-routes.contract.test.ts`'s job.
    expect(readVaultDoc('guide/what-is-atlas')).toBeTruthy();
    expect(readVaultDoc('CHANGELOG')).toBeTruthy();
  });

  it('renders a guide page without its frontmatter block, starting at the title', () => {
    for (const slug of ['guide/what-is-atlas', 'guide/cli']) {
      const body = readVaultDoc(slug) ?? '';
      expect(body.startsWith('# '), slug).toBe(true);
      expect(body).not.toMatch(/^doc_type:/m);
    }
  });

  it('returns null for a missing slug instead of an empty string', () => {
    expect(readVaultDoc('NOPE-NOT-A-DOC')).toBeNull();
  });

  it('serves real guide prose rather than a placeholder', () => {
    const guide = readVaultDoc('guide/what-is-atlas') ?? '';
    // A command this repository registered as a dead channel must not be alive in the guidance
    // (`.claude/rules/surfaces.md`, "there are only two distribution channels").
    expect(guide).not.toMatch(/npx\s+ontology-atlas/);
    expect(guide.length).toBeGreaterThan(700);
  });
});

describe('trimToRecentSections', () => {
  const doc = [
    '머리말 문단.',
    '',
    '## 하나',
    'ㄱ',
    '',
    '## 둘',
    'ㄴ',
    '',
    '## 셋',
    'ㄷ',
  ].join('\n');

  it('keeps the full text when the section count is within the limit', () => {
    expect(trimToRecentSections(doc, 5)).toEqual({ body: doc, omittedSections: 0 });
  });

  it('keeps the first sections up to the limit and counts the folded ones', () => {
    const { body, omittedSections } = trimToRecentSections(doc, 2);
    expect(body).toContain('## 하나');
    expect(body).toContain('## 둘');
    expect(body).not.toContain('## 셋');
    expect(omittedSections).toBe(1);
  });

  it('always keeps the preamble because it is not a section', () => {
    expect(trimToRecentSections(doc, 1).body).toContain('머리말 문단.');
  });

  /**
   * Counting a `## ` inside a code fence as a section puts the cut in the middle of a document and makes
   * the folded count false. CHANGELOG is a document full of code blocks.
   */
  it('does not treat a `##` inside a code fence as a section', () => {
    const withFence = [
      '## 진짜 절',
      '',
      '```md',
      '## 이건 예시지 절이 아니다',
      '```',
      '',
      '## 두 번째 진짜 절',
    ].join('\n');
    const { body, omittedSections } = trimToRecentSections(withFence, 1);
    expect(omittedSections).toBe(1);
    expect(body).toContain('## 이건 예시지 절이 아니다');
    expect(body).not.toContain('## 두 번째 진짜 절');
  });

  /**
   * Since 2026-08-19 `readVaultDoc('CHANGELOG')` returns the **bundled preview** (the most recent 16
   * sections, `gateway-changelog.json`) rather than the full text — the 634KB full text pushed every
   * route's shared chunk past the performance budget. So beyond "does the screen truncation reduce it",
   * this test measures **the accounting of folded sections**: bundle-time folds + screen-time folds +
   * sections shown = the original's total sections. Either truncation drifting silently fails here.
   */
  it('folded counts of the bundle and screen cuts of the real CHANGELOG add up to the source', () => {
    const preview = readVaultDoc('CHANGELOG') ?? '';
    const bundledOmitted = readVaultDocOmittedSections('CHANGELOG');
    const { body, omittedSections } = trimToRecentSections(preview, 12);
    expect(omittedSections).toBeGreaterThan(0);
    expect(body.length).toBeLessThan(preview.length);
    expect(bundledOmitted).toBeGreaterThan(0);

    const raw = readLedgerSource('docs/CHANGELOG.md')!.content;
    // With limit 0 every section is folded — the cheapest way to count the total.
    const totalSections = trimToRecentSections(raw, 0).omittedSections;
    expect(bundledOmitted + omittedSections + 12).toBe(totalSections);
  });
});


/**
 * The entry list's links must point at **a place that really exists in the body**.
 *
 * ⚠️ Measured defect (2026-07-31): the list keyed on the raw heading while the body `h2` keyed on the
 * **rendered** text. Three headings containing backticks had their anchors silently broken — a failure
 * invisible until someone clicks, so it is caught here.
 */
describe('separateCategoryLines', () => {
  it('puts a blank line between consecutive category lines so they stop folding into one paragraph', () => {
    const out = separateCategoryLines('## 2026-09-01 · v1.0.0: x\n\n**Added**: a.\n**Fixed**: b.\n');
    expect(out).toContain('**Added**: a.\n\n**Fixed**: b.');
  });

  it('leaves fenced blocks untouched', () => {
    const src = '```md\n**Added**: a.\n**Fixed**: b.\n```';
    expect(separateCategoryLines(src)).toBe(src);
  });

  /**
   * The rendered changelog must never be one wall paragraph again (2026-09-25: 9,997
   * characters and 99 ".;" seams in one entry). Measured on the bundled body the gateway
   * actually draws, after the same normalisation the page applies.
   */
  it('keeps every bundled changelog paragraph short and free of ".;" seams', () => {
    const body = separateCategoryLines(readVaultDoc('CHANGELOG') ?? '');
    const paragraphs = body.split(/\n\s*\n/).filter((block) => !/^\s*(#|>|- |```)/.test(block));
    expect(paragraphs.length).toBeGreaterThan(10);
    const longest = Math.max(...paragraphs.map((block) => block.length));
    expect(longest, 'a changelog paragraph grew into a wall of text').toBeLessThanOrEqual(900);
    expect(body.includes('.;'), 'facts are glued with ";" again').toBe(false);
  });
});

describe('extractEntries', () => {
  it('strips a middle-dot separator so no title starts with it', () => {
    const [entry] = extractEntries('## 2026-09-24 · v1.2.5: the map remembers its camera\nbody');
    expect(entry?.date).toBe('2026-09-24');
    expect(entry?.title).toBe('v1.2.5: the map remembers its camera');
  });

  it('splits the date from the title', () => {
    const [entry] = extractEntries('## 2026-07-31 — 무언가 바뀌었다\n본문');
    expect(entry?.date).toBe('2026-07-31');
    expect(entry?.title).toBe('무언가 바뀌었다');
  });

  it('uses the whole heading as the title when there is no date', () => {
    const [entry] = extractEntries('## 그냥 제목\n본문');
    expect(entry?.date).toBeNull();
    expect(entry?.title).toBe('그냥 제목');
  });

  it('keeps ids unique when titles repeat so links do not all land on the first', () => {
    const entries = extractEntries('## 같은 제목\n\n## 같은 제목');
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it('does not treat a `##` inside a code fence as an entry', () => {
    const entries = extractEntries(['## 진짜', '', '```md', '## 예시', '```'].join('\n'));
    expect(entries).toHaveLength(1);
  });

  it('normalizes a title with inline markdown to its rendered text', () => {
    // The moment this equality breaks, the anchor breaks.
    const raw = '2026-07-30 — 관문에 읽을거리 둘: `/guide` · **강조**';
    const rendered = '2026-07-30 — 관문에 읽을거리 둘: /guide · 강조';
    expect(normalizeHeadingKey(raw)).toBe(normalizeHeadingKey(rendered));
  });

  it('gives every entry of the real CHANGELOG a unique id', () => {
    const entries = extractEntries(readVaultDoc('CHANGELOG') ?? '');
    expect(entries.length).toBeGreaterThan(10);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});
