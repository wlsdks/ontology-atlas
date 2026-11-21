"use client";

import type { CopyTranslate } from "../../lib/translator";
import { DocumentConfirmStep } from "../DocumentConfirmStep";

/**
 * Restore: this commit's content for one document, landing as an uncommitted change. The
 * confirm says it is reversible, whether uncommitted lines go with it, and which documents stay.
 */
export function RestoreDock({
  t,
  path,
  when,
  pending,
  others,
  busy,
  onRestore,
}: {
  t: CopyTranslate;
  path: string;
  when: string;
  pending: { added: number; removed: number } | null;
  others: number;
  busy: boolean;
  onRestore: (path: string, others: number) => Promise<boolean>;
}) {
  return (
    // Armed, the confirm takes the heading row's full width, under the heading it belongs to.
    <div
      className="flex min-w-0 flex-col gap-2 has-[[data-testid=atlas-git-restore-step]]:basis-full"
      data-testid="atlas-git-restore-dock"
    >
      <DocumentConfirmStep
        testIdPrefix="atlas-git-restore"
        doorLabel={t("restoreAction", { path })}
        confirmLabel={t("restoreButton")}
        busyLabel={t("restoreRunning")}
        cancelLabel={t("cancelButton")}
        tone="primary"
        busy={busy}
        onConfirm={() => onRestore(path, others)}
      >
        <p className="text-label leading-prose text-[color:var(--color-text-secondary)]">
          {t("restoreConfirmBody", { path, when })}
        </p>
        {pending && pending.added + pending.removed > 0 ? (
          <p className="text-label leading-prose text-[color:var(--color-danger-text)]">
            {t("restoreConfirmPending", { added: pending.added, removed: pending.removed })}
          </p>
        ) : null}
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("restoreConfirmLands")}
          {others > 0 ? ` ${t("restoreConfirmOthers", { count: others })}` : ""}
        </p>
      </DocumentConfirmStep>
    </div>
  );
}
