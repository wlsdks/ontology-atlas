import type { useTopologyPreferences } from "../use-topology-preferences";
import type { useTopologyVaultReadModel } from "../use-topology-vault-read-model";

import { buildNewNodeDoc } from "@/entities/docs-vault";
import { type MeaningEditRelation, meaningEditRelationForEdgeType, type OntologyRelationEditPlan, parseOntologyMeaningEditParam } from "@/entities/knowledge-graph";
import { useAgentServer, VaultConflictError } from "@/entities/vault-session";
import type { AcpTurnActivity } from "@/features/acp-session";
import { type MeaningEditorPreview } from "@/features/ontology-meaning-editor";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/vault-document/replace-vault-body";
import { useHeldValue } from "@/shared/lib/render-timing/use-presence";
import { MOTION } from "@/shared/motion";
import { useToast } from "@/shared/ui";
import { type AcpOntologyRelationPreview } from "@/widgets/acp-chat-panel";
import { type IndexAddConcept } from "@/widgets/topology-index-panel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveAgentFocusNodeId, resolveOntologyRelationPreview } from "../../lib/agent/resolve-agent-focus-node";
import { resolveNodeVaultRef, resolveTopologyNodeEditTarget } from "../../lib/authoring/topology-node-edit";
import { type CreateNodeInput } from "../../ui/CreateNodeForm";
import { type CreateSelection } from "./create-defaults";
import { useManualWriteUndo } from "./use-manual-write-undo";
import { selectTopologyNodeRouteState } from "../route-state/url-state";
import { useAgentConnectModel } from "../agent/use-agent-connect-model";
import { useBootstrapFlow } from "./use-bootstrap-flow";
import { useTopologyEdgeInteractions } from "./use-topology-edge-interactions";

