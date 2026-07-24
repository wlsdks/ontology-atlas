"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { SimilarNodeCandidate } from "@/shared/lib/similar-node-title";
import { EmptyState, useToast } from "@/shared/ui";
import { buildStudioItem, selectDefaultStudioNodeId } from "../lib/build-studio-item";
import { buildStudioMap } from "../lib/build-studio-map";
import {
  buildCreateNodeDoc,
  buildMcpPacket,
  candidateFromNode,
  type CreateCandidate,
  type CreateDraft,
} from "../lib/build-create-node";
import { StudioArena, type StudioArenaLabels } from "./StudioArena";
import { StudioCreateArena, type StudioCreateLabels } from "./StudioCreateArena";

/**
 * `/ontology/studio` — the Ontology Studio. Two modes off one route
 * (static-export compatible, switched by `?mode=`):
 *
 * - **enhance** (default, Slice 1) — read one node's real relations as a game
 *   item you complete by socketing relation gems. `?node=<id>` deeplinks;
 *   otherwise the most-connected capability is chosen deterministically.
 * - **create** (`?mode=create`, Slice 2) — ASSEMBLE a brand-new node by
 *   clicking relation cards, then apply two ways: 직접 적용 (write the .md to a
 *   loaded local vault via `createDoc`) or 에이전트에게 맡기기 (copy an MCP
 *   command packet — the only active route in read-only / sample mode).
 */

// Static particle seeds — deterministic so SSR (static export) and the client
// render the same DOM (no hydration mismatch from Math.random).
const PARTICLE_SEEDS = [
  { left: 14, top: 62, dur: 6.1, delay: 0.4, opacity: 0.5 },
  { left: 28, top: 48, dur: 7.3, delay: 2.1, opacity: 0.42 },
  { left: 41, top: 78, dur: 5.4, delay: 1.0, opacity: 0.6 },
  { left: 52, top: 55, dur: 8.0, delay: 3.4, opacity: 0.36 },
  { left: 63, top: 82, dur: 6.7, delay: 0.9, opacity: 0.55 },
  { left: 74, top: 44, dur: 7.8, delay: 4.2, opacity: 0.4 },
  { left: 86, top: 70, dur: 5.9, delay: 2.6, opacity: 0.48 },
  { left: 20, top: 84, dur: 6.4, delay: 1.7, opacity: 0.52 },
  { left: 35, top: 40, dur: 7.1, delay: 3.0, opacity: 0.38 },
  { left: 48, top: 90, dur: 5.6, delay: 0.2, opacity: 0.58 },
  { left: 58, top: 46, dur: 8.2, delay: 2.9, opacity: 0.34 },
  { left: 69, top: 76, dur: 6.0, delay: 1.4, opacity: 0.5 },
  { left: 80, top: 52, dur: 7.5, delay: 3.7, opacity: 0.44 },
  { left: 90, top: 66, dur: 6.3, delay: 0.7, opacity: 0.46 },
] as const;

const STUDIO_BASE = "/ontology/studio";
const CREATE_HREF = `${STUDIO_BASE}?mode=create`;

