import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';

describe('EmptyState — base', () => {
  it('renders title and description', () => {
    render(<EmptyState title="아직 비어 있어요" description="첫 항목을 추가해 보세요." />);
    expect(screen.getByText('아직 비어 있어요')).toBeInTheDocument();
    expect(screen.getByText('첫 항목을 추가해 보세요.')).toBeInTheDocument();
  });

  it('renders ReactNode description (e.g., Link inside)', () => {
    render(
      <EmptyState
        title="비어 있어요"
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- test fixture, no real navigation
        description={<>첫 <a href="/start">항목</a> 을 추가해 보세요.</>}
      />,
    );
    expect(screen.getByRole('link', { name: '항목' })).toHaveAttribute('href', '/start');
  });

  it('renders action area when provided', () => {
    render(
      <EmptyState title="비어 있어요" action={<button type="button">시작</button>} />,
    );
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument();
  });

  it('omits description and action divs when not provided', () => {
    render(<EmptyState title="제목만" />);
    expect(screen.getByText('제목만')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EmptyState — tone variant', () => {
  it('default tone is dashed', () => {
    const { container } = render(<EmptyState title="t" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-tone')).toBe('dashed');
    expect(root.className).toContain('border-dashed');
  });

  it('tone=solid uses non-dashed border + 0.02 bg', () => {
    const { container } = render(<EmptyState title="t" tone="solid" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-tone')).toBe('solid');
    expect(root.className).not.toContain('border-dashed');
    expect(root.className).toContain('bg-[color:var(--color-overlay-1)]');
  });
});

describe('EmptyState — align variant', () => {
  it('default align is left', () => {
    const { container } = render(<EmptyState title="t" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-align')).toBe('left');
    expect(root.className).not.toContain('text-center');
  });

  it('align=center adds text-center and bigger padding', () => {
    const { container } = render(<EmptyState title="t" align="center" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-align')).toBe('center');
    expect(root.className).toContain('text-center');
    expect(root.className).toContain('px-6');
    expect(root.className).toContain('py-10');
  });

  it('align=center centers action area too', () => {
    const { container } = render(
      <EmptyState
        title="비어 있어요"
        align="center"
        action={<button type="button">시작</button>}
      />,
    );
    const actionRow = container.querySelector('.mt-4');
    expect(actionRow).not.toBeNull();
    expect(actionRow?.className).toContain('justify-center');
  });

  it('align=center renders title in body tone (not signature weight)', () => {
    render(<EmptyState title="페이지가 비어 있어요" align="center" />);
    const titleEl = screen.getByText('페이지가 비어 있어요');
    expect(titleEl.className).toContain('font-normal');
    expect(titleEl.className).toContain('text-[color:var(--color-text-tertiary)]');
  });
});

describe('EmptyState — size variant', () => {
  it('size=compact uses smaller padding (left align)', () => {
    const { container } = render(<EmptyState title="t" size="compact" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('px-4');
    expect(root.className).toContain('py-4');
  });

  it('size=regular uses default padding', () => {
    const { container } = render(<EmptyState title="t" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('px-5');
    expect(root.className).toContain('py-6');
  });

  it('align=center overrides size padding (uses px-6 py-10 regardless)', () => {
    const { container } = render(
      <EmptyState title="t" size="compact" align="center" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('px-6');
    expect(root.className).toContain('py-10');
  });
});
