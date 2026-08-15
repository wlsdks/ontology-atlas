import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-body-lg leading-caption',
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
        // ✅ **착색 키 그림자를 걷었다 (2026-08-06 소유자 판정).**
        //
        // 종전 primary 는 쉴 때 `0 10px 24px var(--color-indigo-a22)`, 눌릴 때
        // `0 6px 14px var(--color-indigo-a20)` 이라는 **인디고 착색 드롭**을
        // 갖고 있었다. 위 두 줄이 예고한 그대로 «착색 그림자는 광원이 둘이라는
        // 뜻» 이고, 소유자가 색을 바꿔도 된다고 판정하면 답은 이미 적혀 있었다 —
        // `--shadow-control-press` 로 흡수.
        //
        // 왜 쉴 때는 드롭을 아예 안 주나: 전수 실측(2026-08-06) 결과 이 저장소의
        // 비토큰 `shadow-[…]` 21건 중 **18건이 inset(재질)뿐**이고, 드롭을 손으로
        // 쓴 4건이 이탈이었다. 같은 cva 의 `outline` 도 쉴 때 inset 만 쓴다. 즉
        // 관례는 「쉬는 컨트롤은 재질, 드롭은 떠 있는 것의 몫」이다. primary 가
        // 주목을 이기는 근거는 그림자가 아니라 **채운 인디고 면**이다.
        //
        // 결과: 램프 밖 기하 2건 제거 · 새 토큰 0개 · 광원 하나.
        //
        // 잉크는 `--color-text-on-accent`(#ffffff) 다 — **`--color-text-primary`
        // 가 아니다.** 채운 인디고(`#5e6ad2`) 위에서 `#f7f8f8` 은 합성 대비
        // **4.42:1** 로 WCAG 1.4.3 AA(4.5) 밑이고, `#ffffff` 는 **4.70:1** 로
        // 통과한다. 이 토큰은 2026-08-03 에 「채운 인디고 위의 잉크」 라는
        // 이름으로 이미 만들어져 `control-class.ts` 의 `accentSolid` 가 쓰고
        // 있었는데, 이 프리미티브만 이관에서 빠져 있었다 — 관문의 주 CTA 가
        // 앱에서 가장 눈에 띄는 컨트롤인데 유일하게 AA 미달이던 이유다.
        primary:
          'bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)] shadow-[inset_0_1px_0_var(--color-border-strong)] hover:border-[color:var(--color-indigo-pale-a28)] hover:bg-[color:var(--color-indigo-brand-hover)] active:shadow-[inset_0_1px_0_var(--color-divider),var(--shadow-control-press)]',
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
        /*
         * ★ **기본은 `button` 이다** (2026-08-15 이식성 시험이 잡았다).
         *
         * 형제 프리미티브(`Chip`·`IconButton`·`RowButton`)는 *"폼 안에서
         * `<button>` 의 기본은 submit 이라 칩 하나가 폼을 보낸다"* 를 막는 것을
         * 자기 존재 이유로 적어 두었는데, 정작 **표준 버튼만 raw `<button>`**
         * 이었다. 이 저장소 안에서는 안 터졌다 — 폼이 하나뿐이고 그 안의 버튼
         * 일곱이 전부 `type` 을 손으로 달아 뒀기 때문이다. 그 관례를 모르는
         * 사람(= 이 시스템을 받아 갈 사람)에게는 「취소」가 폼을 보낸다.
         *
         * `{...props}` 가 **뒤에** 펼쳐지므로 `type="submit"` 을 넘기면 그쪽이
         * 이긴다 — 기존 소비처는 하나도 안 바뀐다.
         */
        type="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
