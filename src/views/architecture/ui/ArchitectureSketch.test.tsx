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
  selected: string | null = null,
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
      deltaUnknownLabel="not observed yet"
      contractTrackLabel="Contract"
      observationTrackLabel="Observation"
      deltaTrackLabel="Delta"
      deltaColumnNote="Nothing compared yet"
      deltaColumnHint="Each mark says what that role's own outgoing imports did."
      observationMissingLabel="Not inspected"
      selected={selected}
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
      /*
       * ⚠️ **The drawing takes the canvas it is given, centred** (inspection 122, S8, 2026-09-13).
       * It used to be 1120 in a 1200 canvas with the faces frozen at 280/72/240: the contract face
       * held its width however much ground the card had, so at 1512 the band was 592px inside a
       * 1448px card and all seven role sentences ended in an ellipsis. The face now grows into the
       * spare width up to `PAIRED_CONTRACT_W_MAX`, and whatever the two lanes still do not need is
       * split evenly, so the width is the canvas and the band sits on its centre line.
       *
       * 1200 = 56 padding + 560 contract + 160 gutter + 240 observation + 92 on each side.
       *
       * ⚠️ **Re-derived 2026-09-13** after two reserves were measured as fictions. The contract
       * face used to stop at 424 and the gutter at 72, because the spare width was computed after
       * subtracting the observation lane's 360px skip-arc cap — ground this profile, and every
       * profile the dogfood vault ships, never uses, since none of them declares a skip on the
       * traffic side. With the reserve made conditional the face reaches its own `560` cap and the
       * gutter its `160`, which is what stops the observation lane's sentence being cut at 146px of
       * room. The side lanes fall from 204 to 92 each: the drawing is still centred, on less empty
       * ground.
       */
      expect(graph).toHaveAttribute('width', '1200');
      /* 8 + 20 + 7×72 + 6×24 + 8, plus the 8px head room the top plane's lit edge needs to stop
         reading as a rule under the lane headings, the 3px ledge under the last role, and — since
         2026-09-13 — one `--leading-label` line above the first face for the column note, which
         used to be drawn on top of it. */
      expect(graph).toHaveAttribute('height', '711');
      expect(screen.getByTestId('architecture-paired-lane-headings')).toHaveTextContent(
        'ContractDeltaObservation',
      );
      expect(screen.getAllByTestId(/^architecture-role-index-/)).toHaveLength(7);
      expect(screen.getAllByTestId(/^architecture-observation-box-/)).toHaveLength(7);
      expect(screen.getAllByTestId(/^architecture-delta-marker-/)).toHaveLength(7);
      expect(screen.getByTestId('architecture-delta-marker-widgets')).toHaveTextContent('○');
      expect(screen.getByTestId('architecture-graph-box-widgets')).toHaveAttribute(
        'data-box-width',
        '560',
      );
      /* The whole point of the wider face: the sentence finishes. An ellipsis anywhere in the
         contract lane means the face went back to being narrower than its own copy. */
      const sentences = [...container.querySelectorAll('[data-testid^="architecture-box-line-"]')]
        .map((node) => node.textContent ?? '');
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.filter((line) => line.trimEnd().endsWith('…'))).toEqual([]);
      /*
       * ⚠️ **Every layer plane ends on one line.** The stack used to be one fixed-width
       * parallelogram translated left by a `PLANE_STEP` per rank, so both of its vertical edges
       * stepped together: measured on the built export at 1512 (2026-09-13) the seven left edges
       * ran 324→240 and the seven right edges ran 1336→1252, an 84px staircase on the side the
       * stack does not recede from. Depth is the leftward stagger, the lean of the lit top face and
       * the rank numeral; a ragged right edge was never carrying any of it, and the owner read the
       * result as a drawing that failed to line up.
       */
      const planeEdges = [...container.querySelectorAll('[data-testid^="architecture-layer-plane-"]')]
        .map((plane) => {
          const d = plane.querySelector('path')!.getAttribute('d') ?? '';
          const [, bottomLeft, , bottomRight] = /M ([\d.]+) ([\d.]+) H ([\d.]+)/.exec(d)!;
          return { left: Number(bottomLeft), right: Number(bottomRight) };
        });
      expect(planeEdges.length).toBe(7);
      expect(new Set(planeEdges.map((edge) => edge.right)).size).toBe(1);
      /* The stagger itself is untouched: one `PLANE_STEP` of depth per rank, still going left. */
      const lefts = planeEdges.map((edge) => edge.left);
      expect(new Set(lefts).size).toBe(7);
      expect(Math.max(...lefts) - Math.min(...lefts)).toBe(6 * 14);

      /*
       * ⚠️ **The chrome row does not sit on the first face.** Measured on the built export at 1512
       * in both locales (2026-09-13): the lane heading's box ended at 201 and the column note began
       * at 202 — 1px — and the note's box ended at 215 against a face top of 212, so the note was
       * drawn **over** the dashed face by 3px. Three formulas owned that rhythm; one does now, and
       * it is the `--leading-label` line box rather than a gap chosen by eye, which is what keeps
       * it right in Korean as well as English.
       */
      const laneHeading = container.querySelector('[data-testid="architecture-paired-lane-headings"] text')!;
      const columnNote = screen.getByTestId('architecture-observation-column-note');
      const firstFace = container.querySelector('[data-testid^="architecture-observation-box-"]')!;
      const headingY = Number(laneHeading.getAttribute('y'));
      const noteY = Number(columnNote.getAttribute('y'));
      const faceY = Number(firstFace.getAttribute('y'));
      expect(noteY - headingY).toBe(16);
      expect(faceY).toBeGreaterThan(noteY);

      /* And the observation column states "not inspected yet" once rather than seven times. */
      expect(screen.getByTestId('architecture-observation-column-note')).toBeInTheDocument();
      expect(
        screen.getByTestId('architecture-role-observation-widgets').textContent,
      ).toBe('');
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
      expect(graph).toHaveAttribute('data-ladder-density', 'roomy');
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

  /*
   * ⚠️ Measured 2026-09-03 at 1280x800, the widest laptop the product ships to: the canvas column
   * is 638px and the roomy rows ask for 684, so the seventh role was cut and the canvas counted it
   * as hidden. Fixed-readable faces and connector space yield with the canvas before any role is
   * hidden, so the same 280/72/240 comparison draws on tighter rows instead.
   */
  it('tightens the ladder rows rather than hiding a role when the canvas is short', () => {
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
      clientHeight: 600,
      scrollHeight: 600,
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
      expect(graph).toHaveAttribute('data-ladder-density', 'tight');
      /* 4 + 20 + 7x58 + 6x22 + 4: one summary line per role, and the gap the sentence needs,
         plus the layer stack's 8px head room and its 3px bottom ledge. */
      expect(graph).toHaveAttribute('height', '593');
      const boxes = screen.getAllByTestId(/^architecture-graph-box-/);
      expect(boxes).toHaveLength(7);
      expect(boxes.every((box) => box.getAttribute('data-box-height') === '58')).toBe(true);
      /* The rows are tighter, and every rule still says its sentence beside its own arrow. */
      const sentences = [...document.querySelectorAll('[data-edge-sentence-kind="permitted"]')];
      expect(sentences).toHaveLength(6);
      expect(sentences.every((node) => node.getAttribute('data-edge-sentence') === 'drawn')).toBe(
        true,
      );
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

/**
 * **Direction B, 2026-09-08 — the import direction is drawn as depth.**
 *
 * `app → views → widgets → features → entities → shared` is a rule about what may reach what, and
 * the ladder stated it only as row order. Seven stacked rows of one surface say "these came in
 * this sequence"; a stack of planes says "this one is under that one", which is the actual rule.
 * These gates hold the three facts the drawing now depends on: the stack is ordered and steps by
 * one constant, every role sits inside its own layer's plane, and the one import that travels *up*
 * the stack carries a halo that answers when its role is chosen.
 */
describe('the layer planes', () => {
  const LADDER_GEOMETRY: Record<string, number> = {
    clientWidth: 1200,
    scrollWidth: 1200,
    clientHeight: 700,
    scrollHeight: 700,
  };

  function withLadderCanvas(body: () => void) {
    const originals = Object.fromEntries(
      Object.keys(LADDER_GEOMETRY).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
      ]),
    );
    try {
      for (const [key, value] of Object.entries(LADDER_GEOMETRY)) {
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get: () => value,
        });
      }
      body();
    } finally {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  }

  /** The x the plane's parallelogram starts from: `M <x> <y> H …`. */
  function planeOriginX(plane: Element): number {
    const d = plane.querySelector('path')?.getAttribute('d') ?? '';
    return Number(/^M ([\d.-]+) /.exec(d)?.[1]);
  }

  it('stacks one plane per layer, ordered nearest to deepest and stepping by one constant', () => {
    withLadderCanvas(() => {
      draw({}, new Set(), [], FSD_PROFILE_FRONTMATTER);
      const planes = [...document.querySelectorAll('[data-testid^="architecture-layer-plane-"]')];
      expect(planes).toHaveLength(7);
      expect(planes.map((plane) => plane.getAttribute('data-layer-rank'))).toEqual([
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
      ]);
      /* Depth is the fact the DOM carries; the two ends of the ramp stay in CSS tokens. */
      const depths = planes.map((plane) => Number(plane.getAttribute('data-layer-depth')));
      expect(depths[0]).toBe(1);
      expect(depths[depths.length - 1]).toBe(0);
      expect(depths.every((depth, index) => index === 0 || depth < depths[index - 1])).toBe(true);
      /* One step per layer, so the whole stack shears along a single line. */
      const origins = planes.map(planeOriginX);
      const steps = origins.slice(1).map((x, index) => origins[index] - x);
      expect(new Set(steps)).toEqual(new Set([14]));
    });
  });

  it('gives every role ground to stand on, and adds nothing an assistive reader must hear', () => {
    withLadderCanvas(() => {
      const { container } = draw({}, new Set(), [], FSD_PROFILE_FRONTMATTER);
      const group = container.querySelector('[data-testid="architecture-layer-planes"]');
      expect(group).toHaveAttribute('aria-hidden', 'true');
      expect(group).toHaveAttribute('pointer-events', 'none');
      expect(group?.querySelectorAll('text')).toHaveLength(0);
      /* The nearest layer's plane is the one shifted furthest along the stack, so it is the
         tightest containment case: its ground still starts left of the reviewed face. */
      const faceX = Number(
        container
          .querySelector('[data-testid="architecture-graph-box-app"] rect')
          ?.getAttribute('x'),
      );
      const nearest = container.querySelector('[data-testid="architecture-layer-plane-app"]');
      expect(nearest).not.toBeNull();
      expect(planeOriginX(nearest as Element)).toBeLessThan(faceX);
    });
  });

  it('a violation climbs the stack, and choosing its role raises the halo with the stroke', () => {
    withLadderCanvas(() => {
      const { container, unmount } = draw(
        {},
        new Set(['adapter>application']),
        OBSERVED_TRAFFIC,
        HEXAGONAL_PROFILE_FRONTMATTER,
      );
      const halo = container.querySelector(
        '[data-testid="architecture-violation-halo-adapter-application"]',
      );
      expect(halo).toHaveAttribute('filter', 'url(#architecture-violation-halo)');
      expect(halo).toHaveAttribute('stroke', 'var(--color-danger-text)');
      expect(halo).toHaveAttribute('data-edge-raised', 'false');
      expect(halo).toHaveAttribute('stroke-width', '4');
      /* The halo is a second painted pass, never a second crossing: a gate that counts strokes
         by `data-edge-from` must still see one path per crossing. */
      expect(halo).not.toHaveAttribute('data-edge-from');
      const restStrokeWidth = Number(
        container
          .querySelector(
            '[data-edge-kind="traffic"][data-edge-from="adapter"][data-edge-to="application"]',
          )
          ?.getAttribute('stroke-width'),
      );
      unmount();

      const raised = draw(
        {},
        new Set(['adapter>application']),
        OBSERVED_TRAFFIC,
        HEXAGONAL_PROFILE_FRONTMATTER,
        'adapter',
      ).container;
      const raisedHalo = raised.querySelector(
        '[data-testid="architecture-violation-halo-adapter-application"]',
      );
      expect(raisedHalo).toHaveAttribute('data-edge-raised', 'true');
      expect(raisedHalo).toHaveAttribute('stroke-width', '7');
      /* Its own stroke rises with it, so the raise is one event rather than a lit outline. */
      expect(
        Number(
          raised
            .querySelector(
              '[data-edge-kind="traffic"][data-edge-from="adapter"][data-edge-to="application"]',
            )
            ?.getAttribute('stroke-width'),
        ),
      ).toBeGreaterThan(restStrokeWidth);
    });
  });
});
