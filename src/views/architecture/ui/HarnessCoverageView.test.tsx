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
  /*
   * Declares no path at all, so it reaches every area by declaration and belongs in the band rather
   * than in eight rows. Mirrored across both hook trees, which is what nine of this repository's
   * real hooks are.
   */
  declaration({
    id: '.claude/hooks/block-npm-publish.sh',
    label: 'block-npm-publish',
    column: 'gated',
    declaresPath: false,
    scopes: [],
    declaration: '',
    tools: ['claude-code'],
    namedBy: '.claude/settings.json',
  }),
  declaration({
    id: '.codex/hooks/block-npm-publish.sh',
    label: 'block-npm-publish',
    column: 'gated',
    declaresPath: false,
    scopes: [],
    declaration: '',
    tools: ['codex'],
    namedBy: '.codex/hooks.json',
  }),
  declaration({
    id: '.claude/rules/forbidden.md',
    label: 'forbidden',
    column: 'told',
    origin: 'rule',
    declaresPath: false,
    scopes: [],
    declaration: '',
    tools: ['claude-code'],
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

  it('never leaves an empty cell with a blank slot, at any width', () => {
    /*
     * ⚠️ **The defect this catches.** Below `sm` the "None" word steps aside, because it
     * overran the 39px cell by 11.5px in English and broke mid-word in Korean. Leaving the slot
     * *empty* there is the table convention for "no data" beside sibling cells that all carry a
     * digit, and the fact is "data known, value zero". Both labels are in the DOM and CSS picks
     * one, so what this asserts is that the narrow-width branch exists at all — delete the digit
     * and this goes red while every rendered-width measurement still passes.
     */
    mount();
    const emptyCell = document.querySelector(
      '[data-harness-cell][data-harness-cell-empty="true"]',
    ) as HTMLElement;
    const narrow = emptyCell.querySelector('.sm\\:hidden');
    const wide = emptyCell.querySelector('.sm\\:inline');
    expect(narrow, 'the narrow-width slot is missing, so a phone cell would render blank').not.toBeNull();
    expect(narrow!.textContent).toBe('0');
    expect(wide!.textContent).toBe('없음');
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

describe('two census strips, one subject', () => {
  it('gives the card surface only to the strip that heads the table', () => {
    /*
     * ⚠️ **The defect this catches.** Six tiles at one numeral step, one border token and one
     * surface — 172,653px² of `--color-panel` against the subject's 207,183px² at 1512×901 — left
     * the screen reading strip · table · strip with nothing saying which strip it was about. The
     * numerals are deliberately still equal: both strips print the same kind of fact. Surface is
     * the only channel allowed to differ.
     */
    mount();
    const panelled = [...document.querySelectorAll('[data-census-surface="panel"]')];
    const bare = [...document.querySelectorAll('[data-census-surface="bare"]')];
    expect(panelled.map((el) => el.getAttribute('data-testid'))).toEqual(
      Array(3).fill('harness-coverage-column-card'),
    );
    expect(bare.map((el) => el.getAttribute('data-testid'))).toEqual(
      Array(3).fill('harness-reach-tile'),
    );
    /* The bones survive the demotion: same numeral element, same step, in both strips. */
    expect(document.querySelectorAll('[data-testid="harness-reach-number"]').length).toBe(3);
  });

  it("defines the three reach states with the strip's own three labels", () => {
    /* A legend that renames its terms is a second vocabulary, not an explanation. */
    mount();
    const reach = screen.getByTestId('harness-reach');
    const terms = [...reach.querySelectorAll('dt')].map((el) => el.textContent);
    const labels = ['guides', 'named', 'unnamed'].map(
      (row) => reach.querySelector(`[data-census-row="${row}"] > div > span`)?.textContent,
    );
    expect(terms).toEqual(labels);
    /* One control for one definition — three per-tile hints is what put a panel at x −89.97. */
    expect(reach.querySelectorAll('[aria-describedby]').length).toBe(1);
  });
});

describe('the always-loaded band', () => {
  function openBand() {
    mount();
    const toggle = document.querySelector(
      '[data-testid="harness-everywhere-toggle"][data-harness-everywhere="gated"]',
    ) as HTMLButtonElement;
    fireEvent.click(toggle);
    return toggle;
  }

  it('shows on its own toggle that it is open, through geometry rather than ink', () => {
    /*
     * ⚠️ **The defect this catches.** For `shape: 'link'` the only state channel `controlClass`
     * offers is text colour, and this button's only child sets its own colour explicitly — so the
     * active ink painted nothing and all three toggles rendered identically whether the band was
     * open or shut. The chevron's rotation is a channel no child can override.
     */
    const toggle = openBand();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('data-harness-everywhere-open')).toBe('true');
    expect(toggle.querySelector('svg')!.getAttribute('class')).toContain('rotate-90');
    const other = document.querySelector(
      '[data-testid="harness-everywhere-toggle"][data-harness-everywhere="told"]',
    );
    if (other) expect(other.querySelector('svg')!.getAttribute('class')).not.toContain('rotate-90');
  });

  it('closes on Escape and puts focus back on the toggle that opened it', () => {
    /* Its close button lives in a different subtree from the toggle, so without this focus fell to
       `<body>` and the next Tab restarted at the top of the document. */
    const toggle = openBand();
    expect(screen.getByTestId('harness-coverage-everywhere')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('harness-coverage-everywhere')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('points at the band it opens, which is not its DOM neighbour', () => {
    const toggle = openBand();
    expect(toggle.getAttribute('aria-controls')).toBe('harness-coverage-everywhere');
    expect(screen.getByTestId('harness-coverage-everywhere').id).toBe('harness-coverage-everywhere');
  });

  it('prints a mirrored always-loaded guard once, with both tools', () => {
    /* The band is where the owner met nine names printed twice. Its count stays a count of files
       and its list stays one row per name. */
    const toggle = openBand();
    expect(toggle.textContent).toContain('1');
    const band = screen.getByTestId('harness-coverage-everywhere');
    expect(band.textContent!.match(/block-npm-publish/g)).toHaveLength(1);
    expect(band).toHaveTextContent('Claude Code');
    expect(band).toHaveTextContent('Codex');
  });

  it('re-reveals an open cell detail when the band inserts itself above the table', () => {
    /*
     * ⚠️ **The defect this catches.** Opening the band inserts 142px above the table (measured
     * 1512×901: the header row moving from y 371 to y 513). As a mount-only ref callback the
     * detail's reveal never ran again, so an already-open detail was pushed down with nothing
     * scrolling it back. The reveal key changing is what makes the effect fire.
     */
    mount();
    const cell = document
      .querySelector('[data-harness-area="domains/front"]')!
      .querySelector('[data-harness-cell="watched"]') as HTMLElement;
    fireEvent.click(cell);
    const before = screen.getByTestId('harness-coverage-detail').getAttribute('data-harness-detail-reveal');
    fireEvent.click(
      document.querySelector(
        '[data-testid="harness-everywhere-toggle"][data-harness-everywhere="gated"]',
      ) as HTMLButtonElement,
    );
    const after = screen.getByTestId('harness-coverage-detail').getAttribute('data-harness-detail-reveal');
    expect(after).not.toBe(before);
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
