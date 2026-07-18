import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChromeChip } from './chrome-chip';

describe('ChromeChip', () => {
  it('renders icon + label + optional kbd cap', () => {
    render(
      <ChromeChip icon={<svg data-testid="icon" />} kbd="D">
        문서함
      </ChromeChip>,
    );
    const chip = screen.getByRole('button', { name: '문서함' });
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(chip).toHaveTextContent('문서함');
    expect(chip).toHaveTextContent('D');
  });

  it('uses the 44px chrome-tile-size height + 10px chrome-radius token contract', () => {
    render(<ChromeChip>자동 정렬</ChromeChip>);
    const chip = screen.getByRole('button');
    expect(chip.className).toContain('h-[var(--chrome-tile-size)]');
    expect(chip.className).toContain('rounded-[var(--chrome-radius)]');
    expect(chip.className).toContain('bg-[color:var(--chrome-surface)]');
  });

  it('compact mode hides the label visually (sr-only) and narrows to a square', () => {
    render(
      <ChromeChip icon={<svg />} compact>
        자동 정렬
      </ChromeChip>,
    );
    const chip = screen.getByRole('button', { name: '자동 정렬' });
    expect(chip.className).toContain('w-[var(--chrome-tile-size)]');
    const label = chip.querySelector('span.sr-only');
    expect(label).toHaveTextContent('자동 정렬');
  });

  it('active state adds an indigo tint without a second color system', () => {
    render(<ChromeChip active>검색</ChromeChip>);
    const chip = screen.getByRole('button');
    expect(chip.className).toContain('var(--chrome-active-border)');
    expect(chip.className).toContain('var(--chrome-active-surface)');
  });

  it('forwards native button props (onClick, data-testid, aria-label)', () => {
    const onClick = vi.fn();
    render(
      <ChromeChip onClick={onClick} data-testid="search-chip" aria-label="개념 검색 열기">
        검색
      </ChromeChip>,
    );
    const chip = screen.getByTestId('search-chip');
    expect(chip).toHaveAccessibleName('개념 검색 열기');
    chip.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
