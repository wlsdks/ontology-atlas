import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroCollapsed } from './HeroCollapsed';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('HeroCollapsed', () => {
  it('does not show a SAMPLE badge by default', () => {
    render(<HeroCollapsed />);
    expect(screen.queryByTestId('hero-sample-badge')).not.toBeInTheDocument();
  });

  it('shows a SAMPLE badge when sampleBadge is set (static/no-vault mode)', () => {
    render(<HeroCollapsed sampleBadge />);
    expect(screen.getByTestId('hero-sample-badge')).toBeInTheDocument();
  });

  it('hides the SAMPLE badge in compact mode (no room for it)', () => {
    render(<HeroCollapsed sampleBadge compact />);
    expect(screen.queryByTestId('hero-sample-badge')).not.toBeInTheDocument();
  });
});
