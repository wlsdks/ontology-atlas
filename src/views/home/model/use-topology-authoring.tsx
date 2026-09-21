import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { buildNewNodeDoc } from "@/entities/docs-vault";
import { buildOntologyChangeSet, type MeaningEditRelation, meaningEditRelationForEdgeType, type OntologyChangeSet, type OntologyRelationEditPlan, parseOntologyMeaningEditParam, resolveNodeAgentTarget, resolveOntologyBuilderNodeSlug } from "@/entities/knowledge-graph";
import { useAgentServer } from "@/entities/vault-session";
import type { AcpTurnActivity } from "@/features/acp-session";
import { type MeaningEditorPreview } from "@/features/ontology-meaning-editor";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/replace-vault-body";
import { useHeldValue } from "@/shared/lib/use-presence";
import { MOTION } from "@/shared/motion";
import { useToast } from "@/shared/ui";
import { type AcpOntologyRelationPreview } from "@/widgets/acp-chat-panel";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveAgentFocusNodeId, resolveOntologyRelationPreview } from "../lib/resolve-agent-focus-node";
import { resolveTopologyNodeEditTarget } from "../lib/topology-node-edit";
import { type CreateNodeKind } from "../ui/CreateNodeForm";
import { selectTopologyNodeRouteState } from "./url-state";
import { useAgentConnectModel } from "./use-agent-connect-model";
import { useBootstrapFlow } from "./use-bootstrap-flow";
import { useTopologyEdgeInteractions } from "./use-topology-edge-interactions";

