import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountUp } from './CountUp';

/**
 * The count-up's one contract: **the DOM always carries the final value.**
 *
 * The animation is a browser-only overlay (it arms itself through `IntersectionObserver`, which
 * jsdom does not have), so what is testable here is exactly what matters: every non-browser
 * reader — the caption-honesty test, a crawler, assistive tech through the stable `aria-label` —
 * sees the true number and never an intermediate one.
 */
describe('CountUp', () => {
  it('처음부터 최종 값을 그린다 — 애니메이션은 진실 위의 덧칠이다', () => {
    render(<CountUp value={83} />);
    expect(screen.getByLabelText('83')).toBeInTheDocument();
    expect(screen.getByLabelText('83').textContent).toBe('83');
  });

  it('보조기술이 듣는 이름은 중간 값이 아니라 최종 값 하나다', () => {
    const { container } = render(<CountUp value={110} />);
    const outer = container.firstElementChild!;
    expect(outer.getAttribute('aria-label')).toBe('110');
    // The visible digits are hidden from assistive tech — they exist to be watched, not read out.
    expect(outer.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
