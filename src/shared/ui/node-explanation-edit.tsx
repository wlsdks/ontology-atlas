"use client";

import { useState } from "react";
import { Check, PencilLine, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { fieldClass } from '@/shared/ui/control-class';
import { controlClass } from '@/shared/ui/control-class';

/**
 * Read ↔ edit ↔ save primitive for a node's explanation, i.e. its prose body
 * (multiline).
 *
 * Ontology-first: a node's body *is* its explanation, and a person or an AI agent
 * fills it in directly from the topology full-detail widget. Saving belongs to the
 * caller, which uses `replaceVaultBody` + `saveDoc` to replace the body while
 * preserving the frontmatter. Labels are injected as props, keeping this component
 * pure. It lives in `shared/ui` because FSD forbids a widget importing from a view,
 * so the `full-detail-a1` widget could not reach its original home in
 * `views/home/ui`.
 *
 * Charter compliance: neutrals plus a single indigo, no glow or scale. Cmd/Ctrl+Enter
 * saves and Esc cancels (this is a textarea, so Enter inserts a newline).
 */
export interface NodeExplanationEditLabels {
  heading: string;
  edit: string;
  save: string;
  cancel: string;
  placeholder: string;
  empty: string;
  saving: string;
}

export function NodeExplanationEdit({
  value,
  onSave,
  labels,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  labels: NodeExplanationEditLabels;
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
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div data-testid="node-explanation-read">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {labels.heading}
          </span>
          <button
            type="button"
            onClick={beginEdit}
            aria-label={labels.edit}
            data-testid="node-explanation-edit-button"
            className={controlClass({ hoverInk: 'strong', hoverSurface: 'lift', shape: "icon", size: "xs", tone: "muted", className: "h-6 w-6 rounded-full" })}
          >
            <PencilLine size={ICON_SIZE.sm} aria-hidden />
          </button>
        </div>
        <p
          className={
            value
              ? "mt-2 [overflow-wrap:anywhere] whitespace-pre-wrap text-body leading-body text-[color:var(--color-text-secondary)]"
              : "mt-2 text-body italic leading-body text-[color:var(--color-text-quaternary)]"
          }
        >
          {value || labels.empty}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="node-explanation-edit">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {labels.heading}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void commit()}
            disabled={saving}
            aria-label={labels.save}
            data-testid="node-explanation-save"
            className={controlClass({ shape: "icon", size: "xs", tone: "accentOnTint", className: "h-6 w-6 rounded-full border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]" })}
          >
            <Check size={ICON_SIZE.sm} aria-hidden />
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            aria-label={labels.cancel}
            data-testid="node-explanation-cancel"
            className={controlClass({ hoverInk: 'strong', shape: "icon", tone: "muted", className: "h-6 w-6 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
          >
            <X size={ICON_SIZE.sm} aria-hidden />
          </button>
        </div>
      </div>
      <textarea
        value={draft}
        autoFocus
        disabled={saving}
        rows={4}
        placeholder={labels.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
          else if (e.key === "Escape") cancel();
        }}
        aria-label={labels.heading}
        data-testid="node-explanation-input"
        className={fieldClass({ multiline: true, size: "md", className: "mt-2 w-full resize-y" })}
      />
    </div>
  );
}
