import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-sm leading-none',
    'font-[var(--font-weight-signature)]',
    'rounded-xl',
    'border border-transparent',
    'select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-180 ease-out',
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
        primary:
          'bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-primary)] shadow-[inset_0_1px_0_var(--color-border-strong),0_10px_24px_rgba(94,106,210,0.22)] hover:border-[color:rgba(205,212,255,0.28)] hover:bg-[color:var(--color-indigo-hover)] active:shadow-[inset_0_1px_0_var(--color-divider),0_6px_14px_rgba(94,106,210,0.2)]',
        ghost:
          'bg-transparent text-[color:var(--color-text-primary)] hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-border-soft)] active:shadow-[0_4px_10px_rgba(0,0,0,0.1)]',
        outline:
          'border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-primary)] shadow-[inset_0_1px_0_var(--color-overlay-2)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-overlay-2)] active:shadow-[inset_0_1px_0_var(--color-overlay-2),0_5px_12px_rgba(0,0,0,0.12)]',
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
