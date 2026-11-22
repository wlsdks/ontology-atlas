"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { CloudDownload, FolderOpen, Search } from "lucide-react";

import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import type { FileManager } from "../../model/sources/file-manager";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/**
 * The empty Library, top-anchored so a block that arrives later moves nothing above it. Found files
 * in this folder lead above the drop area; the folder line names the one place sources live; a code
 * folder's files stay a quiet suggestion below it. This active panel owns h1.
 */
export function LibraryStartStage({
  folderName,
  inApp,
  fileManager,
  agentName,
  agentNote,
  wikiOnly,
  busy,
  foundShown,
  found,
  dropArea,
  suggestion,
  onFindDocuments,
  onImportFromService,
  onReveal,
  t,
}: {
  /** The folder's name, never its path. */
  folderName: string;
  inApp: boolean;
  fileManager: FileManager;
  /** The connected agent's name, or null for the generic words. */
  agentName: string | null;
  /** The no-agent line in the app, the browser line on the web, or nothing. */
  agentNote: ReactNode;
  wikiOnly: boolean;
  busy: boolean;
  /** Found documents already name the folder and open the find dialog, so the folder block steps aside. */
  foundShown: boolean;
  found: ReactNode;
  dropArea: ReactNode;
  suggestion: ReactNode;
  onFindDocuments: () => void;
  onImportFromService: () => void;
  onReveal: () => void;
  t: LibraryT;
}) {
  const fileManagerName = t("start.fileManagerName", { fileManager });
  const quietChip = controlClass({
    shape: "chip",
    size: "md",
    tone: "secondary",
    hoverInk: "strong",
    hoverBorder: "strong",
    className: "gap-1.5",
  });
  return (
    <div data-testid="library-start-stage" className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t("start.title")}</h1>
        <p className="text-body-lg text-[color:var(--color-text-secondary)]">
          {wikiOnly
            ? t("start.bodyWikiOnly")
            : t("start.body", { agent: agentName ?? t("start.agentFallback") })}
        </p>
        {agentNote}
      </header>
      {found}
      {dropArea}
      {foundShown ? null : <div data-testid="library-start-where" className="flex flex-col gap-2">
        <p className="text-body text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]">
          {inApp
            ? t("start.where", { folder: folderName, fileManagerName })
            : t("start.whereWeb", { folder: folderName })}
        </p>
        <p className="text-label text-[color:var(--color-text-tertiary)]">{t("start.copyNote")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {inApp ? (
            <button type="button" onClick={onReveal} data-testid="library-start-reveal" className={quietChip}>
              <FolderOpen size={ICON_SIZE.sm} aria-hidden />
              {t("start.reveal", { fileManager })}
            </button>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              onFindDocuments();
            }}
            disabled={busy}
            data-testid="library-start-find-documents"
            className={quietChip}
          >
            <Search size={ICON_SIZE.sm} aria-hidden />
            {t("sources.find")}
          </button>
        </div>
      </div>}
      {suggestion}
      <footer className="flex flex-col items-start gap-2 border-t border-[color:var(--color-divider)] pt-4">
        <p data-testid="library-start-privacy" className="text-label text-[color:var(--color-text-tertiary)]">{t("start.privacy")}</p>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onImportFromService();
          }}
          disabled={busy}
          data-testid="library-start-import"
          title={t("sources.importTooltip")}
          className={controlClass({ shape: "link", tone: "accent", hoverInk: "strong", className: "gap-1.5" })}
        >
          <CloudDownload size={ICON_SIZE.sm} aria-hidden />
          {t("sources.import")}
        </button>
      </footer>
    </div>
  );
}
