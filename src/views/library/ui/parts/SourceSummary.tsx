"use client";

import type { useTranslations } from "next-intl";
import { BookText, FileText, FolderOpen, Download, Sparkles } from "lucide-react";

import {
  formatSourceBytes,
  type LibrarySourceRow,
  type LibraryWriteUpLink,
} from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
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
 *
 * ## The second door: what was made of it (owner, 2026-09-06)
 *
 * The original and the write-up must be separate things a person can move between, and
 * this pane held only one half of that: `Cited by` was a fact in a list, spelled as
 * slugs, that a reader could not press. It is now the row **View write-up**, and each
 * page says whether it still matches these bytes — a write-up citing an older version of
 * this file is exactly the case where following the link matters most, and the one a
 * plain list of names cannot tell apart.
 *
 * When nothing cites the file, the row is **Compile** instead, because "no wiki page yet"
 * describes a gap whose cure is one press. It is disabled with its own reason wherever
 * that press cannot happen, never silently absent: on this pane the person arrived by
 * choosing this very file, so a missing step is a dead end rather than tidiness.
 */
export function SourceSummary({
  row,
  hash,
  canReveal,
  writeUps,
  onOpen,
  onOpenWiki,
  onCompile,
  compileBlockedReason,
  busy,
  t,
}: {
  row: LibrarySourceRow;
  /** The measured sha256, or null when nothing has asked for one yet. */
  hash: string | null;
  /** True in the installed app, where the door reveals rather than downloads. */
  canReveal: boolean;
  /** Pages citing this file, and whether each still matches its bytes. */
  writeUps: readonly LibraryWriteUpLink[];
  onOpen: () => void;
  onOpenWiki: (slug: string) => void;
  onCompile: () => void;
  /** The exact reason Compile cannot run now, or null when it can. */
  compileBlockedReason: string | null;
  busy: boolean;
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

      <div
        data-testid="library-source-writeups"
        className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4"
      >
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t("source.viewWriteUp")}
        </p>
        {writeUps.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {writeUps.map((page) => (
              <li key={page.slug}>
                <button
                  type="button"
                  onClick={() => onOpenWiki(page.slug)}
                  data-testid={`library-source-writeup-${page.slug}`}
                  /*
                   * **The title is what a reader sees; the slug is still the address.**
                   * Every other surface addresses a wiki page by its title, so a row of
                   * slugs here would be a second vocabulary for one thing. But this pane
                   * is the one place a person copies exact vault paths — it prints the
                   * source's own `Path` two rows up — so the page's path stays reachable
                   * rather than becoming information only the index has.
                   */
                  title={page.slug}
                  className={controlClass({
                    shape: "chip",
                    tone: "muted",
                    className: "max-w-full gap-1.5",
                  })}
                >
                  <BookText size={ICON_SIZE.sm} aria-hidden />
                  <span className="min-w-0 truncate">{page.title}</span>
                  {/*
                   * Whether the page still describes *these* bytes is the fact that
                   * decides whether following it is worth the reader's time — and
                   * "nothing has measured this file yet" is a third answer, not a
                   * quieter version of "behind". Printing it as behind made this pane
                   * disagree with its own STATE row, which reads `checking` in exactly
                   * that window (PO steward, 2026-09-06).
                   */}
                  <span
                    className={cn(
                      "flex-none",
                      page.freshness === "current" &&
                        "text-[color:var(--color-success-text-a90)]",
                      page.freshness === "behind" &&
                        "text-[color:var(--color-amber-source-a90)]",
                      page.freshness === "unchecked" &&
                        "text-[color:var(--color-text-quaternary)]",
                    )}
                  >
                    {t(`source.writeUp.${page.freshness}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
              {t("source.citedByNobody")}
            </p>
            <div>
              <button
                type="button"
                onClick={onCompile}
                disabled={busy || compileBlockedReason !== null}
                data-testid="library-source-compile"
                className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
              >
                <Sparkles size={ICON_SIZE.sm} aria-hidden />
                {t("wiki.compile")}
              </button>
            </div>
            {compileBlockedReason ? (
              <p
                data-testid="library-source-compile-blocked"
                className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
              >
                {compileBlockedReason}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
