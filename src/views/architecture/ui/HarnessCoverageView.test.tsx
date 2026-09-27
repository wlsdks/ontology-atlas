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
 * What every coverage mark encodes, asserted as the encoding: the square says something or
 * nothing; the number says how many; the card numeral counts the empty squares below it; a
 * mirrored name appears once while the tools carry the multiplicity.
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

/* Front has twelve checks and Api two: the spread a per-column-max bar drew at equal length. */
const coverage: ScopeDeclaration[] = [
  ...Array.from({ length: 12 }, (_, index) =>
    declaration({ id: `package.json#test:front-${index}`, column: 'watched', origin: 'script', scopes: ['src/front'] }),
  ),
  declaration({ id: 'package.json#test:api-a', column: 'watched', origin: 'script', scopes: ['api/orders'] }),
  declaration({ id: 'package.json#test:api-b', column: 'watched', origin: 'script', scopes: ['api/orders'] }),
  declaration({ id: 'src/AGENTS.md', column: 'told', origin: 'nested-agents', scopes: ['src'] }),
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
  /* Declares no path, so it reaches every area and belongs in the band; mirrored across both hook trees. */
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
    /* A mark scaled to its column's maximum cannot be decoded, so a mark has exactly two states and no inline size. */
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
    /* Filled has a background, empty is an outline: readable without separating indigo from amber. */
    expect(filled.className).toMatch(/bg-\[color:var\(--color-indigo/);
    expect(empty.className).not.toMatch(/\bbg-\[/);
  });

  it('names an empty cell instead of leaving it blank', () => {
    mount();
    const emptyCell = document.querySelector(
      '[data-harness-cell][data-harness-cell-empty="true"]',
    ) as HTMLElement;
    expect(emptyCell.querySelector('.sm\\:inline')!.textContent).toBe('없음');
  });

  it('prints the magnitude as a number, in the cell', () => {
    mount();
    const front = document.querySelector('[data-harness-area="domains/front"]')!;
    expect(within(front as HTMLElement).getByText('12')).toBeInTheDocument();
  });

  it("makes the card's numeral the count of empty squares in its own column", () => {
    /* The card's number must equal a count of the marks below it, or the screen contradicts itself. */
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
    /* Both branches are exercised, so the equality is not 0 = 0. */
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
    /* The numerals stay equal in both strips; surface is the only channel allowed to differ. */
    mount();
    const panelled = [...document.querySelectorAll('[data-census-surface="panel"]')];
    const bare = [...document.querySelectorAll('[data-census-surface="bare"]')];
    expect(panelled.map((el) => el.getAttribute('data-testid'))).toEqual(
      Array(3).fill('harness-coverage-column-card'),
    );
    expect(bare.map((el) => el.getAttribute('data-testid'))).toEqual(
      Array(3).fill('harness-reach-tile'),
    );
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
    /* One control for one definition; per-tile hints overflowed the viewport. */
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
    /* For `shape: 'link'` the only state channel is text colour, which the child overrides; the chevron's rotation cannot be. */
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
    /* The close button lives in another subtree, so without this focus falls to `<body>`. */
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
    /* The band's count stays a count of files and its list one row per name. */
    const toggle = openBand();
    expect(toggle.textContent).toContain('1');
    const band = screen.getByTestId('harness-coverage-everywhere');
    expect(band.textContent!.match(/block-npm-publish/g)).toHaveLength(1);
    expect(band).toHaveTextContent('Claude Code');
    expect(band).toHaveTextContent('Codex');
  });

  it('re-reveals an open cell detail when the band inserts itself above the table', () => {
    /* Opening the band pushes the table down; the reveal key changing re-scrolls an open detail. */
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
    /* Hooks mirrored in `.claude/hooks/` and `.codex/hooks/` print once, with the naming configs asserted. */
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
    /* Two declarations, two tools, one guard: the count and the tool list agree. */
    expect(cell.getAttribute('aria-label')).toContain('2');
  });
});
