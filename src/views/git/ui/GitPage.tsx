"use client";

import { AtlasGitPanel, useAtlasGitContext } from "@/widgets/atlas-git-panel";

/**
 * History — the **destination** recording how vault documents changed (promoted 2026-07-25).
 *
 * **Why a destination rather than a modal.** It used to open as a 560px scrim modal from a utility tile
 * at the bottom of the rail. The owner asked for "Git added right under the LNB icons — one menu from
 * connecting through managing", and what this surface actually does (what changed → what should I
 * record → when did which meaning change) is **work you stay in and read**, which does not fit a 560px
 * modal.
 *
 * The promotion **absorbed the utility tile and the modal** — two entrances reproduce the same class of
 * confusion as the defect where the rail's icon count differed per page. The uncommitted-change count
 * moved to a warning badge on the destination icon (`AppNavRail`).
 *
 * **Audience.** The old tile did not render for `audiencePlain`. The destination is exposed to **every
 * audience** — "who changed what meaning and when" is information planners and executives read too, and
 * that is not development work. A rail whose item count varies by audience is itself that same class of
 * defect. (Audience gating of write actions is a separate slice; today the panel only branches
 * web/desktop.)
 *
 * **Current state.** The body still uses the existing `AtlasGitPanel`. The v2 mockup's two-column
 * layout (left: change list plus a sticky composer / right: an evidence pane ≥600px) is follow-up work —
 * this slice lands the route, the rail, and the absorption first so there is exactly one entrance.
 */
export function GitPage() {
  const { vaultPath, changeset, graph } = useAtlasGitContext();

  return (
    <main
      data-testid="git-page"
      // Height contract (2026-07-26 — the real root of the owner's "there is too much blank space").
      //
      // This destination **did not take** the height the shell offers and stood on `flex-1` alone. In
      // the old shell the vertical was the main axis, and a main-axis child's height comes from its
      // flex-basis (i.e. content), so with short content the page collapsed to content height.
      // Measured at 1920×1223: main was 554px — the rail's right divider and the canvas background
      // **stopped** halfway down the screen (y=554). The "800px of blank space" the owner saw was not an
      // empty page but **an area with no app in it**. It looked like a spacing problem and was a layout defect.
      //
      // The shell owns the viewport with `h-dvh` (AppShell), so the page takes that height with `h-full`
      // and handles scrolling inside — the same grammar as home and the docs surface.
      className="flex h-full flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      {/* Page frame — **the width cap belongs to the panel.**
          Measured correction 2026-08-02: this frame's `max-w-[1280px]` was squeezing the workbench. At
          1512×806 it used only 1216 of the available 1448 (232px idle), and inside that the two columns
          split 522 left / 600 right — **the attention winner (the timeline) was narrower than the
          secondary (evidence)**. The evidence column's 600px minimum (`--git-evidence-min`, based on 80
          columns of 11px mono) and a 1280 cap cannot both hold alongside left-column dominance, so one
          had to go, and the one to go is this cap.
          This file's original comment already had the answer — *"narrowing the width is the panel's
          job"*. Setup narrows itself with `--git-setup-measure` and the single column with
          `--git-single-measure`. */}
      <div className="mx-auto flex w-full min-h-0 flex-1 flex-col overflow-hidden px-4 pt-5 sm:px-8">
        <AtlasGitPanel
          vaultPath={vaultPath}
          sessionChangeset={changeset}
          graph={graph}
          className="flex-1"
        />
      </div>
    </main>
  );
}
