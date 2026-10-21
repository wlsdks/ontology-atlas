import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageHeaderBar } from './page-header-bar';

describe('PageHeaderBar', () => {
  it('holds the title, the switcher and the actions in one 60px row', () => {
    render(
      <PageHeaderBar
        frame="page"
        title="Agents"
        tabsTestId="tabs-slot"
        tabs={<div role="tablist" aria-label="Views" />}
        actions={<button type="button">New</button>}
      />,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Agents' });
    const bar = heading.parentElement!.parentElement!;
    expect(bar.className).toContain('h-15');
    expect(bar.className).toContain('border-b');
    expect(screen.getByTestId('tabs-slot')).toContainElement(screen.getByRole('tablist'));
    expect(screen.getByRole('button', { name: 'New' }).parentElement!.className).toContain('ml-auto');
  });

  it('maps each frame to the body inset it shares', () => {
    const { rerender } = render(<PageHeaderBar frame="page" title="A" />);
    const row = () => screen.getByRole('heading').parentElement!;
    expect(row().className).toContain('var(--page-max)');
    rerender(<PageHeaderBar frame="harness" title="A" />);
    expect(row().className).toContain('100cqw');
  });

  it('sets a meta fact on the title baseline right after the title', () => {
    render(<PageHeaderBar frame="page" title="Projects" meta={<span data-testid="count">3</span>} />);
    const meta = screen.getByTestId('count');
    expect(meta.previousElementSibling).toBe(screen.getByRole('heading', { level: 1, name: 'Projects' }));
    expect(meta.parentElement!.className).toContain('items-baseline');
  });
});
