"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { fieldLabel } from "./control-class";

/**
 * Checkbox — 라벨 내장 체크박스 (2026-08-15 「체계」석 비준).
 *
 * ## 창립 census — 6곳/5파일의 세 갈래 드리프트
 *
 * | 갈래 | 수 |
 * |---|---:|
 * | `accent` = `--color-indigo-brand`(#5e6ad2) | 4 |
 * | `accent` = `--color-indigo-accent`(#7170ff — 다른 토큰) | 1 |
 * | **accent 없음 → UA 기본색** (둘 이상의 채색 시스템 금지 현행범) | 1 |
 *
 * 그리고 **6곳 전부 `focus-visible` 0** — 2026-08-05 「OS 강조색 초점 링」
 * 결함의 폼 판이었다. 이 컴포넌트가 셋을 못박는다: accent 는 brand 하나 ·
 * 크기는 size-4 · 초점 링은 값 층 문법(`--color-indigo-a46`).
 *
 * ## 라벨이 곧 타깃이다
 *
 * `fieldLabel({ row: true })` 가 라벨 클릭 = 토글과 WCAG 2.5.8 24px 바닥을
 * 진다 — `checkbox-target-size` 계약이 원인 검사로 그대로 남는다. 라벨 없는
 * 체크박스는 만들지 않는다(이름 없는 컨트롤은 오정보다).
 *
 * 게이트: raw `type="checkbox"` 는 `field-adoption-ratchet` 이 막고, `accent-[`
 * arbitrary 는 lint 가 막는다(이주 완료로 켤 때 위반 0).
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "size" | "children"> {
  label: ReactNode;
  /** 행(라벨)의 자리잡기·타입 단 조정 — 규격은 여기 넣지 않는다. */
  className?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  // label 을 span 으로 감싸지 않는다 — 행(fieldLabel row)은 flex 라, 복합
  // 라벨(아이콘 + truncate 스팬들)은 자기 노드가 직접 flex 자식이어야 한다.
  return (
    <label className={fieldLabel({ row: true, className })}>
      {/* 클래스를 상수로 빼지 않는다 — checkbox-target-size 계약이 여는 태그
          안의 리터럴을 읽는다(상수 뒤에 숨으면 크기 없음으로 판정된다). */}
      <input
        ref={ref}
        type="checkbox"
        className="size-4 shrink-0 accent-[color:var(--color-indigo-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]"
        {...rest}
      />
      {label}
    </label>
  );
});
