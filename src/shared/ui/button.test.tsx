import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('renders children + native button element', () => {
    render(<Button>저장</Button>);
    const btn = screen.getByRole('button', { name: '저장' });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('default variant=primary uses indigo-brand background', () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole('button');
    // 헌장 §11 — primary CTA 는 단일 인디고 brand 색만 사용
    expect(btn.className).toContain('color-indigo-brand');
  });

  it('variant=ghost has transparent bg + primary text', () => {
    render(<Button variant="ghost">x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).toContain('color-text-primary');
  });

  it('variant=outline has subtle border + alpha bg', () => {
    render(<Button variant="outline">x</Button>);
    const btn = screen.getByRole('button');
    // 헌장 §11 — outline 은 무채색 alpha 만
    expect(btn.className).toContain('var(--color-overlay-3)');
    expect(btn.className).toContain('var(--color-overlay-1)');
  });

  it('size variants apply distinct height + padding', () => {
    const { rerender } = render(<Button size="sm">s</Button>);
    expect(screen.getByRole('button').className).toContain('h-8');

    rerender(<Button size="md">m</Button>);
    expect(screen.getByRole('button').className).toContain('h-10');

    rerender(<Button size="lg">l</Button>);
    expect(screen.getByRole('button').className).toContain('h-11');
  });

  it('disabled state has cursor-not-allowed + opacity reduction', () => {
    render(<Button disabled>비활성</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('disabled:cursor-not-allowed');
    expect(btn.className).toContain('disabled:opacity-55');
  });

  it('uses border/background hover states without hover shadows', () => {
    const variants = [
      buttonVariants({ variant: 'primary' }),
      buttonVariants({ variant: 'ghost' }),
      buttonVariants({ variant: 'outline' }),
    ];

    for (const cls of variants) {
      expect(cls).not.toContain('hover:shadow');
    }
    expect(variants.join(' ')).toContain('hover:border');
    expect(variants.join(' ')).toContain('hover:bg');
  });

  it('motion-reduce variant disables transition + transform', () => {
    render(<Button>m</Button>);
    const btn = screen.getByRole('button');
    // 헌장 §11 + a11y — prefers-reduced-motion 사용자 보호
    expect(btn.className).toContain('motion-reduce:transition-none');
    expect(btn.className).toContain('motion-reduce:transform-none');
  });

  it('forwards ref to underlying button', () => {
    const refs: HTMLButtonElement[] = [];
    render(<Button ref={(el) => { if (el) refs.push(el); }}>r</Button>);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.tagName).toBe('BUTTON');
  });

  it('exports buttonVariants for use as Link className', () => {
    // Link/anchor 가 Button 모양 따라할 때 buttonVariants 함수 직접 호출.
    const cls = buttonVariants({ variant: 'outline', size: 'sm' });
    expect(typeof cls).toBe('string');
    expect(cls).toContain('h-8');
    expect(cls).toContain('var(--color-overlay-3)');
  });
});
