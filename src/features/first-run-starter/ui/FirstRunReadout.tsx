"use client";

import { useTranslations } from "next-intl";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useFirstRunSampleModeSettled } from "../model/use-first-run-sample-mode-settled";

export interface FirstRunReadoutProps {
  /**
   * Concepts on the canvas now (`OntologyMap#onDrawnCountChange`), not in the vault.
   */
  conceptCount: number;
  /** Decides whether zooming still has anything to reveal. */
  totalConceptCount: number;
  domainCount: number;
  /**
   * The semantic-zoom tier from `OntologyMap#onZoomTierChange`; drives the label and drops the
   * zoom hint at "element". Defaults to "spine" before the map reports.
   */
  tier?: "spine" | "circuit" | "element";
  /**
   * Plain mode never reveals elements by zooming (`PLAIN_TIER_REVEAL`), so the click-based
   * wording replaces the zoom hint regardless of `tier`.
   */
  audiencePlain?: boolean;
}

/**
 * The bottom-right readout: concept and domain counts plus the zoom tier and hint while zooming
 * still reveals something (`first-run-v3-flagship.html` `.readout`). Not tied to the module's
 * dismiss, so it stays while browsing the sample.
 */
export function FirstRunReadout({
  conceptCount,
  totalConceptCount,
  domainCount,
  tier = "spine",
  audiencePlain = false,
}: FirstRunReadoutProps) {
  const t = useTranslations("firstRunStarter.readout");
  const visible = useFirstRunSampleModeSettled();
  // Mono uppercase wide tracking only widens Korean spaces, so the eyebrow is per locale.
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");

  if (!visible) return null;

  /*
   * When every concept is already drawn the tier label and zoom hint are false, so the count
   * hides them and no view has to opt out.
   */
  const everythingDrawn = totalConceptCount > 0 && conceptCount >= totalConceptCount;
  const tierLabel = t(`tier_${tier}`);
  // At the element tier the zoom hint is already fulfilled. Plain mode can never reach an
  // element, so it always shows the hint with click-based wording.
  const showZoomHint = !everythingDrawn && (audiencePlain || tier !== "element");
  const zoomHintText = audiencePlain ? t("zoomHintPlain") : t("zoomHint");

  return (
    <div
      data-testid="first-run-readout"
      data-zoom-tier={tier}
      data-drawn-concepts={conceptCount}
      className={`pointer-events-none hidden items-center gap-3.5 text-caption text-[color:var(--color-text-quaternary)] md:flex ${eyebrow}`}
    >
      <span data-testid="first-run-readout-concepts">
        <span className="text-[color:var(--color-text-tertiary)]">{conceptCount}</span>{" "}
        {t("conceptUnit")}
      </span>
      <Dot />
      <span>
        <span className="text-[color:var(--color-text-tertiary)]">{domainCount}</span>{" "}
        {t("domainUnit")}
      </span>
      {everythingDrawn ? null : (
        <>
          <Dot />
          <span data-testid="first-run-readout-tier">{tierLabel}</span>
        </>
      )}
      {showZoomHint ? (
        <>
          <Dot />
          <span data-testid="first-run-readout-zoom-hint">{zoomHintText}</span>
        </>
      ) : null}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-text-quaternary)]"
    />
  );
}
