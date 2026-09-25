"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { VaultConflictError } from "@/entities/vault-session";
import { slugify } from "@/shared/lib/slugify";
import { useFailureSentence, type FailureCopy } from "@/shared/lib/use-failure-sentence";
import { useHeldValue } from "@/shared/lib/use-presence";
import { Button, Dialog } from "@/shared/ui";
import { Input } from "@/shared/ui/input";

export interface RenameDocTarget {
  slug: string;
  title: string;
  /** How many documents point here — their references move with the file. */
  referrerCount: number;
}

/**
 * **Rename is a door on the page, and it asks for a name** (2026-09-26, map-edit QA D9).
 *
 * Renaming lived only in the command palette, behind a typed query, and answered with the
 * browser's own `window.prompt` asking for a "document address (no extension)": an unstyled
 * light box outside the product's dialog system, asking a person for a slug path. This asks
 * for a new name in the product's `Dialog` (scrim, focus trap, Escape, focus return) and shows
 * the address that name becomes before anything moves. The folder stays: a rename changes the
 * file's name, not where it is filed (a kind change moves folders, `kind-folder-move.ts`).
 *
 * The name becomes an address through `slugify`, the rule new documents are named by, so a
 * name typed here and a name typed into "create" land the same way. The move itself is the
 * caller's (`renameDoc` with `rewriteBacklinks`), and a refusal is shown here in the reader's
 * language, never the vault layer's English.
 */
export function RenameDocDialog({
  target,
  isTaken,
  onCancel,
  onConfirm,
}: {
  /** The document to rename; null closes the dialog. */
  target: RenameDocTarget | null;
  /** Whether another document already lives at an address. */
  isTaken: (slug: string) => boolean;
  onCancel: () => void;
  /** Moves the document; rejects with the reason when the vault refuses. */
  onConfirm: (nextSlug: string) => Promise<void>;
}) {
  // Held through the exit so the panel does not fade out around an empty box.
  const held = useHeldValue(target, target?.slug ?? null);
  return (
    <Dialog
      open={target !== null}
      onClose={onCancel}
      labelledBy="docs-rename-dialog-title"
      testId="docs-rename-dialog"
    >
      {held ? (
        <RenameForm
          key={held.slug}
          target={held}
          isTaken={isTaken}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

function splitAddress(slug: string): { dir: string; name: string } {
  const at = slug.lastIndexOf("/");
  return at === -1 ? { dir: "", name: slug } : { dir: slug.slice(0, at + 1), name: slug.slice(at + 1) };
}

function RenameForm({
  target,
  isTaken,
  onCancel,
  onConfirm,
}: {
  target: RenameDocTarget;
  isTaken: (slug: string) => boolean;
  onCancel: () => void;
  onConfirm: (nextSlug: string) => Promise<void>;
}) {
  const t = useTranslations("docsVault.renameDialog");
  const failureSentence = useFailureSentence();
  const { dir, name: currentName } = splitAddress(target.slug);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<FailureCopy | null>(null);

  const nextName = slugify(name).replace(/^-+|-+$/g, "");
  const nextSlug = `${dir}${nextName}`;
  const unchanged = nextSlug === target.slug;
  // Validation speaks only once there is something to judge: the untouched name is not an error.
  const problem = !nextName
    ? name.trim()
      ? t("errorNoLetters")
      : t("errorEmpty")
    : unchanged
      ? null
      : nextSlug.toLowerCase() === target.slug.toLowerCase()
        ? t("errorCaseOnly")
        : isTaken(nextSlug)
          ? t("errorTaken", { path: `${nextSlug}.md` })
          : null;
  const canConfirm = !saving && !unchanged && problem === null;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canConfirm) return;
    setSaving(true);
    setFailure(null);
    try {
      await onConfirm(nextSlug);
    } catch (error) {
      setFailure(
        error instanceof VaultConflictError
          ? { sentence: t("errorConflict"), detail: error.message }
          : failureSentence(error, t("errorFailed")),
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <h2
        id="docs-rename-dialog-title"
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t("title")}
      </h2>
      <p className="mt-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
        {t("body", { title: target.title })}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <Input
          label={t("nameLabel")}
          className="w-full"
          value={name}
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value);
            setFailure(null);
          }}
          data-testid="docs-rename-input"
          error={problem ?? undefined}
          hint={
            problem
              ? undefined
              : unchanged
                ? t("addressCurrent", { path: `${target.slug}.md` })
                : t("addressHint", { path: `${nextSlug}.md` })
          }
        />
        <p
          data-testid="docs-rename-referrers"
          className="text-label leading-prose text-[color:var(--color-text-tertiary)]"
        >
          {target.referrerCount > 0
            ? t("referrers", { count: target.referrerCount })
            : t("referrersNone")}
        </p>
        {failure ? (
          <p
            role="alert"
            data-testid="docs-rename-failure"
            data-failure-detail={failure.detail ?? undefined}
            className="text-label leading-prose text-[color:var(--color-status-danger)]"
          >
            {failure.sentence}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" disabled={saving} onClick={onCancel} data-testid="docs-rename-cancel">
          {t("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={!canConfirm} data-testid="docs-rename-confirm">
          {saving ? t("confirming") : t("confirm")}
        </Button>
      </div>
    </form>
  );
}
