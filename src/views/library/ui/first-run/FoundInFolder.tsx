"use client";

import type { useTranslations } from "next-intl";
import { Copy, ListChecks } from "lucide-react";

import { Button } from "@/shared/ui";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { FoundInFolderSummary } from "../../model/sources/use-library-sources";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/** A placeholder no catalogue string can contain, so the chips sit where `{folderCounts}` is. */
const CHIPS_AT = "\u0000";

/**
 * Documents the person already put in this folder lead: the count, the folders they are in, and
 * one Copy all. Choosing opens the find dialog with the same files.
 */
export function FoundInFolder({
  found,
  folderName,
  busy,
  onCopyAll,
  onChoose,
  t,
}: {
  found: FoundInFolderSummary;
  folderName: string;
  busy: boolean;
  onCopyAll: () => void;
  onChoose: () => void;
  t: LibraryT;
}) {
  const [before, after = ""] = t("found.where", { folder: folderName, folderCounts: CHIPS_AT }).split(CHIPS_AT);
  return (
    <section
      data-testid="library-found-in-folder"
      data-found-count={found.count}
      className="motion-stagger-fade flex w-full flex-col gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-5 py-4"
    >
      {/* The promise that no file was opened rides on the title, so the card keeps one line under it. */}
      <h2 title={t("start.found.basis")} className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {found.truncated ? t("found.titleTruncated", { count: found.count }) : t("found.title", { count: found.count })}
      </h2>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-body text-[color:var(--color-text-secondary)]">
        <span>{before.replace(/\s*·\s*$/, "")}</span>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span className="contents" data-testid="library-found-folders">
          {found.folders.map((folder) => (
            <span
              key={folder.name}
              data-testid="library-found-folder"
              className={badgeClass({ shape: "tag", className: "h-6 gap-1 border border-[color:var(--color-border-soft)] text-[color:var(--color-text-secondary)]" })}
            >
              {t("found.folderCount", { folder: folder.name, count: folder.count })}
            </span>
          ))}
        </span>
        {after.trim() ? <span>{after}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="md" disabled={busy} onClick={onCopyAll} data-testid="library-found-copy-all">
          <Copy size={ICON_SIZE.md} aria-hidden />
          {t("found.copyAll", { count: found.count })}
        </Button>
        <button
          type="button"
          onClick={(event) => {
            /* A click that did not focus the button (Safari) still needs a place for the dialog to return focus. */
            event.currentTarget.focus({ preventScroll: true });
            onChoose();
          }}
          disabled={busy}
          data-testid="library-found-choose"
          className={controlClass({ shape: "chip", size: "lg", tone: "secondary", hoverInk: "strong", hoverBorder: "strong", className: "gap-1.5" })}
        >
          <ListChecks size={ICON_SIZE.sm} aria-hidden />
          {t("found.choose")}
        </button>
      </div>
    </section>
  );
}
