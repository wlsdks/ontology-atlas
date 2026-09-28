import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
    // Within the cap: index 2 waits 2 * 60 = 120ms.
    expect(screen.getByTestId('c2').getAttribute('style')).toContain('120ms');
    // Past the cap: index 11 waits 8 * 60 = 480ms, not 660ms.
    const capped = screen.getByTestId('c11').getAttribute('style') ?? '';
    expect(capped).toContain('480ms');
    expect(capped).not.toContain('660ms');
  });

  it('reveals only children that arrive later, so the ones on screen do not replay', async () => {
    const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const list = (count: number) => (
      <StaggeredFadeIn stagger={24}>
        {Array.from({ length: count }, (_, i) => (
          <div key={`card-${i}`} data-testid={`card-${i}`}>
            {i}
          </div>
        ))}
      </StaggeredFadeIn>
    );
    const { rerender } = render(list(2));
    await frame();
    expect(screen.getByTestId('card-1').style.opacity).toBe('1');

    rerender(list(4));
    expect(screen.getByTestId('card-0').style.opacity).toBe('1');
    expect(screen.getByTestId('card-1').style.opacity).toBe('1');
    expect(screen.getByTestId('card-2').style.opacity).toBe('0');
    expect(screen.getByTestId('card-3').style.transition).toContain('24ms');

    await frame();
    expect(screen.getByTestId('card-2').style.opacity).toBe('1');
    expect(screen.getByTestId('card-2').style.transition).toContain(' 0ms');
    expect(screen.getByTestId('card-3').style.transition).toContain('24ms');
  });
});
