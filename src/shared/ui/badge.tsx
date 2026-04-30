import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1',
    'rounded-full px-2.5 py-0.5',
    'text-xs',
    'font-[var(--font-weight-signature)]',
    'border',
    // 좁은 카드 layout 안에서 한 글자씩 vertical 줄바꿈 되는 결함 차단.
    // 짧은 status / kind 라벨 (성공·실패·draft 등) 은 한 줄에 들어가야
    // pill 의미가 살아남는다.
    'whitespace-nowrap',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-secondary)]',
        indigo:
          'border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.1)] text-[color:var(--color-indigo-accent)]',
        subtle:
          'border-transparent bg-transparent text-[color:var(--color-text-tertiary)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';
