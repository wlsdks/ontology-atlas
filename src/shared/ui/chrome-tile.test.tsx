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
    render(<ChromeTile icon={<svg />} title="공방" href="/ontology/studio/" />);
    const tile = screen.getByRole('link', { name: '공방' });
    expect(tile.tagName).toBe('A');
    expect(tile).toHaveAttribute('href', '/ontology/studio/');
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

  /**
   * Collapsed, the tile measures `--chrome-tile-size`; labelled, the visible word is inside the
   * accessible name. Lint cannot see either.
   */
  describe('label mode', () => {
    it('keeps the chrome-tile-size box while allowing the tile to grow past it', () => {
      render(<ChromeTile icon={<svg />} title="Guided tour" label="Guided tour" />);
      const tile = screen.getByRole('button');
      // `size-[…]` would pin the width to the height and clip the label.
      expect(tile.className).not.toContain('size-[var(--chrome-tile-size)]');
      expect(tile.className).toContain('h-[var(--chrome-tile-size)]');
      expect(tile.className).toContain('min-w-[var(--chrome-tile-size)]');
    });

    it('spends the icon-to-label distance as a margin, never as a flex gap', () => {
      // A flex `gap` counts even at zero label width, so a collapsed tile would grow.
      render(<ChromeTile icon={<svg />} title="Guided tour" label="Guided tour" />);
      expect(screen.getByRole('button').className).not.toMatch(/(^|\s)gap-/);
    });

    it('names the control with the label the reader can see', () => {
      render(<ChromeTile icon={<svg />} title="Guided tour" label="Guided tour" />);
      const tile = screen.getByRole('button', { name: 'Guided tour' });
      expect(tile.querySelector('.chrome-tile-label')).toHaveTextContent('Guided tour');
    });

    it('drops the native tooltip, because the label already says it on screen', () => {
      render(<ChromeTile icon={<svg />} title="Guided tour" label="Guided tour" />);
      const tile = screen.getByRole('button', { name: 'Guided tour' });
      expect(tile).not.toHaveAttribute('title');
    });

    it('ignores aria-label in this mode, so the name cannot drift from the word on screen', () => {
      // A name that differs from the visible word fails WCAG 2.5.3 for speech input.
      render(
        <ChromeTile
          icon={<svg />}
          title="Guided tour"
          label="Guided tour"
          aria-label="Start the guided tour"
        />,
      );
      const tile = screen.getByRole('button', { name: 'Guided tour' });
      expect(tile).not.toHaveAttribute('aria-label');
    });
  });
});
