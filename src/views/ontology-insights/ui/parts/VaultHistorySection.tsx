"use client";

import type { useTranslations } from "next-intl";

import type { VaultHistoryState } from "../../lib/use-vault-history";
import { vaultLayerMilestones, type VaultLayer } from "../../lib/vault-history";
import { VaultHistoryTracks } from "./VaultHistoryTracks";
import { VaultPresentStack } from "./VaultPresentStack";
import { InsightsSectionTitle } from "./InsightsSectionTitle";

/**
 * The weekly counts, or the honest reason there are none. The series is recomputed from Git and Atlas keeps no
 * record of its own, so the web and a folder without commits show no chart. No history is never drawn as zeroes:
 * a flat line claims "you did nothing" where the truth is "nothing was recorded".
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
      {/* One column for header and figure: capped weekly columns read as countable stacks, and the header takes the
         figure's edges. */}
      {/* Left-aligned on the card's padding line like every other panel. The weekly tracks keep their width cap; the
         present piles take the full width. */}
      <div
        className={`flex w-full flex-col ${state.status === "ready" ? "max-w-[var(--vault-history-width)]" : ""}`}
      >
      {/* The caption shares the title's row only from 640; below that it takes its own row. */}
      <div className="flex flex-col gap-1 @min-[640px]/insights:flex-row @min-[640px]/insights:items-baseline @min-[640px]/insights:gap-2">
        <InsightsSectionTitle
          level={2}
          className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]"
        >
          {t("vaultHistory.title")}
        </InsightsSectionTitle>
        {/* The Git source line appears only over the weekly tracks it describes; the present is counted from paths. */}
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

  // The present, drawn wherever the past cannot be: how much the folder holds, counted from paths now. The sentence
  // about the missing time axis sits under it, since the folder is the subject.
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

  // Narrowed to `unavailable
  // none` by the branch above; both draw the folder as it stands and then say whose
  // limitation hides the weeks.
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

  // Milestones in words beside the chart: the week a layer first existed and the week it grew most, from the same
  // points the chart draws. A layer with nothing to report says nothing.
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
