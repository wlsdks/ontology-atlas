import { act, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

function sketch(
  ledgers: Record<string, RoleLedger> = {},
  violatedPairs = new Set<string>(),
  traffic: readonly ArchitectureRoleEdge[] = [],
  profileFrontmatter: unknown = HEXAGONAL_PROFILE_FRONTMATTER,
  selected: string | null = null,
  extra: Partial<ComponentProps<typeof ArchitectureSketch>> = {},
) {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(profileFrontmatter as never)),
    traffic,
  );
  return (
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
      deltaColumnHint="Each mark says what that role's own outgoing imports did."
      observationMissingLabel="Not inspected"
      observationEmptyTitle="Source not inspected yet"
      observationEmptyBody="Inspect source has an agent read the real imports and fill this in for each role."
      lowerOnlyRuleLabel="Each role may depend only on roles below it."
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
      {...extra}
    />
  );
}

function draw(...args: Parameters<typeof sketch>) {
  return render(sketch(...args));
}

/* jsdom lays nothing out, so a test that needs a measured canvas stubs element geometry around its run. */
function withGeometry(geometry: Record<string, number>, run: () => void) {
  const originals = Object.fromEntries(
    Object.keys(geometry).map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)]),
  );
  for (const [key, value] of Object.entries(geometry))
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
  try {
    run();
  } finally {
    for (const [key, descriptor] of Object.entries(originals))
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
}

describe('the count of what is below', () => {
  it('sits over the fade and takes no height from the scroller it counts against', () => {
    /* A flow-row pill took the height that decided whether it should appear; jsdom lays nothing out, so geometry is stubbed and the pill's placement asserted. */
    withGeometry({ clientWidth: 1200, scrollWidth: 1200, clientHeight: 100, scrollHeight: 700 }, () => {
      draw();
    });
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

  /* A ledger line of zeros would claim "no violations" about source nobody listed. */
  it('draws no ledger line and keeps the short box when no record was measured', () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid^="architecture-role-ledger-"]')).toBeNull();
    expect(screen.queryByTestId('architecture-graph-run')).toBeNull();
    const box = container.querySelector('[data-testid="architecture-graph-box-domain"]');
    expect(box?.getAttribute('data-box-height')).toBe('72');
  });

  it('grows every box in lockstep once any role carries a ledger', () => {
    /* The boxes are one row of the same thing, so the profile decides the height, not the role. */
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
    /* One line, so a seven-role chain still fits a laptop canvas. */
    expect(line?.textContent).toContain('314 imports out');
  });

  /* Status is a shape, never a colour: a red/green ledger would be a second colour system. */
  it('marks state with an achromatic glyph rather than a status colour', () => {
    const { container } = draw({ domain: ledger({ state: 'violated', violated: 1 }) });
    const line = container.querySelector('[data-testid="architecture-role-ledger-domain"]');
    expect(line?.textContent?.startsWith('⊘')).toBe(true);
    expect(line?.getAttribute('class') ?? '').not.toMatch(/red|green|amber|emerald/);
  });
});

