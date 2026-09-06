"use client";

import type { useTranslations } from "next-intl";
import { FilePlus2, Search } from "lucide-react";

import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";

/**
 * **An empty folder is an empty state, not a popup** (owner, 2026-09-06).
 *
 * The owner opened the installed app on a folder with **no sources at all** and read the
 * result as broken: a 560px guide raised itself over the right 48% of the pane, lying
 * across the graph's own *"Nothing to draw yet…"* sentence, while the header counted
 * *0 sources · 0 pages · 0 concepts* and the strip said *Gather next · Compile waiting ·
 * Read waiting*. Four surfaces, all of them saying the folder is empty, one of them on
 * top of another.
 *
 * This repository already had the answer for "nothing to open yet": `PAGE_COLUMN_STAGE`,
 * the 640px column stood in the middle of the screen (2026-08-12, after the same owner
 * called a top-anchored empty state *"severely barren"*). The Library's own no-folder
 * branch has used it since the destination shipped. So a folder that is open but empty
 * gets the same grammar rather than an emptier copy of the workbench.
 *
 * ## Why the whole screen, and not just the right pane
 *
 * Because the index is empty too. With no sources and no pages its two lists carry their
 * own "nothing here yet" copy **and the same two doors as this stage** — measured on the
 * baseline frame, `Add files` and `Find documents` appeared twice in one viewport, 900px
 * apart. `LibraryPage`'s own no-folder branch already states the rule this follows: an
 * index of nothing beside a reader of nothing is two empty boxes asking one question.
 *
 * ## Anatomy
 *
 * Eyebrow, **one** title, one sentence, the two doors, and one quiet line naming the
 * folder the drop goes into. There is no second heading: a tie between an `h1` and an
 * `h2` reads as two titles, and the destination's own name is on the rail.
 */
export function LibraryStartStage({
  vaultLabel,
  busy,
  onAddFiles,
  onFindDocuments,
  t,
}: {
  /** The folder's absolute path in the app, its handle name on the web. */
  vaultLabel: string;
  busy: boolean;
  onAddFiles: () => void;
  onFindDocuments: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    /*
     * The card, not a band of three inks spread across the pane. The 2026-08-12 empty-state
     * verdict is that "barren" is about whether the block is anchored, and the repository's
     * one in-app answer (`DomainCouplingCard`) is this exact frame: the stage column, a
     * dashed edge and the first overlay. Dashed rather than solid because the last line of
     * this stage says a folder is also a place to drop files into.
     */
    <div
      data-testid="library-start-stage"
      className={`${PAGE_COLUMN_STAGE} rounded-panel border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]`}
    >
      <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {t("eyebrow")}
      </p>
      {/*
        **The page headline pair, not the card-title one** (design-lead, 2026-09-06). At
        `text-body-lg` nothing on this 1512×982 frame was larger than 14px, so the eye
        reached the door before it had read what the screen was — a title-to-caption ratio
        of 1.47 on a surface whose whole job is one sentence. `text-display` /
        `leading-display` is this repository's page-headline pair and takes it to 2.42.
        It is a step above the no-folder stage's own `h1`, and deliberately: there the
        heading is the destination's name with the state sentence under it, here the
        heading **is** the state and the rail carries the name.
      */}
      <h1 className="mt-1 text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {t("emptyTitle")}
      </h1>
      <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
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
          className={controlClass({
            shape: "chip",
            size: "lg",
            tone: "strong",
            hoverSurface: "lift",
            hoverBorder: "strong",
            className: "gap-1.5",
          })}
        >
          <FilePlus2 size={ICON_SIZE.sm} aria-hidden />
          {t("sources.add")}
        </button>
        <button
          type="button"
          onClick={onFindDocuments}
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
      </div>
      {/* The folder is the interface, and this is the moment to say so. The label is an
          absolute path in the app: one unbroken run of slashes that `keep-all` alone
          would carry past the column edge. */}
      <p
        data-testid="library-start-drop"
        className="mt-4 text-label leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all] [overflow-wrap:anywhere]"
      >
        {t("sources.dropHint", { folder: vaultLabel })}
      </p>
    </div>
  );
}
