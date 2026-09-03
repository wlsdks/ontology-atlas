import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from '../model/graph-layout';
import type { RoleLedger } from '../model/role-ledger';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';
import { ArchitectureSketch } from './ArchitectureSketch';

const OBSERVED_TRAFFIC: ArchitectureRoleEdge[] = [
  { fromRole: 'adapter', toRole: 'application', count: 12 },
  { fromRole: 'application', toRole: 'port', count: 7 },
  { fromRole: 'port', toRole: 'domain', count: 4 },
];

function draw(
  ledgers: Record<string, RoleLedger> = {},
  violatedPairs = new Set<string>(),
  traffic: readonly ArchitectureRoleEdge[] = [],
  profileFrontmatter: unknown = HEXAGONAL_PROFILE_FRONTMATTER,
) {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(profileFrontmatter as never)),
    traffic,
  );
  return render(
    <ArchitectureSketch
      graph={graph}
      ledgers={ledgers}
      roleSummary={() => null}
      edgeSentence={(edge) =>
        edge.kind === 'permitted'
          ? `${edge.from} may depend on ${edge.to}`
          : `${edge.from} reaches ${edge.to} in ${edge.count ?? 0} imports`
      }
      violatedPairs={violatedPairs}
      ledgerStatusLabel={(ledger) =>
        ledger.state === 'clean' ? 'no violations out' : `${ledger.violated} violated`
      }
      ledgerImportsLabel={(count) => `${count} imports out`}
      contractTrackLabel="Contract"
      observationTrackLabel="Observation"
      deltaTrackLabel="Delta"
      observationMissingLabel="Not inspected"
      selected={null}
      roleInspectorOpen={false}
      onSelect={() => {}}
      roleLabel={(id) => id}
      moduleCountLabel={(n) => `${n} modules`}
      conceptCountLabel={(n) => `${n} concepts`}
      moduleCounts={null}
      conceptCounts={{}}
      hiddenRightLabel={(count) => `${count} more to the right`}
      hiddenLeftLabel={(count) => `${count} more to the left`}
      hiddenAboveLabel={(count) => `${count} more above`}
      hiddenBelowLabel={(count) => `${count} more below`}
    />,
  );
}

