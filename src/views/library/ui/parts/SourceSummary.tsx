"use client";

import type { useTranslations } from "next-intl";
import { FileText, FolderOpen, Download } from "lucide-react";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

/**
 * **What the reader can honestly show for a file it has never opened.**
 *
 * A raw source is kept verbatim and is deliberately never parsed, so there is no body to
 * render — a PDF, a spreadsheet and an exported page have nothing in common that a
 * Markdown reader could draw. Rendering "nothing" would be the wrong answer twice over:
 * it looks broken, and it hides the four facts Atlas really does hold about the file.
 *
 * So the pane states them: what it is called, what it is, how big it is, whether the
 * bytes still match what anybody wrote up, and which pages cite it. Every one of those
 * came from the directory listing or from a hash Atlas measured; none required opening
 * the file.
 *
 * The one door is **put the person in front of the file**, and it differs by surface for
 * a reason rather than by convenience: the app reveals it in Finder — reveal, never open,
 * because Atlas launches no program on somebody's behalf — while a browser has no Finder
 * and no absolute path, so it hands over the bytes it was already granted.
 */
export function SourceSummary({
  row,
  hash,
  canReveal,
  onOpen,
  t,
}: {
  row: LibrarySourceRow;
  /** The measured sha256, or null when nothing has asked for one yet. */
  hash: string | null;
  /** True in the installed app, where the door reveals rather than downloads. */
  canReveal: boolean;
  onOpen: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const facts: Array<{ key: string; label: string; value: string; mono?: boolean }> = [
    { key: "path", label: t("source.path"), value: row.path, mono: true },
    {
      key: "format",
      label: t("source.format"),
      value: row.format ? row.format.toUpperCase() : t("sources.noFormat"),
    },
    { key: "size", label: t("source.size"), value: formatSourceBytes(row.bytes) },
    {
      key: "state",
      label: t("source.state"),
      value: t(`sources.state.${row.state}.label`),
    },
    {
      key: "hash",
      label: t("source.hash"),
      // Never a guess. An unmeasured hash says so rather than showing an empty cell that
      // reads as "no hash", which is a different and untrue fact.
      value: hash ?? t("source.hashUnmeasured"),
      // A hash is an identifier and sits in mono; the sentence that stands in for one is prose.
      mono: hash !== null,
    },
    {
      key: "citedBy",
      label: t("source.citedBy"),
      value: row.citedBy.length > 0 ? row.citedBy.join(", ") : t("source.citedByNobody"),
    },
  ];

  return (
    <div
      data-testid="library-source-summary"
      className="mx-auto w-full max-w-[760px] px-6 pt-8 md:px-10"
    >
      <div className="flex items-start gap-2">
        <FileText
          size={ICON_SIZE.md}
          aria-hidden
          className="mt-1 flex-none text-[color:var(--color-text-quaternary)]"
        />
        <h2 className="min-w-0 break-all text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
          {row.name}
        </h2>
      </div>
      <p className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {t("source.neverOpened")}
      </p>

      <dl className="mt-5 flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] pt-4">
        {facts.map((fact) => (
          <div key={fact.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <dt className="w-[132px] flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {fact.label}
            </dt>
            <dd
              className={`min-w-0 flex-1 break-all text-label text-[color:var(--color-text-secondary)] ${
                fact.mono ? "font-mono" : ""
              }`}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <button
          type="button"
          onClick={onOpen}
          data-testid="library-source-open"
          className={controlClass({ shape: "chip", tone: "muted", className: "gap-2" })}
        >
          {canReveal ? (
            <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <Download size={ICON_SIZE.sm} aria-hidden />
          )}
          {canReveal ? t("source.reveal") : t("source.download")}
        </button>
      </div>
    </div>
  );
}
