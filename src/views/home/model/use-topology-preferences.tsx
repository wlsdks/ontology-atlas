
import { useRelationVocabulary } from "@/entities/knowledge-graph";
import { useCanvasBackground, useExpand, useFootprint, useDomainStructure, useGlyphSet, useHexBoard, useMapArrangement, useMapDragSpeed, useMapZoomSpeed, useView3d, type MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import { useAudiencePlain } from "@/shared/lib/preferences/audience-preference";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

export function useTopologyPreferences() {
  const tWorkbench = useTranslations('analysisWorkbench');
  const t = useTranslations('topology');
  const tMeaningEditor = useTranslations('meaningEditor');
  const reducedMotion = usePrefersReducedMotion();
  const siteT = useTranslations('metadata');
  const businessFlowRequestText = useTranslations('ontologyPages.insights.flow')('request');
  // For the create composer's per-locale name inputs.
  const activeLocale = useLocale();
  const tKinds = useTranslations('kinds');
  // The help glossary owns these definitions (see `TopologyIndexTreeRowLabels.subcountsTitle`).
  const tGlossary = useTranslations('searchWidgets.shortcuts.glossary');
  const kindCountsTitle = useMemo(
    () =>
      `${tGlossary('capabilityTerm')}: ${tGlossary('capabilityDefinition')} · ` +
      `${tGlossary('elementTerm')}: ${tGlossary('elementDefinition')} · ` +
      // A concept referenced by two domains is counted once on the containment spine, so the
      // caption says where.
      `${tGlossary('sharedConceptNote')}`,
    [tGlossary],
  );
  const tTopologyKeyboardWalk = useTranslations('topologyWidgets.keyboardWalk');
  const tAtlasGit = useTranslations('atlasGit');
  const relationVocabulary = useRelationVocabulary();
  // Plain mode is a display lens only: it hides the element tier (except a clicked node's ego),
  // uses plain vocabulary and hides developer chrome. A shared store, because the shell's history
  // tile reads it too.
  const [audiencePlain, setAudiencePlain] = useAudiencePlain();
  // App-wide stores the DOM glyphs also subscribe to, so canvas and DOM swap in lockstep.
  const canvasBackground = useCanvasBackground();
  // Opt-in: the ownership Cone tree or the relation-driven Cloud.
  const view3d = useView3d();
  const structure = useDomainStructure();
  /** `OntologyHexBoardMap`. */
  const hexBoard = useHexBoard();
  /** See the `MapArrangement` doc-block. */
  const mapArrangement = useMapArrangement();
  const footprint = useFootprint();
  const glyphSet = useGlyphSet();
  const expand = useExpand();
  const dragSpeed = useMapDragSpeed();
  const zoomSpeed = useMapZoomSpeed();
  const navigationSpeed = useMemo<MapNavigationSpeed>(() => ({ drag: dragSpeed, zoom: zoomSpeed }), [dragSpeed, zoomSpeed]);
  // Plain mode uses the datasheet's register.
  const relationRegister: "formal" | "plain" = audiencePlain ? "plain" : "formal";
  /**
   * For trail step captions. Unstable, since `relationVocabulary` is a new closure every render;
   * the trail memoises its edge scan separately.
   */
  const relationLabelInRegister = useCallback(
    (type: string) => relationVocabulary(type, relationRegister),
    [relationVocabulary, relationRegister],
  );
  return {
    expand, t, audiencePlain, setAudiencePlain, reducedMotion, tMeaningEditor, relationVocabulary,
    relationRegister, siteT, relationLabelInRegister, activeLocale, view3d, structure, hexBoard, businessFlowRequestText,
    tKinds, tWorkbench, tAtlasGit, kindCountsTitle, tTopologyKeyboardWalk, glyphSet, canvasBackground,
    mapArrangement, footprint, navigationSpeed
  };
}
