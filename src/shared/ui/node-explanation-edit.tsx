"use client";

import { useEffect, useRef, useState } from "react";
import { Check, PencilLine, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { isImeComposing } from "@/shared/lib/ime-composition";
import { MARKDOWN_PROSE_CLASS } from "@/shared/ui/markdown-prose";
import { fieldClass } from '@/shared/ui/control-class';
import { controlClass } from '@/shared/ui/control-class';

/**
 * Read, edit and save for a node's prose body. Saving belongs to the caller, which keeps the
 * frontmatter; labels are props. In `shared/ui` because a widget cannot import from a view.
 * Cmd/Ctrl+Enter saves and Escape cancels; Enter inserts a newline.
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
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const beginEdit = () => {
    setDraft(value);
    setEditing(true);
  };
  const cancel = () => {
    restoreFocus.current = true;
    setEditing(false);
    setDraft(value);
  };
  /*
   * A refused save keeps the editor open with the draft; the caller says why, since this
   * primitive has no strings.
   */
  const commit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // The draft is still the person's, and the caller has reported the refusal.
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
            ref={editButton}
            type="button"
            onClick={beginEdit}
            aria-label={labels.edit}
            data-testid="node-explanation-edit-button"
            className={controlClass({ hoverInk: 'strong', hoverSurface: 'lift', shape: "icon", size: "xs", tone: "muted", className: "h-6 w-6 rounded-full" })}
          >
            <PencilLine size={ICON_SIZE.sm} aria-hidden />
          </button>
        </div>
        {/* Rendered, not transcribed: node bodies are Markdown. The textarea edits the source. */}
        {value ? (
          <div
            data-testid="node-explanation-rendered"
            className={cn(
              "mt-2 [overflow-wrap:anywhere] text-body leading-body text-[color:var(--color-text-secondary)]",
              MARKDOWN_PROSE_CLASS,
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="mt-2 text-body italic leading-body text-[color:var(--color-text-quaternary)]">
            {labels.empty}
          </p>
        )}
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
          if (e.key === "Escape") e.stopPropagation();
          if (isImeComposing(e)) return;
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
          else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label={labels.heading}
        data-testid="node-explanation-input"
        className={fieldClass({ multiline: true, size: "md", className: "mt-2 w-full resize-y" })}
      />
    </div>
  );
}
