import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractEntries,
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
describe('관문 읽을거리는 볼트 문서를 읽는다', () => {
  it('가이드 첫 장과 변경 내역이 볼트에 실제로 있다', () => {
    // The guide split from one page (`GUIDE`) into six (`guide/*`) on 2026-07-31. Verifying the full list
    // is `tests/contract/gateway-routes.contract.test.ts`'s job.
    expect(readVaultDoc('guide/what-is-atlas')).toBeTruthy();
    expect(readVaultDoc('CHANGELOG')).toBeTruthy();
  });

  it('없는 슬러그는 null 이다 — 빈 문자열로 조용히 넘어가지 않는다', () => {
    expect(readVaultDoc('NOPE-NOT-A-DOC')).toBeNull();
  });

  it('가이드가 실제 안내문이다 — 자리표시자가 아니다', () => {
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

  it('절 수가 상한 이하면 전문 그대로다', () => {
    expect(trimToRecentSections(doc, 5)).toEqual({ body: doc, omittedSections: 0 });
  });

  it('앞에서 상한만큼만 남기고 몇 개를 접었는지 센다', () => {
    const { body, omittedSections } = trimToRecentSections(doc, 2);
    expect(body).toContain('## 하나');
    expect(body).toContain('## 둘');
    expect(body).not.toContain('## 셋');
    expect(omittedSections).toBe(1);
  });

  it('머리말은 절이 아니므로 항상 남는다', () => {
    expect(trimToRecentSections(doc, 1).body).toContain('머리말 문단.');
  });

  /**
   * Counting a `## ` inside a code fence as a section puts the cut in the middle of a document and makes
   * the folded count false. CHANGELOG is a document full of code blocks.
   */
  it('코드 펜스 안의 `##` 는 절이 아니다', () => {
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
  it('실제 CHANGELOG — 번들·화면 두 절단의 접힌 수 합이 원문과 맞는다', () => {
    const preview = readVaultDoc('CHANGELOG') ?? '';
    const bundledOmitted = readVaultDocOmittedSections('CHANGELOG');
    const { body, omittedSections } = trimToRecentSections(preview, 12);
    expect(omittedSections).toBeGreaterThan(0);
    expect(body.length).toBeLessThan(preview.length);
    expect(bundledOmitted).toBeGreaterThan(0);

    const raw = readFileSync(
      path.join(process.cwd(), 'docs', 'CHANGELOG.md'),
      'utf8',
    );
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
describe('extractEntries', () => {
  it('날짜와 제목을 갈라 낸다', () => {
    const [entry] = extractEntries('## 2026-07-31 — 무언가 바뀌었다\n본문');
    expect(entry?.date).toBe('2026-07-31');
    expect(entry?.title).toBe('무언가 바뀌었다');
  });

  it('날짜가 없으면 제목 전체를 쓴다', () => {
    const [entry] = extractEntries('## 그냥 제목\n본문');
    expect(entry?.date).toBeNull();
    expect(entry?.title).toBe('그냥 제목');
  });

  it('같은 제목이 겹쳐도 id 가 유일하다 — 겹치면 첫 번째로만 간다', () => {
    const entries = extractEntries('## 같은 제목\n\n## 같은 제목');
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it('코드 펜스 안의 `##` 는 항목이 아니다', () => {
    const entries = extractEntries(['## 진짜', '', '```md', '## 예시', '```'].join('\n'));
    expect(entries).toHaveLength(1);
  });

  it('인라인 마크다운이 든 제목도 정규화하면 렌더 텍스트와 같아진다', () => {
    // The moment this equality breaks, the anchor breaks.
    const raw = '2026-07-30 — 관문에 읽을거리 둘: `/guide` · **강조**';
    const rendered = '2026-07-30 — 관문에 읽을거리 둘: /guide · 강조';
    expect(normalizeHeadingKey(raw)).toBe(normalizeHeadingKey(rendered));
  });

  it('실제 CHANGELOG 의 모든 항목이 유일한 id 를 갖는다', () => {
    const entries = extractEntries(readVaultDoc('CHANGELOG') ?? '');
    expect(entries.length).toBeGreaterThan(10);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});
