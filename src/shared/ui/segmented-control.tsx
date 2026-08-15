"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { controlClass, type ControlSize } from "./control-class";

/**
 * SegmentedControl — 보더 상자 안 **배타 단일선택** (2026-08-15 체계석 비준 +
 * 상호작용석 공동 서명).
 *
 * ## 창립 census — 5곳 손 재구현의 드리프트
 *
 * ARIA 3종(aria-pressed 2 · radiogroup 3 — 그리고 **roving 구현 0곳**: role 이
 * 화살표 이동을 약속만 하고 아무 일도 안 일어났다) · 컨테이너 인셋 3종 ·
 * 바탕 3종 · 선택 표현 2언어(손 조합은 잉크 대비 1.17:1 — 상태가 아니라
 * 착시). feature 층 둘은 위젯 감금(FSD) 때문에 재발명한 것 — 그것이 승격의
 * 근거다.
 *
 * ## 문법 — 2택 on/off 도 radiogroup 이다
 *
 * 각 세그먼트의 라벨은 설정 이름이 아니라 **값의 이름**이고(「개발/일반」·
 * 「EN/KO」·「켬/끔」), 형제에 aria-pressed 를 나란히 걸면 접근성 트리에
 * 배타성이 실리지 않는다. 라디오는 집합·위치·배타성을 한 번에 준다(APG
 * radio group). **aria-pressed 는 이 프리미티브에서 표현 불가능하다** — 이름이
 * 안 바뀌는 단일 토글(스포트라이트·미리보기)만 그 문법이 옳고, 그건 이
 * 부품의 소비자가 아니다.
 *
 * ## 키보드 — 프리미티브가 진다
 *
 * roving tabindex(체크 항목만 탭 스톱) · →↓/←↑ 순환 이동 + **selection
 * follows focus**(네이티브 라디오와 동일 — 다섯 현장 전부 되돌릴 수 있는
 * 선호값 쓰기라 안전) · Space · **Home/End 없음**(tabs 표의 키다, 라디오
 * 표에 없다) · Escape 미처리(팝오버의 Escape 를 훔치지 않는다).
 *
 * ## 컨테이너 캐노니컬 — 인셋은 다수결이 아니라 사다리가 정했다
 *
 * `p-px + gap-px` 만 아이템 24/32 위에서 컨테이너 자연높이(28/36)가 높이
 * 어휘에 선다(p-0.5 → 30/38, p-1 → 34/42 — 전부 어휘 밖으로 이미 사형된
 * 값들). 바탕은 `--color-overlay-1`(α — 어느 표면 위에서도 부모+2% 유지,
 * fieldClass boxed 동족). 보더 soft · 반경 chip 은 5/5 만장일치.
 *
 * busy 는 그룹 `aria-busy` + 재선택 no-op 이다 — **그룹 disabled 금지**(유일한
 * 탭 스톱이 사라져 키보드 사용자가 문서 처음으로 떨어진다).
 *
 * ⚠️ **overlay-1 우물은 border-soft 와 짝으로만 성립한다** (위계석 승인 전제,
 * 2026-08-15): 우물 면 자체는 주변 대비 ≈1.16:1 로 사실상 안 보이고 — 그것이
 * 올바른 배역이다(컨트롤 우물이 보이면 조연이 조명을 받는다) — 경계는 보더가,
 * 상태는 active 틴트가 진다. 보더를 지우면 우물이 화면에서 소실된다.
 */

type SegmentedName =
  | { ariaLabel: string; labelledBy?: never }
  | { ariaLabel?: never; labelledBy: string };

export interface SegmentedOption<T extends string | number | boolean> {
  value: T;
  label: ReactNode;
  /** 보이는 라벨이 약어(EN·KO)일 때 낭독용 전체 이름. */
  ariaLabel?: string;
  testId?: string;
}

export type SegmentedControlProps<T extends string | number | boolean> = SegmentedName & {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
  /** 값 층 segment 의 크기 단 — 기본 lg(32px, coarse 44 승격). */
  size?: Extract<ControlSize, "md" | "lg">;
  /** 전환 진행 중 — 재선택만 잠그고 초점은 산다. 그룹 disabled 를 걸지 않는다. */
  busy?: boolean;
  testId?: string;
  /** 자리잡기 전용 — 규격은 여기 넣지 않는다. */
  className?: string;
};

export function SegmentedControl<T extends string | number | boolean>({
  ariaLabel,
  labelledBy,
  value,
  options,
  onChange,
  size = "lg",
  busy,
  testId,
  className,
}: SegmentedControlProps<T>) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = options.findIndex((o) => o.value === value);
  // APG: 체크 항목이 없으면 첫 항목이 탭 스톱이다.
  const tabStopIndex = checkedIndex >= 0 ? checkedIndex : 0;

  const select = (index: number) => {
    if (busy) return;
    const option = options[index];
    if (!option) return;
    itemRefs.current[index]?.focus({ preventScroll: true });
    if (option.value !== value) onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    // Home/End 는 라디오 표에 없는 키다 — tab-bar 를 베끼며 같이 들어오는
    // 회귀를 계약 테스트가 막는다. Escape 도 처리하지 않는다(숙주의 것).
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      select((index + 1) % options.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      select((index - 1 + options.length) % options.length);
    } else if (event.key === " ") {
      event.preventDefault();
      select(index);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-px",
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            aria-disabled={busy || undefined}
            tabIndex={index === tabStopIndex ? 0 : -1}
            data-testid={option.testId}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={controlClass({ shape: "segment", size, active: checked })}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