export function OntologyStudioPage() {
  const t = useTranslations("ontologyStudio");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { insight } = useOntologyInsight();
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const kindLabel = useOntologyKindLabel();
  const toast = useToast();

  const isCreate = searchParams.get("mode") === "create";
  const requestedNode = searchParams.get("node");

  const nodes = useMemo(() => insight?.nodes ?? [], [insight]);
  const edges = useMemo(() => insight?.edges ?? [], [insight]);

  // ── ENHANCE mode data ──────────────────────────────────────────────────
  const item = useMemo(() => {
    if (nodes.length === 0) return null;
    const targetId =
      (requestedNode && nodes.some((n) => n.id === requestedNode) ? requestedNode : null) ??
      selectDefaultStudioNodeId(nodes, edges);
    if (!targetId) return null;
    return buildStudioItem(targetId, nodes, edges);
  }, [nodes, edges, requestedNode]);

  // Ego subgraph for the focal node, adapted to the app's real map renderer —
  // the ENHANCE arena's central visual. Keyed off the resolved item so it
  // tracks the same focal node the stats/sockets describe.
  const studioMap = useMemo(
    () => (item ? buildStudioMap(item.node.id, nodes, edges) : { nodes: [], edges: [] }),
    [item, nodes, edges],
  );

  // ── CREATE mode data ───────────────────────────────────────────────────
  const writable = mode === "local" && localVault.status === "loaded";

  const domains = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === "domain")
        .map((n) => ({ value: n.id.replace(/^domain:/, ""), title: n.display ?? n.title })),
    [nodes],
  );
  const candidates = useMemo<CreateCandidate[]>(() => nodes.map((n) => candidateFromNode(n)), [nodes]);
  const similarCandidates = useMemo<SimilarNodeCandidate[]>(
    () => candidates.map((c) => ({ slug: c.ref, title: c.title, kind: c.kind })),
    [candidates],
  );
  const refToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidates) map.set(c.ref, c.id);
    return map;
  }, [candidates]);

  const onDeferredAction = useCallback(() => {
    toast.show(t("nextSlice"), "info");
  }, [toast, t]);

  const enterCreate = useCallback(() => router.push(CREATE_HREF), [router]);
  const exitCreate = useCallback(() => router.push(STUDIO_BASE), [router]);

  const applyDirect = useCallback(
    async (draft: CreateDraft) => {
      try {
        const { slug, markdown } = buildCreateNodeDoc(draft);
        await localVault.createDoc(slug, markdown);
        toast.show(t("create.appliedDirect", { title: draft.title.trim() }), "success");
        // Hand the fresh node to enhance so the user can keep completing it.
        const tail = slug.split("/").at(-1) ?? "";
        router.push(`${STUDIO_BASE}?node=${encodeURIComponent(`${draft.kind}:${tail}`)}`);
      } catch (err) {
        toast.show(
          t("create.applyFailed", { message: err instanceof Error ? err.message : String(err) }),
          "error",
        );
      }
    },
    [localVault, toast, t, router],
  );

  const applyAgent = useCallback(
    async (draft: CreateDraft) => {
      const packet = buildMcpPacket(draft);
      try {
        await navigator.clipboard.writeText(packet);
        toast.show(t("create.copiedAgent"), "success");
      } catch {
        // Clipboard blocked (permissions / insecure context) — still confirm the
        // packet was built; the user can re-trigger once focus/permission allows.
        toast.show(t("create.copyFailed"), "info");
      }
    },
    [toast, t],
  );

  const openSimilar = useCallback(
    (slug: string) => {
      const nodeId = refToNodeId.get(slug);
      if (nodeId) router.push(`${STUDIO_BASE}?node=${encodeURIComponent(nodeId)}`);
    },
    [refToNodeId, router],
  );

  // ── CREATE surface ─────────────────────────────────────────────────────
  if (isCreate) {
    const createLabels: StudioCreateLabels = {
      mode: t("create.mode"),
      title: t("create.title"),
      close: t("create.close"),
      kindLabelHead: t("create.kindLabel"),
      nameLabel: t("create.nameLabel"),
      namePlaceholder: t("create.namePlaceholder"),
      domainLabel: t("create.domainLabel"),
      domainNone: t("create.domainNone"),
      definitionLabel: t("create.definitionLabel"),
      definitionPlaceholder: t("create.definitionPlaceholder"),
      gaugeLabel: t("create.gaugeLabel"),
      gaugeNote: (filled, total) => t("create.gaugeNote", { filled, total }),
      assembleTitle: t("create.assembleTitle"),
      assembleSubtitle: t("create.assembleSubtitle"),
      progress: (filled, total) => t("create.progress", { filled, total }),
      relation: {
        isA: {
          title: t("create.relation.isA.title"),
          type: t("create.relation.isA.type"),
          hint: t("create.relation.isA.hint"),
          add: t("create.relation.isA.add"),
        },
        dependsOn: {
          title: t("create.relation.dependsOn.title"),
          type: t("create.relation.dependsOn.type"),
          hint: t("create.relation.dependsOn.hint"),
          add: t("create.relation.dependsOn.add"),
        },
        contains: {
          title: t("create.relation.contains.title"),
          type: t("create.relation.contains.type"),
          hint: t("create.relation.contains.hint"),
          add: t("create.relation.contains.add"),
        },
        relates: {
          title: t("create.relation.relates.title"),
          type: t("create.relation.relates.type"),
          hint: t("create.relation.relates.hint"),
          add: t("create.relation.relates.add"),
        },
      },
      isaTag: t("create.isaTag"),
      optionalTag: t("create.optionalTag"),
      emptyCard: t("create.emptyCard"),
      pickerPlaceholder: t("create.pickerPlaceholder"),
      pickerEmpty: t("create.pickerEmpty"),
      pickerHint: t("create.pickerHint"),
      previewLabel: t("create.previewLabel"),
      previewGhostIsa: t("create.previewGhostIsa"),
      similarMessage: (title, kLabel, dLabel) =>
        t("create.similarMessage", { title, kind: kLabel, domain: dLabel }),
      similarOpen: t("create.similarOpen"),
      similarCreateAnyway: t("create.similarCreateAnyway"),
      ledgerCount: (count) => t("create.ledgerCount", { count }),
      pendingNode: (kLabel) => t("create.pendingNode", { kind: kLabel }),
      pendingRelation: (relationLabel, target) =>
        t("create.pendingRelation", { relation: relationLabel, target }),
      applyDirect: t("create.applyDirect"),
      applyDirectSub: t("create.applyDirectSub"),
      applyDirectDisabled: t("create.applyDirectDisabled"),
      applyAgent: t("create.applyAgent"),
      applyAgentSub: t("create.applyAgentSub"),
    };

    return (
      <StudioCreateArena
        labels={createLabels}
        kindLabel={kindLabel}
        domains={domains}
        candidates={candidates}
        similarCandidates={similarCandidates}
        writable={writable}
        onApplyDirect={applyDirect}
        onApplyAgent={applyAgent}
        onOpenSimilar={openSimilar}
        onExit={exitCreate}
        particleSeeds={PARTICLE_SEEDS}
      />
    );
  }

  // ── ENHANCE surface ────────────────────────────────────────────────────
  const labels: StudioArenaLabels = {
    mode: t("mode"),
    close: t("close"),
    statsTitle: t("statsTitle"),
    socketsTitle: t("socketsTitle"),
    axis: {
      definition: t("axis.definition"),
      evidence: t("axis.evidence"),
      contains: t("axis.contains"),
      dependsOn: t("axis.dependsOn"),
      relates: t("axis.relates"),
      isA: t("axis.isA"),
    },
    statConfirmed: t("statConfirmed"),
    statMissing: t("statMissing"),
    level: (from, to) => t("level", { from, to }),
    levelMax: (level) => t("levelMax", { level }),
    gaugeLead: t("gaugeLead"),
    gaugeTrail: t("gaugeTrail"),
    gaugeMax: (percent) => t("gaugeMax", { percent }),
    isaTag: t("isaTag"),
    isaPrompt: (title) => t("isaPrompt", { title }),
    relationMeta: (count) => t("relationMeta", { count }),
    relatesPick: t("relatesPick"),
    relatesEmptyHint: t("relatesEmptyHint"),
    add: t("add"),
    readOnlyNote: t("readOnlyNote"),
    enhance: t("enhance"),
    enhanceSub: t("enhanceSub"),
    agent: t("agent"),
    mapAria: t("mapAria", { title: item?.node.label ?? "" }),
  };

  if (!item) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6">
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyBody")}
          tone="solid"
          align="center"
          action={
            <button
              type="button"
              onClick={enterCreate}
              className="rounded-lg border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("create.entry")}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <StudioArena
      item={item}
      map={studioMap}
      labels={labels}
      onDeferredAction={onDeferredAction}
      onCreate={enterCreate}
      createLabel={t("create.entry")}
    />
  );
}
