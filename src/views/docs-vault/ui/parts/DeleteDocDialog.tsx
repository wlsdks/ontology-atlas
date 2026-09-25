"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { VaultConflictError } from "@/entities/vault-session";
import { useFailureSentence, type FailureCopy } from "@/shared/lib/use-failure-sentence";
import { useHeldValue } from "@/shared/lib/use-presence";
import { Button, Dialog } from "@/shared/ui";

export interface DeleteDocTarget {
  slug: string;
  title: string;
  /** The documents that still point here, by the name each one is shown by. */
  referrers: ReadonlyArray<{ slug: string; title: string }>;
}

/** How many referrers the warning names before it counts the rest. */
const REFERRERS_NAMED_MAX = 3;

/**
 * **A delete names what it leaves pointing at nothing** (2026-09-26, map-edit QA D7 and D9).
 *
 * Deleting was a native `window.confirm` reading only the title, the path and "this cannot be
 * undone", reachable from the command palette alone — and it removed a document three others
 * still listed in their `dependencies:` without a word. The references are left in place,
 * as MCP `delete_concept` leaves them when a person confirms past its backlink check
 * (`force: true`): they are the person's record of a relation, not the app's to erase. So
 * the confirmation names them before anything is removed, and the referrer's own page flags
 * the missing target afterwards (`DocFrontmatterBlock`).
 *
 * `role="alertdialog"` because the body is the warning, and `initialFocus="container"` keeps
 * the caret off the destructive button (`Dialog`'s own note for exactly this case).
 */
export function DeleteDocDialog({
  target,
  onCancel,
  onConfirm,
}: {
  /** The document to delete; null closes the dialog. */
  target: DeleteDocTarget | null;
  onCancel: () => void;
  /** Deletes the document; rejects with the reason when the vault refuses. */
  onConfirm: () => Promise<void>;
}) {
  const held = useHeldValue(target, target?.slug ?? null);
  return (
    <Dialog
      open={target !== null}
      onClose={onCancel}
      role="alertdialog"
      labelledBy="docs-delete-dialog-title"
      testId="docs-delete-dialog"
      initialFocus="container"
    >
      {held ? (
        <DeleteBody key={held.slug} target={held} onCancel={onCancel} onConfirm={onConfirm} />
      ) : null}
    </Dialog>
  );
}

function DeleteBody({
  target,
  onCancel,
  onConfirm,
}: {
  target: DeleteDocTarget;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("docsVault.deleteDialog");
  const failureSentence = useFailureSentence();
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<FailureCopy | null>(null);
  const named = target.referrers.slice(0, REFERRERS_NAMED_MAX);
  const unnamed = target.referrers.length - named.length;

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (error) {
      setFailure(
        error instanceof VaultConflictError
          ? { sentence: t("errorConflict"), detail: error.message }
          : failureSentence(error, t("errorFailed")),
      );
      setDeleting(false);
    }
  }

  return (
    <>
      <h2
        id="docs-delete-dialog-title"
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t("title", { title: target.title })}
      </h2>
      <p className="mt-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
        {t("body", { path: `${target.slug}.md` })}
      </p>
      {target.referrers.length > 0 ? (
        <div
          data-testid="docs-delete-referrers"
          data-count={target.referrers.length}
          className="mt-3 rounded-micro border border-[color:var(--color-amber-docs-a18)] bg-[color:var(--color-amber-source-a08)] px-3 py-2.5 text-label leading-prose text-[color:var(--color-amber-docs-a92)]"
        >
          <p>{t("referrers", { count: target.referrers.length })}</p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[color:var(--color-text-secondary)]">
            {named.map((referrer) => (
              <li key={referrer.slug} className="truncate" title={referrer.slug}>
                {referrer.title}
              </li>
            ))}
            {unnamed > 0 ? (
              <li className="text-[color:var(--color-text-tertiary)]">{t("referrersMore", { count: unnamed })}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {failure ? (
        <p
          role="alert"
          data-testid="docs-delete-failure"
          data-failure-detail={failure.detail ?? undefined}
          className="mt-3 text-label leading-prose text-[color:var(--color-status-danger)]"
        >
          {failure.sentence}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" disabled={deleting} onClick={onCancel} data-testid="docs-delete-cancel">
          {t("cancel")}
        </Button>
        <Button
          variant="danger"
          data-confirm-step
          disabled={deleting}
          onClick={() => void confirm()}
          data-testid="docs-delete-confirm"
        >
          {deleting ? t("confirming") : t("confirm")}
        </Button>
      </div>
    </>
  );
}
