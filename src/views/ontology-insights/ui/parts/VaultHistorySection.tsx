"use client";

import type { useTranslations } from "next-intl";

import type { VaultHistoryState } from "../../lib/use-vault-history";
import { vaultLayerMilestones, type VaultLayer } from "../../lib/vault-history";
import { VaultHistoryTracks } from "./VaultHistoryTracks";
import { VaultPresentStack } from "./VaultPresentStack";
import { InsightsSectionTitle } from "./InsightsSectionTitle";

/**
 * **The weekly counts, or the honest reason there are none.**
 *
 * Four states and three of them draw no chart. That ratio is the point: the series is
 * recomputed from the folder's Git history and Atlas keeps no record of its own, so there
 * are ordinary, blameless situations in which there is nothing to show — the web, where
 * the bridge cannot reach a repository, and a folder nobody has committed in.
 *
 * ⚠️ **"No history" is never drawn as zeroes.** A flat line along the bottom is a claim
 * about the person ("you did nothing") where the truth is a claim about the data ("nothing
 * was recorded"). The PO steward made this a condition of the surface existing at all, and
 * the probe that justified it found the same shape in the data: this repository's own
 * folder shows `wiki` at 0 for its whole history, because the Library shipped three days
 * ago. A zero that means zero and a zero that means "no data" have to look different.
 */
