import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export interface DocsHeaderTileProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "className"> {
  icon: ReactNode;
  /** 툴팁이자 접근성 이름의 기본값. */
  title: string;
  "aria-label"?: string;
  /** 현재 열려있는/토글된 상태 — 인디고 보더+표면으로만 표시(제2 채색 없음). */
  active?: boolean;
  className?: string;
}

/**
 * 문서함 헤더 전용 34×34px 아이콘 타일 — design-prescription.md ③-2 "타일
 * 규격" 처방(34px · radius-inner 7px · border-soft · hover
 * var(--color-indigo-line-a32) · active = --chrome-active-surface/-border).
 *
 * `shared/ui/ChromeTile` 와 의도적으로 별개다 — 그 컴포넌트는
 * `--chrome-tile-size`(44px, topology 플로팅 컨트롤 전용)를 하드 고정해 헤더의
 * 밀도 요구(34px)에 맞지 않는다(implementation-contract.md §1 각주). 같은
 * chrome 시각 문법(라운드·보더·호버·active 토큰)만 공유하는 문서함 헤더
 * 로컬 variant.
 *
 * 크기는 `--docs-header-tile-size`(34px) 토큰 참조 — 이전엔 `h-[34px]
 * w-[34px]` 리터럴이었다(Guardian 이월 P3, 슬라이스 B 에서 토큰 승격).
 */
export const DocsHeaderTile = forwardRef<HTMLButtonElement, DocsHeaderTileProps>(
  function DocsHeaderTile(
    { icon, title, active, className, "aria-label": ariaLabelProp, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        aria-label={ariaLabelProp ?? title}
        className={cn(
          "inline-flex h-[var(--docs-header-tile-size)] w-[var(--docs-header-tile-size)] flex-none items-center justify-center rounded-[var(--chrome-radius-inner)] border text-[color:var(--color-text-tertiary)] transition-colors disabled:cursor-not-allowed disabled:opacity-45",
          active
            ? "border-[color:var(--chrome-active-border)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-text-primary)]"
            : "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]",
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );
  },
);
