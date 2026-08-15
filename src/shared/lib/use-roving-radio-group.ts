"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * **radiogroup 의 행동 층** — roving tabindex + 화살표 순환 + selection follows
 * focus (2026-08-15 체계석 비준).
 *
 * ## 왜 훅이 따로 필요한가 — 그릇은 수렴하지 않는데 행동은 하나다
 *
 * 2026-08-15 (3) 이 `SegmentedControl` 을 만들며 손 재구현 5곳을 거뒀는데,
 * 그 라운드가 훑지 않은 자리가 더 있었다. 이번 전수: 프리미티브 밖
 * `role="radiogroup"` **5어커런스(11그룹)** + `aria-pressed` 로 배타 선택을
 * 표현한 **9그룹** = 최종 모집단 18그룹, **roving 구현 0 · onKeyDown 0**.
 * 100% 다.
 *
 * 즉 role 이 보조기술에게 「여기서 화살표로 옮겨 다닐 수 있다」고 약속하고
 * 아무 데서도 일어나지 않았다. 창립 전수가 결함으로 지목한 그 문장이
 * 그대로 살아 있었던 것이다.
 *
 * **그런데 그릇은 한 벌로 수렴하지 않는다.** 실측 네 가족:
 *
 * | 가족 | 그룹 | 컨테이너 |
 * |---|---:|---|
 * | 우물(well) | 4 | `border + bg-overlay-1 + p-px` — 프리미티브 캐노니컬 |
 * | 떨어진 칩 줄 | 12 | `flex flex-wrap items-center gap-1.5` (바이트 동일 9 + no-op 1) |
 * | 격자 타일 | 2 | `grid grid-cols-2` + `shape:'tile'` 미리보기 카드 |
 * | 세로 목록 행 | 2 | radiogroup 이 **틀린 그릇** — `aria-current` 로 이관 |
 *
 * 2026-08-15 (7) 의 문법 그대로다: **분류 가능(전부 radiogroup 이다)은 수렴
 * 가능(그릇이 한 벌이다)이 아니다.** 수렴 안 되는 그릇에 축을 강요하면 축을
 * 하나씩 덧붙이게 되고, 그게 컨트롤 높이 8~9종 사고의 병이었다.
 *
 * 그래서 층을 가른다 — **행동은 이 훅 하나, 그릇은 자리의 것.** 다수파 그릇
 * 둘(well · chips)은 `SegmentedControl` 이 자동으로 입혀 주고, 나머지는 이
 * 훅을 직접 입는다.
 *
 * ## 훅만으로는 왜 부족한가 (그래서 프리미티브도 남는다)
 *
 * Dialog 원장(2026-08-15)이 같은 자리에서 배운 것: *"행동 훅과 규약은 이미
 * 있었다 — 없던 것은 **자동으로 입혀 주는 자리**다."* `useDialogFocusTrap` 이
 * 있는 동안에도 `aria-modal` 선언 20 대 트랩 실재 8이었다. 훅만 주면 12곳이
 * 각자 배선하고, 그게 오늘 roving 0 이 된 경로다.
 *
 * ## 무엇을 하고 무엇을 안 하나
 *
 * **한다**: refs · tabIndex(체크 항목만 탭 스톱) · →↓/←↑ 순환 + selection
 * follows focus(네이티브 라디오와 동일) · Space.
 *
 * **안 한다**: 값을 한 줄도 내지 않는다(className 은 이 훅의 반환에 없다) ·
 * **Home/End**(tabs 표의 키다, 라디오 표에 없다 — tab-bar 를 베끼며 같이
 * 들어오는 회귀를 계약이 막는다) · **Escape**(팝오버의 Escape 를 훔치지
 * 않는다) · 그룹 disabled(유일한 탭 스톱이 사라져 키보드 사용자가 문서
 * 처음으로 떨어진다 — `busy` 는 재선택 no-op 이지 disabled 가 아니다).
 *
 * 게이트: `tests/contract/radiogroup-behavior-ratchet.contract.test.ts` 가
 * 프리미티브 밖 `role="radiogroup"` 을 세고, 등재된 자리는 같은 파일에
 * **이 훅 호출이 실재해야** 통과시킨다(장부가 실측보다 후하면 빨개진다).
 */

export interface RovingRadioGroupOptions<T> {
  /** 지금 체크된 값. 어느 항목도 안 맞으면 첫 항목이 탭 스톱이 된다(APG). */
  value: T;
  /** 항목의 값들 — 순서가 곧 화살표 순환 순서다. */
  values: readonly T[];
  onChange: (next: T) => void;
  /** 전환 중 — 재선택만 잠그고 초점은 산다. 그룹 disabled 를 걸지 않는다. */
  busy?: boolean;
}

export interface RovingRadioItemProps {
  ref: (el: HTMLButtonElement | null) => void;
  role: "radio";
  "aria-checked": boolean;
  "aria-disabled": true | undefined;
  tabIndex: 0 | -1;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface RovingRadioGroup {
  /** 그룹 컨테이너에 펴 넣는다 — role 과 aria-busy 만. 값은 안 낸다. */
  groupProps: { role: "radiogroup"; "aria-busy": true | undefined };
  /** 항목 index 에 펴 넣는다. `type="button"` 은 소비처가 준다. */
  itemProps: (index: number) => RovingRadioItemProps;
  /** 체크된 항목의 index. 없으면 -1. */
  checkedIndex: number;
}

export function useRovingRadioGroup<T>({
  value,
  values,
  onChange,
  busy,
}: RovingRadioGroupOptions<T>): RovingRadioGroup {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = values.findIndex((v) => v === value);
  // APG: 체크 항목이 없으면 첫 항목이 탭 스톱이다.
  const tabStopIndex = checkedIndex >= 0 ? checkedIndex : 0;

  const select = (index: number) => {
    if (busy) return;
    if (index < 0 || index >= values.length) return;
    itemRefs.current[index]?.focus({ preventScroll: true });
    const next = values[index];
    if (next !== value) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      select((index + 1) % values.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      select((index - 1 + values.length) % values.length);
    } else if (event.key === " ") {
      event.preventDefault();
      select(index);
    }
  };

  return {
    groupProps: { role: "radiogroup", "aria-busy": busy || undefined },
    checkedIndex,
    itemProps: (index) => ({
      ref: (el) => {
        itemRefs.current[index] = el;
      },
      role: "radio",
      "aria-checked": index === checkedIndex,
      "aria-disabled": busy || undefined,
      tabIndex: index === tabStopIndex ? 0 : -1,
      onClick: () => select(index),
      onKeyDown: (event) => handleKeyDown(event, index),
    }),
  };
}