describe('the evidence split plane', () => {
  it('uses the selected dual evidence ladder when seven roles fit as paired downward rows', () => {
    withGeometry({ clientWidth: 1200, scrollWidth: 1200, clientHeight: 700, scrollHeight: 700 }, () => {
      const { container } = draw({}, new Set(), [], FSD_PROFILE_FRONTMATTER);
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-architecture-axis', 'down');
      expect(graph).toHaveAttribute('data-evidence-layout', 'paired-ladder');
      /*
       * The empty column holds the skip lane a record will need, so a landing record moves no face:
       * 1200 = 56 padding + 424 contract + 72 gutter + 240 observation + 204 on each side.
       */
      expect(graph).toHaveAttribute('width', '1200');
      /* 8 + 20 + 16 + 7×72 + 6×24 + 8, plus the bands' 8px head room and 3px ledge. */
      expect(graph).toHaveAttribute('height', '711');
      const headings = screen.getByTestId('architecture-paired-lane-headings');
      expect(headings).toHaveTextContent('Contract');
      expect(headings).toHaveTextContent('Observation');
      expect(screen.queryByTestId('architecture-delta-heading')).toBeNull();
      expect(screen.getAllByTestId(/^architecture-role-index-/)).toHaveLength(7);
      /* One empty state for the measured columns, not a placeholder per role. */
      expect(screen.queryAllByTestId(/^architecture-observation-box-/)).toHaveLength(0);
      expect(screen.queryAllByTestId(/^architecture-delta-marker-/)).toHaveLength(0);
      expect(screen.queryAllByTestId(/^architecture-delta-connector-/)).toHaveLength(0);
      const empties = screen.getAllByTestId('architecture-observation-empty');
      expect(empties).toHaveLength(1);
      expect(empties[0]).toHaveAttribute('data-empty-layout', 'column');
      expect(empties[0]).toHaveAttribute('role', 'note');
      expect(empties[0]).toHaveAccessibleName('Source not inspected yet');
      expect(empties[0]).toHaveTextContent('Delta');
      expect(empties[0]).toHaveTextContent('not observed yet');
      expect(empties[0]).toHaveTextContent(
        'Inspect source has an agent read the real imports and fill this in for each role.',
      );
      expect(screen.getByTestId('architecture-lower-only-sentence')).toHaveTextContent(
        'Each role may depend only on roles below it.',
      );
      const rules = [...container.querySelectorAll('[data-edge-sentence-kind="permitted"]')];
      expect(rules).toHaveLength(6);
      expect(rules.every((node) => node.getAttribute('data-edge-sentence') === 'said-once')).toBe(true);
      expect(screen.getByTestId('architecture-graph-box-widgets')).toHaveAttribute(
        'data-box-width',
        '424',
      );
      /* An ellipsis in the contract lane means the face is narrower than its copy. */
      const sentences = [...container.querySelectorAll('[data-testid^="architecture-box-line-"]')]
        .map((node) => node.textContent ?? '');
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.filter((line) => line.trimEnd().endsWith('…'))).toEqual([]);
      expect(container.querySelectorAll('[data-testid^="architecture-layer-plane-"]')).toHaveLength(0);

      const laneHeading = container.querySelector('[data-testid="architecture-paired-lane-headings"] text')!;
      const panel = empties[0] as HTMLElement;
      const faces = [...container.querySelectorAll('[data-graph-box] rect.architecture-node-face')];
      const faceTops = faces.map((face) => Number(face.getAttribute('y')));
      const faceBottom = Math.max(...faceTops) + Number(faces[0].getAttribute('height'));
      const panelX = parseFloat(panel.style.left);
      const panelY = parseFloat(panel.style.top);
      expect(panelY).toBe(Math.min(...faceTops));
      expect(panelY + parseFloat(panel.style.height)).toBe(faceBottom);
      expect(panelY).toBeGreaterThan(Number(laneHeading.getAttribute('y')));
      const contractRight = Number(faces[0].getAttribute('x')) + 424;
      expect(panelX).toBe(contractRight + 72);
      expect(parseFloat(panel.style.width)).toBe(240);
      expect(screen.queryByTestId('architecture-role-observation-widgets')).toBeNull();
      expect(screen.getByTestId('architecture-graph-box-widgets').getAttribute('aria-label')).not.toContain(
        'Not inspected',
      );
      expect(Number(screen.getByTestId('architecture-observation-heading').getAttribute('x'))).toBe(
        panelX + parseFloat(panel.style.width) / 2,
      );
      const hitAreas = [...container.querySelectorAll('[data-architecture-role-hit-area="true"]')];
      expect(hitAreas).toHaveLength(7);
      expect(hitAreas.every((area) => area.getAttribute('width') === '424')).toBe(true);
    });
  });

  it('seats the inspect action in the empty column and gives it up when a receipt lands', () => {
    withGeometry({ clientWidth: 1200, scrollWidth: 1200, clientHeight: 700, scrollHeight: 700 }, () => {
      const seated = vi.fn();
      const extra = {
        observationEmptyAction: <button type="button">Inspect source</button>,
        onObservationEmptyActionSeated: seated,
      };
      const { rerender } = render(sketch({}, new Set(), [], FSD_PROFILE_FRONTMATTER, null, extra));
      const panel = screen.getByTestId('architecture-observation-empty');
      expect(panel.querySelector('button')).toHaveTextContent('Inspect source');
      expect(seated).toHaveBeenLastCalledWith(true);

      const receipt: RoleLedger = { state: 'clean', violated: 0, outgoing: 1, sampleLimited: false, importsOut: 12 };
      const roles = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
      rerender(sketch(Object.fromEntries(roles.map((role) => [role, receipt])), new Set(), [], FSD_PROFILE_FRONTMATTER, null, extra));
      expect(seated).toHaveBeenLastCalledWith(false);
      expect(screen.getByTestId('architecture-observation-empty')).toHaveClass('architecture-empty-panel-out');
      expect(document.querySelectorAll('.architecture-arrive-plane')).toHaveLength(7);
      expect(document.querySelectorAll('.architecture-arrive-face')).toHaveLength(7);
      act(() => {
        window.dispatchEvent(new Event('pointerdown'));
      });
      expect(document.querySelectorAll('.architecture-arrive-plane')).toHaveLength(0);
    });
  });

  it('arrives only on its own profile, and a landing receipt fills the column without moving a face', () => {
    withGeometry({ clientWidth: 1200, scrollWidth: 1200, clientHeight: 700, scrollHeight: 700 }, () => {
      const receipt: RoleLedger = { state: 'clean', violated: 0, outgoing: 1, sampleLimited: false, importsOut: 12 };
      const roles = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
      const ledgers = Object.fromEntries(roles.map((role) => [role, receipt]));
      const skips: ArchitectureRoleEdge[] = [
        { fromRole: 'routing', toRole: 'app', count: 12 },
        { fromRole: 'views', toRole: 'shared', count: 5 },
      ];
      const face = () => {
        const rect = document.querySelector('[data-testid="architecture-graph-box-routing"] .architecture-canvas-node')!;
        return [rect.getAttribute('x'), rect.getAttribute('width')];
      };

      const { rerender } = render(sketch({}, new Set(), [], FSD_PROFILE_FRONTMATTER, null, { profileKey: 'web' }));
      const panel = screen.getByTestId('architecture-observation-empty');
      const column = [panel.style.left, panel.style.width];
      const contract = face();
      rerender(sketch(ledgers, new Set(), skips, FSD_PROFILE_FRONTMATTER, null, { profileKey: 'web' }));
      const observed = screen.getByTestId('architecture-observation-box-routing');
      expect([`${observed.getAttribute('x')}px`, `${observed.getAttribute('width')}px`]).toEqual(column);
      expect(face()).toEqual(contract);
      expect(document.querySelectorAll('.architecture-arrive-face')).toHaveLength(7);

      rerender(sketch({}, new Set(), [], FSD_PROFILE_FRONTMATTER, null, { profileKey: 'web' }));
      rerender(sketch(ledgers, new Set(), skips, FSD_PROFILE_FRONTMATTER, null, { profileKey: 'payments' }));
      expect(document.querySelectorAll('[class*="architecture-arrive-"]')).toHaveLength(0);
      expect(screen.queryByTestId('architecture-observation-empty')).toBeNull();
    });
  });

  const CLEAN: RoleLedger = { state: 'clean', violated: 0, outgoing: 1, sampleLimited: false, importsOut: 12 };
  const FSD_ROLES = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
  const LONG_VIEWS = 'Every screen a person can open is one module here, and it composes the layers below it into the page.';
  const frameOf = () => {
    const face = document.querySelector('[data-testid="architecture-graph-box-routing"] .architecture-canvas-node')!;
    const panel = screen.queryByTestId('architecture-observation-empty');
    const observed = screen.queryByTestId('architecture-observation-box-routing');
    return {
      contract: [face.getAttribute('x'), face.getAttribute('width')],
      column: panel
        ? [parseFloat(panel.style.left), parseFloat(panel.style.width)]
        : [Number(observed?.getAttribute('x')), Number(observed?.getAttribute('width'))],
      lane: screen.getByTestId('architecture-graph').getAttribute('data-skip-lane'),
      cut: [...document.querySelectorAll('[data-testid^="architecture-box-line-"]')].filter((line) =>
        (line.textContent ?? '').trimEnd().endsWith('…'),
      ).length,
    };
  };

  it.each([
    ['no traffic', 1200, []],
    ['adjacent imports only', 1200, [{ fromRole: 'routing', toRole: 'app', count: 12 }]],
    ['no traffic, lane left free', 900, []],
  ] as const)('a record with %s lands at %ipx without moving a face', (_, width, traffic) => {
    withGeometry({ clientWidth: width, scrollWidth: width, clientHeight: 700, scrollHeight: 700 }, () => {
      const extra = { profileKey: 'web', roleSummary: (id: string) => (id === 'views' ? LONG_VIEWS : null) };
      const ledgers = Object.fromEntries(FSD_ROLES.map((role) => [role, CLEAN]));
      const { rerender } = render(sketch({}, new Set(), [], FSD_PROFILE_FRONTMATTER, null, extra));
      const empty = frameOf();
      rerender(sketch(ledgers, new Set(), traffic, FSD_PROFILE_FRONTMATTER, null, extra));
      expect(frameOf()).toEqual(empty);
      expect(document.querySelector('[data-architecture-arrival]')).toHaveAttribute('data-architecture-arrival', 'staged');
    });
  });

  it('leaves the skip lane free where holding it would cut a description, and a skip that claims it lands whole', () => {
    withGeometry({ clientWidth: 900, scrollWidth: 900, clientHeight: 700, scrollHeight: 700 }, () => {
      const extra = { profileKey: 'web', roleSummary: (id: string) => (id === 'views' ? LONG_VIEWS : null) };
      const { rerender } = render(sketch({}, new Set(), [], FSD_PROFILE_FRONTMATTER, null, extra));
      const empty = frameOf();
      expect(empty.lane).toBe('free');
      expect(empty.cut).toBe(0);
      const ledgers = Object.fromEntries(FSD_ROLES.map((role) => [role, CLEAN]));
      rerender(sketch(ledgers, new Set(), [{ fromRole: 'views', toRole: 'shared', count: 5 }], FSD_PROFILE_FRONTMATTER, null, extra));
      expect(frameOf().lane).toBe('held');
      expect(document.querySelector('[data-architecture-arrival]')).toHaveAttribute('data-architecture-arrival', 'whole');
    });
  });

  /* With a receipt the ladder has a face and a mark per role, and the delta heading returns with its hover limit. */
  it('draws the per-role faces and the delta heading once every role carries a receipt', () => {
    withGeometry({ clientWidth: 1200, scrollWidth: 1200, clientHeight: 700, scrollHeight: 700 }, () => {
      const receipt: RoleLedger = {
        state: 'clean',
        violated: 0,
        outgoing: 1,
        sampleLimited: false,
        importsOut: 12,
      };
      const roles = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
      draw(Object.fromEntries(roles.map((role) => [role, receipt])), new Set(), [], FSD_PROFILE_FRONTMATTER);
      expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-evidence-layout', 'paired-ladder');
      expect(screen.queryByTestId('architecture-observation-empty')).toBeNull();
      expect(screen.getAllByTestId(/^architecture-observation-box-/)).toHaveLength(7);
      expect(screen.getAllByTestId(/^architecture-delta-marker-/)).toHaveLength(7);
      expect(screen.getByTestId('architecture-delta-heading').querySelector('title')).toHaveTextContent(
        "Each mark says what that role's own outgoing imports did.",
      );
    });
  });

  /* An across chain at 1920 cut every role sentence; the ladder rows win whenever the canvas is tall enough. */
  it('prefers the comparison ladder over an across chain when the rows fit the height', () => {
    /* The height rule applies only at xl, where the canvas column is height-bounded. */
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
      const sentences = [...document.querySelectorAll('[data-edge-sentence-kind="permitted"]')];
      expect(sentences).toHaveLength(6);
      expect(sentences.every((node) => node.getAttribute('data-edge-sentence') === 'said-once')).toBe(true);
      expect(screen.getByTestId('architecture-lower-only-sentence')).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    }
  });

  /* At 1280x800 the roomy rows do not fit; faces and connector space yield before any role is hidden. */
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
      /* 4 + 20 + 16 + 7x58 + 6x22 + 4, plus 8px head room and a 3px ledge: exactly `pairedTightH`. */
      expect(graph).toHaveAttribute('height', '593');
      const boxes = screen.getAllByTestId(/^architecture-graph-box-/);
      expect(boxes).toHaveLength(7);
      expect(boxes.every((box) => box.getAttribute('data-box-height') === '58')).toBe(true);
      const sentences = [...document.querySelectorAll('[data-edge-sentence-kind="permitted"]')];
      expect(sentences).toHaveLength(6);
      expect(sentences.every((node) => node.getAttribute('data-edge-sentence') === 'said-once')).toBe(
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
    /* Too short for four paired rows (16 + 20 + 4×72 + 3×24 = 396), so the across chain is honest. */
    withGeometry({ clientWidth: 1600, scrollWidth: 1600, clientHeight: 360, scrollHeight: 360 }, () => {
      const { container } = draw();
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-box-width-mode', 'roomy');
      expect(graph).toHaveAttribute('data-architecture-axis', 'across');
      expect(screen.queryAllByTestId(/^architecture-observation-box-/)).toHaveLength(0);
      expect(screen.queryAllByTestId(/^architecture-delta-connector-/)).toHaveLength(0);
      const band = screen.getByTestId('architecture-observation-empty');
      expect(band).toHaveAttribute('data-empty-layout', 'band');
      expect(band).toHaveTextContent('Source not inspected yet');
      expect(screen.getAllByTestId(/^architecture-role-index-/)).toHaveLength(4);
      expect(screen.getByTestId('architecture-role-index-adapter')).toHaveTextContent('01');
      expect(screen.getByTestId('architecture-role-index-domain')).toHaveTextContent('04');
      expect(container.querySelectorAll('[data-architecture-role-hit-area="true"]')).toHaveLength(4);
      expect(container.querySelectorAll('[data-architecture-port="contract"]')).toHaveLength(3);
      expect(container.querySelectorAll('[data-port-direction="incoming"]')).toHaveLength(0);
      expect(
        container.querySelector(
          '[data-graph-box="adapter"] [data-port-direction="outgoing"]',
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(
          '[data-graph-box="domain"] [data-port-direction="outgoing"]',
        ),
      ).toBeNull();
      expect(screen.getByTestId('architecture-graph-box-domain')).toHaveAttribute(
        'data-box-height',
        '90',
      );
      expect(screen.queryByTestId('architecture-role-observation-domain')).toBeNull();
      expect(container.querySelector('[data-testid="architecture-graph-run"]')).toBeNull();
    });
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
    withGeometry({ clientWidth: 400, scrollWidth: 400, clientHeight: 700, scrollHeight: 700 }, () => {
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
    });
  });

  it('keeps a violated edge and arrowhead red while shared ports remain indigo', () => {
    /* Observed-lane ports exist only on a canvas wide enough to split the lanes; jsdom reports zero width. */
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
 * The import direction is drawn as depth: a stack of planes says "this one is under that one".
 * These gates hold that the stack is ordered and steps by one constant, every role sits inside its
 * layer's plane, and the one upward import carries a halo that answers when its role is chosen.
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

  const FSD_ROLES = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
  const CLEAN: RoleLedger = { state: 'clean', violated: 0, outgoing: 1, sampleLimited: false, importsOut: 12 };

  it('draws no band before anything was observed, then one band per role joining both faces with equal overhang', () => {
    withLadderCanvas(() => {
      const empty = draw({}, new Set(), [], FSD_PROFILE_FRONTMATTER);
      expect(document.querySelectorAll('[data-testid^="architecture-layer-plane-"]')).toHaveLength(0);
      const emptyFaceY = Number(
        document.querySelector('[data-testid="architecture-graph-box-app"] rect.architecture-node-face')?.getAttribute('y'),
      );
      empty.unmount();

      const { container } = draw(
        Object.fromEntries(FSD_ROLES.map((role) => [role, CLEAN])),
        new Set(),
        [],
        FSD_PROFILE_FRONTMATTER,
      );
      const planes = [...container.querySelectorAll('[data-testid^="architecture-layer-plane-"]')];
      expect(planes.map((plane) => plane.getAttribute('data-layer-rank'))).toEqual([
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
      ]);
      for (const role of FSD_ROLES) {
        const band = container.querySelector(`[data-testid="architecture-layer-plane-${role}"] rect`)!;
        const face = container.querySelector(`[data-testid="architecture-graph-box-${role}"] rect.architecture-node-face`)!;
        const observed = container.querySelector(`[data-testid="architecture-observation-box-${role}"]`)!;
        const bandLeft = Number(band.getAttribute('x'));
        const bandRight = bandLeft + Number(band.getAttribute('width'));
        const observedRight = Number(observed.getAttribute('x')) + Number(observed.getAttribute('width'));
        expect(Number(face.getAttribute('x')) - bandLeft).toBe(20);
        expect(bandRight - observedRight).toBe(20);
      }
      expect(
        Number(container.querySelector('[data-testid="architecture-graph-box-app"] rect.architecture-node-face')?.getAttribute('y')),
      ).toBe(emptyFaceY);
    });
  });

  it('gives every role ground to stand on, and adds nothing an assistive reader must hear', () => {
    withLadderCanvas(() => {
      const { container } = draw(
        Object.fromEntries(FSD_ROLES.map((role) => [role, CLEAN])),
        new Set(),
        [],
        FSD_PROFILE_FRONTMATTER,
      );
      const group = container.querySelector('[data-testid="architecture-layer-planes"]');
      expect(group).toHaveAttribute('aria-hidden', 'true');
      expect(group).toHaveAttribute('pointer-events', 'none');
      expect(group?.querySelectorAll('text')).toHaveLength(0);
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
      /* The halo is a second painted pass, never a second crossing: stroke counts by `data-edge-from` stay one per crossing. */
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
      /* Its own stroke rises with it, so the raise is one event. */
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
