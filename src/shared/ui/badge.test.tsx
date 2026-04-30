import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>새 라벨</Badge>);
    expect(screen.getByText('새 라벨')).toBeInTheDocument();
  });

  it('default variant uses subtle white border + secondary text', () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.firstElementChild as HTMLElement;
    // 헌장 §11 — default variant 는 무채색 alpha + 회색 보더 만 사용.
    expect(el.className).toContain('var(--color-divider)');
    expect(el.className).toContain('color-text-secondary');
  });

  it('indigo variant applies brand border + indigo accent', () => {
    const { container } = render(<Badge variant="indigo">x</Badge>);
    const el = container.firstElementChild as HTMLElement;
    // 헌장 §11 — indigo 는 단일 인디고 alpha (보라핑크 X)
    expect(el.className).toContain('color-indigo-brand');
    expect(el.className).toContain('rgba(94,106,210,0.1)');
    expect(el.className).toContain('color-indigo-accent');
  });

  it('subtle variant has transparent border + tertiary text', () => {
    const { container } = render(<Badge variant="subtle">x</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('border-transparent');
    expect(el.className).toContain('color-text-tertiary');
  });

  it('always wraps in nowrap (한 글자 split 회피)', () => {
    const { container } = render(<Badge>매우 긴 라벨</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('whitespace-nowrap');
  });

  it('forwards ref to the underlying span', () => {
    const refs: HTMLSpanElement[] = [];
    const set = (el: HTMLSpanElement | null) => {
      if (el) refs.push(el);
    };
    render(<Badge ref={set}>refed</Badge>);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.tagName).toBe('SPAN');
  });

  it('passes through additional className via cn merge', () => {
    const { container } = render(<Badge className="data-extra">x</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('data-extra');
    // 기본 variant class 유지
    expect(el.className).toContain('rounded-full');
  });
});
