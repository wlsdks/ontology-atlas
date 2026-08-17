import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabBar } from './tab-bar';

const ITEMS = [
  { key: 'overview', label: '개요', count: 296 },
  { key: 'relations', label: '관계', count: 508 },
  { key: 'freshness', label: '신선도', count: '12주' },
];

function InteractiveTabBar({
  initialKey,
  onSelect,
}: {
  initialKey: string;
  onSelect: (key: string) => void;
}) {
  const [activeKey, setActiveKey] = useState(initialKey);
  return (
    <TabBar
      items={ITEMS}
      activeKey={activeKey}
      onSelect={(key) => {
        onSelect(key);
        setActiveKey(key);
      }}
      ariaLabel="탭"
    />
  );
}

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
    expect(active).toHaveAttribute('tabindex', '0');
    expect(inactive).toHaveAttribute('aria-selected', 'false');
    expect(inactive).toHaveAttribute('tabindex', '-1');
    expect(active.className).toContain('color-indigo-accent');
    expect(inactive.className).toContain('border-transparent');
    expect(active.className).toContain('focus-visible:ring-inset');
    expect(active.className).toContain('color-indigo-focus-ring');
  });

  it('calls onSelect with the clicked tab key', () => {
    const onSelect = vi.fn();
    render(<TabBar items={ITEMS} activeKey="overview" onSelect={onSelect} ariaLabel="탭" />);
    fireEvent.click(screen.getByRole('tab', { name: /신선도/ }));
    expect(onSelect).toHaveBeenCalledWith('freshness');
  });

  it('keeps focus without navigating again when the active tab is clicked', () => {
    const onSelect = vi.fn();
    render(<TabBar items={ITEMS} activeKey="overview" onSelect={onSelect} ariaLabel="탭" />);
    const overview = screen.getByRole('tab', { name: /개요/ });

    fireEvent.click(overview);

    expect(overview).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
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

  it('moves focus and activates tabs with horizontal arrow keys, wrapping at both ends', () => {
    const onSelect = vi.fn();
    render(<InteractiveTabBar initialKey="overview" onSelect={onSelect} />);
    const overview = screen.getByRole('tab', { name: /개요/ });
    const relations = screen.getByRole('tab', { name: /관계/ });
    const freshness = screen.getByRole('tab', { name: /신선도/ });

    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(relations).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('relations');

    fireEvent.keyDown(relations, { key: 'ArrowLeft' });
    expect(overview).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('overview');

    fireEvent.keyDown(overview, { key: 'ArrowLeft' });
    expect(freshness).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('freshness');
  });

  it('restores focus to the activated tab after the activeKey commit', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">바깥 포커스</button>
        <TabBar items={ITEMS} activeKey="overview" onSelect={onSelect} ariaLabel="탭" />
      </>,
    );
    const overview = screen.getByRole('tab', { name: /개요/ });
    const relations = screen.getByRole('tab', { name: /관계/ });

    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    screen.getByRole('button', { name: '바깥 포커스' }).focus();

    rerender(
      <>
        <button type="button">바깥 포커스</button>
        <TabBar items={ITEMS} activeKey="relations" onSelect={onSelect} ariaLabel="탭" />
      </>,
    );

    expect(relations).toHaveAttribute('aria-selected', 'true');
    expect(relations).toHaveAttribute('tabindex', '0');
    expect(overview).toHaveAttribute('tabindex', '-1');
    expect(relations).toHaveFocus();
  });

  it('moves focus and activates the first or last tab with Home and End', () => {
    const onSelect = vi.fn();
    render(<TabBar items={ITEMS} activeKey="relations" onSelect={onSelect} ariaLabel="탭" />);
    const overview = screen.getByRole('tab', { name: /개요/ });
    const relations = screen.getByRole('tab', { name: /관계/ });
    const freshness = screen.getByRole('tab', { name: /신선도/ });

    relations.focus();
    fireEvent.keyDown(relations, { key: 'End' });
    expect(freshness).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('freshness');

    fireEvent.keyDown(freshness, { key: 'Home' });
    expect(overview).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('overview');
  });

  it('배지가 무엇을 세는지 title 로 말하고, 배지 없는 탭에는 붙이지 않는다', () => {
    render(
      <TabBar
        items={[
          { key: 'overview', label: '개요', count: 296, countTitle: '개념 수' },
          { key: 'freshness', label: '신선도', countTitle: '붙으면 안 되는 설명' },
        ]}
        activeKey="overview"
        onSelect={() => {}}
        ariaLabel="탭"
      />,
    );

    expect(screen.getByRole('tab', { name: /개요/ })).toHaveAttribute('title', '개념 수');
    // 숫자가 없으면 설명할 숫자도 없다 — 빈 슬롯에 툴팁이 붙으면 없는 배지를 약속한다.
    expect(screen.getByRole('tab', { name: /신선도/ })).not.toHaveAttribute('title');
  });
});
