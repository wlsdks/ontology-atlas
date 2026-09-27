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

/** A hand-written copy would split the page a visitor sees from the document the repository reviews. */
describe('gateway reading comes from vault documents', () => {
  it('finds the first guide page and the changelog in the vault', () => {
    // The full guide page list is `tests/contract/gateway-routes.contract.test.ts`'s job.
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

  /** CHANGELOG is full of code blocks; a fenced `## ` counted as a section would cut mid-document. */
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
   * `readVaultDoc('CHANGELOG')` returns the bundled preview (`gateway-changelog.json`), not the full
   * text. Bundle folds + screen folds + shown sections must equal the original's total.
   */
  it('folded counts of the bundle and screen cuts of the real CHANGELOG add up to the source', () => {
    const preview = readVaultDoc('CHANGELOG') ?? '';
    const bundledOmitted = readVaultDocOmittedSections('CHANGELOG');
    const { body, omittedSections } = trimToRecentSections(preview, 12);
    expect(omittedSections).toBeGreaterThan(0);
    expect(body.length).toBeLessThan(preview.length);
    expect(bundledOmitted).toBeGreaterThan(0);

    const raw = readLedgerSource('docs/CHANGELOG.md')!.content;
    const totalSections = trimToRecentSections(raw, 0).omittedSections;
    expect(bundledOmitted + omittedSections + 12).toBe(totalSections);
  });
});


describe('separateCategoryLines', () => {
  it('puts a blank line between consecutive category lines so they stop folding into one paragraph', () => {
    const out = separateCategoryLines('## 2026-09-01 · v1.0.0: x\n\n**Added**: a.\n**Fixed**: b.\n');
    expect(out).toContain('**Added**: a.\n\n**Fixed**: b.');
  });

  it('leaves fenced blocks untouched', () => {
    const src = '```md\n**Added**: a.\n**Fixed**: b.\n```';
    expect(separateCategoryLines(src)).toBe(src);
  });

  /** The rendered changelog must never be one wall paragraph; measured on the bundled body after the page's normalisation. */
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