interface Options {
  setRouteState: (updater: Partial<import("@/views/home/model/route-state/url-state").HomeRouteState> | ((current: import("@/views/home/model/route-state/url-state").HomeRouteState) => import("@/views/home/model/route-state/url-state").HomeRouteState), options?: import("@/views/home/model/route-state/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  meaningEditorIntent: boolean;
  meaningEditParam: string | null;
  toast: ReturnType<typeof useToast>;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "reducedMotion" | "tMeaningEditor" | "t" | "relationVocabulary" | "relationRegister" | "activeLocale">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "selectedOntologyNode"
    | "vault"
    | "ontologyInsight"
    | "setNeedsVaultReason"
    | "recentChanges"
    | "docFreshnessIndex"
    | "updatedAgoNowMs"
  >;
}
export function useTopologyAuthoring({ setRouteState, meaningEditorIntent, meaningEditParam, toast, topologyVaultReadModel, topologyPreferences }: Options) {
  const { selectedOntologyNode, vault, ontologyInsight, setNeedsVaultReason, recentChanges, docFreshnessIndex, updatedAgoNowMs } = topologyVaultReadModel;
  const { reducedMotion, tMeaningEditor, t, relationVocabulary, relationRegister, activeLocale } = topologyPreferences;

  const nodeEditTarget = useMemo(
    () =>
      selectedOntologyNode
        ? resolveTopologyNodeEditTarget(selectedOntologyNode, vault.manifest?.docs ?? [])
        : null,
    [selectedOntologyNode, vault.manifest],
  );
  const [meaningEditorState, setMeaningEditorState] = useState<{
    sourceId: string;
    initialRelation: MeaningEditRelation;
    initialTargetId: string | null;
    initialWhy: string;
  } | null>(null);
  const heldMeaningEditorState = useHeldValue(
    meaningEditorState,
    meaningEditorState
      ? `${meaningEditorState.sourceId}:${meaningEditorState.initialRelation}:${meaningEditorState.initialTargetId ?? "new"}`
      : null,
  );
  const [meaningPreview, setMeaningPreview] = useState<MeaningEditorPreview | null>(null);
  const [acpRelationPreview, setAcpRelationPreview] =
    useState<AcpOntologyRelationPreview | null>(null);
  const [acpTurnActivityFrame, setAcpTurnActivityFrame] = useState<{
    activity: AcpTurnActivity;
    at: number;
    /** Kept across the turn's frames so the chip can count from it. */
    startedAt: number;
  } | null>(null);
  const meaningEditorSource = useMemo(() => {
    if (!selectedOntologyNode || !nodeEditTarget) return null;
    return {
      id: selectedOntologyNode.id,
      slug: nodeEditTarget.vaultSlug.replace(/^ontology\//, ""),
      title: selectedOntologyNode.display ?? selectedOntologyNode.title,
      kind: selectedOntologyNode.kind,
      frontmatter: nodeEditTarget.frontmatter,
    };
  }, [nodeEditTarget, selectedOntologyNode]);
  const meaningEditorCandidates = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        .filter((node) => ["project", "domain", "capability", "element"].includes(node.kind))
        .map((node) => ({
          id: node.id,
          slug: resolveNodeVaultRef(node),
          title: node.display ?? node.title,
          kind: node.kind,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [ontologyInsight],
  );
  const openMeaningEditor = useCallback(
    ({
      sourceId,
      relation = "dependsOn",
      targetId = null,
    }: {
      sourceId: string;
      relation?: MeaningEditRelation;
      targetId?: string | null;
    }) => {
      setRouteState((current) => ({
        ...selectTopologyNodeRouteState(current, sourceId),
        createNodeIntent: false,
        meaningEditorIntent: true,
        meaningEditParam: targetId ? `${relation}:${targetId}` : null,
      }));
    },
    [setRouteState],
  );
  const closeMeaningEditor = useCallback(() => {
    setMeaningEditorState(null);
    setMeaningPreview(null);
    setRouteState((current) => ({
      ...current,
      meaningEditorIntent: false,
      meaningEditParam: null,
    }));
  }, [setRouteState, setMeaningEditorState, setMeaningPreview]);
  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (!meaningEditorIntent || !meaningEditorSource) {
        if (!meaningEditorIntent) setMeaningEditorState(null);
        // A URL edit intent on the sample has no document to write: say why, offer the folder, and
        // drop the intent from the address so it does not repeat.
        if (
          meaningEditorIntent &&
          selectedOntologyNode &&
          vault.status !== "loaded" &&
          vault.status !== "loading" &&
          vault.status !== "permission-needed"
        ) {
          setNeedsVaultReason("editNeedsVault");
          closeMeaningEditor();
        }
        return;
      }
      const parsed = parseOntologyMeaningEditParam(meaningEditParam);
      const initialWhy = parsed
        ? ontologyInsight?.edges.find(
          (edge) =>
            edge.from === meaningEditorSource.id &&
            edge.to === parsed.targetId &&
            meaningEditRelationForEdgeType(edge.type) === parsed.relation,
        )?.label?.trim() ?? ""
        : "";
      const next = {
        sourceId: meaningEditorSource.id,
        initialRelation: parsed?.relation ?? ("dependsOn" as const),
        initialTargetId: parsed?.targetId ?? null,
        initialWhy,
      };
      setMeaningEditorState((current) =>
        current &&
          current.sourceId === next.sourceId &&
          current.initialRelation === next.initialRelation &&
          current.initialTargetId === next.initialTargetId &&
          current.initialWhy === next.initialWhy
          ? current
          : next,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [meaningEditParam, meaningEditorIntent, meaningEditorSource, ontologyInsight, selectedOntologyNode, vault.status, closeMeaningEditor, setNeedsVaultReason]);
  const applyMeaningEditor = useCallback(
    async (plan: OntologyRelationEditPlan) => {
      if (!nodeEditTarget || !meaningEditorState) throw new Error("missing edit target");
      try {
        if (!reducedMotion) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, MOTION.settle.duration * 1000);
          });
        }
        await vault.updateFrontmatter(nodeEditTarget.vaultSlug, plan.updates, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(tMeaningEditor("saved"), "success");
        closeMeaningEditor();
      } catch (error) {
        toast.show(tMeaningEditor("saveError"), "error");
        throw error;
      }
    },
    [closeMeaningEditor, meaningEditorState, nodeEditTarget, reducedMotion, tMeaningEditor, toast, vault],
  );
  // The fresh heartbeat's declared target, drawn on the map. Fresh only (`hasFreshHeartbeat`),
  // since a stale focus misleads; no slug, match or fresh heartbeat draws nothing.
  const agentActivityStatus = vault.agentActivityStatus;
  const hasFreshAgentHeartbeat = Boolean(
    agentActivityStatus?.heartbeat && agentActivityStatus.valid && !agentActivityStatus.stale,
  );
  const agentFocusNodeId = useMemo(() => {
    // A running ACP turn wins, and its `null` target is honoured: the previous sidecar target is
    // not real now.
    if (acpTurnActivityFrame) {
      return resolveAgentFocusNodeId(
        acpTurnActivityFrame.activity.ontologySlug,
        ontologyInsight?.nodes,
      );
    }
    return hasFreshAgentHeartbeat
      ? resolveAgentFocusNodeId(
        agentActivityStatus?.heartbeat?.focus.ontologySlug ?? null,
        ontologyInsight?.nodes,
      )
      : null;
  }, [acpTurnActivityFrame, hasFreshAgentHeartbeat, agentActivityStatus, ontologyInsight]);
  const resolvedAcpRelationPreview = useMemo(
    () => resolveOntologyRelationPreview(acpRelationPreview, ontologyInsight?.nodes),
    [acpRelationPreview, ontologyInsight],
  );
  // A pending permission decision outranks the manual editor's preview; the canvas draws one
  // relation at a time.
  const mapRelationPreview = resolvedAcpRelationPreview ?? meaningPreview;
  // Fires only when the fresh `agentFocusNodeId` is also inside the recent-changes lens, reusing
  // both signals.
  const agentAttributedRecentNodeId = useMemo(
    () => (agentFocusNodeId && recentChanges.recentNodeIds.has(agentFocusNodeId) ? agentFocusNodeId : null),
    [agentFocusNodeId, recentChanges],
  );
  // Only with a writable local vault.
  const [createNodeOpen, setCreateNodeOpen] = useState(false);
  const closeCreateNode = useCallback(() => {
    setCreateNodeOpen(false);
    setRouteState((current) => ({
      ...current,
      createNodeIntent: false,
    }));
  }, [setRouteState, setCreateNodeOpen]);
  const canCreateNode = vault.manifest !== null;
  const [mapRevealToken, setMapRevealToken] = useState(0);
  const {
    selectedEdge, setSelectedEdge, edgePanelModel, edgePanelOpen, heldEdgePanelModel,
    setHoverEdge, handleHoverEdge, hoverEdgeCardModel, handleHoverCluster, clusterHoverCardModel,
  } = useTopologyEdgeInteractions({
    insight: ontologyInsight, selectedNode: Boolean(selectedOntologyNode), createNodeOpen,
    docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister,
    manifest: vault.manifest,
  });
  // The config snippet, deep links and connect button all branch on it.
  const agentServer = useAgentServer();
  // Only asks whether an agent is attached now (`docs/DECISIONS.md`, entry 90).
  const agentConnect = useAgentConnectModel({ agentActivityStatus });
  // The AI connection sheet never opens by itself after a folder opens: a modal over the first map
  // makes the first interaction "close". Connection intent comes only from a click.
  const { bootstrapOpen, setBootstrapOpen, bootstrapPlan, runBootstrap } = useBootstrapFlow({
    vault,
    onCompleted: ({ addedToExisting, elementCount }) => {
      // The reloaded graph arrives as a reveal.
      setMapRevealToken((n) => n + 1);
      toast.show(
        t(addedToExisting ? "bootstrap.toastAdded" : "bootstrap.toastDone", { count: elementCount }),
        "success",
      );
    },
  });
  const { runManualWrite } = useManualWriteUndo({ vault, toast, t });
  /**
   * Writes the new concept at once. Only the on-screen create controls reach this path, so it
   * stamps `created_by: human`. Returns whether the file was written.
   */
  const createNode = useCallback(
    async (input: CreateNodeInput, { keepOpen = false }: { keepOpen?: boolean } = {}): Promise<boolean> => {
      let built: { slug: string; markdown: string };
      try {
        built = buildNewNodeDoc({ ...input, createdBy: "human" });
      } catch {
        toast.show(t("createNode.toastError"), "error");
        return false;
      }
      const description = input.description?.trim();
      const markdown = description ? `${built.markdown}\n${description}\n` : built.markdown;
      if (vault.fileHandles.has(built.slug)) {
        toast.show(t("createNode.toastExists"), "error");
        return false;
      }
      try {
        await runManualWrite({
          slug: built.slug,
          write: () => vault.createDoc(built.slug, markdown),
          written: markdown,
          message: t("createNode.toastCreated", { name: input.title.trim() }),
        });
      } catch (err) {
        const exists = err instanceof Error && err.message.includes("already exists");
        toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
        return false;
      }
      if (!keepOpen) {
        const tail = built.slug.slice(built.slug.lastIndexOf("/") + 1);
        setCreateNodeOpen(false);
        setRouteState((current) => ({
          ...current,
          createNodeIntent: false,
          selectedSlug: `${input.kind}:${tail}`,
        }));
      }
      return true;
    },
    [runManualWrite, setRouteState, t, toast, vault],
  );
  /** The concept list's add row: a domain stands alone, a capability or element goes in the group's domain. */
  const addConceptInGroup = useCallback<IndexAddConcept>(
    (group, kind, title) =>
      createNode(
        {
          title,
          kind,
          domain: kind === "domain" ? undefined : resolveNodeVaultRef(group),
          localeLabels: { [activeLocale]: title },
        },
        { keepOpen: true },
      ),
    [activeLocale, createNode],
  );
  /** The concepts a new title is compared with, so a near-duplicate is named before it is made. */
  const createNodeExistingConcepts = useMemo(
    () =>
      (ontologyInsight?.nodes ?? []).map((node) => ({
        slug: node.id,
        title: node.display ?? node.title,
        kind: node.kind,
      })),
    [ontologyInsight],
  );
  const createSelection = useMemo<CreateSelection | null>(() => {
    if (!selectedOntologyNode) return null;
    const domain = nodeEditTarget?.frontmatter.domain;
    return {
      kind: selectedOntologyNode.kind,
      ref: resolveNodeVaultRef(selectedOntologyNode),
      domainRef: typeof domain === "string" ? domain : null,
    };
  }, [nodeEditTarget, selectedOntologyNode]);
  // `value` is the domain document's address (`domains/agent-access`), the spelling
  // agent-written `domain:` uses; `buildNewNodeDoc` keeps the folder
  // through `canonicalizeDomainRef`.
  const createNodeDomainOptions = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        .filter((node) => node.kind === "domain")
        .map((node) => ({
          value: resolveNodeVaultRef(node),
          label: node.display ?? node.title,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [ontologyInsight],
  );
  // Seeded from the whole raw file, since the manifest excerpt is truncated and editing it would
  // drop text;
  // the editor stays hidden until the read finishes.
  const [nodeBody, setNodeBody] = useState<{ slug: string; raw: string; body: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const target = nodeEditTarget;
    const fh =
      target && vault.manifest !== null ? vault.fileHandles.get(target.vaultSlug) : null;
    if (!target || !fh) {
      // A microtask avoids a synchronous setState (cascading-render warning).
      window.queueMicrotask(() => {
        if (!cancelled) setNodeBody(null);
      });
      return () => {
        cancelled = true;
      };
    }
    fh.getFile()
      .then((f) => f.text())
      .then((raw) => {
        if (!cancelled) {
          setNodeBody({ slug: target.vaultSlug, raw, body: parseFrontmatter(raw).body.trim() });
        }
      })
      .catch(() => {
        if (!cancelled) setNodeBody(null);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeEditTarget, vault.manifest, vault.fileHandles]);
  const saveNodeExplanation = useCallback(
    async (next: string) => {
      if (!nodeEditTarget || !nodeBody || nodeBody.slug !== nodeEditTarget.vaultSlug) return;
      try {
        const content = replaceVaultBody(nodeBody.raw, next);
        await vault.saveDoc(nodeEditTarget.vaultSlug, content, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(t("explanationEdit.saved"), "success");
      } catch (error) {
        // A conflict says the file changed elsewhere and what the next save does, unlike a broken
        // disk.
        // Rethrown so `NodeExplanationEdit` stays open with the person's draft.
        toast.show(
          t(error instanceof VaultConflictError ? "explanationEdit.conflict" : "explanationEdit.error"),
          "error",
        );
        throw error;
      }
    },
    [nodeEditTarget, nodeBody, vault, toast, t],
  );
  return {
    canCreateNode, createNodeOpen, bootstrapOpen, setCreateNodeOpen, nodeEditTarget, agentActivityStatus,
    agentFocusNodeId, agentServer, acpTurnActivityFrame, setAcpTurnActivityFrame, nodeBody,
    saveNodeExplanation, meaningEditorState, meaningEditorSource, edgePanelOpen, setHoverEdge,
    setMeaningEditorState, setSelectedEdge, closeCreateNode, selectedEdge, setBootstrapOpen, bootstrapPlan,
    runBootstrap, createNode, createNodeDomainOptions, createNodeExistingConcepts, createSelection,
    runManualWrite, addConceptInGroup,
    agentAttributedRecentNodeId, agentConnect, mapRevealToken, handleHoverEdge, mapRelationPreview,
    handleHoverCluster, openMeaningEditor, heldMeaningEditorState, meaningEditorCandidates, setMeaningPreview,
    applyMeaningEditor, closeMeaningEditor, hoverEdgeCardModel, clusterHoverCardModel, heldEdgePanelModel,
    edgePanelModel, setAcpRelationPreview
  } as const;
}
