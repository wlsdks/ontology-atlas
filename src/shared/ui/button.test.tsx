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
    // Charter §11 — a primary CTA uses the single indigo brand colour only.
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
    // Charter §11 — outline uses neutral alpha only.
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

  it('every size wears the chip radius: a Button is a control, not a container', () => {
    // A 32px Button beside a 32px controlClass chip or fieldClass field wears their radius (6px),
    // and so do 40px and 44px ones: a 40px primary on the panel corner read as a pill beside
    // rectangular primaries on the next screen (2026-09-26).
    // Type stays 14px at every size, the step a 32px field sets its value in.
    for (const size of ['sm', 'md', 'lg'] as const) {
      const cls = buttonVariants({ size });
      expect(cls).toMatch(/\btext-body-lg\b/);
      expect(cls).not.toMatch(/\btext-body(?!-)\b/);
      expect(cls.match(/\brounded-(chip|panel)\b/g)).toHaveLength(1);
    }
    expect(buttonVariants({ size: 'sm' })).toMatch(/\brounded-chip\b/);
    expect(buttonVariants({ size: 'md' })).toMatch(/\brounded-chip\b/);
    expect(buttonVariants({ size: 'lg' })).toMatch(/\brounded-chip\b/);
  });

  it('variant=danger draws the danger ramp on the plane, the rule and the ink', () => {
    const cls = buttonVariants({ variant: 'danger' });
    expect(cls).toContain('bg-[color:var(--color-danger-a08)]');
    expect(cls).toContain('border-[color:var(--color-danger-a32)]');
    expect(cls).toContain('text-[color:var(--color-danger-text)]');
  });

  it('variant=danger drops the hue while disabled (the danger ink at opacity-55 measured 2.42:1)', () => {
    const cls = buttonVariants({ variant: 'danger' });
    expect(cls).toContain('disabled:text-[color:var(--color-text-primary)]');
    expect(cls).toContain('disabled:bg-[color:var(--color-overlay-1)]');
    expect(cls).toContain('disabled:border-[color:var(--color-overlay-3)]');
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
      buttonVariants({ variant: 'danger' }),
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
    // Charter §11 plus accessibility — protects prefers-reduced-motion users.
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
    // A link/anchor imitating a Button calls buttonVariants directly.
    const cls = buttonVariants({ variant: 'outline', size: 'sm' });
    expect(typeof cls).toBe('string');
    expect(cls).toContain('h-8');
    expect(cls).toContain('var(--color-overlay-3)');
  });
});
