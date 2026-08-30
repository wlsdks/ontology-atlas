import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import { HEXAGONAL_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from '../model/graph-layout';
import { ArchitectureRules } from './ArchitectureRules';

function draw() {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never)),
    [],
  );
  return render(
    <ArchitectureRules
      graph={graph}
      violatedPairs={new Set(['adapter>domain'])}
      roleLabel={(id) => id}
      permittedEdgeLabel={(from, to) => `${from}: may use ${to}`}
      trafficEdgeLabel={(from, to, n) => `${from}: imports ${to} ${n} times`}
      legendPermitted="a reviewed dependency"
      legendTraffic="measured imports"
      legendSkipHint="a crossing that skips a role"
      legendViolated="a crossing the receipt counted as a violation"
      legendShapeEnd="a role at either end"
      legendShapeWork="a role in between"
      directionLabel="an arrow points the way a dependency runs"
    />,
  );
}

describe('the rule sentences', () => {
  it('are painted, not left one pixel wide in the accessibility tree', () => {
    /*
     * ⚠️ The walkthrough on 2026-08-28 found the complete answer to the screen's own question
     * inside an `sr-only` box measured at one pixel. A fact only the accessibility tree carries is
     * a fact on no screen at all. They live in the panel beside the canvas now (2026-08-30) —
     * still painted, and below `xl` still the next section down the page.
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

  /*
   * ⚠️ A legend row for a mark nobody drew is noise, and this component is now the only place the
   * key exists — nothing else on the screen says what a shape or a stroke means.
   */
  it('keys every mark the drawing actually uses, and no others', () => {
    const { container } = draw();
    const legend = container.querySelector('p')?.textContent ?? '';
    expect(legend).toContain('a role at either end');
    expect(legend).toContain('a role in between');
    expect(legend).toContain('a reviewed dependency');
    /* This fixture has no measured traffic, so the measured-imports row must not appear. */
    expect(legend).not.toContain('measured imports');
  });
});
