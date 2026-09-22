import type { useHomeWorkbenchController } from "./use-home-workbench-controller";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyNavigationActions } from "./use-topology-navigation-actions";
import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { buildDocsVaultHref } from "@/entities/docs-vault";
import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import type { AnalysisCaptureContext } from "@/features/acp-session";
import { analysisGraphFromInsight, useAnalysisCapture } from "@/features/acp-session";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useMemo } from "react";
import { edgeSentenceValues, normalizeEdgeSentenceKey } from "../lib/edge-sentence";
import { selectTopologyPathRouteState } from "./url-state";
import { useTaskReviewBaseline } from "./use-task-review-baseline";

interface Options {
  router: ReturnType<typeof useRouter>;
  setExpandAllActive: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect">;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "chatNodeIndex"
    | "setFullDetailSlug"
    | "interactionSelectedSlugRef"
    | "setSelectedRelationActive"
  >;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "relationVocabulary" | "relationRegister">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "selectedEdge" | "setMeaningEditorState" | "setSelectedEdge">;
  homeWorkbenchController: Pick<
    ReturnType<typeof useHomeWorkbenchController>,
    | "analysisParentRunId"
    | "analysisParentRequestText"
    | "meaningWorkbenchOpen"
    | "acpDockFrameOpen"
    | "showRelationMeaning"
    | "analysisFindings"
  >;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "ontologyInsight" | "vault" | "gitVaultPath" | "selectedOntologyNode">;
}
export function useTopologyAnalysisReview({
  router, setExpandAllActive, setRouteState, topologyVaultReadModel, homeWorkbenchController,
  topologyAuthoring, topologyPreferences, topologyCanvasFocus, topologyNavigationActions
}: Options) {
  const { ontologyInsight, vault, gitVaultPath, selectedOntologyNode } = topologyVaultReadModel;
  const { analysisParentRunId, analysisParentRequestText, meaningWorkbenchOpen, acpDockFrameOpen, showRelationMeaning, analysisFindings } = homeWorkbenchController;
  const { selectedEdge, setMeaningEditorState, setSelectedEdge } = topologyAuthoring;
  const { t, relationVocabulary, relationRegister } = topologyPreferences;
  const { chatNodeIndex, setFullDetailSlug, interactionSelectedSlugRef, setSelectedRelationActive } = topologyCanvasFocus;
  const { handleSelect } = topologyNavigationActions;


  const meaningAnalysisContext = useMemo<AnalysisCaptureContext>(() => {
    const project = (ontologyInsight?.nodes ?? []).filter((node) => node.kind === 'project');
    const projectSlug = project.length === 1 ? resolveNodeAgentTarget(project[0]).ref : null;
    const projectDoc = vault.manifest?.docs.find((doc) => doc.slug === projectSlug);
    return {
      mode: 'meaning', surface: 'map', handle: vault.handle,
      writable: vault.status === 'loaded',
      fileHandles: vault.fileHandles,
      scope: {
        projectSlug,
        projectUid: typeof projectDoc?.frontmatter.uid === 'string' ? projectDoc.frontmatter.uid : null,
        targetSlugs: [], profileSlug: null
      },
      graph: analysisGraphFromInsight(ontologyInsight),
      sourceFingerprint: null, profileHash: null, parentRunId: analysisParentRunId, parentRequestText: analysisParentRequestText,
    };
  }, [ontologyInsight, vault.handle, vault.manifest, vault.status, vault.fileHandles, analysisParentRunId, analysisParentRequestText]);
  const captureTaskBaseline = useTaskReviewBaseline({
    handle: vault.handle,
    vaultRoot: gitVaultPath,
    fileHandles: vault.fileHandles,
    nodes: ontologyInsight?.nodes ?? [],
    projectSlug: meaningAnalysisContext.scope.projectSlug,
  });
  const analysisCapture = useAnalysisCapture(meaningAnalysisContext);
  const meaningRelations = useMemo(() => {
    if (!ontologyInsight || (!meaningWorkbenchOpen && !acpDockFrameOpen)) return [];
    const focus = selectedOntologyNode?.id;
    const nodes = new Map(ontologyInsight.nodes.map((node) => [node.id, node]));
    return ontologyInsight.edges.filter((edge) => selectedEdge
      ? edge.from === selectedEdge.sourceId && edge.to === selectedEdge.targetId && edge.type === selectedEdge.relationType
      : focus ? edge.from === focus || edge.to === focus : false).map((edge) => {
        const from = nodes.get(edge.from); const to = nodes.get(edge.to);
        const key = normalizeEdgeSentenceKey(edge.type);
        return {
          id: edge.id,
          sentence: t(`edgeSentence.${key}`, edgeSentenceValues(key, from?.display ?? from?.title ?? edge.from, to?.display ?? to?.title ?? edge.to)),
          typeLabel: relationVocabulary(edge.type, relationRegister), why: edge.label?.trim() || null,
          declaredBy: edge.evidenceIds[0] ?? null
        };
      });
  }, [ontologyInsight, meaningWorkbenchOpen, acpDockFrameOpen, selectedOntologyNode, selectedEdge, t, relationVocabulary, relationRegister]);
  /*
   * Edges in the workbench's scope with no `relation_notes`: the count the Meaning view offers
   * to have written. Scope follows the selection the way `meaningRelations` does — one edge,
   * one node's edges, or the whole graph. A `belongs_to` edge is a child's `domain:` back-pointer;
   * the reason for that pair lives on the parent's containment line (decision 2026-09-06), so the
   * back-pointer is never a gap the agent could fill and is left out of the count (the view said
   * "1 missing" for a domain whose every reason was written, 2026-09-06).
   */
  const relationNoteGaps = useMemo(() => {
    if (!ontologyInsight || (!meaningWorkbenchOpen && !acpDockFrameOpen)) return 0;
    const focus = selectedOntologyNode?.id;
    return ontologyInsight.edges.filter((edge) => selectedEdge
      ? edge.from === selectedEdge.sourceId && edge.to === selectedEdge.targetId && edge.type === selectedEdge.relationType
      : focus ? edge.from === focus || edge.to === focus : true).filter((edge) => edge.type !== 'belongs_to' && !edge.label?.trim()).length;
  }, [ontologyInsight, meaningWorkbenchOpen, acpDockFrameOpen, selectedOntologyNode, selectedEdge]);
  const mapRelationCaptions = useMemo(() => (meaningWorkbenchOpen || acpDockFrameOpen) && showRelationMeaning ? new Map((ontologyInsight?.edges ?? []).map((edge) => [edge.id, relationVocabulary(edge.type, relationRegister)])) : null, [meaningWorkbenchOpen, acpDockFrameOpen, showRelationMeaning, ontologyInsight, relationVocabulary, relationRegister]);
  const mapReviewQuestionIds = useMemo(() => new Set(analysisFindings.flatMap((finding) => finding.targetSlugs.map((slug) => chatNodeIndex.get(slug)).filter((id): id is string => !!id))), [analysisFindings, chatNodeIndex]);
  const openAnalysisEvidence = useCallback((slug: string) => {
    const nodeId = chatNodeIndex.get(slug);
    if (nodeId) { handleSelect(nodeId); setFullDetailSlug(nodeId); }
    else router.push(buildDocsVaultHref({ slug }));
  }, [chatNodeIndex, handleSelect, router, setFullDetailSlug]);
  const showAnalysisRelation = useCallback((edge: NonNullable<typeof selectedEdge>) => {
    interactionSelectedSlugRef.current = null;
    setExpandAllActive(false);
    setMeaningEditorState(null);
    setFullDetailSlug(null);
    setSelectedRelationActive(false);
    // The existing path lens reveals both ancestor chains and frames their visible endpoints.
    setRouteState((current) => selectTopologyPathRouteState({ ...current, realmSlug: null }, {
      sourceSlug: edge.sourceId, targetSlug: edge.targetId,
    }));
    setSelectedEdge(edge);
  }, [interactionSelectedSlugRef, setExpandAllActive, setFullDetailSlug, setMeaningEditorState, setRouteState, setSelectedEdge, setSelectedRelationActive]);
  return {
    mapRelationCaptions, mapReviewQuestionIds, meaningAnalysisContext, analysisCapture, relationNoteGaps,
    openAnalysisEvidence, showAnalysisRelation, meaningRelations, captureTaskBaseline
  } as const;
}
