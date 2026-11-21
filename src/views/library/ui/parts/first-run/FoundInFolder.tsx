"use client";

import type { useTranslations } from "next-intl";
import { Copy, ListChecks } from "lucide-react";

import { Button } from "@/shared/ui";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

export interface FoundInFolderSummary {
  count: number;
  /** Discovery stopped at its cap, so the count is a floor. */
  truncated: boolean;
  /** First folder below the open folder, by how many found files each holds. */
  folders: { name: string; count: number }[];
}

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
      <h2 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
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
          onClick={onChoose}
          disabled={busy}
          data-testid="library-found-choose"
          className={controlClass({ shape: "chip", size: "lg", tone: "secondary", hoverInk: "strong", hoverBorder: "strong", className: "gap-1.5" })}
        >
          <ListChecks size={ICON_SIZE.sm} aria-hidden />
          {t("found.choose")}
        </button>
      </div>
      <p className="text-label text-[color:var(--color-text-tertiary)]">{t("start.found.basis")}</p>
    </section>
  );
}
