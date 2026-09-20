import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OntologyMapTierLegend } from './OntologyMapTierLegend';

/**
 * **A rail with nothing to draw takes the corner, not the rims.**
 *
 * `layoutTierLegendRows` answers `null` when the band it was handed cannot hold one
 * row per plane. That answer used to fall through every branch in the component: the
 * placement stayed `rail`, no row rendered, `onFitChange(false)` sent the names back
 * to the plane rims — the failure the rail exists to end. CI drew exactly that at
 * 1512x982 on 2026-09-20: `data-tier-legend-placement="rail"` with zero rows inside
 * it, while the same build on a developer's machine chose the corner and passed.
 *
 * jsdom lays nothing out, so every measured box is zero — which is the same input the
 * band gives when it is too short for four rows. That makes this the one place the
 * branch can be pinned without a runner whose fonts happen to squeeze the band.
 */
const ANCHORS = [
  { kind: 'project', y: 120 },
  { kind: 'domain', y: 310 },
  { kind: 'capability', y: 500 },
  { kind: 'element', y: 610 },
];
const LABELS = {
  project: '프로젝트',
  domain: '도메인',
  capability: '기능',
  element: '요소',
} as Record<string, string>;

afterEach(cleanup);

describe('the Strata tier legend', () => {
  it('draws its names in the corner when the rail has no band to lay them in', () => {
    const onFitChange = vi.fn();
    render(
      <OntologyMapTierLegend
        anchors={ANCHORS}
        labels={LABELS}
        onRaise={() => {}}
        onFitChange={onFitChange}
        placement="rail"
      />,
    );

    const legend = screen.getByTestId('topology-tier-legend');
    expect(
      legend.dataset.tierLegendPlacement,
      'the rail could not lay a row, so the drawn shape is the corner',
    ).toBe('corner');
    expect(
      ANCHORS.map((anchor) => screen.getByTestId(`topology-tier-legend-row-${anchor.kind}`).textContent),
      'every plane is still named',
    ).toEqual(['프로젝트', '도메인', '기능', '요소']);
    // The names are placed, so the rims must not be asked to take them back.
    expect(legend.dataset.tierLegendFits).toBe('true');
    expect(onFitChange).toHaveBeenLastCalledWith(true);
  });

  it('claims no fit when there is no plane to name', () => {
    const onFitChange = vi.fn();
    render(
      <OntologyMapTierLegend
        anchors={[]}
        labels={LABELS}
        onRaise={() => {}}
        onFitChange={onFitChange}
        placement="rail"
      />,
    );
    // Nothing to place is not the same as placed, and `fits` is what the map reads
    // to decide whether the rim names come back.
    expect(screen.getByTestId('topology-tier-legend').dataset.tierLegendFits).toBe('false');
    expect(onFitChange).toHaveBeenLastCalledWith(false);
  });
});
