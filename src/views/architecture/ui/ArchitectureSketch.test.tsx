import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import { HEXAGONAL_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from '../model/graph-layout';
import type { RoleLedger } from '../model/role-ledger';
import { ArchitectureSketch } from './ArchitectureSketch';

function draw(ledgers: Record<string, RoleLedger> = {}) {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never)),
    [],
  );
  return render(
    <ArchitectureSketch
      graph={graph}
      ledgers={ledgers}
      ledgerStatusLabel={(ledger) =>
        ledger.state === 'clean' ? 'no violations out' : `${ledger.violated} violated`
      }
      ledgerImportsLabel={(count) => `${count} imports out`}
      selected={null}
      onSelect={() => {}}
      roleLabel={(id) => id}
      moduleCountLabel={(n) => `${n} modules`}
      conceptCountLabel={(n) => `${n} concepts`}
      permittedEdgeLabel={(from, to) => `${from} may use ${to}`}
      trafficEdgeLabel={(from, to, n) => `${from} imports ${to} ${n} times`}
      moduleCounts={null}
      conceptCounts={{}}
      runLabel="Run the flow"
      hiddenRightLabel={(count) => `${count} more to the right`}
      hiddenLeftLabel={(count) => `${count} more to the left`}
      hiddenAboveLabel={(count) => `${count} more above`}
      hiddenBelowLabel={(count) => `${count} more below`}
    />,
  );
}

describe('the run control', () => {
  it('staggers by column, not by pixel', () => {
    /*
     * ⚠️ The defect a fresh-eyes walkthrough measured on 2026-08-28. The step was fed the box's x
     * coordinate, and the stylesheet multiplies the step by a 90ms token — so three strokes began
     * at 2520ms, 20520ms and 38520ms and a "run" took forty seconds to cross four boxes. A stagger
     * counts places in a queue; a queue place is a small integer.
     */
    const { container } = draw();
    fireEvent.click(screen.getByTestId('architecture-graph-run'));
    const steps = [...container.querySelectorAll('[data-edge-kind]')].map((edge) =>
      Number((edge as HTMLElement).style.getPropertyValue('--architecture-run-step')),
    );
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(Number.isInteger(step)).toBe(true);
      expect(step).toBeLessThan(12);
    }
  });

  it('cannot be pressed again while the flow is playing', () => {
    /* Without this the presses stacked, and nothing on the control said a run was under way. */
    draw();
    const button = screen.getByTestId('architecture-graph-run');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(button).toBeDisabled();
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
    const { container } = draw();
    fireEvent.click(screen.getByTestId('architecture-graph-run'));
    const edges = [...container.querySelectorAll('[data-edge-kind]')];
    expect(edges.every((e) => e.classList.contains('architecture-flow-running'))).toBe(true);
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
    for (const edge of edges) {
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

describe('the rule sentences', () => {
  it('are painted, not left one pixel wide in the accessibility tree', () => {
    /*
     * ⚠️ The walkthrough on 2026-08-28 found the complete answer to the screen's own question
     * inside an `sr-only` box measured at one pixel. A fact only the accessibility tree carries is
     * a fact on no screen at all.
     */
    const { container } = draw();
    const list = container.querySelector('[data-testid="architecture-edge-sentences"]');
    expect(list).not.toBeNull();
    expect(list?.className).not.toContain('sr-only');
  });

  it('read down the chain, not in the order the canvas paints them', () => {
    /* The canvas paints the longest skip first so short strokes land on top; read as sentences
       that order scatters the same role across the list. */
    const { container } = draw();
    const froms = [...container.querySelectorAll('[data-testid="architecture-edge-sentences"] li')]
      .map((li) => li.textContent?.split(':')[0]?.trim() ?? '');
    const firstSeen = new Map<string, number>();
    froms.forEach((from, index) => {
      if (!firstSeen.has(from)) firstSeen.set(from, index);
    });
    /* Every run of one role is contiguous: a role never reappears after another has begun. */
    for (const [role, start] of firstSeen) {
      const last = froms.lastIndexOf(role);
      expect(froms.slice(start, last + 1).every((f) => f === role)).toBe(true);
    }
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
    const box = container.querySelector('[data-testid="architecture-graph-box-domain"] rect');
    expect(box?.getAttribute('height')).toBe('62');
  });

  it('grows every box in lockstep once any role carries a ledger', () => {
    /* One tall box beside six short ones is a row of different things; the boxes are one row of
       the same thing, so the height is decided by the profile, not by the role. */
    const { container } = draw({ domain: ledger() });
    const heights = [
      ...container.querySelectorAll('[data-testid^="architecture-graph-box-"] rect'),
    ].map((rect) => rect.getAttribute('height'));
    expect(new Set(heights)).toEqual(new Set(['74']));
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
