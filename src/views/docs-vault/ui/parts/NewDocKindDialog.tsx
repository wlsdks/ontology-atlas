"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { Button, Dialog, OntologyMapKindGlyph, controlClass } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";
import { NEW_DOC_KINDS, type NewDocKind } from "../../model/use-doc-write-actions";

/**
 * Asks for the kind first, so every new document is a node. `project` has its own
 * flow at `/project/new`. `Dialog` owns scrim, trap, Escape, focus restore and motion.
 */
export function NewDocKindDialog({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (kind: NewDocKind, title: string) => Promise<string | undefined> | void;
  onClose: () => void;
}) {
  const t = useTranslations("docsVault.newDocDialog");
  const dialog = useTranslations("docsVault.dialog");
  const kindLabel = useOntologyKindLabel();
  const [kind, setKind] = useState<NewDocKind | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  function close() {
    if (saving) return;
    setKind(null);
    setTitle("");
    setError(undefined);
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind || !title.trim() || saving) return;
    setSaving(true);
    let problem: string | undefined | void;
    try {
      problem = await onSelect(kind, title.trim());
    } catch (err) {
      problem = dialog("createFailed", { message: err instanceof Error ? err.message : String(err) });
    }
    setSaving(false);
    if (problem) {
      setError(problem);
      return;
    }
    setKind(null);
    setTitle("");
    setError(undefined);
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} labelledBy="new-doc-kind-dialog-title">
      <p
        id="new-doc-kind-dialog-title"
        className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t("title")}
      </p>
      {!kind ? <>
      <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t("subtitle")}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {NEW_DOC_KINDS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => setKind(kind)}
              className={controlClass({ hoverBorder: 'strong',
                shape: "card",
                className: "w-full text-left",
              })}
            >
              <OntologyMapKindGlyph kind={kind} size={16} />
              <span className="text-body text-[color:var(--color-text-secondary)]">
                {kindLabel(kind)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={close}
        className={controlClass({ hoverInk: 'secondary',
          shape: "link",
          tone: "muted",
          className: "touch-hit-expand mt-3",
        })}
      >
        {t("cancel")}
      </button>
      </> : (
        <form onSubmit={(event) => void submit(event)} className="mt-4">
          <Input label={dialog("newDocTitlePrompt")} className="w-full" value={title}
            onChange={(event) => { setTitle(event.target.value); setError(undefined); }}
            error={error} autoFocus disabled={saving} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={saving}>{t("cancel")}</Button>
            <Button type="submit" variant="primary" disabled={saving || !title.trim()}>{t("create")}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
