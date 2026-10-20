import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WaitStage, type WaitStep } from './wait-stage';

const steps: WaitStep[] = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
  id,
  label: `Step ${id}`,
  state: index < 2 ? 'done' : index === 2 ? 'current' : 'pending',
}));

describe('WaitStage', () => {
  it('covers its ancestor and lets pointer events through except on its block', () => {
    const { container } = render(<WaitStage title="Reading" />);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain('absolute inset-0');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('place-items-center');
    expect(screen.getByRole('status').className).toContain('pointer-events-auto');
  });

  it('is the status itself unless it is given live text to announce', () => {
    const { rerender } = render(<WaitStage title="Reading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reading');
    rerender(<WaitStage title="Reading" announce="Reading: hooks" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Reading: hooks');
  });

  it('lays the steps out column by column in half as many rows, under the bar', () => {
    render(
      <WaitStage
        title="Reading"
        progress={{ stage: 'Hooks', counter: '3 of 9', done: 3, total: 9, label: 'Reading' }}
        steps={steps}
      />,
    );
    const list = screen.getByRole('list');
    expect(list.style.gridTemplateRows).toBe('repeat(3, auto)');
    expect(list.className).toContain('grid-flow-col');
    expect(list.querySelectorAll('li')).toHaveLength(5);
    const fill = document.querySelector('[data-work-fill]') as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(0.3333333333333333)');
    expect(fill.style.width).toBe('');
  });

  it('sweeps instead of filling while the total is unknown', () => {
    render(<WaitStage title="Reading" progress={{ stage: 'Docs', counter: '…', done: 0, total: null, label: 'Reading' }} />);
    expect(document.querySelector('.motion-work-sweep')).not.toBeNull();
  });

  it('shows the mascot at two times its sprite size, or the map orbit', () => {
    const { rerender } = render(<WaitStage title="Reading" mark="mascot" />);
    expect(screen.getByTestId('brand-waiting-mark').parentElement?.className).toContain('atlas-waiting-mark-2x');
    rerender(<WaitStage title="Reading" mark="orbit" />);
    expect(screen.getByTestId('map-wait-cluster')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-waiting-mark')).toBeNull();
  });
});
