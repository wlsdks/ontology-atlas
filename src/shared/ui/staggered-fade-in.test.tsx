import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resetStaggerSessionForTests } from '@/shared/motion/stagger';
import { StaggeredFadeIn } from './staggered-fade-in';

describe('StaggeredFadeIn', () => {
  beforeEach(() => resetStaggerSessionForTests());

  it('renders every child and staggers them once', () => {
    render(
      <StaggeredFadeIn vaultKey="local:a" scopeKey="list" as="ul" ariaLabel="rows">
        <li key="x" data-testid="x">alpha</li>
        <li key="y" data-testid="y">beta</li>
      </StaggeredFadeIn>,
    );
    expect(screen.getByRole('list', { name: 'rows' })).toBeInTheDocument();
    expect(screen.getByTestId('x').className).toContain('motion-stagger-in');
    expect(screen.getByTestId('y').style.getPropertyValue('--motion-stagger-index')).toBe('1');
  });

  it('keeps the child class and style it already had', () => {
    render(
      <StaggeredFadeIn vaultKey="local:a" scopeKey="own">
        <div key="k" data-testid="k" className="own" style={{ color: 'red' }}>z</div>
      </StaggeredFadeIn>,
    );
    const el = screen.getByTestId('k');
    expect(el.className).toContain('own');
    expect(el.style.color).toBe('red');
  });
});
