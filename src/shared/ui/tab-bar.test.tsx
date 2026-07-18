import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabBar } from './tab-bar';

const ITEMS = [
  { key: 'overview', label: '개요', count: 296 },
  { key: 'relations', label: '관계', count: 508 },
  { key: 'freshness', label: '신선도', count: '12주' },
];

describe('TabBar', () => {
  it('renders every tab with its label and engraved count', () => {
    render(<TabBar items={ITEMS} activeKey="overview" onSelect={() => {}} ariaLabel="탭" />);
    expect(screen.getByRole('tab', { name: /개요/ })).toBeInTheDocument();
    expect(screen.getByText('508')).toBeInTheDocument();
    expect(screen.getByText('12주')).toBeInTheDocument();
  });

  it('marks the active tab aria-selected and gives it the indigo underline class', () => {
    render(<TabBar items={ITEMS} activeKey="relations" onSelect={() => {}} ariaLabel="탭" />);
    const active = screen.getByRole('tab', { name: /관계/ });
    const inactive = screen.getByRole('tab', { name: /개요/ });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(inactive).toHaveAttribute('aria-selected', 'false');
    expect(active.className).toContain('color-indigo-accent');
    expect(inactive.className).toContain('border-transparent');
  });

  it('calls onSelect with the clicked tab key', () => {
    const onSelect = vi.fn();
    render(<TabBar items={ITEMS} activeKey="overview" onSelect={onSelect} ariaLabel="탭" />);
    fireEvent.click(screen.getByRole('tab', { name: /신선도/ }));
    expect(onSelect).toHaveBeenCalledWith('freshness');
  });

  it('renders a tab with no count (no stray undefined text)', () => {
    render(
      <TabBar
        items={[{ key: 'a', label: 'A' }]}
        activeKey="a"
        onSelect={() => {}}
        ariaLabel="탭"
      />,
    );
    expect(screen.getByRole('tab', { name: 'A' })).toBeInTheDocument();
  });
});
