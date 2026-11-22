"use client";

import type { useTranslations } from "next-intl";
import { BookText, Sparkles } from "lucide-react";

import type { LibraryWriteUpLink } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { RowButton } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { AgentDoor } from "../agent/AgentDoor";
import { PANE_LIST_BLEED, PANE_ROW_INSET } from "./source-pane-layout";

/** The pages that cite this source and whether each still matches its bytes, or the way to write the first one. */
export function SourceWriteUps({
  writeUps, onOpenWiki, onCompile, compileNote, compileBlocked, agentDoor, busy, t,
}: {
  writeUps: readonly LibraryWriteUpLink[];
  onOpenWiki: (slug: string) => void;
  onCompile: () => void;
  /** The one fact true of pressing Compile: why it cannot run, or what leaves this computer. */
  compileNote: string | null;
  /** Whether the press is refused; the note above says why. */
  compileBlocked: boolean;
  /** Whether that refusal earns a door to `/agents`: the caller decides on the route, not on the sentence. */
  agentDoor: boolean;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <div
      data-testid="library-source-writeups"
      className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4"
    >
      <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {t("source.viewWriteUp")}
      </p>
      {writeUps.length > 0 ? (
        <ul className={`mt-2 flex flex-col gap-0.5 ${PANE_LIST_BLEED}`}>
          {writeUps.map((page) => (
            <li key={page.slug}>
              <RowButton
                onClick={() => onOpenWiki(page.slug)}
                data-testid={`library-source-writeup-${page.slug}`}
                /*
                 * The title is what a reader sees; the slug is the address. This pane prints the source's own `Path`,
                 * so it is the one place a person copies exact vault paths, and the page's path stays reachable.
                 */
                title={page.slug}
                tone="muted"
                className={`${PANE_ROW_INSET} hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]`}
              >
                <BookText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
                {/* Not yet measured is a third answer, not a quieter `behind`; it must match the STATE row. */}
                <span
                  className={cn(
                    "flex-none",
                    page.freshness === "current" &&
                      "text-[color:var(--color-success-text-a90)]",
                    /* Same amber as the index chip; the word, not the colour, separates `partial` from `behind`. */
                    page.freshness === "partial" &&
                      "text-[color:var(--color-amber-source-a90)]",
                    page.freshness === "behind" &&
                      "text-[color:var(--color-amber-source-a90)]",
                    page.freshness === "unchecked" &&
                      "text-[color:var(--color-text-quaternary)]",
                  )}
                >
                  {t(`source.writeUp.${page.freshness}`)}
                </span>
              </RowButton>
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
              disabled={busy || compileBlocked}
              data-testid="library-source-compile"
              className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
            >
              <Sparkles size={ICON_SIZE.sm} aria-hidden />
              {t("wiki.compile")}
            </button>
          </div>
          {compileNote ? (
            <p
              data-testid="library-transfer"
              className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
            >
              {compileNote}
            </p>
          ) : null}
          {/*
             The door, when the note says a coding agent is missing rather than what leaves this computer;
             the caller says which.
           */}
          {compileNote && compileBlocked && agentDoor ? (
            <div className="flex">
              <AgentDoor testId="library-source-compile-blocked-door" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
