import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import { HEXAGONAL_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from '../model/graph-layout';
import { ArchitectureSketch } from './ArchitectureSketch';

function draw() {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never)),
    [],
  );
  return render(
    <ArchitectureSketch
      graph={graph}
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
