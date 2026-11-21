
import { useRelationVocabulary } from "@/entities/knowledge-graph";
import { useCanvasBackground, useExpand, useFootprint, useDomainStructure, useGlyphSet, useHexBoard, useMapDragSpeed, useMapView, useMapZoomSpeed, useView3d, type MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
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
  const businessFlowRequestText = useTranslations('topology')('businessFlowRequest');
  const activeLocale = useLocale();
  const tKinds = useTranslations('kinds');
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
  const view3d = useView3d();
  const neural = useMapView() === "neural";
  const structure = useDomainStructure();
  const hexBoard = useHexBoard();
  const footprint = useFootprint();
  const glyphSet = useGlyphSet();
  const expand = useExpand();
  const dragSpeed = useMapDragSpeed();
  const zoomSpeed = useMapZoomSpeed();
  const navigationSpeed = useMemo<MapNavigationSpeed>(() => ({ drag: dragSpeed, zoom: zoomSpeed }), [dragSpeed, zoomSpeed]);
  const relationRegister: "formal" | "plain" = audiencePlain ? "plain" : "formal";
  const relationLabelInRegister = useCallback(
    (type: string) => relationVocabulary(type, relationRegister),
    [relationVocabulary, relationRegister],
  );
  return {
    expand, t, audiencePlain, setAudiencePlain, reducedMotion, tMeaningEditor, relationVocabulary,
    relationRegister, siteT, relationLabelInRegister, activeLocale, view3d, neural, structure, hexBoard, businessFlowRequestText,
    tKinds, tWorkbench, tAtlasGit, kindCountsTitle, tTopologyKeyboardWalk, glyphSet, canvasBackground,
    footprint, navigationSpeed
  };
}
