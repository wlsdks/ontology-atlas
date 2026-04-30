import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card';

describe('Card primitives', () => {
  it('Card renders children with rounded panel + subtle border', () => {
    const { container } = render(<Card>본문</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.textContent).toBe('본문');
    // 헌장 §11 — 무채색 alpha border + 패널 배경
    expect(el.className).toContain('rounded-lg');
    expect(el.className).toContain('var(--color-overlay-2)');
    expect(el.className).toContain('color-panel');
  });

  it('CardHeader is flex column with gap', () => {
    const { container } = render(<CardHeader>x</CardHeader>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('flex');
    expect(el.className).toContain('flex-col');
    expect(el.className).toContain('gap-1');
  });

  it('CardTitle renders as h3 with signature weight', () => {
    render(<CardTitle>제목</CardTitle>);
    const heading = screen.getByRole('heading', { level: 3, name: '제목' });
    expect(heading).toBeInTheDocument();
    expect(heading.className).toContain('font-[var(--font-weight-signature)]');
    // 헌장 §11 — primary text color (단일 인디고는 별도 컴포넌트)
    expect(heading.className).toContain('color-text-primary');
  });

  it('CardDescription renders as p tag with tertiary text', () => {
    const { container } = render(<CardDescription>설명</CardDescription>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('P');
    expect(el.textContent).toBe('설명');
    expect(el.className).toContain('color-text-tertiary');
  });

  it('CardContent renders as div with secondary text', () => {
    const { container } = render(<CardContent>본문 컨텐츠</CardContent>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.textContent).toBe('본문 컨텐츠');
    expect(el.className).toContain('color-text-secondary');
  });

  it('all primitives merge custom className via cn', () => {
    const { container } = render(
      <Card className="data-extra-card">
        <CardHeader className="data-extra-header">
          <CardTitle className="data-extra-title">t</CardTitle>
          <CardDescription className="data-extra-desc">d</CardDescription>
        </CardHeader>
        <CardContent className="data-extra-content">c</CardContent>
      </Card>,
    );
    expect(container.querySelector('.data-extra-card')).not.toBeNull();
    expect(container.querySelector('.data-extra-header')).not.toBeNull();
    expect(container.querySelector('.data-extra-title')).not.toBeNull();
    expect(container.querySelector('.data-extra-desc')).not.toBeNull();
    expect(container.querySelector('.data-extra-content')).not.toBeNull();
  });

  it('forwards ref to underlying element on each primitive', () => {
    const refs: HTMLElement[] = [];
    const collect = (el: HTMLElement | null) => {
      if (el) refs.push(el);
    };
    render(
      <Card ref={collect}>
        <CardHeader ref={collect}>
          <CardTitle ref={collect}>t</CardTitle>
          <CardDescription ref={collect}>d</CardDescription>
        </CardHeader>
        <CardContent ref={collect}>c</CardContent>
      </Card>,
    );
    expect(refs).toHaveLength(5);
    // ref 호출 순서는 React 의 commit 단계 inner→outer 라 의존하지 않고
    // 태그 카운트로 검증 (3 div: Card / Header / Content + 1 h3 + 1 p).
    const tags = refs.map((r) => r.tagName).sort();
    expect(tags).toEqual(['DIV', 'DIV', 'DIV', 'H3', 'P']);
  });
});
