import { cn } from "@/shared/lib/cn";

export interface EvidenceOnlyBadgeProps {
  /** 짧은 라벨 — 「문서 없음」 급. 표면마다 다르게 쓰지 않는다. */
  label: string;
  /** 마우스를 올렸을 때 나오는 한 줄 — 왜 아래 계층인지와 승격 경로. */
  hint?: string;
  className?: string;
}

/**
 * 「근거로만 적힌 이름」 표시 — 자기 `.md` 가 없는 파생 개념에 붙는다.
 *
 * **무채색이다.** 이 배지가 뜨는 표면은 한 화면에 수십 개가 될 수 있어
 * (도그푸드 볼트 289개념 중 193개가 파생) 신호 톤을 쓰면 앰버가 화면을
 * 덮는다 — 헌장의 "앰버가 셋 이상 보이면 결함" 위반이다. 계층은 색이 아니라
 * 위치(아래 계층)와 이 조용한 라벨로 말한다.
 *
 * **행 높이를 흔들지 않는다.** `text-label`(11px) + `leading-label`(16px) 로
 * 같은 행의 본문(`text-body` 12.5px, 줄높이 ~19px)보다 낮게 유지한다 —
 * 배지가 붙은 행만 키가 커지면 반복 세트의 격자 리듬이 아무도 고르지 않은
 * 채 무너진다(치수 규칙성).
 */
export function EvidenceOnlyBadge({ label, hint, className }: EvidenceOnlyBadgeProps) {
  return (
    <span
      data-testid="evidence-only-badge"
      title={hint}
      className={cn(
        "inline-flex flex-none items-center rounded-micro border border-[color:var(--color-border-soft)] px-1 text-label leading-label text-[color:var(--color-text-quaternary)]",
        className,
      )}
    >
      {label}
    </span>
  );
}