describe('the count of what is below', () => {
  it('sits over the fade and takes no height from the scroller it counts against', () => {
    /*
     * ⚠️ Measured in the installed app 2026-08-30 at a 1512x949 window: the pill lived in a flow
     * row under the scroller, so the moment it appeared it took 32px from the very height that
     * decided whether it should appear, and a chain that fit by 13px stayed "1 more below" for
     * good. jsdom lays nothing out, so the scroller's geometry is stubbed to a cut chain; what is
     * asserted is where the pill is put, which is the whole fix.
     */
    /* A 1200px-wide, 100px-tall scroller holding a 700px drawing: the chain runs down and is cut. */
    const geometry: Record<string, number> = { clientWidth: 1200, scrollWidth: 1200, clientHeight: 100, scrollHeight: 700 };
    const originals = Object.fromEntries(
      Object.keys(geometry).map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)]),
    );
    for (const [key, value] of Object.entries(geometry))
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
    try {
      draw();
    } finally {
      for (const [key, descriptor] of Object.entries(originals))
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
    const pill = screen.getByTestId('architecture-canvas-hidden-below');
    const wrapper = pill.parentElement as HTMLElement;
    expect(wrapper.className).toContain('absolute');
    expect(wrapper.className).toContain('pointer-events-none');
    const scroller = document.querySelector('[data-testid="architecture-graph"]')?.parentElement as HTMLElement;
    expect(wrapper.compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe('the role ledger', () => {
  const ledger = (over: Partial<RoleLedger> = {}): RoleLedger => ({
    state: 'clean',
    violated: 0,
    outgoing: 2,
    sampleLimited: false,
    importsOut: 314,
    ...over,
  });

  /*
   * ⚠️ **Without a receipt the box says nothing, and stays the size it was.** A ledger line of
   * zeros would read as "no violations" — a claim about source nobody listed. This is the normal
   * case in a browser, where source cannot be listed at all.
   */
  it('draws no ledger line and keeps the short box when no record was measured', () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid^="architecture-role-ledger-"]')).toBeNull();
    expect(screen.queryByTestId('architecture-graph-run')).toBeNull();
    const box = container.querySelector('[data-testid="architecture-graph-box-domain"]');
    expect(box?.getAttribute('data-box-height')).toBe('72');
  });

  it('grows every box in lockstep once any role carries a ledger', () => {
    /* One tall box beside six short ones is a row of different things; the boxes are one row of
       the same thing, so the height is decided by the profile, not by the role. */
    const { container } = draw({ domain: ledger() });
    const heights = [
      ...container.querySelectorAll('[data-testid^="architecture-graph-box-"]'),
    ].map((box) => box.getAttribute('data-box-height'));
    expect(new Set(heights)).toEqual(new Set(['82']));
  });

  it('states what the role’s own outgoing edges did, and the imports behind the stroke', () => {
    const { container } = draw({ domain: ledger({ state: 'violated', violated: 3 }) });
    const line = container.querySelector('[data-testid="architecture-role-ledger-domain"]');
    expect(line?.getAttribute('data-ledger-state')).toBe('violated');
    expect(line?.textContent).toContain('3 violated');
    /* One line, not two: the receipt and the traffic behind the stroke read as one sentence so a
       seven-role chain still fits a laptop canvas without scrolling. */
    expect(line?.textContent).toContain('314 imports out');
  });

  /*
   * ⚠️ Status is a shape here, never a colour. The design system is neutrals plus one indigo, and
   * a red/green ledger would be a second colour system — a rule change to request, not to assume.
   */
  it('marks state with an achromatic glyph rather than a status colour', () => {
    const { container } = draw({ domain: ledger({ state: 'violated', violated: 1 }) });
    const line = container.querySelector('[data-testid="architecture-role-ledger-domain"]');
    expect(line?.textContent?.startsWith('⊘')).toBe(true);
    expect(line?.getAttribute('class') ?? '').not.toMatch(/red|green|amber|emerald/);
  });
});

describe('the evidence split plane', () => {
  it('uses the selected dual evidence ladder when seven roles fit as paired downward rows', () => {
    const geometry: Record<string, number> = {
      clientWidth: 1200,
      scrollWidth: 1200,
      clientHeight: 700,
      scrollHeight: 700,
    };
    const originals = Object.fromEntries(
      Object.keys(geometry).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
      ]),
    );
    try {
      for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get: () => value,
        });
      }
      const { container } = draw({}, new Set(), [], FSD_PROFILE_FRONTMATTER);
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-architecture-axis', 'down');
      expect(graph).toHaveAttribute('data-evidence-layout', 'paired-ladder');
      expect(graph).toHaveAttribute('width', '1008');
      /* 8 + 20 + 7×72 + 6×24 + 8: the row gap carries the rule sentence beside its arrow. */
      expect(graph).toHaveAttribute('height', '684');
      expect(screen.getByTestId('architecture-paired-lane-headings')).toHaveTextContent(
        'ContractDeltaObservation',
      );
      expect(screen.getAllByTestId(/^architecture-role-index-/)).toHaveLength(7);
      expect(screen.getAllByTestId(/^architecture-observation-box-/)).toHaveLength(7);
      expect(screen.getAllByTestId(/^architecture-delta-marker-/)).toHaveLength(7);
      expect(screen.getByTestId('architecture-delta-marker-widgets')).toHaveTextContent('○');
      expect(screen.getByTestId('architecture-graph-box-widgets')).toHaveAttribute(
        'data-box-width',
        '280',
      );
      expect(screen.getByTestId('architecture-observation-box-widgets')).toHaveAttribute(
        'width',
        '240',
      );
      expect(container.querySelectorAll('[data-architecture-role-hit-area="true"]')).toHaveLength(7);
    } finally {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });

  /*
   * ⚠️ Measured 2026-09-03 at 1920×1080: "across while it fits across" drew 151px cards, 205px of
   * ink in a 918px canvas, and cut every role sentence. The 280/72/240 rows the 2026-09-03 record
   * decided are preferred whenever the canvas at rest is tall enough for them.
   */
  it('prefers the comparison ladder over an across chain when the rows fit the height', () => {
    /* The height rule applies only at workbench width (xl), where the canvas column is
       height-bounded; below it the column is content-sized and the width rule alone decides. */
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('1280'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    const geometry: Record<string, number> = {
      clientWidth: 1792,
      scrollWidth: 1792,
      clientHeight: 918,
      scrollHeight: 918,
    };
    const originals = Object.fromEntries(
      Object.keys(geometry).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
      ]),
    );
    try {
      for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get: () => value,
        });
      }
      draw({}, new Set(), [], FSD_PROFILE_FRONTMATTER);
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-architecture-axis', 'down');
      expect(graph).toHaveAttribute('data-evidence-layout', 'paired-ladder');
      /* Every adjacent rule sentence is drawn beside its arrow, none held or cut. */
      const sentences = [...document.querySelectorAll('[data-edge-sentence-kind="permitted"]')];
      expect(sentences).toHaveLength(6);
      expect(sentences.every((node) => node.getAttribute('data-edge-sentence') === 'drawn')).toBe(true);
      expect(sentences.every((node) => node.getAttribute('text-anchor') === 'start')).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });

  it('expands into aligned contract and observation lanes only when the full role set fits', () => {
    /* A canvas too short for the four paired rows (16 + 20 + 4×72 + 3×24 = 396), so the across
       chain is the honest answer; a taller one takes the comparison ladder, tested below. */
    const geometry: Record<string, number> = {
      clientWidth: 1600,
      scrollWidth: 1600,
      clientHeight: 360,
      scrollHeight: 360,
    };
    const originals = Object.fromEntries(
      Object.keys(geometry).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
      ]),
    );
    try {
      for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get: () => value,
        });
      }
      const { container } = draw();
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-box-width-mode', 'roomy');
      expect(graph).toHaveAttribute('data-architecture-axis', 'across');
      expect(screen.getAllByTestId(/^architecture-observation-box-/)).toHaveLength(4);
      expect(screen.getAllByTestId(/^architecture-delta-connector-/)).toHaveLength(4);
      expect(screen.getAllByTestId(/^architecture-role-index-/)).toHaveLength(4);
      expect(screen.getByTestId('architecture-role-index-adapter')).toHaveTextContent('01');
      expect(screen.getByTestId('architecture-role-index-domain')).toHaveTextContent('04');
      expect(container.querySelectorAll('[data-architecture-role-hit-area="true"]')).toHaveLength(4);
      expect(container.querySelectorAll('[data-architecture-port="contract"]')).toHaveLength(6);
      expect(
        container.querySelector(
          '[data-graph-box="adapter"] [data-port-direction="incoming"]',
        ),
      ).toBeNull();
      expect(
        container.querySelector(
          '[data-graph-box="adapter"] [data-port-direction="outgoing"]',
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(
          '[data-graph-box="domain"] [data-port-direction="incoming"]',
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(
          '[data-graph-box="domain"] [data-port-direction="outgoing"]',
        ),
      ).toBeNull();
      expect(screen.getByTestId('architecture-graph-box-domain')).toHaveAttribute(
        'data-box-height',
        '84',
      );
      expect(screen.getByTestId('architecture-role-observation-domain')).toHaveTextContent(
        'Not inspected',
      );
      expect(container.querySelector('[data-testid="architecture-graph-run"]')).toBeNull();
    } finally {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });

  it('keeps a split observation card to its import count while the gutter carries status', () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientWidth',
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 1600,
    });
    try {
      draw({
        domain: {
          state: 'clean',
          violated: 0,
          outgoing: 2,
          sampleLimited: false,
          importsOut: 314,
        },
      });
      const observation = screen.getByTestId('architecture-role-ledger-domain');
      expect(observation).toHaveTextContent(/^314 imports out$/);
      expect(observation).not.toHaveTextContent('no violations');
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
      }
    }
  });

  it('draws reviewed permission and matching observed traffic on distinct compact tracks', () => {
    const geometry: Record<string, number> = {
      clientWidth: 400,
      scrollWidth: 400,
      clientHeight: 700,
      scrollHeight: 700,
    };
    const originals = Object.fromEntries(
      Object.keys(geometry).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
      ]),
    );
    try {
      for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get: () => value,
        });
      }
      const { container } = draw({}, new Set(), OBSERVED_TRAFFIC);
      const rule = container.querySelector<SVGPathElement>(
        '[data-edge-kind="permitted"][data-edge-from="adapter"][data-edge-to="application"]',
      );
      const traffic = container.querySelector<SVGPathElement>(
        '[data-edge-kind="traffic"][data-edge-from="adapter"][data-edge-to="application"]',
      );
      expect(screen.getByTestId('architecture-graph')).toHaveAttribute(
        'data-architecture-axis',
        'down',
      );
      expect(rule).toHaveAttribute('data-edge-track-offset', '-6');
      expect(traffic).toHaveAttribute('data-edge-track-offset', '6');
      expect(rule?.getAttribute('d')).not.toBe(traffic?.getAttribute('d'));
      expect(
        container.querySelector(
          '[data-edge-sentence-kind="permitted"][data-edge-sentence="drawn"]',
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(
          '[data-edge-sentence-kind="traffic"][data-edge-sentence="drawn"]',
        ),
      ).not.toBeNull();
    } finally {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });

  it('keeps a violated edge and arrowhead red while shared ports remain indigo', () => {
    /* Ports for the observed lane exist only once the measured canvas can split contract from
       observation. jsdom reports a zero-width canvas unless this test supplies the same wide
       geometry the assertion is about. */
    const originalClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientWidth',
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 1200,
    });
    let container: HTMLElement;
    try {
      ({ container } = draw(
        {},
        new Set(['adapter>application']),
        OBSERVED_TRAFFIC,
      ));
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
      }
    }
    const edge = container.querySelector<SVGPathElement>(
      '[data-edge-kind="traffic"][data-edge-from="adapter"][data-edge-to="application"]',
    );
    expect(edge).toHaveAttribute('stroke', 'var(--color-danger-text)');
    expect(edge).toHaveAttribute('marker-end', 'url(#architecture-sketch-arrow-violation)');
    const ports = [...container.querySelectorAll('[data-architecture-port="observation"]')];
    expect(ports.length).toBeGreaterThan(0);
    expect(ports.every((port) => port.getAttribute('stroke') !== 'var(--color-danger-text)')).toBe(
      true,
    );
  });
});
