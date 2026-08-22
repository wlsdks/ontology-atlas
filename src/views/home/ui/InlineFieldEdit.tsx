"use client";

import { useState } from "react";
import { Check, PencilLine, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { controlClass, fieldClass } from "@/shared/ui/control-class";

/**
 * Inline edit primitive for one frontmatter field (domain, for example), turning
 * a drawer row between read, edit, and save/cancel. Labels arrive as props, the
 * same pattern the drawer uses, so this stays independent of `useTranslations`.
 */
export interface InlineFieldEditLabels {
  /** The field's name, e.g. "domain". */
  field: string;
  /** aria for the button that enters edit mode. */
  edit: string;
  save: string;
  cancel: string;
  placeholder: string;
  /** Shown in read mode when the value is an empty string. */
  empty: string;
  /** Shown while saving. */
  saving: string;
}

export function InlineFieldEdit({
  value,
  onSave,
  labels,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  labels: InlineFieldEditLabels;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setDraft(value);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };
  const commit = async () => {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2" data-testid="inline-field-read">
        <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          {labels.field}
        </span>
        <span
          className={
            value
              ? "text-body text-[color:var(--color-text-secondary)]"
              : "text-body italic text-[color:var(--color-text-quaternary)]"
          }
        >
          {value || labels.empty}
        </span>
        <button
          type="button"
          onClick={beginEdit}
          aria-label={labels.edit}
          data-testid="inline-field-edit-button"
          className={controlClass({ hoverInk: 'strong', hoverSurface: 'lift',
            shape: "icon",
            size: "sm",
            tone: "muted",
            className: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
          })}
        >
          <PencilLine size={ICON_SIZE.sm} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" data-testid="inline-field-edit">
      <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
        {labels.field}
      </span>
      <input
        type="text"
        value={draft}
        autoFocus
        disabled={saving}
        placeholder={labels.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          else if (e.key === "Escape") cancel();
        }}
        aria-label={labels.field}
        data-testid="inline-field-input"
        className={fieldClass({ size: "sm", className: "min-w-0 flex-1" })}
      />
      <button
        type="button"
        onClick={() => void commit()}
        disabled={saving}
        aria-label={labels.save}
        data-testid="inline-field-save"
        className={controlClass({
          shape: "icon",
          size: "md",
          tone: "accentOnTint",
          className:
            "border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        <Check size={ICON_SIZE.sm} aria-hidden />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        aria-label={labels.cancel}
        data-testid="inline-field-cancel"
        className={controlClass({ hoverInk: 'strong',
          shape: "icon",
          size: "md",
          tone: "muted",
          className: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        <X size={ICON_SIZE.sm} aria-hidden />
      </button>
    </div>
  );
}