interface Options {
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  meaningEditorIntent: boolean;
  meaningEditParam: string | null;
  toast: ReturnType<typeof useToast>;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "reducedMotion" | "tMeaningEditor" | "t" | "relationVocabulary" | "relationRegister">;
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
  const { reducedMotion, tMeaningEditor, t, relationVocabulary, relationRegister } = topologyPreferences;

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
    /** When this turn began; kept across the turn's frames so the chip can count from it. */
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
          slug: (resolveNodeAgentTarget(node)?.ref ?? resolveOntologyBuilderNodeSlug(node)).replace(
            /^ontology\//,
            "",
          ),
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
        /*
         * An edit intent that arrived by URL (`?workbench=edit`, e.g. from the
         * insights to-do list) has no document to write in the sample. It used to
         * be dropped in silence: the address named an edit while the screen showed
         * the ordinary read panel (walkthrough finding, 2026-09-03). Say why, offer
         * the folder, and drop the intent from the address so it does not repeat.
         */
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
  // W6 agent visibility — the fresh heartbeat's declared current target,
  // shown on the map itself (not just a rail dot).
  // Only while the heartbeat is FRESH (same `hasFreshHeartbeat` bar the rail
  // dot/popover already use) — a stale heartbeat's stale focus would mislead
  // more than help. Real heartbeat data only: no slug, no match, or no fresh
  // heartbeat all resolve to `null`, which draws nothing extra on the map.
  const agentActivityStatus = vault.agentActivityStatus;
  const hasFreshAgentHeartbeat = Boolean(
    agentActivityStatus?.heartbeat && agentActivityStatus.valid && !agentActivityStatus.stale,
  );
  const agentFocusNodeId = useMemo(() => {
    // An in-app ACP turn in progress is the current one. Its `null` target is
    // honoured as-is: falling back to the previous sidecar target would draw a
    // focus that is not real.
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
  // While a permission card is up, that decision is the most urgent thing; once it
  // is done the manual editor's own preview resumes. The canvas never draws more
  // than one relation at a time.
  const mapRelationPreview = resolvedAcpRelationPreview ?? meaningPreview;
  // The "an agent just touched this" INDEX badge fires only when the already
  // fresh-gated `agentFocusNodeId` (the same source as the map ring) is also inside
  // the recent-changes lens — reusing both existing signals rather than inventing a
  // second matching heuristic.
  const agentAttributedRecentNodeId = useMemo(
    () => (agentFocusNodeId && recentChanges.recentNodeIds.has(agentFocusNodeId) ? agentFocusNodeId : null),
    [agentFocusNodeId, recentChanges],
  );
  // Create a node from the map itself; only with a writable local vault.
  const [createNodeOpen, setCreateNodeOpen] = useState(false);
  const [createNodeProposal, setCreateNodeProposal] = useState<{
    input: {
      title: string;
      kind: CreateNodeKind;
      domain?: string;
      localeLabels?: Record<string, string>;
    };
    slug: string;
    markdown: string;
    changeSet: OntologyChangeSet;
  } | null>(null);
  const [createNodeConfirming, setCreateNodeConfirming] = useState(false);
  const createNodeToggleRef = useRef<HTMLButtonElement | null>(null);
  const createNodePanelRef = useRef<HTMLDivElement | null>(null);
  const closeCreateNode = useCallback(() => {
    setCreateNodeProposal(null);
    setCreateNodeConfirming(false);
    setCreateNodeOpen(false);
    setRouteState((current) => ({
      ...current,
      createNodeIntent: false,
    }));
    window.requestAnimationFrame(() => {
      createNodeToggleRef.current?.focus();
    });
  }, [setRouteState, setCreateNodeProposal, setCreateNodeOpen]);
  const canCreateNode = vault.manifest !== null;
  // Triggers the map's reveal once bootstrap finishes.
  const [mapRevealToken, setMapRevealToken] = useState(0);
  const {
    selectedEdge, setSelectedEdge, edgePanelModel, edgePanelOpen, heldEdgePanelModel,
    setHoverEdge, handleHoverEdge, hoverEdgeCardModel, handleHoverCluster, clusterHoverCardModel,
  } = useTopologyEdgeInteractions({
    insight: ontologyInsight, selectedNode: Boolean(selectedOntologyNode), createNodeOpen,
    docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister,
    manifest: vault.manifest,
  });
  // Whether the bundled MCP server is present — the config snippet, deep links, and
  // connect button all branch on it.
  const agentServer = useAgentServer();
  // Asks one question only: is an agent attached right now. The registration snippet
  // and domain names left this model when the connect sheet was retired
  // (`docs/DECISIONS.md`, entry 90).
  const agentConnect = useAgentConnectModel({ agentActivityStatus });
  // Do not **automatically open** the AI connection sheet immediately after opening a folder. There was once
  // a one-time auto-speech 1200ms later, but a modal covering the first encounter with the self-map just created
  // made the first interaction 'close' (measured 2026-07-26). Guidance is already in the
  // start checklist and the "Agent" destination.
  // Auto-speech adds no value, and contradicts this app's discipline of "not hiding what it introduces."
  // Connection intent is established only when the user clicks.
  // HomePage modularization phase 1 — bootstrap flow owned by use-bootstrap-flow hook.
  // Only completion effects (toast · E1 rebuild) remain here.
  const { bootstrapOpen, setBootstrapOpen, bootstrapPlan, runBootstrap } = useBootstrapFlow({
    vault,
    onCompleted: ({ addedToExisting, elementCount }) => {
      // The reloaded graph arrives as a reveal — "my documents gathering".
      setMapRevealToken((n) => n + 1);
      toast.show(
        t(addedToExisting ? "bootstrap.toastAdded" : "bootstrap.toastDone", { count: elementCount }),
        "success",
      );
    },
  });
  const createNode = useCallback(
    async (input: {
      title: string;
      kind: CreateNodeKind;
      domain?: string;
      localeLabels?: Record<string, string>;
    }): Promise<false> => {
      try {
        /*
         * Stamp the node as human-authored. This path is reachable only from the
         * on-screen "create concept" control, so the call path itself proves the
         * actor — the condition the ledger puts on a write-time stamp. Without this
         * line a freshly created node gets no review-pending ring on the map
         * (measured 2026-08-03).
         */
        const { slug, markdown } = buildNewNodeDoc({ ...input, createdBy: "human" });
        if (vault.fileHandles.has(slug)) {
          toast.show(t("createNode.toastExists"), "error");
          return false;
        }
        const frontmatter = parseFrontmatter(markdown).frontmatter;
        setCreateNodeProposal({
          input,
          slug,
          markdown,
          changeSet: buildOntologyChangeSet("add_concept", {
            slug,
            ...frontmatter,
          }),
        });
      } catch (err) {
        const exists = err instanceof Error && err.message.includes("already exists");
        toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      }
      return false;
    },
    [t, toast, vault.fileHandles, setCreateNodeProposal],
  );
  const confirmCreateNode = useCallback(async () => {
    if (!createNodeProposal || createNodeConfirming) return;
    setCreateNodeConfirming(true);
    try {
      await vault.createDoc(createNodeProposal.slug, createNodeProposal.markdown);
      const tail = createNodeProposal.slug.includes("/")
        ? createNodeProposal.slug.slice(createNodeProposal.slug.lastIndexOf("/") + 1)
        : createNodeProposal.slug;
      toast.show(t("createNode.toastSaved", { slug: createNodeProposal.slug }), "success", {
        label: t("createNode.toastSavedAction"),
        onClick: () =>
          setRouteState((current) => ({
            ...current,
            selectedSlug: `${createNodeProposal.input.kind}:${tail}`,
          })),
      });
      closeCreateNode();
    } catch (err) {
      const exists = err instanceof Error && err.message.includes("already exists");
      toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      setCreateNodeConfirming(false);
    }
  }, [closeCreateNode, createNodeConfirming, createNodeProposal, setRouteState, t, toast, vault]);
  // Domain picker options for "add concept": pick an existing domain node by name
  // rather than typing a slug. `value` is the bare tail slug (`domain:auth` →
  // `auth`); `buildNewNodeDoc` normalises it again through `canonicalizeDomainRef`
  // on save.
  const createNodeDomainOptions = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        .filter((node) => node.kind === "domain")
        .map((node) => ({
          value: node.id.includes(":") ? node.id.slice(node.id.indexOf(":") + 1) : node.id,
          label: node.display ?? node.title,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [ontologyInsight],
  );
  const handleCreateNodePanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCreateNode();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const panel = createNodePanelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true" &&
          el.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeCreateNode],
  );
  // Editing a node's body. The manifest's excerpt is truncated, so editing from it
  // would silently drop text — the body is seeded from the *whole raw file* through
  // the file handle instead, and the explanation editor stays hidden until that read
  // finishes.
  const [nodeBody, setNodeBody] = useState<{ slug: string; raw: string; body: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const target = nodeEditTarget;
    const fh =
      target && vault.manifest !== null ? vault.fileHandles.get(target.vaultSlug) : null;
    if (!target || !fh) {
      // Deferred to a microtask to avoid a synchronous setState (cascading-render
      // warning).
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
      } catch {
        toast.show(t("explanationEdit.error"), "error");
      }
    },
    [nodeEditTarget, nodeBody, vault, toast, t],
  );
  return {
    canCreateNode, createNodeOpen, bootstrapOpen, setCreateNodeOpen, nodeEditTarget, agentActivityStatus,
    agentFocusNodeId, agentServer, acpTurnActivityFrame, setAcpTurnActivityFrame, nodeBody,
    saveNodeExplanation, meaningEditorState, meaningEditorSource, edgePanelOpen, setHoverEdge,
    setMeaningEditorState, setSelectedEdge, closeCreateNode, selectedEdge, setBootstrapOpen, bootstrapPlan,
    runBootstrap, createNodePanelRef, handleCreateNodePanelKeyDown, createNode, createNodeDomainOptions,
    createNodeProposal, createNodeConfirming, setCreateNodeProposal, confirmCreateNode,
    agentAttributedRecentNodeId, agentConnect, mapRevealToken, handleHoverEdge, mapRelationPreview,
    handleHoverCluster, openMeaningEditor, heldMeaningEditorState, meaningEditorCandidates, setMeaningPreview,
    applyMeaningEditor, closeMeaningEditor, hoverEdgeCardModel, clusterHoverCardModel, heldEdgePanelModel,
    edgePanelModel, setAcpRelationPreview
  } as const;
}
