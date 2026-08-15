"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/shared/lib/cn";
import { fieldClass, fieldLabel, type FieldFrame, type FieldSize } from "./control-class";

/**
 * Input / Textarea — 폼 필드의 **행동 층** (2026-08-15 「체계」석 비준).
 *
 * ## 존재 이유는 스타일이 아니다
 *
 * 값 층(`fieldClass`)의 채택은 이미 완비였다(텍스트 필드 미경유 0 — 폼 부채
 * 래칫 종료 선언 상태). 이 컴포넌트가 나르는 것은 **배선**이다:
 *
 * 1. **접근 이름 강제** — `label`(htmlFor 배선) · `aria-label` · `labelledBy`
 *    셋 중 하나를 타입이 요구한다. 이름 없는 필드는 컴파일이 안 된다.
 * 2. **오류/힌트 자동 배선** — 창립 census 에서 `aria-invalid` 7곳 ·
 *    `aria-describedby` 11곳 · `role="alert"` 14파일이 전부 손 배선이고
 *    패턴이 제각각이었다. `error`/`hint` prop 하나가 `useId` 로
 *    `aria-invalid` + `aria-describedby`(error 먼저) + `role="alert"` 를
 *    한 번에 배선한다 — 추출 repo 에서 에이전트가 폼을 조립할 때 이 강제가
 *    게이트다.
 *
 * ## 값은 값 층 한 곳에만 산다
 *
 * 입력의 className 은 `fieldClass(...)` 호출 결과 **그대로**다 — 계약 테스트가
 * 바이트 동일성을 단언한다. 새 축·새 토큰·픽셀 이동 0 이 이 컴포넌트의 성립
 * 조건이었다(비준문). `spellCheck` 기본값도 손대지 않는다 — slug·경로·키 는
 * 자리별 의미 판단이다.
 *
 * ## 기존 fieldClass 직접 호출은 부채가 아니다
 *
 * 값 층 준수 상태라 이주를 강제하지 않는다(종료 선언된 장부를 다시 열지
 * 않는다). 래칫(`field-adoption-ratchet`)은 **새 파일**의 raw 텍스트 필드만
 * 첫날부터 0 으로 막는다.
 */

/** 접근 이름 — 셋 중 하나는 타입이 요구한다. 이름 없는 필드는 오정보다. */
type FieldNameProps =
  | { label: ReactNode; "aria-label"?: string; labelledBy?: never }
  | { label?: undefined; "aria-label": string; labelledBy?: never }
  | { label?: undefined; "aria-label"?: undefined; labelledBy: string };

interface FieldCommonProps {
  size?: FieldSize;
  frame?: FieldFrame;
  /** 필드 아래 안내 한 줄 — `aria-describedby` 로 배선된다. */
  hint?: ReactNode;
  /** 오류 한 줄 — `aria-invalid` + `aria-describedby` + `role="alert"`. */
  error?: ReactNode;
  /** 래퍼(자리잡기·폭)의 몫 — 규격은 여기 넣지 않는다. */
  className?: string;
}

function useFieldWiring(idProp: string | undefined, hint: ReactNode, error: ReactNode) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint != null ? `${id}-hint` : undefined;
  const errorId = error != null ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return { id, hintId, errorId, describedBy };
}

function FieldShell({
  id,
  label,
  labelledBy,
  className,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  id: string;
  label?: ReactNode;
  labelledBy?: string;
  className?: string;
  hint?: ReactNode;
  hintId?: string;
  error?: ReactNode;
  errorId?: string;
  children: ReactNode;
}) {
  void labelledBy;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label != null ? (
        <label htmlFor={id} className={fieldLabel()}>
          {label}
        </label>
      ) : null}
      {children}
      {error != null ? (
        <p id={errorId} role="alert" className="text-body text-[color:var(--color-status-danger)]">
          {error}
        </p>
      ) : null}
      {hint != null ? (
        <p id={hintId} className="text-label leading-label text-[color:var(--color-text-quaternary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = FieldCommonProps &
  FieldNameProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size" | "aria-label">;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, labelledBy, size, frame, hint, error, className, id: idProp, ...rest },
  ref,
) {
  const { id, hintId, errorId, describedBy } = useFieldWiring(idProp, hint, error);
  return (
    <FieldShell {...{ id, label, labelledBy, className, hint, hintId, error, errorId }}>
      <input
        ref={ref}
        id={id}
        aria-labelledby={labelledBy}
        aria-invalid={error != null ? true : undefined}
        aria-describedby={describedBy}
        className={fieldClass({ size, frame })}
        {...rest}
      />
    </FieldShell>
  );
});

export type TextareaProps = FieldCommonProps &
  FieldNameProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "aria-label">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, labelledBy, size, frame, hint, error, className, id: idProp, ...rest },
  ref,
) {
  const { id, hintId, errorId, describedBy } = useFieldWiring(idProp, hint, error);
  return (
    <FieldShell {...{ id, label, labelledBy, className, hint, hintId, error, errorId }}>
      <textarea
        ref={ref}
        id={id}
        aria-labelledby={labelledBy}
        aria-invalid={error != null ? true : undefined}
        aria-describedby={describedBy}
        className={fieldClass({ multiline: true, size, frame })}
        {...rest}
      />
    </FieldShell>
  );
});
