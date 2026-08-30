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
  it('no longer live here: every stroke states its own sentence on the canvas', () => {
    /*
     * The 2026-08-28 walkthrough found the sentences in an `sr-only` box one pixel wide; on
     * 2026-08-30 they moved into this panel, painted; the same day (Direction B) they moved onto
     * the strokes themselves. This panel keeps the key for every mark, which is still painted.
     */
    const { container } = draw();
    expect(container.querySelector('[data-testid="architecture-edge-sentences"]')).toBeNull();
    const legend = container.querySelector('p');
    expect(legend).not.toBeNull();
    expect(legend?.className).not.toContain('sr-only');
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
