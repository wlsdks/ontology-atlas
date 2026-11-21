"use client";

import { ActionFeedbackGlyph, type ActionFeedbackState } from '@/shared/motion/status-glyphs/ActionFeedbackGlyph';
import type { MouseEvent } from "react";
import type { useTranslations } from "next-intl";
import { CloudDownload, FilePlus2, Search } from "lucide-react";

import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Button, FeatureStage } from "@/shared/ui";

import { LibraryCitedWikiArtwork } from "./LibraryCitedWikiArtwork";

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
  foundCount = 0,
  onFindDocuments,
  onImportFromService,
  t,
}: {
  /** The folder's absolute path in the app, its handle name on the web. */
  vaultLabel: string;
  busy: boolean;
  onAddFiles: () => void;
  addFilesFeedback?: ActionFeedbackState;
  /** Documents already in the opened folder or its connected code folder; above zero they lead the doors. */
  foundCount?: number;
  onFindDocuments: () => void;
  /** Opens the service picker: documents that are not on this computer yet. */
  onImportFromService: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const found = foundCount > 0;
  const openFinder = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    onFindDocuments();
  };
  const addDoor = (
    <button
      type="button"
      onClick={onAddFiles}
      disabled={busy}
      data-testid="library-start-add-files"
      aria-busy={addFilesFeedback === 'working' || undefined}
      className={controlClass({
        shape: "chip",
        size: "lg",
        tone: found ? "muted" : "strong",
        ...(found ? { hoverInk: "strong" as const } : { hoverSurface: "lift" as const }),
        hoverBorder: "strong",
        className: "gap-1.5",
      })}
    >
      <ActionFeedbackGlyph state={addFilesFeedback} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} />
      {t("sources.add")}
    </button>
  );
  const importDoor = (
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
  );
  return (
    <FeatureStage
      data-testid="library-start-stage"
      titleAs="h1"
      art={state => <LibraryCitedWikiArtwork {...state} sourcesLabel={t("kindSourcesTitle")} wikiLabel={t("kindWikiTitle")} />}
      title={t("emptyTitle")}
      body={found ? t("emptyFoundBody", { count: foundCount }) : t("emptyBody")}
      action={found ? (
        <div className="flex flex-col items-center gap-3">
          <Button size="lg" disabled={busy} data-testid="library-start-find-documents" data-found-count={foundCount} onClick={openFinder}>
            <Search size={ICON_SIZE.lg} aria-hidden />
            {t("emptyFoundAction", { count: foundCount })}
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {addDoor}
            {importDoor}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {addDoor}
          <button
            type="button"
            onClick={openFinder}
            disabled={busy}
            data-testid="library-start-find-documents"
            data-found-count={foundCount}
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
          {importDoor}
        </div>
      )}
      /* The label is an absolute path in the app: one unbroken run that `keep-all` alone would carry past the column edge. */
      note={<span data-testid="library-start-drop" className="[word-break:keep-all] [overflow-wrap:anywhere]">{t("sources.dropHint", { folder: vaultLabel })}</span>}
    />
  );
}
