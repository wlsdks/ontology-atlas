import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HiddenCountLine } from './hidden-count-line';

/**
 * The rule: a counted group that draws fewer rows than it holds must say how
 * many it withheld and point at where the rest is readable — and must say
 * nothing at all when it withheld nothing. A permanently visible remainder line
 * is noise; a permanently absent one is the silent truncation this round fixed.
 */
describe('HiddenCountLine', () => {
  it('renders nothing when the view shows everything it counted', () => {
    render(
      <HiddenCountLine total={4} shown={4} label={(n) => `${n} more`} route={<button type="button">x</button>} />,
    );
    expect(screen.queryByTestId('hidden-count-line')).toBeNull();
  });

  it('renders nothing when shown exceeds total (a caller previewing more than it counted)', () => {
    render(
      <HiddenCountLine total={2} shown={5} label={(n) => `${n} more`} route={<button type="button">x</button>} />,
    );
    expect(screen.queryByTestId('hidden-count-line')).toBeNull();
  });

  it('carries the difference, not either operand, and always a route', () => {
    render(
      <HiddenCountLine
        total={9}
        shown={4}
        label={(n) => `${n} more relation types not shown`}
        route={
          <button type="button" data-testid="route" data-href="/insights">
            All relation types
          </button>
        }
      />,
    );
    const line = screen.getByTestId('hidden-count-line');
    expect(line).toHaveAttribute('data-hidden-count', '5');
    expect(line).toHaveTextContent('5 more relation types not shown');
    expect(line.querySelector('[data-testid="route"]')).toHaveAttribute('data-href', '/insights');
  });

  it('computes the difference itself, so a caller cannot print a disagreeing number', () => {
    // `label` receives the component's own subtraction — there is no prop that
    // takes a finished sentence, so a stale count cannot be passed in.
    let seen = -1;
    render(
      <HiddenCountLine
        total={31}
        shown={8}
        label={(n) => {
          seen = n;
          return `${n} more`;
        }}
        route={<button type="button">All documents</button>}
      />,
    );
    expect(seen).toBe(23);
    expect(screen.getByTestId('hidden-count-line')).toHaveAttribute('data-hidden-count', '23');
  });
});
