"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { findSimilarNodeByTitle, type SimilarNodeCandidate } from "@/shared/lib/similar-node-title";
import { EmptyState, useToast } from "@/shared/ui";
import {
  buildStudioItem,
  selectDefaultStudioNodeId,
  BEARING_FRONTMATTER_KEY,
  type StudioBearing,
  type StudioRelation,
} from "../lib/build-studio-item";
import {
  buildCreateNodeDoc,
  buildEditPacket,
  buildFillPacket,
  buildMcpPacket,
  buildRemovePacket,
  candidateFromNode,
  kindExpectsDomain,
  type CreateCandidate,
  type CreateDraft,
  type CreateNodeKind,
  type PendingRelation,
} from "../lib/build-create-node";
import {
  isRelationEditableFromFocal,
  planRelationRefUpdates,
  projectBearings,
  reduceStudioChanges,
  summarizeStudioChanges,
  type StudioChange,
  type StudioSummaryVocab,
} from "../lib/build-studio-changes";
import { buildPickerDiscovery } from "../lib/build-picker-discovery";
import { StudioCompass, type CompassBearingView, type StudioCompassLabels } from "./StudioCompass";

/**
 * `/ontology/studio` — the 나침 무대 (Compass Stage), the vault WRITE surface.
 * ONE surface, two fill-states (no mode tabs):
 *   - default            an existing node, partially filled (`?node=<id>`).
 *   - `?mode=create`     an all-empty new node.
 * See `StudioCompass` for the visual contract and `build-studio-item` for the
 * bearing-grouping data model.
 */

const STUDIO_BASE = "/ontology/studio";
const CREATE_HREF = `${STUDIO_BASE}?mode=create`;
const EXIT_HREF = "/topology";

const CREATE_KINDS: CreateNodeKind[] = ["project", "domain", "capability", "element"];

/** Which existing-node kinds each relation offers as picker candidates. */
const CANDIDATE_KINDS: Record<StudioRelation, ReadonlySet<string> | null> = {
  isA: new Set(["capability", "domain", "project"]),
  dependsOn: new Set(["capability", "element"]),
  contains: new Set(["capability", "element"]),
  relates: null, // any non-container
};

