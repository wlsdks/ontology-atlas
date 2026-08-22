"use client";

import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
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
 * ## 키보드 — 이제 훅이 진다 (2026-08-15 2차 라운드)
 *
 * roving tabindex · →↓/←↑ 순환 + selection follows focus · Space ·
 * Home/End 없음 · Escape 미처리 — **구현은 `shared/lib/use-roving-radio-group`
 * 하나**이고 이 파일은 그것을 입는다. 갈라놓은 이유: 창립 라운드가 훑지 않은
 * 손 radiogroup 이 더 있었고(최종 모집단 18그룹 · roving 0 · 100%), 그중
 * 격자 타일처럼 **그릇이 진짜로 다른** 자리가 있어 한 컴포넌트로 수렴하지
 * 않는다. 그런 자리는 훅을 직접 입는다. 이 파일이 남는 이유는 다수파 그릇
 * 둘을 **자동으로 입혀 주기 위해서**다 — 훅만 주면 자리마다 각자 배선하고,
 * 그게 오늘 roving 0 이 된 경로다(Dialog 원장의 그 문장).
 *
 * ## 그릇 캐노니컬 둘 (`variant`)
 *
 * | | 컨테이너 | 아이템 | 실측 |
 * |---|---|---|---:|
 * | `well`(기본) | `inline-flex gap-px … p-px` | `shape:'segment'` | 4그룹 |
 * | `chips` | `flex flex-wrap items-center gap-1.5` | `shape:'chip'` | **10/12 가 이미 이 문법** |
 *
 * `chips` 는 새 값이 아니라 **실측 다수파의 등재**다(바이트 동일 9 + no-op
 * 추가만 붙은 1). 그리고 `Choice` 의 손 오버라이드 `h-8 px-3 text-body` 는
 * `chip lg`(`min-h-8 px-3 py-1 text-body`)와 **기하 동등**이라 이주가 픽셀
 * 0이다 — 움직이는 것은 선택 표현 색뿐이고, 그건 창립 전수가 「2언어」라고
 * 적었지만 실제로는 **3언어**로 살아 있었다(Choice 손 조합 · TopologyIndexPanel
 * 제3언어 · 램프 active).
 *
 * ## 컨테이너 캐노니컬 — 인셋은 다수결이 아니라 램프가 정했다
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
  /**
   * 마우스 툴팁 — 네이티브 속성 통과. 실측 소비처 2(FirstRunStarter ·
   * ProjectDrawer)라 열었다. **per-option `className` 은 열지 않는다** —
   * 「자리잡기 전용」 prop 계약이 규격 반입 통로가 된다(체계석 명시).
   */
  title?: string;
  testId?: string;
}

export type SegmentedControlProps<T extends string | number | boolean> = SegmentedName & {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
  /** 값 층 크기 단 — 기본 lg(32px, coarse 44 승격). */
  size?: Extract<ControlSize, "md" | "lg">;
  /**
   * 그릇 — 실측 다수파 둘. 기본은 `well`(붙은 우물, 4그룹).
   * `chips` 는 떨어진 칩 줄(`flex flex-wrap items-center gap-1.5`)이고,
   * 바이트 동일 9그룹 + no-op 추가 1 = 10/12 가 이미 그 문법이었다.
   */
  variant?: "well" | "chips";
  /**
   * 항목이 폭을 균등하게 나눠 갖는다. 실측 소비처 3(BlockImport ·
   * FirstRunStarter · StudioMaterialize) — 2옵션에서 `grid-cols-2` 와
   * 수학적으로 같은 폭이다.
   */
  fill?: boolean;
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
  variant = "well",
  fill,
  busy,
  testId,
  className,
}: SegmentedControlProps<T>) {
  /*
   * 행동은 이 파일이 구현하지 않는다 — `useRovingRadioGroup` 하나다. 이 파일이
   * 남는 이유는 **그릇을 자동으로 입혀 주기 위해서**이고, 그게 없으면 12곳이
   * 각자 배선한다(Dialog 원장 2026-08-15: "없던 것은 자동으로 입혀 주는 자리다").
   */
  const group = useRovingRadioGroup<T>({
    value,
    values: options.map((o) => o.value),
    onChange,
    busy,
  });

  return (
    <div
      {...group.groupProps}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={cn(
        variant === "well"
          ? "inline-flex items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-px"
          : "flex flex-wrap items-center gap-1.5",
        fill && (variant === "well" ? "flex w-full" : "w-full"),
        className,
      )}
    >
      {options.map((option, index) => {
        const item = group.itemProps(index);
        return (
          <button
            key={String(option.value)}
            {...item}
            type="button"
            aria-label={option.ariaLabel}
            title={option.title}
            data-testid={option.testId}
            className={controlClass({
              shape: variant === "well" ? "segment" : "chip",
              size,
              active: item["aria-checked"],
              className: fill ? "min-w-0 flex-1" : undefined,
            })}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
