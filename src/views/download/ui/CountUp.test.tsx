import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountUp } from './CountUp';

describe('CountUp', () => {
  it('renders the final value from the first frame; animation only paints over it', () => {
    render(<CountUp value={83} />);
    expect(screen.getByText('83')).toBeInTheDocument();
  });

  it('adds no ARIA attributes, since the plain digits in a bare span are the accessible form', () => {
    const { container } = render(<CountUp value={110} />);
    const span = container.firstElementChild!;
    expect(span.getAttribute('aria-label')).toBeNull();
    expect(span.getAttribute('aria-hidden')).toBeNull();
    expect(span.textContent).toBe('110');
  });
});