const RELATIONS: StudioRelation[] = ["isA", "dependsOn", "contains", "relates"];
const BEARING_OF: Record<StudioRelation, StudioBearing> = {
  isA: "up",
  dependsOn: "right",
  contains: "down",
  relates: "left",
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

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
  const writable = mode === "local" && localVault.status === "loaded";

  const candidates = useMemo<CreateCandidate[]>(() => nodes.map((n) => candidateFromNode(n)), [nodes]);
  const similarCandidates = useMemo<SimilarNodeCandidate[]>(
    () => candidates.map((c) => ({ slug: c.ref, title: c.title, kind: c.kind })),
    [candidates],
  );
  const domains = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === "domain")
        .map((n) => ({ value: n.id.replace(/^domain:/, ""), title: n.display ?? n.title })),
    [nodes],
  );

  const flowHint = useCallback(
    (filled: number) =>
      filled >= 4 ? t("flowHint.done") : filled >= 3 ? t("flowHint.almost") : filled >= 1 ? t("flowHint.half") : t("flowHint.start"),
    [t],
  );

  const questionFor = useCallback((relation: StudioRelation) => t(`question.${relation}`), [t]);
  const laneLabelFor = useCallback((relation: StudioRelation) => t(`laneLabel.${relation}`), [t]);
  const emptyHintFor = useCallback((relation: StudioRelation) => t(`emptyHint.${relation}`), [t]);

  const labels: StudioCompassLabels = useMemo(
    () => ({
      searchPlaceholder: t("searchPlaceholder"),
      exit: t("exit"),
      moreRelations: t("moreRelations"),
      flowEyebrow: t("flowEyebrow"),
      flowCount: (filled, total) => `${t("flowCount", { filled, total })} ${flowHint(filled)}`,
      framePrompt: (name) => (isCreate ? t("create.framePrompt") : t("framePrompt", { name })),
      guideBadge: t("guideBadge"),
      bottomProgress: (filled, total) =>
        `${t("bottomProgress", { filled, total })} ${filled >= total ? t("bottomDone") : t("bottomRemain", { remain: total - filled })}`,
      save: t("save"),
      saveHint: t("saveHint"),
      foldMore: () => t("foldMore"),
      foldTitle: (label, total) => t("foldTitle", { label, total }),
      defMore: t("defMore"),
      defLess: t("defLess"),
      pickerTitle: (question) => question,
      pickerSub: t("picker.sub"),
      pickerPlaceholder: t("picker.placeholder"),
      pickerEmpty: t("picker.empty"),
      pickerKind: (kindLabelText) => kindLabelText,
      pickerCreateNew: t("picker.createNew"),
      suggestHeading: t("picker.suggestHeading"),
      browseHeading: t("picker.browseHeading"),
      reasonSameDomain: t("picker.reasonSameDomain"),
      reasonTitleSimilar: t("picker.reasonTitleSimilar"),
      reasonAdjacent: t("picker.reasonAdjacent"),
      browseBack: t("picker.browseBack"),
      browseNoDomain: t("picker.browseNoDomain"),
      similarSuggest: (title) => t("picker.similar", { title }),
      similarAccept: t("picker.similarAccept"),
      createName: t("kindLabel"),
      createNamePlaceholder: t("create.namePlaceholder"),
      createDomainNone: t("create.domainNone"),
      createDefinitionPlaceholder: t("create.definitionPlaceholder"),
      createSimilar: (title, kindLabelText) => t("create.similar", { title, kind: kindLabelText }),
      createSimilarOpen: t("create.similarOpen"),
      createSimilarAnyway: t("create.similarAnyway"),
      // Slice 1 — edit existing relations
      edit: t("edit"),
      editTitle: t("editTitle"),
      editRetypeHeading: t("editRetypeHeading"),
      editMoveTo: (bearingLabelText) => t("editMoveTo", { bearing: bearingLabelText }),
      editDelete: t("editDelete"),
      editDeleteConfirm: t("editDeleteConfirm"),
      editDeleteYes: t("editDeleteYes"),
      editDeleteCancel: t("editDeleteCancel"),
      editElsewhere: (other) => t("editElsewhere", { other }),
      editElsewhereGo: t("editElsewhereGo"),
      pendingBadge: t("pendingBadge"),
      // Slice 2 — record summary + commit
      summaryUndo: t("summaryUndo"),
      exitConfirmTitle: t("exitConfirmTitle"),
      exitConfirmDiscard: t("exitConfirmDiscard"),
      exitConfirmKeep: t("exitConfirmKeep"),
      commitEmptyHint: t("commitEmptyHint"),
    }),
    [t, isCreate, flowHint],
  );

  // Plain-language record summary vocab — one bag serving both ko + en and both
  // modes (enhance / create). Shared by the "이렇게 기록됩니다" panel.
  const relationShort = useCallback((relation: StudioRelation) => t(`relationShort.${relation}`), [t]);
  const summaryVocab: StudioSummaryVocab = useMemo(
    () => ({
      relationLabel: relationShort,
      addLine: (relationLabelText, title) => t("summary.addLine", { relation: relationLabelText, title }),
      moveLine: (title, toLabel) => t("summary.moveLine", { title, relation: toLabel }),
      removeLine: (relationLabelText, title) => t("summary.removeLine", { relation: relationLabelText, title }),
      enhanceHeadline: (name, count) => t("summary.enhanceHeadline", { name, count }),
      enhanceFileEffect: () => t("summary.enhanceFileEffect"),
      createHeadline: (kindLabelText, name, domainLabelText) =>
        domainLabelText
          ? t("summary.createHeadlineDomain", { kind: kindLabelText, name, domain: domainLabelText })
          : t("summary.createHeadline", { kind: kindLabelText, name }),
      createFileEffect: (count) => t("summary.createFileEffect", { count }),
      collapsedCount: (count) => t("summary.collapsed", { count }),
      empty: t("summary.empty"),
    }),
    [t, relationShort],
  );

  const enterCreate = useCallback(() => router.push(CREATE_HREF), [router]);
  const exit = useCallback(() => router.push(EXIT_HREF), [router]);
  const openNode = useCallback(
    (id: string) => router.push(`${STUDIO_BASE}?node=${encodeURIComponent(id)}`),
    [router],
  );

  // Candidate picker for a relation — allowed kinds, minus already-linked / self.
  const makeCandidatesFor = useCallback(
    (relation: StudioRelation, query: string, exclude: ReadonlySet<string>): CreateCandidate[] => {
      const allow = CANDIDATE_KINDS[relation];
      const q = query.trim().toLowerCase();
      return candidates
        .filter((c) => (allow ? allow.has(c.kind) : c.kind !== "project" && c.kind !== "domain"))
        .filter((c) => !exclude.has(c.id))
        .filter((c) => (q ? c.title.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q) : true))
        .slice(0, 8);
    },
    [candidates],
  );

  // Near-dup nudge in the picker — the user typed the exact name of an existing node.
  const makeSimilarFor = useCallback(
    (relation: StudioRelation, query: string, exclude: ReadonlySet<string>): CreateCandidate | null => {
      const q = normalize(query);
      if (q.length < 2) return null;
      const allow = CANDIDATE_KINDS[relation];
      return (
        candidates.find(
          (c) =>
            (allow ? allow.has(c.kind) : c.kind !== "project" && c.kind !== "domain") &&
            !exclude.has(c.id) &&
            normalize(c.title) === q,
        ) ?? null
      );
    },
    [candidates],
  );

  // ─────────────────────────────── CREATE state ──────────────────────────
  const [kind, setKind] = useState<CreateNodeKind>("capability");
  const [title, setTitle] = useState("");
  const [domainValue, setDomainValue] = useState<string | null>(null);
  const [definition, setDefinition] = useState("");
  const [relations, setRelations] = useState<PendingRelation[]>([]);
  const [similarDismissed, setSimilarDismissed] = useState(false);

  // ─────────────────────────────── ENHANCE staged changes ────────────────
  // Which existing node the enhance stage is centered on (deeplink or default).
  // Declared up here so the reset effect keeps a stable hook order across the
  // create/enhance early return.
  const enhanceFocalId = useMemo(() => {
    if (nodes.length === 0) return null;
    return (
      (requestedNode && nodes.some((n) => n.id === requestedNode) ? requestedNode : null) ??
      selectDefaultStudioNodeId(nodes, edges)
    );
  }, [requestedNode, nodes, edges]);

  // Slice 2 — enhance is STAGED: fills / retypes / deletes accumulate here and
  // only land on "확인하고 저장". Reset whenever the focal node changes so a new
  // node never inherits another node's pending edits — the React-recommended
  // "reset state during render when a prop changes" pattern (no effect).
  const [changes, setChanges] = useState<StudioChange[]>([]);
  const [prevFocalId, setPrevFocalId] = useState(enhanceFocalId);
  if (prevFocalId !== enhanceFocalId) {
    setPrevFocalId(enhanceFocalId);
    setChanges([]);
  }

  // Slice 3 — the enhance stage's focal item + optimistic projection, lifted
  // above the create early-return so `discoveryFor` is a STABLE memoized
  // callback (the picker memoizes discovery per socket-open on its identity).
  const enhanceItem = useMemo(
    () => (enhanceFocalId ? buildStudioItem(enhanceFocalId, nodes, edges) : null),
    [enhanceFocalId, nodes, edges],
  );
  const enhanceProjection = useMemo(() => {
    if (!enhanceItem) return null;
    return projectBearings(
      {
        isA: enhanceItem.bearings.up.neighbors,
        dependsOn: enhanceItem.bearings.right.neighbors,
        contains: enhanceItem.bearings.down.neighbors,
        relates: enhanceItem.bearings.left.neighbors,
      },
      changes,
    );
  }, [enhanceItem, changes]);
  // The picker's discovery surface (추천 + 둘러보기) for a socket's relation —
  // excludes self + already-connected + staged targets. Read-only, deterministic.
  const discoveryFor = useCallback(
    (relation: StudioRelation) =>
      buildPickerDiscovery({
        focalId: enhanceItem?.node.id ?? "",
        nodes,
        edges,
        relation,
        allowedKinds: CANDIDATE_KINDS[relation],
        stagedTargetIds: enhanceProjection?.pendingTargetIds,
      }),
    [enhanceItem, nodes, edges, enhanceProjection],
  );

  const draft: CreateDraft = useMemo(
    () => ({ kind, title, domainValue, definition, relations }),
    [kind, title, domainValue, definition, relations],
  );

  const createSimilarHit = useMemo(() => {
    if (similarDismissed || !title.trim()) return null;
    return findSimilarNodeByTitle(title, kind, similarCandidates);
  }, [title, kind, similarCandidates, similarDismissed]);

  const openSimilarNode = useCallback(
    (slug: string) => {
      const node = candidates.find((c) => c.ref === slug);
      if (node) router.push(`${STUDIO_BASE}?node=${encodeURIComponent(node.id)}`);
    },
    [candidates, router],
  );

  const applyCreate = useCallback(async () => {
    if (!title.trim()) return;
    if (writable) {
      try {
        const { slug, markdown } = buildCreateNodeDoc(draft);
        await localVault.createDoc(slug, markdown);
        toast.show(t("create.appliedDirect", { title: title.trim() }), "success");
        const tail = slug.split("/").at(-1) ?? "";
        router.push(`${STUDIO_BASE}?node=${encodeURIComponent(`${kind}:${tail}`)}`);
      } catch (err) {
        toast.show(t("create.applyFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(buildMcpPacket(draft));
      toast.show(t("create.copiedAgent"), "success");
    } catch {
      toast.show(t("create.copyFailed"), "info");
    }
  }, [title, writable, draft, localVault, toast, t, router, kind]);

  if (isCreate) {
    const bearings: CompassBearingView[] = RELATIONS.map((relation) => {
      const rels = relations.filter((r) => r.type === relation);
      const neighbors = rels.map((r) => ({
        id: r.candidate.id,
        title: r.candidate.title,
        kind: r.candidate.kind,
        ref: r.candidate.ref,
      }));
      const filled = neighbors.length > 0;
      return {
        bearing: BEARING_OF[relation],
        relation,
        question: questionFor(relation),
        laneLabel: laneLabelFor(relation),
        emptyHint: emptyHintFor(relation),
        neighbors,
        filled,
        recommended: !filled && relation === "isA",
        expected: !filled && relation === "contains",
      };
    });
    const filledBearings = bearings.filter((b) => b.filled).length;
    const excludeFor = (relation: StudioRelation) =>
      new Set(relations.filter((r) => r.type === relation).map((r) => r.candidate.id));

    const createChanges: StudioChange[] = relations.map((r) => ({
      op: "add",
      relation: r.type,
      target: { id: r.candidate.id, title: r.candidate.title, kind: r.candidate.kind, ref: r.candidate.ref },
    }));
    const domainLabelText = domains.find((d) => d.value === domainValue)?.title ?? null;
    const createSummary = summarizeStudioChanges(
      { mode: "create", kindLabel: kindLabel(kind), name: title.trim() || t("create.namePlaceholder"), domainLabel: domainLabelText, changes: createChanges },
      summaryVocab,
    );

    return (
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={kindLabel}
        focal={{
          kindLabel: kindLabel(kind),
          domainLabel: domainLabelText,
          name: title,
          definition,
        }}
        bearings={bearings}
        filledBearings={filledBearings}
        writable={writable}
        candidatesFor={(relation, query) => makeCandidatesFor(relation, query, excludeFor(relation))}
        similarFor={(relation, query) => makeSimilarFor(relation, query, excludeFor(relation))}
        onFill={(relation, candidate) =>
          setRelations((prev) =>
            prev.some((r) => r.type === relation && r.candidate.id === candidate.id)
              ? prev
              : [...prev, { type: relation, candidate }],
          )
        }
        onSave={applyCreate}
        onExit={exit}
        searchNodes={candidates}
        onOpenNode={openNode}
        moreRelationsSoon={t("moreRelationsSoon")}
        canSave={Boolean(title.trim())}
        summary={title.trim() ? createSummary : null}
        onUndoChange={(index) => setRelations((prev) => prev.filter((_, i) => i !== index))}
        hasPendingChanges={Boolean(title.trim()) || relations.length > 0}
        bearingLabelFor={relationShort}
        editabilityOf={() => true}
        onRemove={(relation, neighbor) =>
          setRelations((prev) => prev.filter((r) => !(r.type === relation && r.candidate.id === neighbor.id)))
        }
        onRetype={(from, to, neighbor) =>
          setRelations((prev) =>
            prev.map((r) => (r.type === from && r.candidate.id === neighbor.id ? { ...r, type: to } : r)),
          )
        }
        createKinds={CREATE_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
        createKind={kind}
        onCreateKind={(k) => {
          setKind(k);
          if (!kindExpectsDomain(k)) setDomainValue(null);
          setSimilarDismissed(false);
        }}
        onCreateName={(n) => {
          setTitle(n);
          setSimilarDismissed(false);
        }}
        createDomains={kindExpectsDomain(kind) ? domains : []}
        createDomainValue={domainValue}
        onCreateDomain={setDomainValue}
        onCreateDefinition={setDefinition}
        createSimilarHit={createSimilarHit}
        onOpenSimilar={openSimilarNode}
        onDismissSimilar={() => setSimilarDismissed(true)}
      />
    );
  }

  // ─────────────────────────────── ENHANCE ───────────────────────────────
  if (!enhanceItem || !enhanceProjection) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6">
        <EmptyState
          title={t("empty.title")}
          description={t("empty.body")}
          tone="solid"
          align="center"
          action={
            <button
              type="button"
              onClick={enterCreate}
              className="rounded-lg border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("empty.create")}
            </button>
          }
        />
      </div>
    );
  }

  const focalItem = enhanceItem;
  const sourceSlug = focalItem.node.sourceSlug;
  const focalDoc =
    writable && localVault.manifest
      ? localVault.manifest.docs.find((d) => d.slug === sourceSlug)
      : undefined;

  // Optimistic projection of the pending changes (computed above). The stage
  // renders the PROJECTION so struts/satellites move before the disk write; the
  // summary + commit consume the same `changes`.
  const projection = enhanceProjection;

  // Guide the next empty socket in the same priority buildStudioItem uses.
  const GUIDE_ORDER: StudioRelation[] = ["isA", "contains", "dependsOn", "relates"];
  const recommendedRel = GUIDE_ORDER.find((r) => !projection.byRelation[r].filled) ?? null;

  const bearings: CompassBearingView[] = RELATIONS.map((relation) => {
    const proj = projection.byRelation[relation];
    return {
      bearing: BEARING_OF[relation],
      relation,
      question: questionFor(relation),
      laneLabel: laneLabelFor(relation),
      emptyHint: emptyHintFor(relation),
      neighbors: proj.neighbors,
      filled: proj.filled,
      recommended: !proj.filled && relation === recommendedRel,
      expected: !proj.filled && relation === "contains",
    };
  });
  const filledBearings = RELATIONS.filter((r) => projection.byRelation[r].filled).length;

  // Exclude self + everything currently (projected) on a lane from its picker.
  const excludeFor = (relation: StudioRelation) =>
    new Set<string>([focalItem.node.id, ...projection.byRelation[relation].neighbors.map((n) => n.id)]);

  // Base frontmatter refs per relation — the source of truth for the writable
  // commit AND direction detection (is this edge editable from the focal doc?).
  const baseRefs: Record<StudioRelation, string[]> = {
    isA: focalDoc ? asStringArray(focalDoc.frontmatter.broader) : [],
    dependsOn: focalDoc ? asStringArray(focalDoc.frontmatter.dependencies) : [],
    contains: focalDoc ? asStringArray(focalDoc.frontmatter.contains) : [],
    relates: focalDoc ? asStringArray(focalDoc.frontmatter.relates) : [],
  };

  const stage = (action: Parameters<typeof reduceStudioChanges>[1]) =>
    setChanges((prev) => reduceStudioChanges(prev, action));

  const summary =
    changes.length > 0
      ? summarizeStudioChanges({ mode: "enhance", focalName: focalItem.node.label, changes }, summaryVocab)
      : null;

  const commit = async () => {
    if (changes.length === 0) {
      toast.show(t("nothingToCommit"), "info");
      return;
    }
    if (writable) {
      try {
        const updates = planRelationRefUpdates(baseRefs, changes);
        const fmUpdates: Record<string, string[]> = {};
        for (const rel of RELATIONS) {
          const next = updates[rel];
          if (next) fmUpdates[BEARING_FRONTMATTER_KEY[rel]] = next;
        }
        await localVault.updateFrontmatter(sourceSlug, fmUpdates);
        toast.show(t("commitSaved", { count: changes.length }), "success");
        setChanges([]);
      } catch (err) {
        toast.show(t("commitFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
      }
      return;
    }
    // read-only → one copyable MCP packet. The `broader` array is idempotent, so
    // any is_a-touching line writes the SAME final array (dupes are harmless).
    try {
      const broaderAfter = projection.byRelation.isA.neighbors.map((n) => n.ref);
      const lines = changes.map((c) => {
        if (c.op === "add") {
          return c.relation === "isA"
            ? buildRemovePacket(sourceSlug, "isA", c.target.ref, { broaderRefsAfter: broaderAfter })
            : buildFillPacket(sourceSlug, c.relation, c.target.ref);
        }
        if (c.op === "remove") {
          return buildRemovePacket(sourceSlug, c.relation, c.target.ref, { broaderRefsAfter: broaderAfter });
        }
        return buildEditPacket(sourceSlug, c.from, c.to, c.target.ref, { broaderRefsAfter: broaderAfter });
      });
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.show(t("commitCopied"), "success");
      setChanges([]);
    } catch {
      toast.show(t("fillCopyFailed"), "info");
    }
  };

  return (
    <StudioCompass
      key={focalItem.node.id}
      mode="enhance"
      labels={labels}
      kindLabelFor={kindLabel}
      focal={{
        kindLabel: kindLabel(focalItem.node.kind),
        domainLabel: focalItem.node.domainLabel,
        name: focalItem.node.label,
        definition: focalItem.node.definition,
      }}
      bearings={bearings}
      filledBearings={filledBearings}
      writable={writable}
      candidatesFor={(relation, query) => makeCandidatesFor(relation, query, excludeFor(relation))}
      similarFor={(relation, query) => makeSimilarFor(relation, query, excludeFor(relation))}
      discoveryFor={discoveryFor}
      onFill={(relation, candidate) =>
        stage({
          type: "add",
          relation,
          target: { id: candidate.id, title: candidate.title, kind: candidate.kind, ref: candidate.ref },
        })
      }
      onRetype={(from, to, neighbor) => stage({ type: "retype", from, to, target: neighbor })}
      onRemove={(relation, neighbor) => stage({ type: "remove", relation, target: neighbor })}
      editabilityOf={(relation, neighbor) =>
        writable ? isRelationEditableFromFocal(focalDoc?.frontmatter, relation, neighbor) : true
      }
      bearingLabelFor={relationShort}
      pendingNeighborIds={projection.pendingTargetIds}
      summary={summary}
      onUndoChange={(index) => stage({ type: "undo", index })}
      hasPendingChanges={changes.length > 0}
      canSave={changes.length > 0}
      onSave={commit}
      onExit={exit}
      onCreateNew={enterCreate}
      searchNodes={candidates}
      onOpenNode={openNode}
      moreRelationsSoon={t("moreRelationsSoon")}
    />
  );
}
