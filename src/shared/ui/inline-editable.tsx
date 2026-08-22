"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/shared/lib/cn";
import { fieldClass } from '@/shared/ui/control-class';

interface Props {
  /** Current value — shown in view mode, seeded into edit mode. */
  value: string;
  /** When false, clicking does not enter edit mode. */
  editable: boolean;
  /** Called on commit (Enter or blur). Not called when the value is unchanged. */
  onSave: (next: string) => void | Promise<void>;
  /**
   * The tag to render. Edit mode swaps in an input/textarea, so this exists to keep
   * view mode at the same block level and preserve the surrounding layout.
   */
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  /** textarea when true, input when false. */
  multiline?: boolean;
  className?: string;
  /** Placeholder shown in view mode when the value is empty. */
  placeholder?: string;
  /** Whether an empty value may be saved. When false (default) an empty submit cancels. */
  allowEmpty?: boolean;
  /** Accessible name for screen readers. */
  ariaLabel?: string;
  /** E2E id, applied to both the view and the edit element. */
  dataTestId?: string;
}

/**
 * Click → edit in place → commit on Enter/blur, cancel on Esc.
 *
 * The building block for the Notion/Obsidian expectation that a space you own is
 * editable on the spot: an owner reading their own project detail page can fix the
 * `h1` and the description without leaving it.
 *
 * Handling a failed save is the caller's job (`onSave`). This component swallows
 * the throw rather than propagating it and returns to view mode.
 */
export function InlineEditable({
  value,
  editable,
  onSave,
  as = "span",
  multiline = false,
  className,
  placeholder = "Click to edit",
  allowEmpty = false,
  ariaLabel,
  dataTestId,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync an externally changed value (live subscription and the like) only while not editing.
  useEffect(() => {
    if (!editing) queueMicrotask(() => setDraft(value));
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    el?.focus();
    // Selection applies to the input case only.
    if (el && "select" in el && typeof el.select === "function") {
      el.select();
    }
  }, [editing, multiline]);

  const enterEdit = () => {
    if (!editable || saving) return;
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    if (!next && !allowEmpty) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      // The caller reports the failure (a toast, say); here we only return to view mode.
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDownEdit = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    // Single-line commits on Enter; multiline needs Cmd/Ctrl+Enter.
    if (e.key === "Enter") {
      if (multiline && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void commit();
    }
  };

  const handleKeyDownView = (e: KeyboardEvent<HTMLElement>) => {
    if (!editable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      enterEdit();
    }
  };

  if (!editable) {
    return renderView({
      as,
      content: value || placeholder,
      isEmpty: !value,
      className,
      interactive: false,
      onClick: undefined,
      onKeyDown: undefined,
      ariaLabel,
      dataTestId,
    });
  }

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: () => void commit(),
      onKeyDown: handleKeyDownEdit,
      "aria-label": ariaLabel,
      "data-testid": dataTestId,
      className: fieldClass({ multiline: true, size: "sm", className: cn("w-full", className) }),
    };
    if (multiline) {
      return (
        <textarea
          ref={textareaRef}
          rows={3}
          {...sharedProps}
          className={cn(sharedProps.className, "resize-y leading-display")}
        />
      );
    }
    return <input ref={inputRef} {...sharedProps} />;
  }

  return renderView({
    as,
    content: value || placeholder,
    isEmpty: !value,
    className: cn(
      "cursor-text rounded-chip transition-colors hover:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a32)]",
      className,
    ),
    interactive: true,
    onClick: enterEdit,
    onKeyDown: handleKeyDownView,
    ariaLabel,
    dataTestId,
  });
}

function renderView({
  as,
  content,
  isEmpty,
  className,
  interactive,
  onClick,
  onKeyDown,
  ariaLabel,
  dataTestId,
}: {
  as: NonNullable<Props["as"]>;
  content: ReactNode;
  isEmpty: boolean;
  className?: string;
  interactive: boolean;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  ariaLabel?: string;
  dataTestId?: string;
}) {
  // ariaLabel has to reach view mode too: with `role=button`, a screen reader must
  // be able to say which field this button edits. It was previously destructured
  // but never spread, leaving view mode with no accessible name.
  const commonProps = {
    className,
    "data-testid": dataTestId,
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    ...(interactive
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick,
          onKeyDown,
        }
      : {}),
  };
  const rendered = isEmpty ? (
    <span className="text-[color:var(--color-text-quaternary)]">{content}</span>
  ) : (
    content
  );
  switch (as) {
    case "h1":
      return <h1 {...commonProps}>{rendered}</h1>;
    case "h2":
      return <h2 {...commonProps}>{rendered}</h2>;
    case "h3":
      return <h3 {...commonProps}>{rendered}</h3>;
    case "p":
      return <p {...commonProps}>{rendered}</p>;
    case "div":
      return <div {...commonProps}>{rendered}</div>;
    case "span":
    default:
      return <span {...commonProps}>{rendered}</span>;
  }
}
