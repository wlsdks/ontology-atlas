"use client";

import { useTranslations } from "next-intl";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useFirstRunSampleModeSettled } from "../model/use-first-run-sample-mode-settled";

export interface FirstRunReadoutProps {
  /**
   * How many concepts are **on the canvas right now**
   * (`TopologyMapV2#onDrawnCountChange`), not how many the vault holds. The
   * readout used to open with the project count, which is 1 in every vault
   * anyone has opened and told the reader nothing.
   */
  conceptCount: number;
  /** Every concept the vault holds — the denominator that decides whether zooming still has anything to reveal. */
  totalConceptCount: number;
  domainCount: number;
  /**
   * M-5 — the current semantic-zoom altitude tier, reported by the map engine
   * (`TopologyMapV2#onZoomTierChange`). Drives the readout's orientation label
   * (SPINE → CIRCUIT → ELEMENT) and, once elements are actually on screen
   * ("element"), drops the now-false "zoom in to see elements" hint. Defaults
   * to "spine" (the overview entry) when the map hasn't reported yet.
   */
  tier?: "spine" | "circuit" | "element";
  /**
   * In plain (non-developer) mode the element tier is pushed into an unreachable band
   * (`PLAIN_TIER_REVEAL`), so zooming never reveals elements. "Zoom in to see
   * elements" is therefore always false in this mode, so it is replaced with the
   * click-based plain wording regardless of `tier` (not dropped — that guidance is
   * always valid in this mode).
   */
  audiencePlain?: boolean;
}

/**
 * The bottom-right instrument readout — "125 concepts · 9 domains", plus the zoom
 * tier and its hint while zooming still has something to reveal (approved contract: `first-run-v3-flagship.html` `.readout`). It
 * replaced the previous round's bottom open-source strip: v3 turned that slot into a
 * map orientation indicator, since the "about, macOS app, GitHub" links are already
 * covered by the existing chrome and settings gear.
 *
 * The tier label and zoom hint used to be one frozen string
 * (`readout.hint` = "Spine view · zoom in to see elements"). It stayed that way even
 * at maximum zoom with element nodes on screen — an orientation instrument that lies.
 * The label now tracks the live `tier`, and the "zoom in to see elements" hint shows
 * only while elements are NOT yet revealed (spine / circuit); at the element tier it
 * is dropped.
 *
 * Unlike `useFirstRunStarter`'s `visible` (= sample mode settled && !dismissed), this
 * is not tied to dismiss — closing the get-started module still leaves a useful
 * orientation indicator while browsing the static sample (the same persistence the
 * previous open-source strip had).
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
  // This readout's grammar (mono + uppercase + wide tracking) is a normal signal in
  // latin but in Korean only widens the space glyphs, reading as "Large Stem View"
  // (measured tracking 1.8px). The condition is made per locale — English is unchanged.
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");

  if (!visible) return null;

  /*
   * **Nothing left to reveal, nothing left to say.** The tier label and the zoom
   * hint describe a rule ("Domains only", "zoom in to reveal elements"); they are
   * only true while the rule is still holding something back. In the Cone view it
   * never is — every concept is drawn at every zoom — so the readout stood under
   * 125 visible dots and said "DOMAINS ONLY · ZOOM IN TO REVEAL ELEMENTS"
   * (measured 2026-09-05). The count itself now decides, so no view has to
   * remember to opt out.
   */
  const everythingDrawn = totalConceptCount > 0 && conceptCount >= totalConceptCount;
  const tierLabel = t(`tier_${tier}`);
  // At the element tier the "zoom in to see elements" promise is already fulfilled —
  // showing it would be a lie. Below it, keep the guidance.
  // In plain mode the tier verdict itself is meaningless (zooming can never reach an
  // element), so it always shows and only the wording becomes click-based.
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
