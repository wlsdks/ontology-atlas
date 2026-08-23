import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { EvidenceSpecimen } from './EvidenceSpecimen';
import { EVIDENCE_SPECIMEN } from '../model/evidence-specimen.generated';

/**
 * The evidence specimen — **the section's claim is that the left panel is a file you can open in
 * this repository**, so what is locked here is that the claim stays true.
 *
 * The generator (`scripts/generate-evidence-specimen.mjs`) owns freshness and CI diffs it. These
 * cases cover the half a diff cannot: that the rendered panel really is the generated data, that
 * the elision is admitted rather than hidden, and that a Korean reader gets Korean names.
 */

const wrap = (ui: React.ReactNode, locale: 'en' | 'ko' = 'en') => (
  <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? koMessages : messages}>
    {ui}
  </NextIntlClientProvider>
);

describe('EvidenceSpecimen', () => {
  /**
   * **The file on screen is a file on disk.** This is the one assertion that makes the section
   * honest rather than decorative: it re-reads the vault file and requires every line the panel
   * shows to appear in it, verbatim. A hand-edited generated file, a stale commit, or a "nicer"
   * hand-written sample all fail here.
   */
  it('보여 주는 줄이 전부 실제 볼트 파일에 그대로 있다', () => {
    const onDisk = readFileSync(join(process.cwd(), EVIDENCE_SPECIMEN.file), 'utf8');
    for (const locale of ['ko', 'en'] as const) {
      const shown = EVIDENCE_SPECIMEN.frontmatter[locale];
      expect(shown.length, `${locale}: 보여 줄 줄이 하나도 없다 — 이 시험이 헛돈다`).toBeGreaterThan(4);
      for (const line of shown) {
        expect(onDisk, `${locale}: 이 줄이 파일에 없다: ${line}`).toContain(line);
      }
    }
  });

  it('화면에 그 줄들이 그대로 그려진다', () => {
    render(wrap(<EvidenceSpecimen />));
    const panel = screen.getByTestId('evidence-specimen');
    for (const line of EVIDENCE_SPECIMEN.frontmatter.en) {
      expect(panel.textContent ?? '').toContain(line);
    }
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.file);
  });

  /**
   * Showing a subset of a file as if it were the file is the same untruth the section exists to
   * disprove, so the count of dropped lines has to reach the screen.
   */
  it('뺀 줄 수가 실제로 뺀 만큼이다 — 화면이 부분을 전체라고 말하지 않는다', () => {
    /*
     * ⚠️ **Count against the file, not against the sentence.** The first version of this test
     * only asked whether one of the two honesty sentences was on screen, and the probe walked
     * through it: forcing `omittedLines` to 0 made the panel say "this is the file as written"
     * about a subset, and the test went green. Showing part of a file as if it were the whole
     * one is precisely the untruth this section exists to disprove, so the number has to be
     * reconciled with the file.
     */
    const onDisk = readFileSync(join(process.cwd(), EVIDENCE_SPECIMEN.file), 'utf8');
    const total = /^---\n([\s\S]*?)\n---/.exec(onDisk)?.[1].split('\n').length ?? 0;
    expect(total, 'frontmatter 를 못 읽었다 — 이 시험이 헛돈다').toBeGreaterThan(4);
    for (const locale of ['ko', 'en'] as const) {
      const shown = EVIDENCE_SPECIMEN.frontmatter[locale].length;
      const omitted = EVIDENCE_SPECIMEN.omittedLines[locale];
      expect(
        shown + omitted,
        `${locale}: 보여 준 ${shown}줄 + 뺐다고 한 ${omitted}줄 이 파일의 ${total}줄과 안 맞는다 ` +
          `— 부분을 전체라고 말하고 있다`,
      ).toBe(total);
    }

    render(wrap(<EvidenceSpecimen />));
    const panel = screen.getByTestId('evidence-specimen');
    if (EVIDENCE_SPECIMEN.omittedLines.en > 0) {
      expect(panel.textContent ?? '').toContain(String(EVIDENCE_SPECIMEN.omittedLines.en));
    }
  });

  /**
   * The specimen must keep being a *graph* specimen. A node with no edge would still render fine
   * and would quietly stop demonstrating the one thing this section is for.
   */
  it('표본은 관계를 하나 갖는다 — 홀로 있는 노드는 그래프의 증거가 아니다', () => {
    expect(EVIDENCE_SPECIMEN.facts.dependency.ko.length).toBeGreaterThan(0);
    expect(EVIDENCE_SPECIMEN.facts.domain.ko.length).toBeGreaterThan(0);
    expect(EVIDENCE_SPECIMEN.facts.implPath.length).toBeGreaterThan(0);
  });

  it('한국어로 열면 노드 이름이 한국어다', () => {
    render(wrap(<EvidenceSpecimen />, 'ko'));
    const panel = screen.getByTestId('evidence-specimen');
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.name.ko);
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.domain.ko);
  });

  it('영어로 열면 노드 이름이 영어다', () => {
    render(wrap(<EvidenceSpecimen />, 'en'));
    const panel = screen.getByTestId('evidence-specimen');
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.name.en);
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.domain.en);
  });

  /**
   * **The English panel draws no Korean.** `/en/download/` is one of two routes
   * `tests/e2e/locale-purity.spec.ts` locks as drawing no vault text, and the first version of
   * this panel broke it: showing the file verbatim put `display_ko: AI 연결 서버` on an English
   * screen. CI caught it (2026-08-23). The fix leaves the other locale's display line out and
   * counts it, so this asserts the property at the unit level too — an e2e failure is a slow way
   * to learn it.
   */
  it('영문 패널에 한글이 하나도 안 그려진다', () => {
    render(wrap(<EvidenceSpecimen />, 'en'));
    const text = screen.getByTestId('evidence-specimen').textContent ?? '';
    const hangul = text.match(/[\u3131-\u318E\uAC00-\uD7A3]/g) ?? [];
    expect(hangul, `영문 화면에 한글이 그려졌다: ${hangul.join('')}`).toEqual([]);
  });

  /**
   * **The linked demo lights the pair, and only the pair.** Each beat's contract is one file line
   * plus its fact row answering together — a highlight that lands on the wrong line teaches the
   * wrong correspondence, which is worse than none.
   */
  it('demoKey 가 그 줄과 그 사실 행만 켠다', () => {
    const { container } = render(wrap(<EvidenceSpecimen demoKey="domain" />, 'ko'));
    const litLines = [...container.querySelectorAll('pre span')].filter((el) =>
      el.className.includes('overlay-2'),
    );
    expect(litLines).toHaveLength(1);
    expect(litLines[0].textContent).toMatch(/^domain:/);

    const litRows = [...container.querySelectorAll('dl > div')].filter((el) =>
      el.className.includes('overlay-2'),
    );
    expect(litRows).toHaveLength(1);
    expect(litRows[0].textContent).toContain(EVIDENCE_SPECIMEN.facts.domain.ko);
  });

  it('demoKey 가 없으면 아무것도 안 켠다 — 쉬는 상태가 기본이다', () => {
    const { container } = render(wrap(<EvidenceSpecimen />, 'ko'));
    const lit = [...container.querySelectorAll('pre span, dl > div')].filter((el) =>
      el.className.includes('overlay-2'),
    );
    expect(lit).toHaveLength(0);
  });

  it("title 비트는 이름 줄들(title·display)을 함께 켠다 — 한 뜻이 여러 줄에 적혀 있어서다", () => {
    const { container } = render(wrap(<EvidenceSpecimen demoKey="title" />, 'ko'));
    const lit = [...container.querySelectorAll('pre span')]
      .filter((el) => el.className.includes('overlay-2'))
      .map((el) => (el.textContent ?? '').split(':')[0]);
    expect(lit).toContain('title');
    expect(lit).toContain('display_ko');
  });

  /** The claim "go and check" is only worth making if the link actually resolves to the file. */
  it('링크가 화면에 적힌 그 파일을 가리킨다', () => {
    render(wrap(<EvidenceSpecimen />));
    const link = screen.getByRole('link', { name: /open this file/i });
    expect(link.getAttribute('href')).toContain(EVIDENCE_SPECIMEN.file);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
