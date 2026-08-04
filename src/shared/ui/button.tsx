import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-body-lg leading-none',
    'font-[var(--font-weight-signature)]',
    'rounded-panel',
    'border border-transparent',
    'select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-base)] ease-[var(--motion-ease)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]',
    'active:translate-y-[1px]',
    'motion-reduce:transition-none motion-reduce:transform-none',
    // disabled: 시각적 약화 + 커서 변경. pointer-events-none 대신 cursor-
    // not-allowed 로 hover 시 "왜 눌러도 안 되지" 명확화. hover 스타일은
    // disabled 일 때 적용 X — motion 단 여전히 가능 (transition 도 끔).
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:bg-inherit disabled:hover:border-inherit disabled:active:translate-y-0',
  ].join(' '),
  {
    variants: {
      variant: {
        // ⚠️ primary 의 키 그림자는 **인디고 착색**이다(`--color-indigo-a22/a20`).
        // 2026-07-28 재수렴에서 기하는 맞췄지만 색은 그대로 뒀다 — 앱에서 가장
        // 눈에 띄는 컨트롤의 색을 무채색으로 바꾸는 것은 취향 판단이라 소유자
        // 몫이다. 착색 그림자는 광원이 둘이라는 뜻이므로, 정리하기로 하면
        // `--shadow-control-press` 로 흡수하면 된다.
        //
        // 잉크는 `--color-text-on-accent`(#ffffff) 다 — **`--color-text-primary`
        // 가 아니다.** 채운 인디고(`#5e6ad2`) 위에서 `#f7f8f8` 은 합성 대비
        // **4.42:1** 로 WCAG 1.4.3 AA(4.5) 밑이고, `#ffffff` 는 **4.70:1** 로
        // 통과한다. 이 토큰은 2026-08-03 에 「채운 인디고 위의 잉크」 라는
        // 이름으로 이미 만들어져 `control-class.ts` 의 `accentSolid` 가 쓰고
        // 있었는데, 이 프리미티브만 이관에서 빠져 있었다 — 관문의 주 CTA 가
        // 앱에서 가장 눈에 띄는 컨트롤인데 유일하게 AA 미달이던 이유다.
        primary:
          'bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)] shadow-[inset_0_1px_0_var(--color-border-strong),0_10px_24px_var(--color-indigo-a22)] hover:border-[color:var(--color-indigo-pale-a28)] hover:bg-[color:var(--color-indigo-brand-hover)] active:shadow-[inset_0_1px_0_var(--color-divider),0_6px_14px_var(--color-indigo-a20)]',
        ghost:
          'bg-transparent text-[color:var(--color-text-primary)] hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-border-soft)] active:shadow-[var(--shadow-control-press)]',
        outline:
          'border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-primary)] shadow-[inset_0_1px_0_var(--color-overlay-2)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-overlay-2)] active:shadow-[inset_0_1px_0_var(--color-overlay-2),var(--shadow-control-press)]',
      },
      size: {
        sm: 'h-8 px-3.5',
        md: 'h-10 px-4.5',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
