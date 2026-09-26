import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OntologyMapTierLegend } from './OntologyMapTierLegend';

/**
 * **Strata's tier names stand where the frame placed them, and nowhere else**
 * (2026-09-26). The frame decides from the drawn rims (`model/tier-names.ts`); this
 * draws those names at their boxes, measures every name for the next placement, and
 * gives the room back when it leaves.
 */
const LABELS = {
  project: '프로젝트',
  domain: '도메인',
  capability: '역량',
  element: '요소',
} as Record<string, string>;

afterEach(cleanup);

describe('the Strata tier names', () => {
  it('draws only the names the frame placed, each at its own box beside its rim', () => {
    render(
      <OntologyMapTierLegend
        names={[
          { kind: 'project', side: 'right', minX: 959, maxX: 1003, minY: 117, maxY: 133, a: 1 },
          { kind: 'element', side: 'left', minX: 391, maxX: 413, minY: 628, maxY: 644, a: 0.5 },
        ]}
        labels={LABELS}
        onRaise={() => {}}
        onWidths={() => {}}
      />,
    );
    const rows = screen.getAllByTestId(/^topology-tier-legend-row-/);
    expect(rows.map((row) => row.textContent)).toEqual(['프로젝트', '요소']);
    const project = screen.getByTestId('topology-tier-legend-row-project');
    expect(project.style.left).toBe('959px');
    expect(project.style.top).toBe('117px');
    expect(project.dataset.tierSide).toBe('right');
    // A name rises and fades with its plane.
    expect(screen.getByTestId('topology-tier-legend-row-element').style.opacity).toBe('0.5');
    // No corner list: a plane the frame could not place is not named anywhere else.
    expect(screen.queryByTestId('topology-tier-legend-row-domain')).toBeNull();
  });

  it('measures every name, placed or not, and hands the room back when it leaves', () => {
    const onWidths = vi.fn();
    const view = render(<OntologyMapTierLegend names={[]} labels={LABELS} onRaise={() => {}} onWidths={onWidths} />);
    expect(Object.keys(onWidths.mock.calls[0]![0] as object).sort()).toEqual(['capability', 'domain', 'element', 'project']);
    view.unmount();
    expect(onWidths).toHaveBeenLastCalledWith({});
  });

  it('raises the plane a name is pointed at, and lets go', () => {
    const onRaise = vi.fn();
    render(
      <OntologyMapTierLegend
        names={[{ kind: 'domain', side: 'right', minX: 10, maxX: 43, minY: 10, maxY: 26, a: 1 }]}
        labels={LABELS}
        onRaise={onRaise}
        onWidths={() => {}}
      />,
    );
    const row = screen.getByTestId('topology-tier-legend-row-domain');
    fireEvent.pointerEnter(row);
    expect(onRaise).toHaveBeenLastCalledWith('domain');
    fireEvent.pointerLeave(row);
    expect(onRaise).toHaveBeenLastCalledWith(null);
  });
});
