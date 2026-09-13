import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type {
  CoverageAreaInput,
  HarnessReport,
  ScopeDeclaration,
} from '@/entities/agent-files';

import { HarnessCoverageView } from './HarnessCoverageView';

/**
 * **What every mark on the coverage matrix encodes, asserted as the encoding rather than as a class.**
 *
 * The owner read the first build and could not tell what the marks were saying or why they were
 * there. The repair was to give each one a single sentence and delete anything that could not earn
 * one, so these tests are written against those sentences:
 *
 * - the square says *something* or *nothing*, and nothing else;
 * - the number beside it says how many, as a number;
 * - the card's numeral is the count of empty squares below it, verifiable by counting;
 * - a mirrored name appears once, and the tools carry the multiplicity.
 *
 * Each one names the defect it would catch, because a gate whose failure mode is not written down
 * is a gate nobody can tell is aimed at the wrong thing.
 */

/* jsdom has no `scrollIntoView`; the open detail scrolls itself into view in every real browser. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function declaration(over: Partial<ScopeDeclaration> & Pick<ScopeDeclaration, 'id' | 'column'>): ScopeDeclaration {
  return {
    label: over.id,
    origin: 'hook',
    declaration: 'src/',
    declaresPath: true,
    scopes: ['src'],
    tools: [],
    ...over,
  };
}

const areas: CoverageAreaInput[] = [
  {
    slug: 'domains/front',
    title: 'Front',
    purpose: 'What a shopper touches.',
    capabilities: [{ slug: 'capabilities/front', title: 'Front', path: 'src/front' }],
  },
  {
    slug: 'domains/api',
    title: 'Api',
    purpose: 'The order service.',
    capabilities: [{ slug: 'capabilities/api', title: 'Api', path: 'api/orders' }],
  },
  {
    slug: 'domains/shell',
    title: 'Shell',
    purpose: 'The app window.',
    capabilities: [{ slug: 'capabilities/shell', title: 'Shell', path: 'shell' }],
  },
];

/*
 * Front is named by twelve checks and Api by two, which is the spread that killed the bar: the
 * previous mark drew both at a full track because each was its column's own maximum.
 */
const coverage: ScopeDeclaration[] = [
  ...Array.from({ length: 12 }, (_, index) =>
    declaration({ id: `package.json#test:front-${index}`, column: 'watched', origin: 'script', scopes: ['src/front'] }),
  ),
  declaration({ id: 'package.json#test:api-a', column: 'watched', origin: 'script', scopes: ['api/orders'] }),
  declaration({ id: 'package.json#test:api-b', column: 'watched', origin: 'script', scopes: ['api/orders'] }),
  declaration({ id: 'src/AGENTS.md', column: 'told', origin: 'nested-agents', scopes: ['src'] }),
  /* One guard, mirrored for two tools, exactly as nine of this repository's hooks are. */
  declaration({
    id: '.claude/hooks/fast-sensor.sh',
    label: 'fast-sensor',
    column: 'gated',
    tools: ['claude-code'],
    namedBy: '.claude/settings.json',
    scopes: ['src/front'],
  }),
  declaration({
    id: '.codex/hooks/fast-sensor.sh',
    label: 'fast-sensor',
    column: 'gated',
    tools: ['codex'],
    namedBy: '.codex/hooks.json',
    scopes: ['src/front'],
  }),
];

function report(): HarnessReport {
  return {
    coverage,
    testFiles: [],
    documentReach: {
      total: 10, guides: 4, mirroredGuides: 2, named: 3, namedDirect: 2, hops: 2, unnamed: 3,
      unnamedByFolder: [{ folder: 'docs', count: 3 }], excluded: [], truncated: false,
    },
    guideDocumentCount: 4,
  } as unknown as HarnessReport;
}

function mount() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <HarnessCoverageView report={report()} areas={areas} pathlessCapabilities={0} sourceRoot="/repo" />
    </NextIntlClientProvider>,
  );
}

