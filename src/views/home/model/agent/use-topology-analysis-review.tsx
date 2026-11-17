import type { useHomeWorkbenchController } from "../use-home-workbench-controller";
import type { useTopologyAuthoring } from "../authoring/use-topology-authoring";
import type { useTopologyCanvasFocus } from "../use-topology-canvas-focus";
import type { useTopologyNavigationActions } from "../use-topology-navigation-actions";
import type { useTopologyPreferences } from "../use-topology-preferences";
import type { useTopologyVaultReadModel } from "../use-topology-vault-read-model";
import type { useAcpRuntimeController } from './use-acp-runtime-controller';

import { buildDocsVaultHref } from "@/entities/docs-vault";
import { isContainmentRelation, resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import type { AnalysisCaptureContext } from "@/features/acp-session";
import { analysisGraphFromInsight, useAnalysisCapture } from "@/features/acp-session";
import { investigationCaptureContext } from '../gray-area/investigation-context';
import { isRecordedReviewRequest } from '@/widgets/analysis-workbench';
import { useRouter } from "@/i18n/navigation";
import { useCallback, useMemo, useState } from "react";
import { selectTopologyPathRouteState } from "../route-state/url-state";
import { useTaskReviewBaseline } from "./use-task-review-baseline";

/** `onTurnStarted` below hands the investigation capture only the exact investigation request. */
const everyRequestItReceives = () => true;

interface Options {
  investigationBasis?:ReturnType<typeof useAcpRuntimeController>['investigationBasis'];
  router: ReturnType<typeof useRouter>;
  setExpandAllActive: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/route-state/url-state").HomeRouteState> | ((current: import("@/views/home/model/route-state/url-state").HomeRouteState) => import("@/views/home/model/route-state/url-state").HomeRouteState), options?: import("@/views/home/model/route-state/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect">;
  topologyCanvasFocus: Pick<
    ReturnType<typeof useTopologyCanvasFocus>,
    | "chatNodeIndex"
    | "setFullDetailSlug"
    | "interactionSelectedSlugRef"
    | "setSelectedRelationActive"
  >;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "relationVocabulary" | "relationRegister">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "selectedEdge" | "setMeaningEditorState" | "setSelectedEdge">;
  homeWorkbenchController: Pick<
    ReturnType<typeof useHomeWorkbenchController>,
    | "analysisParentRunId"
    | "analysisParentRequestText"
    | "meaningWorkbenchOpen"
    | "acpDockFrameOpen"
    | "analysisFindings"
  >;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "ontologyInsight" | "vault" | "gitVaultPath" | "selectedOntologyNode">;
}
export function useTopologyAnalysisReview({
  router, setExpandAllActive, setRouteState, topologyVaultReadModel, homeWorkbenchController,
  topologyAuthoring, topologyPreferences, topologyCanvasFocus, topologyNavigationActions, investigationBasis
}: Options) {
  const { ontologyInsight, vault, gitVaultPath, selectedOntologyNode } = topologyVaultReadModel;
  const { analysisParentRunId, analysisParentRequestText, meaningWorkbenchOpen, acpDockFrameOpen, analysisFindings } = homeWorkbenchController;
  const { selectedEdge, setMeaningEditorState, setSelectedEdge } = topologyAuthoring;
  const { relationVocabulary, relationRegister } = topologyPreferences;
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
  const investigationContext = useMemo(()=>investigationCaptureContext(meaningAnalysisContext,investigationBasis,gitVaultPath,vault.manifest?.docs??[]),[investigationBasis,gitVaultPath,vault.manifest,meaningAnalysisContext]);
  const ordinaryCapture = useAnalysisCapture(meaningAnalysisContext, isRecordedReviewRequest);
  const investigationCapture = useAnalysisCapture(investigationContext??meaningAnalysisContext, everyRequestItReceives);
  const [captureKind,setCaptureKind] = useState<'meaning'|'investigation'>('meaning');
  const analysisCapture = {
    ...(captureKind==='investigation'?investigationCapture:ordinaryCapture),
    onTurnStarted:useCallback((start:import('@/features/acp-session').AcpTurnStart)=>{
      const investigate=Boolean(investigationContext&&investigationBasis?.text===start.text);
      setCaptureKind(investigate?'investigation':'meaning');
      return (investigate?investigationCapture:ordinaryCapture).onTurnStarted(start);
    },[investigationContext,investigationBasis,investigationCapture,ordinaryCapture]),
  };
  // Scoped edges without `relation_notes`, following the selection.
  // `belongs_to` back-pointers are excluded: their reason lives on the parent's containment line.
  const relationNoteGaps = useMemo(() => {
    if (!ontologyInsight || (!meaningWorkbenchOpen && !acpDockFrameOpen)) return 0;
    const focus = selectedOntologyNode?.id;
    return ontologyInsight.edges.filter((edge) => selectedEdge
      ? edge.from === selectedEdge.sourceId && edge.to === selectedEdge.targetId && edge.type === selectedEdge.relationType
      : focus ? edge.from === focus || edge.to === focus : true).filter((edge) => edge.type !== 'belongs_to' && !edge.label?.trim()).length;
  }, [ontologyInsight, meaningWorkbenchOpen, acpDockFrameOpen, selectedOntologyNode, selectedEdge]);
  const mapRelationCaptions = useMemo(() => (meaningWorkbenchOpen || acpDockFrameOpen) ? new Map((ontologyInsight?.edges ?? []).filter((edge) => !isContainmentRelation(edge.type)).map((edge) => [edge.id, relationVocabulary(edge.type, relationRegister)])) : null, [meaningWorkbenchOpen, acpDockFrameOpen, ontologyInsight, relationVocabulary, relationRegister]);
  const mapReviewQuestionIds = useMemo(() => new Set(analysisFindings.flatMap((finding) => finding.targetSlugs.map((slug) => chatNodeIndex.get(slug)).filter((id): id is string => !!id))), [analysisFindings, chatNodeIndex]);
  const openAnalysisEvidence = useCallback((slug: string) => {
    const nodeId = chatNodeIndex.get(slug);
    if (nodeId) { setSelectedEdge(null); handleSelect(nodeId, { exitPath: true }); setFullDetailSlug(nodeId); }
    else router.push(buildDocsVaultHref({ slug }));
  }, [chatNodeIndex, handleSelect, router, setFullDetailSlug, setSelectedEdge]);
  const showAnalysisRelation = useCallback((edge: NonNullable<typeof selectedEdge>) => {
    interactionSelectedSlugRef.current = null;
    setExpandAllActive(false);
    setMeaningEditorState(null);
    setFullDetailSlug(null);
    setSelectedRelationActive(false);
    // The path lens reveals both ancestor chains and frames the endpoints.
    setRouteState((current) => selectTopologyPathRouteState({ ...current, realmSlug: null }, {
      sourceSlug: edge.sourceId, targetSlug: edge.targetId,
    }));
    setSelectedEdge(edge);
  }, [interactionSelectedSlugRef, setExpandAllActive, setFullDetailSlug, setMeaningEditorState, setRouteState, setSelectedEdge, setSelectedRelationActive]);
  return {
    mapRelationCaptions, mapReviewQuestionIds, meaningAnalysisContext, analysisCapture, relationNoteGaps,
    openAnalysisEvidence, showAnalysisRelation, captureTaskBaseline
  } as const;
}