export function VaultHistorySection({
  state,
  t,
}: {
  state: VaultHistoryState;
  t: ReturnType<typeof useTranslations<"ontologyPages.insights">>;
}) {
  const frame = (children: React.ReactNode) => (
    <section
      data-testid="vault-history"
      data-state={state.status}
      aria-label={t("vaultHistory.title")}
      className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      {/*
        One column for the header and the figure together. Eighteen weekly columns stretched
        across a full-width band merged into an area; capped, they read as the countable
        stacks they are — and a header spanning the whole card above a narrower figure reads
        as two unrelated things, so the title and the caption take the figure's own edges.
      */}
      {/*
        ⚠️ **Left-aligned on the card's padding line, not centred** (2026-09-25). Centred, the
        whole composition started 304px (1512) and 380px (1920) inside the panel's edge while
        every other panel on the board starts its text at the padding, so this was the one card
        whose title stood on its own vertical line. The weekly tracks keep their width cap (the
        reason above still holds for them); the present piles take the card's full width.
      */}
      <div
        className={`flex w-full flex-col ${state.status === "ready" ? "max-w-[var(--vault-history-width)]" : ""}`}
      >
      {/*
        The caption shares the title's line only where there is a line to share. Measured at
        390x844 the two fought for one row and the caption broke into two lines pressed
        against the heading, which put a mono aside at the heading's own optical weight. It
        takes its own row below that width instead.
      */}
      <div className="flex flex-col gap-1 @min-[640px]/insights:flex-row @min-[640px]/insights:items-baseline @min-[640px]/insights:gap-2">
        <InsightsSectionTitle
          level={2}
          className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]"
        >
          {t("vaultHistory.title")}
        </InsightsSectionTitle>
        {/*
          ⚠️ **The source line only appears over the figure it describes.** "Recomputed from
          Git history" sat above the present walls in every state, including the one whose
          own body says the history cannot be read here — so on the web it was a claim about
          something not on screen, directly above a sentence contradicting it (design-lead,
          2026-09-09). The present is counted from paths; only the weekly tracks come from
          Git, and only they carry the line.
        */}
        {state.status === "ready" ? (
          <span className="font-mono text-label text-[color:var(--color-text-quaternary)] @min-[640px]/insights:ml-auto">
            {t("vaultHistory.caption")}
          </span>
        ) : null}
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
      </div>
    </section>
  );

  /*
   * The present, drawn wherever the past cannot be. It is a different claim, not a weaker
   * one: how much the folder holds, counted from paths this instant, asserting nothing
   * about when. The sentence saying why there is no time axis sits **under** it, because
   * the folder is the subject and the missing history is the footnote — the first build had
   * that the other way round and a browser reader met an explanation of an absence with
   * nothing above it.
   */
  const stack = (
    <VaultPresentStack
      present={state.present}
      labels={{
        layer: {
          concept: t("vaultHistory.layerConcept"),
          module: t("vaultHistory.layerModule"),
          writeUp: t("vaultHistory.layerWriteUp"),
          document: t("vaultHistory.layerDocument"),
        },
        towerSummary: (layer, count) => t("vaultHistory.towerSummary", { layer, count }),
        scaleNote: (count) => t("vaultHistory.scaleNote", { count }),
      }}
    />
  );

  if (state.status === "loading") {
    return frame(
      <div className="flex flex-col gap-3">
        {stack}
        <p className="text-label text-[color:var(--color-text-tertiary)]">
          {t("vaultHistory.loading")}
        </p>
      </div>,
    );
  }

  // Narrowed to `unavailable | none` by the branch above. Both draw the folder as it stands
  // and then say, in their own words, why the weeks are missing — and the difference between
  // them is whose limitation that is.
  if (state.status !== "ready") {
    const key =
      state.status === "unavailable"
        ? "unavailable"
        : state.status === "failed"
          ? "failed"
          : "none";
    return frame(
      <div className="flex flex-col gap-4">
        {stack}
        <div className="flex flex-col gap-1 border-t border-[color:var(--color-border-soft)] pt-3">
          <p className="text-body text-[color:var(--color-text-primary)]">
            {t(`vaultHistory.${key}Title` as "vaultHistory.noneTitle")}
          </p>
          <p className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {t(`vaultHistory.${key}Body` as "vaultHistory.noneBody")}
          </p>
        </div>
      </div>,
    );
  }

  /*
   * ⚠️ **A curve says the direction; it cannot say the date.** Nobody reads a week off a
   * column forty pixels wide, so the two facts the series can state exactly are stated in
   * words beside it: the week a layer first existed, and the week it grew the most. Both are
   * read off the same points the chart draws, so a milestone can never disagree with the
   * shape above it, and a layer with nothing to report says nothing rather than a dash.
   */
  const milestones = (["concept", "module", "writeUp", "document"] as VaultLayer[])
    .map((layer) => vaultLayerMilestones(state.weeks, layer))
    .filter((m) => m.began || m.grew);

  return frame(
    <VaultHistoryTracks
      weeks={state.weeks}
      peak={state.peak}
      labels={{
        layer: {
          concept: t("vaultHistory.layerConcept"),
          module: t("vaultHistory.layerModule"),
          writeUp: t("vaultHistory.layerWriteUp"),
          document: t("vaultHistory.layerDocument"),
        },
        trackSummary: (layer, latest, earliest) =>
          t("vaultHistory.trackSummary", { layer, latest, earliest }),
        scaleNote: (count) => t("vaultHistory.scaleNote", { count }),
        axisStart: t("vaultHistory.axisStart"),
        axisEnd: t("vaultHistory.axisEnd"),
      }}
      milestones={
        milestones.length > 0 ? (
          <ul
            data-testid="vault-history-milestones"
            className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[color:var(--color-border-soft)] pt-3 text-label text-[color:var(--color-text-tertiary)]"
          >
            {milestones.map((m) => (
              <li key={m.layer} className="[word-break:keep-all]">
                <span className="text-[color:var(--color-text-secondary)]">
                  {t(`vaultHistory.layer${m.layer === "concept" ? "Concept" : m.layer === "module" ? "Module" : m.layer === "writeUp" ? "WriteUp" : "Document"}` as "vaultHistory.layerConcept")}
                </span>{" "}
                {m.began
                  ? t("vaultHistory.milestoneBegan", { week: m.began.week })
                  : null}
                {m.began && m.grew ? " · " : null}
                {m.grew
                  ? t("vaultHistory.milestoneGrew", { week: m.grew.week, delta: m.grew.delta })
                  : null}
              </li>
            ))}
          </ul>
        ) : null
      }
    />,
  );
}
