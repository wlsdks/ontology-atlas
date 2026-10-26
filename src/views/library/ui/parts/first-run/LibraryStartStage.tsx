"use client";

import { ActionFeedbackGlyph, type ActionFeedbackState } from '@/shared/motion/action-feedback-glyph';
import { useLocale, type useTranslations } from "next-intl";
import { CloudDownload, FilePlus2, Search } from "lucide-react";

import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { PAGE_COLUMN_STAGE, PAGE_LEDE, PAGE_TITLE } from "@/shared/ui/tokens/page-frame";

import { libraryEyebrowClass } from "../../../lib/page-eyebrow";

/**
 * An empty folder is an empty state, not a popup: with no sources and no pages the index is empty
 * too and would repeat the same doors, so this stage owns the whole screen. The doors are ordered by
 * how far away the document is. This active panel owns h1.
 */
export function LibraryStartStage({
  vaultLabel,
  busy,
  onAddFiles,
  addFilesFeedback = 'idle',
  onFindDocuments,
  onImportFromService,
  t,
}: {
  /** The folder's absolute path in the app, its handle name on the web. */
  vaultLabel: string;
  busy: boolean;
  onAddFiles: () => void;
  addFilesFeedback?: ActionFeedbackState;
  onFindDocuments: () => void;
  /** Opens the service picker: documents that are not on this computer yet. */
  onImportFromService: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const locale = useLocale();
  return (
    /*
     * The card is anchored by the stage column, a dashed edge and the first overlay; dashed because the
     * stage's last line says a folder is also a place to drop files.
     */
    <div
      data-testid="library-start-stage"
      className={`${PAGE_COLUMN_STAGE} rounded-panel border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]`}
    >
      <p className={libraryEyebrowClass(locale)}>
        {t("eyebrow")}
      </p>
      {/* The page headline pair (`text-display` / `leading-display`), not the card-title one: here the
         heading is the state and the rail carries the destination's name. */}
      <h1 className={`mt-1 break-keep ${PAGE_TITLE}`}>
        {t("emptyTitle")}
      </h1>
      <p className={`mt-2 ${PAGE_LEDE}`}>
        {t("emptyBody")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {/*
          **Hierarchy is one ink step, and the hover comes from the axes.** The first door
          is the one this stage exists to offer, so it is `strong` where its sibling is
          `muted` — the same device step two of the guide uses for Compile, and for the
          same reason recorded there: an indigo tint pair is a hand-written hover the value
          layer deliberately does not carry, and the `hover-axis-adoption-ratchet` counts
          every new one. The stage's emphasis is its title; the doors are two ways on.
        */}
        <button
          type="button"
          onClick={onAddFiles}
          disabled={busy}
          data-testid="library-start-add-files"
              aria-busy={addFilesFeedback === 'working' || undefined}
          className={controlClass({
            shape: "chip",
            size: "lg",
            tone: "strong",
            hoverSurface: "lift",
            hoverBorder: "strong",
            className: "gap-1.5",
          })}
        >
          <ActionFeedbackGlyph state={addFilesFeedback} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} />
          {t("sources.add")}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onFindDocuments();
          }}
          disabled={busy}
          data-testid="library-start-find-documents"
          className={controlClass({
            shape: "chip",
            size: "lg",
            tone: "muted",
            hoverInk: "strong",
            hoverBorder: "strong",
            className: "gap-1.5",
          })}
        >
          <Search size={ICON_SIZE.sm} aria-hidden />
          {t("sources.find")}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onImportFromService();
          }}
          disabled={busy}
          data-testid="library-start-import"
          title={t("sources.importTooltip")}
          className={controlClass({
            shape: "chip",
            size: "lg",
            tone: "muted",
            hoverInk: "strong",
            hoverBorder: "strong",
            className: "gap-1.5",
          })}
        >
          <CloudDownload size={ICON_SIZE.sm} aria-hidden />
          {t("sources.import")}
        </button>
      </div>
      {/* The folder is the interface, and this is the moment to say so. The label is an
          absolute path in the app: one unbroken run of slashes that `keep-all` alone
          would carry past the column edge. */}
      <p
        data-testid="library-start-drop"
        className="mt-4 text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all] [overflow-wrap:anywhere]"
      >
        {t("sources.dropHint", { folder: vaultLabel })}
      </p>
    </div>
  );
}
