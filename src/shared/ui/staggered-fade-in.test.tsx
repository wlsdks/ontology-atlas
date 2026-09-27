import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaggeredFadeIn } from './staggered-fade-in';

describe('StaggeredFadeIn', () => {
  it('renders every child so the animation never hides content', () => {
    render(
      <StaggeredFadeIn as="ul">
        <li>alpha</li>
        <li>beta</li>
        <li>gamma</li>
      </StaggeredFadeIn>,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('gamma')).toBeInTheDocument();
  });

  it('passes ariaLabel to the container region', () => {
    render(
      <StaggeredFadeIn as="section" ariaLabel="통계 strip">
        <div>x</div>
      </StaggeredFadeIn>,
    );
    expect(
      screen.getByRole('region', { name: '통계 strip' }),
    ).toBeInTheDocument();
  });

  it('adds the motion-reduce class to each child', () => {
    render(
      <StaggeredFadeIn>
        <div data-testid="child">y</div>
      </StaggeredFadeIn>,
    );
    expect(screen.getByTestId('child').className).toContain(
      'motion-reduce:!transition-none',
    );
  });

  it('adds an inline transform and opacity transition to each child', () => {
    render(
      <StaggeredFadeIn>
        <div data-testid="child">z</div>
      </StaggeredFadeIn>,
    );
    const style = screen.getByTestId('child').getAttribute('style') ?? '';
    expect(style).toContain('opacity');
    expect(style).toContain('transition');
  });

  it('caps the stagger delay at maxStaggerSteps for a long list', () => {
    render(
      <StaggeredFadeIn stagger={60} maxStaggerSteps={8}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} data-testid={`c${i}`}>
            {i}
          </div>
        ))}
      </StaggeredFadeIn>,
    );
    // Within the cap (index 2) → 2*60 = 120ms.
    expect(screen.getByTestId('c2').getAttribute('style')).toContain('120ms');
    // Past the cap (index 11) → capped at 8*60 = 480ms, not 660ms.
    const capped = screen.getByTestId('c11').getAttribute('style') ?? '';
    expect(capped).toContain('480ms');
    expect(capped).not.toContain('660ms');
  });
});
