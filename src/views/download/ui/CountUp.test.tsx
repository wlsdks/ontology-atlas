import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountUp } from './CountUp';

/**
 * The count-up's one contract: **the DOM always carries the final value.**
 *
 * The animation is a browser-only overlay (it arms itself through `IntersectionObserver`, which
 * jsdom does not have), so what is testable here is exactly what matters: every non-browser
 * reader — the caption-honesty test, a crawler, assistive tech — sees the true number and never an
 * intermediate one.
 */
describe('CountUp', () => {
  it('renders the final value from the first frame; animation only paints over it', () => {
    render(<CountUp value={83} />);
    expect(screen.getByText('83')).toBeInTheDocument();
  });

  /**
   * The first version named the wrapper with `aria-label` and hid the digits — the a11y ratchet
   * rejected it in CI (`aria-prohibited-attr`: a generic span may not carry a name). Plain text
   * is the accessible version, so what is locked is the *absence* of ARIA plumbing.
   */
  it('adds no ARIA attributes, since the plain digits in a bare span are the accessible form', () => {
    const { container } = render(<CountUp value={110} />);
    const span = container.firstElementChild!;
    expect(span.getAttribute('aria-label')).toBeNull();
    expect(span.getAttribute('aria-hidden')).toBeNull();
    expect(span.textContent).toBe('110');
  });
});
