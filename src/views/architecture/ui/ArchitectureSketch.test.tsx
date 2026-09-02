import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import { HEXAGONAL_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
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
) {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never)),
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
      observationMissingLabel="Not inspected"
      selected={null}
      onSelect={() => {}}
      roleLabel={(id) => id}
      moduleCountLabel={(n) => `${n} modules`}
      conceptCountLabel={(n) => `${n} concepts`}
      moduleCounts={null}
      conceptCounts={{}}
      runLabel="Run the flow"
      finishRunLabel="Finish replay"
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

describe('the run control', () => {
  it('normalizes the stagger across the whole observed path', () => {
    /*
     * ⚠️ The defect a fresh-eyes walkthrough measured on 2026-08-28. The step was fed the box's x
     * coordinate, and the stylesheet multiplies the step by a 90ms token — so three strokes began
     * at 2520ms, 20520ms and 38520ms and a "run" took forty seconds to cross four boxes. A stagger
     * counts places in a queue; a queue place is a small integer.
     */
    const { container } = draw({}, new Set(), OBSERVED_TRAFFIC);
    fireEvent.click(screen.getByTestId('architecture-graph-run'));
    const steps = [...container.querySelectorAll('[data-edge-kind]')].map((edge) =>
      Number((edge as HTMLElement).style.getPropertyValue('--architecture-run-step')),
    );
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step).toBeGreaterThanOrEqual(0);
    for (const step of steps) expect(step).toBeLessThanOrEqual(1);
    expect(Math.max(...steps)).toBe(1);
  });

  it('finishes the current replay when pressed again', () => {
    /* A replay is feedback, not a lock: the second activation settles every moving mark. */
    const { container } = draw({}, new Set(), OBSERVED_TRAFFIC);
    const button = screen.getByTestId('architecture-graph-run');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Finish replay');
    fireEvent.click(button);
    expect(button).toHaveTextContent('Run the flow');
    expect(
      [...container.querySelectorAll('[data-edge-kind]')].some((edge) =>
        edge.classList.contains('architecture-flow-running'),
      ),
    ).toBe(false);
  });

  it('makes the measured role sequence visible even when adjacent edge travel is short', () => {
    const { container } = draw({}, new Set(), OBSERVED_TRAFFIC);
    expect(container.querySelector('[data-testid^="architecture-observation-pulse-"]')).toBeNull();

    fireEvent.click(screen.getByTestId('architecture-graph-run'));

    const pulses = [
      ...container.querySelectorAll('[data-testid^="architecture-observation-pulse-"]'),
    ];
    expect(pulses).toHaveLength(3);
    expect(pulses.every((pulse) => pulse.classList.contains('architecture-observation-pulse'))).toBe(
      true,
    );
  });

  it('takes the running class off every stroke once the flow ends', () => {
    /*
     * ⚠️ The class carries the dash pattern as a static rule, so leaving it on left the whole
     * drawing dashed for good with no way back. The strokes report their own end; nothing here
     * repeats the duration as a number.
     */
    /* ⚠️ Scope every query to this render's own container. `document.querySelectorAll` also
       reaches the trees the earlier cases left mounted, and those pressed run and never ended —
       so a global query reports the class still present no matter what this case does. */
    const { container } = draw({}, new Set(), OBSERVED_TRAFFIC);
    fireEvent.click(screen.getByTestId('architecture-graph-run'));
    const trafficEdges = [
      ...container.querySelectorAll('[data-edge-kind="traffic"][data-edge-drawn="true"]'),
    ];
    const contractEdges = [
      ...container.querySelectorAll('[data-edge-kind="permitted"][data-edge-drawn="true"]'),
    ];
    expect(trafficEdges.every((e) => e.classList.contains('architecture-flow-running'))).toBe(true);
    expect(contractEdges.some((e) => e.classList.contains('architecture-flow-running'))).toBe(false);
    /* `bubbles: true` is required: React listens at the root, and Testing Library's default
       initialiser for an animation event does not bubble, so the handler would never run. */
    /* `bubbles: true` is required: React listens at the root, and Testing Library's default
       initialiser for an animation event does not bubble. */
    /*
     * ⚠️ **The prefixed name, and only it.** React resolves the animation-event name once at
     * startup by feature-detecting the style object, and under jsdom that detection lands on
     * `webkitAnimationEnd` — so a plain `animationend`, including Testing Library's
     * `fireEvent.animationEnd`, never reaches the handler and this case failed while the browser
     * behaved correctly. Firing exactly one event per stroke also keeps the count honest: firing
     * both names would drive the counter past zero and hide a miscount.
     */
    for (const edge of trafficEdges) {
      act(() => {
        edge.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }));
      });
    }
    expect(
      [...container.querySelectorAll('[data-edge-kind]')].some((e) =>
        e.classList.contains('architecture-flow-running'),
      ),
    ).toBe(false);
    expect(screen.getByTestId('architecture-graph-run')).not.toBeDisabled();
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
  it('expands into aligned contract and observation lanes only when the full role set fits', () => {
    const geometry: Record<string, number> = {
      clientWidth: 1600,
      scrollWidth: 1600,
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
      const { container } = draw();
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-box-width-mode', 'roomy');
      expect(graph).toHaveAttribute('data-architecture-axis', 'across');
      expect(screen.getAllByTestId(/^architecture-observation-box-/)).toHaveLength(4);
      expect(screen.getAllByTestId(/^architecture-delta-connector-/)).toHaveLength(4);
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
});
