import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { EvidenceSpecimen } from './EvidenceSpecimen';
import { EVIDENCE_SPECIMEN } from '../model/evidence-specimen.generated';

/** `scripts/generate-evidence-specimen.mjs` owns freshness; these cover what its diff cannot. */

const wrap = (ui: React.ReactNode, locale: 'en' | 'ko' = 'en') => (
  <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? koMessages : messages}>
    {ui}
  </NextIntlClientProvider>
);

describe('EvidenceSpecimen', () => {
  it('shows only lines that appear verbatim in the real vault file', () => {
    const onDisk = readFileSync(join(process.cwd(), EVIDENCE_SPECIMEN.file), 'utf8');
    for (const locale of ['ko', 'en'] as const) {
      const shown = EVIDENCE_SPECIMEN.frontmatter[locale];
      expect(shown.length, `${locale}: no lines to show, so this test is vacuous`).toBeGreaterThan(4);
      for (const line of shown) {
        expect(onDisk, `${locale}: line missing from the file: ${line}`).toContain(line);
      }
    }
  });

  it('renders those lines verbatim', () => {
    render(wrap(<EvidenceSpecimen />));
    const panel = screen.getByTestId('evidence-specimen');
    for (const line of EVIDENCE_SPECIMEN.frontmatter.en) {
      expect(panel.textContent ?? '').toContain(line);
    }
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.file);
  });

  it('reports an omitted-line count that matches the file, so a subset never passes as the whole', () => {
    /* Reconciled with the file, not the sentence: forcing `omittedLines` to 0 passed a sentence check. */
    const onDisk = readFileSync(join(process.cwd(), EVIDENCE_SPECIMEN.file), 'utf8');
    const total = /^---\n([\s\S]*?)\n---/.exec(onDisk)?.[1].split('\n').length ?? 0;
    expect(total, 'could not read the frontmatter, so this test is vacuous').toBeGreaterThan(4);
    for (const locale of ['ko', 'en'] as const) {
      const shown = EVIDENCE_SPECIMEN.frontmatter[locale].length;
      const omitted = EVIDENCE_SPECIMEN.omittedLines[locale];
      expect(
        shown + omitted,
        `${locale}: ${shown} shown + ${omitted} omitted lines do not match the file's ${total}; ` +
          `a subset is posing as the whole`,
      ).toBe(total);
    }

    render(wrap(<EvidenceSpecimen />));
    const panel = screen.getByTestId('evidence-specimen');
    if (EVIDENCE_SPECIMEN.omittedLines.en > 0) {
      expect(panel.textContent ?? '').toContain(String(EVIDENCE_SPECIMEN.omittedLines.en));
    }
  });

  it('keeps at least one relation, since a lone node is no graph evidence', () => {
    expect(EVIDENCE_SPECIMEN.facts.dependency.ko.length).toBeGreaterThan(0);
    expect(EVIDENCE_SPECIMEN.facts.domain.ko.length).toBeGreaterThan(0);
    expect(EVIDENCE_SPECIMEN.facts.implPath.length).toBeGreaterThan(0);
  });

  it('shows Korean node names in the Korean locale', () => {
    render(wrap(<EvidenceSpecimen />, 'ko'));
    const panel = screen.getByTestId('evidence-specimen');
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.name.ko);
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.domain.ko);
  });

  it('shows English node names in the English locale', () => {
    render(wrap(<EvidenceSpecimen />, 'en'));
    const panel = screen.getByTestId('evidence-specimen');
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.name.en);
    expect(panel.textContent ?? '').toContain(EVIDENCE_SPECIMEN.facts.domain.en);
  });

  /** A unit-level twin of `tests/e2e/locale-purity.spec.ts`. */
  it('draws no Hangul on the English panel', () => {
    render(wrap(<EvidenceSpecimen />, 'en'));
    const text = screen.getByTestId('evidence-specimen').textContent ?? '';
    const hangul = text.match(/[\u3131-\u318E\uAC00-\uD7A3]/g) ?? [];
    expect(hangul, `Hangul drawn on the English screen: ${hangul.join('')}`).toEqual([]);
  });

  it('lights only the matching line and fact row for a demoKey', () => {
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

  it('lights nothing without a demoKey, the resting default', () => {
    const { container } = render(wrap(<EvidenceSpecimen />, 'ko'));
    const lit = [...container.querySelectorAll('pre span, dl > div')].filter((el) =>
      el.className.includes('overlay-2'),
    );
    expect(lit).toHaveLength(0);
  });

  it("lights every name line (title and display) for the title beat, since one meaning spans several lines", () => {
    const { container } = render(wrap(<EvidenceSpecimen demoKey="title" />, 'ko'));
    const lit = [...container.querySelectorAll('pre span')]
      .filter((el) => el.className.includes('overlay-2'))
      .map((el) => (el.textContent ?? '').split(':')[0]);
    expect(lit).toContain('title');
    expect(lit).toContain('display_ko');
  });

  it('links to the file named on screen', () => {
    render(wrap(<EvidenceSpecimen />));
    const link = screen.getByRole('link', { name: /open this file/i });
    expect(link.getAttribute('href')).toContain(EVIDENCE_SPECIMEN.file);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
