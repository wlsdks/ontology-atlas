"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/shared/lib/cn";
import { fieldClass, fieldLabel, type FieldFrame, type FieldSize } from "./control-class";
import { RowDisclosure } from "./row-disclosure";

/**
 * Behaviour layer of a form field, not styling: a required accessible name, and
 * one `error`/`hint` prop that wires `aria-invalid`, `aria-describedby` (error first)
 * and `role="alert"` through `useId`. The className is `fieldClass(...)` verbatim, asserted by
 * a contract; `field-adoption-ratchet` holds raw text fields in new files at 0.
 */

/** The type requires one of the three; a nameless field does not compile. */
type FieldNameProps =
  | { label: ReactNode; "aria-label"?: string; labelledBy?: never }
  | { label?: undefined; "aria-label": string; labelledBy?: never }
  | { label?: undefined; "aria-label"?: undefined; labelledBy: string };

interface FieldCommonProps {
  size?: FieldSize;
  frame?: FieldFrame;
  /** One line of guidance, wired through `aria-describedby`. */
  hint?: ReactNode;
  /** Wired through `aria-invalid`, `aria-describedby` and `role="alert"`. */
  error?: ReactNode;
  /** Placement and width only; spec values do not go here. */
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
  const [shownError, setShownError] = useState(error);
  if (error != null && error !== shownError) setShownError(error);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label != null ? (
        <label htmlFor={id} className={fieldLabel()}>
          {label}
        </label>
      ) : null}
      <div className="flex flex-col">
        {children}
        <RowDisclosure open={error != null} id={`${id}-error-box`} className="pt-1">
          <p id={errorId} role="alert" className="text-body text-[color:var(--color-status-danger)]">
            {shownError}
          </p>
        </RowDisclosure>
      </div>
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
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "aria-label"> & {
    /**
     * Grows with the text from the `rows` floor to `maxRows`, then scrolls; the height is set
     * from `scrollHeight` on every value change.
     */
    autoGrow?: boolean;
    maxRows?: number;
  };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, labelledBy, size, frame, hint, error, className, id: idProp, autoGrow = false, maxRows, ...rest },
  ref,
) {
  const { id, hintId, errorId, describedBy } = useFieldWiring(idProp, hint, error);
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const value = rest.value;
  useLayoutEffect(() => {
    if (!autoGrow) return;
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 20;
    const chrome =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const ceiling = maxRows ? maxRows * line + (Number.isFinite(chrome) ? chrome : 0) : Number.POSITIVE_INFINITY;
    const next = Math.min(el.scrollHeight, ceiling);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > ceiling ? "auto" : "hidden";
  }, [autoGrow, maxRows, value]);
  return (
    <FieldShell {...{ id, label, labelledBy, className, hint, hintId, error, errorId }}>
      <textarea
        ref={setRefs}
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
