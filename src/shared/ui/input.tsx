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
} from "react";

import { cn } from "@/shared/lib/cn";
import { fieldClass, fieldLabel, type FieldFrame, type FieldSize } from "./control-class";

/**
 * Input / Textarea — the **behaviour layer** of a form field (ratified
 * 2026-08-15 by the design-systems seat).
 *
 * **It does not exist for styling.** Adoption of the value layer (`fieldClass`)
 * was already complete — 0 text fields bypassed it, and the form-debt ratchet was
 * declared closed. What this component carries is **wiring**:
 *
 * 1. **A required accessible name** — the type demands one of `label` (wired via
 *    htmlFor), `aria-label`, or `labelledBy`. A nameless field does not compile.
 * 2. **Automatic error/hint wiring** — the founding inventory found
 *    `aria-invalid` at 7 sites, `aria-describedby` at 11, and `role="alert"`
 *    across 14 files, all hand-wired and all in different patterns. One
 *    `error`/`hint` prop now wires `aria-invalid`, `aria-describedby` (error
 *    first) and `role="alert"` together through `useId`, which is the gate when
 *    an agent assembles a form in an extracted repo.
 *
 * **Values live only in the value layer.** The input's className is the result of
 * `fieldClass(...)` **verbatim**, and a contract test asserts byte equality. Zero
 * new axes, zero new tokens and zero pixel movement were the conditions of
 * ratification. The `spellCheck` default is left alone too — slugs, paths and
 * keys are a per-site judgement.
 *
 * **Existing direct `fieldClass` calls are not debt.** They already comply with
 * the value layer, so no migration is forced (a ledger declared closed is not
 * reopened). The `field-adoption-ratchet` holds raw text fields in **new files**
 * at 0 from day one.
 */

/** Accessible name — the type requires one of the three. A nameless field is misinformation. */
type FieldNameProps =
  | { label: ReactNode; "aria-label"?: string; labelledBy?: never }
  | { label?: undefined; "aria-label": string; labelledBy?: never }
  | { label?: undefined; "aria-label"?: undefined; labelledBy: string };

interface FieldCommonProps {
  size?: FieldSize;
  frame?: FieldFrame;
  /** One line of guidance below the field, wired through `aria-describedby`. */
  hint?: ReactNode;
  /** One line of error text — `aria-invalid` + `aria-describedby` + `role="alert"`. */
  error?: ReactNode;
  /** The wrapper's placement and width — spec values do not go here. */
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
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "aria-label"> & {
    /**
     * Grow with the text (owner, 2026-09-06: the relation reason field was three lines
     * for a sentence that ran to five). `rows` stays the floor; `maxRows` is the ceiling,
     * after which the field scrolls inside itself. Height is set from `scrollHeight` on
     * every value change, so a paste and a deletion both land on the right size.
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
