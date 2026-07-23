import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChromeTile } from './chrome-tile';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

describe('ChromeTile', () => {
  it('renders as a native button with icon + title-derived accessible name', () => {
    render(<ChromeTile icon={<svg data-testid="icon" />} title="문서함" />);
    const tile = screen.getByRole('button', { name: '문서함' });
    expect(tile.tagName).toBe('BUTTON');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(tile).toHaveAttribute('title', '문서함');
  });

  it('uses the chrome-tile-size(36px) + 10px chrome-radius token contract', () => {
    render(<ChromeTile icon={<svg />} title="설정" />);
    const tile = screen.getByRole('button');
    expect(tile.className).toContain('size-[var(--chrome-tile-size)]');
    expect(tile.className).toContain('rounded-[var(--chrome-radius)]');
    expect(tile.className).toContain('bg-[color:var(--chrome-surface)]');
    expect(tile.className).toContain('shadow-[var(--chrome-shadow)]');
  });

  it('renders as a Link when href is given', () => {
    render(<ChromeTile icon={<svg />} title="빌더" href="/ontology/edit/" />);
    const tile = screen.getByRole('link', { name: '빌더' });
    expect(tile.tagName).toBe('A');
    expect(tile).toHaveAttribute('href', '/ontology/edit/');
  });

  it('aria-label overrides title for the accessible name when provided', () => {
    render(<ChromeTile icon={<svg />} title="지도 조절" aria-label="지도 확대/축소 조절" />);
    expect(screen.getByRole('button', { name: '지도 확대/축소 조절' })).toBeInTheDocument();
  });

  it('active state adds an indigo-tinted border without introducing a second color', () => {
    render(<ChromeTile icon={<svg />} title="문서함" active />);
    const tile = screen.getByRole('button');
    expect(tile.className).toContain('var(--chrome-active-border)');
  });

  it('forwards native button props (onClick, data-testid)', () => {
    const onClick = vi.fn();
    render(<ChromeTile icon={<svg />} title="전체 보기" onClick={onClick} data-testid="fit-tile" />);
    const tile = screen.getByTestId('fit-tile');
    tile.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
