import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailCard } from './detail-card';

describe('DetailCard', () => {
  it('renders as article element with rounded panel', () => {
    const { container } = render(
      <DetailCard title="제목">본문</DetailCard>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe('ARTICLE');
    expect(root.className).toContain('rounded-[28px]');
    // 헌장 §11 — 무채색 alpha border + panel 배경
    expect(root.className).toContain('var(--color-divider)');
    expect(root.className).toContain('color-panel');
  });

  it('omits header section when no eyebrow/title/description/action', () => {
    const { container } = render(<DetailCard>본문만</DetailCard>);
    expect(container.querySelector('header')).toBeNull();
    expect(screen.getByText('본문만')).toBeInTheDocument();
  });

  it('renders header when only eyebrow provided', () => {
    const { container } = render(
      <DetailCard eyebrow="라벨">본문</DetailCard>,
    );
    expect(container.querySelector('header')).not.toBeNull();
    expect(screen.getByText('라벨')).toBeInTheDocument();
  });

  it('title renders as h2 with signature weight', () => {
    render(<DetailCard title="이 카드의 제목">x</DetailCard>);
    const h2 = screen.getByRole('heading', { level: 2, name: '이 카드의 제목' });
    expect(h2.className).toContain('font-[var(--font-weight-signature)]');
    expect(h2.className).toContain('color-text-primary');
  });

  it('description renders only when provided', () => {
    const { rerender } = render(<DetailCard title="t">x</DetailCard>);
    expect(screen.queryByText(/설명/)).not.toBeInTheDocument();
    rerender(<DetailCard title="t" description="이 카드 설명">x</DetailCard>);
    expect(screen.getByText('이 카드 설명')).toBeInTheDocument();
  });

  it('headerAction sits in shrink-0 wrapper on right', () => {
    const { container } = render(
      <DetailCard
        title="t"
        headerAction={<button type="button">액션</button>}
      >
        x
      </DetailCard>,
    );
    const action = container.querySelector('.shrink-0');
    expect(action).not.toBeNull();
    expect(action?.querySelector('button')?.textContent).toBe('액션');
  });

  it('merges className on outer + contentClassName on body', () => {
    const { container } = render(
      <DetailCard
        title="t"
        className="data-extra-outer"
        contentClassName="data-extra-content"
      >
        본문
      </DetailCard>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('data-extra-outer');
    expect(root.className).toContain('rounded-[28px]'); // 기본 보존
    const body = container.querySelector('.data-extra-content');
    expect(body).not.toBeNull();
    expect(body?.textContent).toBe('본문');
  });
});
