import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { CONTROL_DISABLED_CLASS } from "@/shared/ui/control-class";

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
 * 문서함 헤더의 정사각 아이콘 타일 — 크기는 `--chrome-tile-size`(36px),
 * 반경은 `--chrome-radius-inner`, 보더/호버/active 는 chrome 토큰.
 *
 * ## 왜 자기 크기 토큰이 없나 (2026-08-03)
 *
 * 있었다 — `--docs-header-tile-size`(34px). 그리고 그 34 는 **설계값이 아니라
 * 화석**이었다. 이 주석의 옛 판이 근거를 그대로 적어 놨다: *"`ChromeTile` 은
 * `--chrome-tile-size`(**44px**)를 하드 고정해 헤더의 밀도 요구(34px)에 맞지
 * 않는다."* 그런데 크롬 타일은 2026-07-23 에 **36px 로 내려왔다**(소유자 3차
 * 보고 *"딱봐도 크다"*). 34 의 유일한 근거가 사라진 날 34 를 다시 유도한
 * 사람은 없었고, 같은 역할에 두 값 · 두 coarse 승격 규칙이 남았다.
 *
 * 그래서 이제 **정사각 아이콘 타일의 치수는 하나다**. 이 파일이 `ChromeTile`
 * 과 여전히 별개인 이유는 크기가 아니라 **반경**이다 — 헤더 안에 앉는 타일은
 * `--chrome-radius-inner`, 지도 위에 떠 있는 타일은 `--chrome-radius`.
 *
 * 원장(반증 조건 포함): `docs/DECISIONS.md` 2026-08-03 「타일 치수는 하나다」.
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
          "inline-flex size-[var(--chrome-tile-size)] flex-none items-center justify-center rounded-[var(--chrome-radius-inner)] border text-[color:var(--color-text-tertiary)] transition-colors",
          // 비활성 값은 손으로 적지 않는다 — 45 로 적혀 있던 자리다(값 층은 55).
          CONTROL_DISABLED_CLASS,
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
