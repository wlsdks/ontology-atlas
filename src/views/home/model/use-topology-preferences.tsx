
import { useRelationVocabulary } from "@/entities/knowledge-graph";
import { useCanvasBackground, useExpand, useFootprint, useGalaxy, useGlyphSet, useMapArrangement, useTerritories, useView3d } from "@/shared/lib/appearance-preferences";
import { useAudiencePlain } from "@/shared/lib/audience-preference";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

export function useTopologyPreferences() {
  const tWorkbench = useTranslations('analysisWorkbench');
  const t = useTranslations('topology');
  const tMeaningEditor = useTranslations('meaningEditor');
  const reducedMotion = usePrefersReducedMotion();
  const siteT = useTranslations('metadata');
  /*
   * The same key insights shows in its flow tab. Reading it here rather than
   * receiving the text keeps one sentence in one place; two copies would drift
   * the first time a rule in it changed.
   */
  const businessFlowRequestText = useTranslations('ontologyPages.insights.flow')('request');
  // "The language on screen right now" for the create composer's per-locale
  // name-input contract.
  const activeLocale = useLocale();
  const tKinds = useTranslations('kinds');
  /* The help glossary owns these definitions; reading them here keeps one source (see
     `TopologyIndexTreeRowLabels.subcountsTitle`). */
  const tGlossary = useTranslations('searchWidgets.shortcuts.glossary');
  const kindCountsTitle = useMemo(
    () =>
      `${tGlossary('capabilityTerm')}: ${tGlossary('capabilityDefinition')} · ` +
      `${tGlossary('elementTerm')}: ${tGlossary('elementDefinition')} · ` +
      // The subcounts follow the containment spine, which holds a concept in one
      // place, so the caption has to say where a concept two domains reference
      // was counted — otherwise the two rows look like they disagree.
      `${tGlossary('sharedConceptNote')}`,
    [tGlossary],
  );
  const tTopologyKeyboardWalk = useTranslations('topologyWidgets.keyboardWalk');
  // aria-label/title for the history chrome-tile entry point below `lg`. Reuses
  // the same `atlasGit` keys `GitStatusTile` already uses.
  const tAtlasGit = useTranslations('atlasGit');
  const relationVocabulary = useRelationVocabulary();
  // Plain (non-developer) mode: a display lens only, never a data change. When on
  // it hides the element tier by default (a clicked node's ego is the exception),
  // switches to plain vocabulary, and hides path sub-info and developer chrome.
  // It reads a shared store rather than localStorage directly, because the shell's
  // history tile reads the same value — changing it in settings has to move the map
  // and the rail together.
  const [audiencePlain, setAudiencePlain] = useAudiencePlain();
  // Appearance preferences, all changed from the settings sheet. Each is read from
  // an app-wide store and handed down to the map canvas; the DOM glyphs subscribe
  // to the same store themselves, so both surfaces swap in lockstep.
  const canvasBackground = useCanvasBackground();
  // 3D view (2026-08-18, opt-in): either the ownership Cone tree or the relation-driven Cloud.
  const view3d = useView3d();
  const galaxy = useGalaxy();
  /** Territories — every capability named around its domain (`OntologyTerritoriesMap`). */
  const territories = useTerritories();
  /** Which structural question places nodes in 3D — see the `MapArrangement` doc-block. */
  const mapArrangement = useMapArrangement();
  const footprint = useFootprint();
  const glyphSet = useGlyphSet();
  const expand = useExpand();
  // The map surface's relation-vocabulary register. Plain mode uses the same
  // register as the datasheet.
  const relationRegister: "formal" | "plain" = audiencePlain ? "plain" : "formal";
  /**
   * One-argument relation naming for a consumer that only knows a type — the trail's step
   * captions. `relationVocabulary` is a fresh closure on every render (next-intl), so this
   * is not stable; the trail keeps the expensive half (scanning every edge) in its own
   * memo, and only the naming pass, at most one line per walked step, repeats.
   */
  const relationLabelInRegister = useCallback(
    (type: string) => relationVocabulary(type, relationRegister),
    [relationVocabulary, relationRegister],
  );
  return {
    expand, t, audiencePlain, setAudiencePlain, reducedMotion, tMeaningEditor, relationVocabulary,
    relationRegister, siteT, relationLabelInRegister, activeLocale, view3d, galaxy, territories, businessFlowRequestText,
    tKinds, tWorkbench, tAtlasGit, kindCountsTitle, tTopologyKeyboardWalk, glyphSet, canvasBackground,
    mapArrangement, footprint
  };
}