describe('what the marks encode', () => {
  it('draws the square as a container — filled, or drawn and empty — and never as a magnitude', () => {
    /*
     * ⚠️ **The defect this catches.** The first build drew `count ÷ (largest count in the column)`,
     * floored at 18%, as an inline width. Measured on this repository: a Gated 2 filled 24.0px and
     * the Watched 2 beside it filled 4.3px; a Gated 2 and a Watched 12 both filled the whole track.
     * A mark whose length is not a fixed unit of anything cannot be decoded, which is what the
     * owner reported. So there are exactly two states and no inline sizing anywhere in a mark.
     */
    mount();
    const marks = document.querySelectorAll('[data-harness-mark]');
    expect(marks.length).toBe(areas.length * 3);
    const states = new Set([...marks].map((mark) => mark.getAttribute('data-harness-mark')));
    expect([...states].sort()).toEqual(['empty', 'filled']);
    for (const mark of marks) {
      /* Any width, height or transform written per mark is a magnitude encoding returning. */
      const style = (mark as HTMLElement).style;
      expect(style.width, `${mark.outerHTML} carries an inline width`).toBe('');
      expect(style.height).toBe('');
      expect(style.transform).toBe('');
      expect(mark.childElementCount, 'a mark holds no inner fill element').toBe(0);
    }
  });

  it('separates the two states by fill as well as by hue, so colour is not the only carrier', () => {
    mount();
    const filled = document.querySelector('[data-harness-mark="filled"]')!;
    const empty = document.querySelector('[data-harness-mark="empty"]')!;
    /* Filled has a background; empty is an outline with nothing in it. A reader who cannot separate
       indigo from amber still reads the difference (design-infoviz). */
    expect(filled.className).toMatch(/bg-\[color:var\(--color-indigo/);
    expect(empty.className).not.toMatch(/\bbg-\[/);
  });

  it('prints the magnitude as a number, in the cell', () => {
    mount();
    const front = document.querySelector('[data-harness-area="domains/front"]')!;
    expect(within(front as HTMLElement).getByText('12')).toBeInTheDocument();
  });

  it("makes the card's numeral the count of empty squares in its own column", () => {
    /*
     * ⚠️ **The defect this catches.** A card whose number is computed one way while the marks below
     * it are computed another would be worse than the undecodable bar it replaced: a reader who
     * counted would find the screen contradicting itself. The card's claim is verifiable by
     * counting, so this counts.
     */
    mount();
    for (const column of ['told', 'gated', 'watched'] as const) {
      const card = document.querySelector(
        `[data-testid="harness-coverage-column-card"][data-census-row="${column}"]`,
      )!;
      const declared = Number(
        card.querySelector('[data-harness-column-gap]')!.getAttribute('data-harness-column-gap'),
      );
      const emptyMarks = document.querySelectorAll(
        `[data-harness-cell="${column}"][data-harness-cell-empty="true"]`,
      ).length;
      expect(declared, `the ${column} card disagrees with its own column`).toBe(emptyMarks);
    }
    /* And the fixture actually exercises both branches, so the equality is not trivially 0 = 0. */
    expect(document.querySelectorAll('[data-harness-mark="empty"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-harness-mark="filled"]').length).toBeGreaterThan(0);
  });

  it('renders no score, grade, percentage or maturity level', () => {
    mount();
    expect(screen.getByTestId('harness-coverage').textContent).not.toMatch(/%|점수|등급|성숙도/);
  });
});

describe('a mirrored guard', () => {
  it('appears once with both tools, and both files stay behind it', () => {
    /*
     * ⚠️ **The defect this catches.** Nine hook names exist in both `.claude/hooks/` and
     * `.codex/hooks/`; the first build printed the bare name twice, which reads as a rendering
     * fault. The repair must not be to drop one of the files either, so the configs that name each
     * one are asserted alongside.
     */
    mount();
    const cell = document
      .querySelector('[data-harness-area="domains/front"]')!
      .querySelector('[data-harness-cell="gated"]') as HTMLElement;
    fireEvent.click(cell);
    const detail = screen.getByTestId('harness-coverage-detail');
    expect(detail.textContent!.match(/fast-sensor/g)).toHaveLength(1);
    expect(detail).toHaveTextContent('Claude Code');
    expect(detail).toHaveTextContent('Codex');
    expect(detail).toHaveTextContent('.claude/settings.json');
    expect(detail).toHaveTextContent('.codex/hooks.json');
    /* The cell still counts files, so the count and the tool list agree: two declarations, two
       tools, one guard. */
    expect(cell.getAttribute('aria-label')).toContain('2');
  });
});
