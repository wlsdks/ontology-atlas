import type { useTopologyPreferences } from "../use-topology-preferences";
import type { useTopologyVaultReadModel } from "../use-topology-vault-read-model";

import { applyFrontmatterUpdates, buildNewNodeDoc } from "@/entities/docs-vault";
import { buildOntologyRelationRemovalPlan, edgeAuthoredByFromNode, type MeaningEditRelation, meaningEditRelationForEdgeType, type OntologyRelationEditPlan, parseOntologyMeaningEditParam } from "@/entities/knowledge-graph";
import { useAgentServer, VaultConflictError } from "@/entities/vault-session";
import type { AcpTurnActivity } from "@/features/acp-session";
import { type MeaningEditorPreview, type MeaningEditorRelationRow, type MeaningEditorWrite } from "@/features/ontology-meaning-editor";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/vault-document/replace-vault-body";
import { useHeldValue } from "@/shared/lib/render-timing/use-presence";
import { useToast } from "@/shared/ui";
import { type AcpOntologyRelationPreview } from "@/widgets/acp-chat-panel";
import { type IndexAddConcept } from "@/widgets/topology-index-panel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveAgentFocusNodeId, resolveOntologyRelationPreview } from "../../lib/agent/resolve-agent-focus-node";
import { resolveNodeVaultRef, resolveTopologyNodeEditTarget } from "../../lib/authoring/topology-node-edit";
import { type CreateNodeInput } from "../../ui/CreateNodeForm";
import { type CreateSelection } from "./create-defaults";
import { renameTitleHeading, replaceLeadParagraph } from "./lead-paragraph";
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
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "tMeaningEditor" | "t" | "relationVocabulary" | "relationRegister" | "activeLocale">;
  topologyVaultReadModel: Pick<
    ReturnType<typeof useTopologyVaultReadModel>,
    | "selectedOntologyNode"
    | "vault"
    | "ontologyInsight"
    | "setNeedsVaultReason"
    | "recentChanges"
    | "docFreshnessIndex"
    | "updatedAgoNowMs"
    | "vaultIdentity"
  >;
}
export function useTopologyAuthoring({ setRouteState, meaningEditorIntent, meaningEditParam, toast, topologyVaultReadModel, topologyPreferences }: Options) {
  const { selectedOntologyNode, vault, ontologyInsight, setNeedsVaultReason, recentChanges, docFreshnessIndex, updatedAgoNowMs, vaultIdentity } = topologyVaultReadModel;
  const { tMeaningEditor, t, relationVocabulary, relationRegister, activeLocale } = topologyPreferences;
  const { runManualWrite, undoLastManualWrite } = useManualWriteUndo({ vault, folder: vaultIdentity, toast, t });

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
  const meaningEditorCandidates = useMemo(() => {
    const nodes = ontologyInsight?.nodes ?? [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    // The domain a node sits in, read from containment edges: an element through its capability.
    const container = new Map<string, string>();
    for (const edge of ontologyInsight?.edges ?? []) {
      if (edge.type === "contains" && !container.has(edge.to)) container.set(edge.to, edge.from);
    }
    const domainTitleOf = (id: string): string | null => {
      let current = container.get(id);
      for (let hop = 0; current && hop < 3; hop += 1) {
        const node = byId.get(current);
        if (node?.kind === "domain") return node.display ?? node.title;
        current = container.get(current);
      }
      return null;
    };
    return nodes
      .filter((node) => ["project", "domain", "capability", "element"].includes(node.kind))
      .map((node) => ({
        id: node.id,
        slug: resolveNodeVaultRef(node),
        title: node.display ?? node.title,
        kind: node.kind,
        names: [node.title, ...Object.values(node.displayLocales ?? {})],
        domainTitle: node.kind === "capability" || node.kind === "element" ? domainTitleOf(node.id) : null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [ontologyInsight]);
  /** The relations the editor lists: those the open document declares, and those other documents declare toward it. */
  const meaningEditorRelations = useMemo<MeaningEditorRelationRow[]>(() => {
    if (!meaningEditorSource || !ontologyInsight) return [];
    const byId = new Map(ontologyInsight.nodes.map((node) => [node.id, node]));
    const rows: MeaningEditorRelationRow[] = [];
    for (const edge of ontologyInsight.edges) {
      const relation = meaningEditRelationForEdgeType(edge.type);
      if (!relation) continue;
      const outgoing = edge.from === meaningEditorSource.id;
      if (!outgoing && edge.to !== meaningEditorSource.id) continue;
      const declarer = byId.get(edge.from);
      if (!declarer || !edgeAuthoredByFromNode(edge.evidenceIds[0], declarer.evidenceIds[0])) continue;
      const other = byId.get(outgoing ? edge.to : edge.from);
      if (!other) continue;
      rows.push({
        relation,
        direction: outgoing ? "out" : "in",
        otherId: other.id,
        otherTitle: other.display ?? other.title,
        why: edge.label?.trim() || null,
      });
    }
    return rows;
  }, [meaningEditorSource, ontologyInsight]);
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
  /** Every relation write lands at once and answers with a toast that offers Undo. */
  const applyMeaningEditor = useCallback(
    async (plan: OntologyRelationEditPlan, what: MeaningEditorWrite, targetTitle: string) => {
      if (!nodeEditTarget || !meaningEditorSource) throw new Error("missing edit target");
      try {
        await runManualWrite({
          slug: nodeEditTarget.vaultSlug,
          write: () => vault.updateFrontmatter(nodeEditTarget.vaultSlug, plan.updates, { expectedMtime: nodeEditTarget.mtime }),
          message: tMeaningEditor(`written.${what}`, { source: meaningEditorSource.title, target: targetTitle }),
        });
        setMeaningPreview(null);
        setRouteState((current) => ({ ...current, meaningEditParam: null }));
      } catch (error) {
        toast.show(tMeaningEditor("saveError"), "error");
        throw error;
      }
    },
    [meaningEditorSource, nodeEditTarget, runManualWrite, setRouteState, tMeaningEditor, toast, vault],
  );
  /** An incoming relation lives in the other document, so its removal writes that document. */
  const removeIncomingRelation = useCallback(
    async (row: MeaningEditorRelationRow) => {
      const other = ontologyInsight?.nodes.find((node) => node.id === row.otherId);
      const target = other ? resolveTopologyNodeEditTarget(other, vault.manifest?.docs ?? []) : null;
      if (!target || !meaningEditorSource || !selectedOntologyNode) throw new Error("missing edit target");
      const plan = buildOntologyRelationRemovalPlan({
        sourceSlug: target.vaultSlug,
        targetSlug: resolveNodeVaultRef(selectedOntologyNode),
        targetKind: selectedOntologyNode.kind,
        relation: row.relation,
        frontmatter: target.frontmatter,
      });
      try {
        await runManualWrite({
          slug: target.vaultSlug,
          write: () => vault.updateFrontmatter(target.vaultSlug, plan.updates, { expectedMtime: target.mtime }),
          message: tMeaningEditor("written.removed", { source: row.otherTitle, target: meaningEditorSource.title }),
        });
      } catch (error) {
        toast.show(tMeaningEditor("saveError"), "error");
        throw error;
      }
    },
    [meaningEditorSource, ontologyInsight, runManualWrite, selectedOntologyNode, tMeaningEditor, toast, vault],
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
  /** The file's current bytes, read fresh so an edit never builds on a stale copy. */
  const readEditTarget = useCallback(async () => {
    if (!nodeEditTarget || !selectedOntologyNode) return null;
    const handle = vault.fileHandles.get(nodeEditTarget.vaultSlug);
    const raw = handle ? await (await handle.getFile()).text() : nodeBody?.slug === nodeEditTarget.vaultSlug ? nodeBody.raw : null;
    return raw === null ? null : { target: nodeEditTarget, node: selectedOntologyNode, raw };
  }, [nodeBody, nodeEditTarget, selectedOntologyNode, vault.fileHandles]);
  const saveInPlace = useCallback(
    async (slug: string, mtime: number | undefined, content: string, message: string) => {
      try {
        await runManualWrite({ slug, write: () => vault.saveDoc(slug, content, { expectedMtime: mtime }), written: content, message });
      } catch (error) {
        toast.show(t(error instanceof VaultConflictError ? "explanationEdit.conflict" : "explanationEdit.error"), "error");
        throw error;
      }
    },
    [runManualWrite, t, toast, vault],
  );
  /**
   * Renames in place: the name shown in this screen's language changes, with the title heading
   * when it spelled the old name. Slug and uid stay, so every reference still resolves.
   */
  const renameConcept = useCallback(
    async (next: string) => {
      const name = next.trim();
      const edit = await readEditTarget();
      if (!edit || !name) return;
      const { frontmatter } = parseFrontmatter(edit.raw);
      const localeKey = `display_${activeLocale}`;
      const key = typeof frontmatter[localeKey] === "string" && frontmatter[localeKey] !== "" ? localeKey : "title";
      const previous = String(frontmatter[key] ?? "");
      if (previous === name) return;
      // A title that spelled the same name moves with it, so the two never drift apart.
      const updates = { [key]: name, ...(key !== "title" && frontmatter.title === previous ? { title: name } : {}) };
      const content = renameTitleHeading(applyFrontmatterUpdates(edit.raw, updates), previous, name);
      await saveInPlace(edit.target.vaultSlug, edit.target.mtime, content, t("conceptEdit.renamed", { from: previous, to: name }));
    },
    [activeLocale, readEditTarget, saveInPlace, t],
  );
  /** The description is `description:` when the file keeps one, else the paragraph under the title. */
  const saveConceptDescription = useCallback(
    async (next: string) => {
      const edit = await readEditTarget();
      if (!edit) return;
      const { frontmatter } = parseFrontmatter(edit.raw);
      const titles = Object.entries(frontmatter)
        .filter(([key, value]) => (key === "title" || key.startsWith("display_")) && typeof value === "string")
        .map(([, value]) => (value as string).trim());
      const content =
        typeof frontmatter.description === "string"
          ? applyFrontmatterUpdates(edit.raw, { description: next.trim() || null })
          : replaceLeadParagraph(edit.raw, next, titles);
      if (content === edit.raw) return;
      await saveInPlace(edit.target.vaultSlug, edit.target.mtime, content, t("conceptEdit.described", { name: edit.node.display ?? edit.node.title }));
    },
    [readEditTarget, saveInPlace, t],
  );
  /** The documents whose lines would point at nothing once this one is gone, as the docs delete names them. */
  const deleteReferrers = useMemo(() => {
    const slug = nodeEditTarget?.vaultSlug;
    if (!slug || !vault.manifest) return [];
    const seen = new Set<string>();
    const referrers: { slug: string; title: string }[] = [];
    for (const entry of vault.manifest.backlinksDetail?.[slug] ?? []) {
      if (entry.fromSlug === slug || seen.has(entry.fromSlug)) continue;
      seen.add(entry.fromSlug);
      const doc = vault.manifest.docs.find((d) => d.slug === entry.fromSlug);
      const localized = doc?.frontmatter?.[`display_${activeLocale}`];
      referrers.push({ slug: entry.fromSlug, title: typeof localized === "string" && localized ? localized : doc?.title ?? entry.fromSlug });
    }
    return referrers;
  }, [activeLocale, nodeEditTarget, vault.manifest]);
  const deleteConcept = useCallback(async () => {
    if (!nodeEditTarget || !selectedOntologyNode) return;
    const slug = nodeEditTarget.vaultSlug;
    try {
      await runManualWrite({
        slug,
        write: () => vault.deleteDoc(slug, { expectedMtime: nodeEditTarget.mtime }),
        written: null,
        message: t("conceptEdit.deleted", { name: selectedOntologyNode.display ?? selectedOntologyNode.title }),
      });
      setRouteState((current) => ({ ...current, selectedSlug: null }));
    } catch (error) {
      toast.show(t(error instanceof VaultConflictError ? "conceptEdit.deleteConflict" : "conceptEdit.deleteFailed"), "error");
      throw error;
    }
  }, [nodeEditTarget, runManualWrite, selectedOntologyNode, setRouteState, t, toast, vault]);
  return {
    canCreateNode, createNodeOpen, bootstrapOpen, setCreateNodeOpen, nodeEditTarget, agentActivityStatus,
    agentFocusNodeId, agentServer, acpTurnActivityFrame, setAcpTurnActivityFrame, nodeBody,
    saveNodeExplanation, meaningEditorState, meaningEditorSource, edgePanelOpen, setHoverEdge,
    setMeaningEditorState, setSelectedEdge, closeCreateNode, selectedEdge, setBootstrapOpen, bootstrapPlan,
    runBootstrap, createNode, createNodeDomainOptions, createNodeExistingConcepts, createSelection,
    runManualWrite, undoLastManualWrite, addConceptInGroup, renameConcept, saveConceptDescription, deleteReferrers, deleteConcept,
    agentAttributedRecentNodeId, agentConnect, mapRevealToken, handleHoverEdge, mapRelationPreview,
    handleHoverCluster, openMeaningEditor, heldMeaningEditorState, meaningEditorCandidates, setMeaningPreview,
    applyMeaningEditor, closeMeaningEditor, meaningEditorRelations, removeIncomingRelation, hoverEdgeCardModel, clusterHoverCardModel, heldEdgePanelModel,
    edgePanelModel, setAcpRelationPreview
  } as const;
}
