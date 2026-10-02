"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/shared/lib/cn";
import { isImeComposing } from "@/shared/lib/ime-composition";
import { fieldClass } from '@/shared/ui/control-class';

interface Props {
  /** Shown in view mode and seeded into edit mode. */
  value: string;
  editable: boolean;
  /** Called on commit (Enter or blur), not when the value is unchanged. */
  onSave: (next: string) => void | Promise<void>;
  /** Keeps view mode at the same block level as the edit field it swaps in. */
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  multiline?: boolean;
  className?: string;
  /** Shown in view mode when the value is empty. */
  placeholder?: string;
  /** When false (default), an empty submit cancels. */
  allowEmpty?: boolean;
  ariaLabel?: string;
  /** Applied to both the view and the edit element. */
  dataTestId?: string;
}

/**
 * Click to edit in place, commit on Enter or blur, cancel on Escape. A failed save is the
 * caller's to report: the throw is swallowed and view mode returns.
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

  useEffect(() => {
    if (!editing) queueMicrotask(() => setDraft(value));
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    el?.focus();
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
      // The caller reports the failure; here we only return to view mode.
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
    const isCommitKey =
      e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey) && !isImeComposing(e);
    if (isCommitKey) {
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
    className,
    interactive: true,
    onClick: enterEdit,
    onKeyDown: handleKeyDownView,
    ariaLabel,
    dataTestId,
  });
}

const EDITABLE_VIEW_CLASS =
  "cursor-text rounded-chip transition-colors hover:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a32)]";

const HEADING_TAGS = new Set<NonNullable<Props["as"]>>(["h1", "h2", "h3"]);

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
  // `ariaLabel` names the field for the edit input only. In view mode the content stays the
  // accessible name, and a button view carries the field name as its description.
  const buttonProps = interactive
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick,
        onKeyDown,
        ...(ariaLabel ? { "aria-description": ariaLabel } : {}),
      }
    : {};
  const rendered = isEmpty ? (
    <span className="text-[color:var(--color-text-quaternary)]">{content}</span>
  ) : (
    content
  );
  /*
   * A heading keeps its tag and role when editable: the pressable surface is a block inside it,
   * because a button role on the host erased the heading from heading navigation.
   */
  if (interactive && HEADING_TAGS.has(as)) {
    const Heading = as as "h1" | "h2" | "h3";
    return (
      <Heading className={className} data-testid={dataTestId}>
        <span {...buttonProps} className={cn("block", EDITABLE_VIEW_CLASS)}>
          {rendered}
        </span>
      </Heading>
    );
  }
  const commonProps = {
    className: interactive ? cn(EDITABLE_VIEW_CLASS, className) : className,
    "data-testid": dataTestId,
    ...buttonProps,
  };
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
