"use client";

import { useId } from "react";
import { useLocale, type useTranslations } from "next-intl";

import type { SourceCopyJob } from "@/features/library";
import { formatSize } from "@/shared/lib/format-size";
import { Button, Dialog, DialogBody, DialogFooter } from "@/shared/ui";

import { skippedByReason } from "./SourceCopyLine";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/** At or above 500 files or 500 MB, the count and size are asked about before anything is copied. */
export function LargeCopyConfirm({
  request,
  onConfirm,
  onCancel,
  t,
}: {
  request: { files: number; totalBytes: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
  t: LibraryT;
}) {
  const locale = useLocale();
  const titleId = useId();
  return (
    <Dialog open={request !== null} onClose={onCancel} size="sm" labelledBy={titleId} testId="library-copy-confirm" initialFocus="none">
      <div className="flex flex-col gap-5">
        <p id={titleId} className="text-body-lg text-[color:var(--color-text-primary)]">
          {request ? t("drop.confirmLarge", { count: request.files, size: formatSize(request.totalBytes, locale) }) : null}
        </p>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="library-copy-confirm-cancel">{t("drop.cancel")}</Button>
          <Button size="sm" onClick={onConfirm} autoFocus data-testid="library-copy-confirm-copy">{t("drop.confirm")}</Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}

/** The names behind the skipped line, grouped by the reason it gave; centred, nothing folded. */
export function SkippedFilesDialog({
  job,
  open,
  onClose,
  t,
}: {
  job: SourceCopyJob | null;
  open: boolean;
  onClose: () => void;
  t: LibraryT;
}) {
  const titleId = useId();
  const groups = job ? skippedByReason(job) : [];
  return (
    <Dialog open={open && job !== null} onClose={onClose} size="md" labelledBy={titleId} testId="library-skipped-files">
      <div className="flex max-h-[min(70vh,36rem)] flex-col gap-4">
        <h2 id={titleId} className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {job ? t("drop.skipped", { count: job.skipped.length }) : null}
        </h2>
        <DialogBody className="flex flex-col gap-4 pr-1">
          {groups.map(({ reason, count }) => (
            <section key={reason} data-testid="library-skipped-group" data-reason={reason} className="flex flex-col gap-1.5">
              <h3 className="text-body text-[color:var(--color-text-secondary)]">
                {t("drop.reasonCount", { reason: t(`drop.skippedReasons.${reason}`), count })}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {(job?.skipped ?? []).filter((row) => row.reason === reason).map((row) => (
                  <li key={`${reason}:${row.name}`} className="text-label text-[color:var(--color-text-tertiary)] [overflow-wrap:anywhere]">
                    {row.name.normalize("NFC")}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("find.close")}</Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
