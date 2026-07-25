"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  buildOntologyInsightsReturnHref,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
  parseOntologyStudioEditParam,
} from "@/entities/knowledge-graph";
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
  buildCreateNodeSlug,
  buildEditPacket,
  buildFillPacket,
  buildMcpPacket,
  buildRemovePacket,
  candidateFromNode,
  findCreateSlugCollision,
  kindExpectsDomain,
  type CreateCandidate,
  type CreateDraft,
  type CreateNodeKind,
  type CreateOrigin,
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
import { buildDeltaPreview } from "../lib/build-delta-preview";
import { resolveStudioFocalId } from "../lib/resolve-studio-focal";
import { studioHasDeepLinkIntent } from "../lib/entry-choice";
import { allowedKindsFor } from "../lib/allowed-kinds";
import { StudioCompass, type CompassBearingView, type StudioCompassLabels } from "./StudioCompass";
import { StudioEntryChoice } from "./StudioEntryChoice";

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

const CREATE_KINDS: CreateNodeKind[] = ["project", "domain", "capability", "element"];

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
  const locale = useLocale();
  // C12③ — the secondary display-name locale is the OTHER of the two app locales.
  const secondaryLocale = locale === "en" ? "ko" : "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { insight } = useOntologyInsight();
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const kindLabel = useOntologyKindLabel();
  const toast = useToast();

  const isCreate = searchParams.get("mode") === "create";
  const requestedNode = searchParams.get("node");
  // #1 — the entry choice moment shows ONLY on a bare `/ontology/studio` open.
  // Any deep-link intent (mode/node/from/edit, or an insights review return)
  // carries a decision already, so it skips the choice entirely (pure gate in
  // lib so the deep-link-skip contract is unit-tested).
  const hasStudioDeepLink = studioHasDeepLinkIntent(searchParams);
  const [choiceDismissed, setChoiceDismissed] = useState(false);
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams.get(ONTOLOGY_DEEPLINK_VIA_KEY),
  );
  const insightsReviewId = insightsReturnTab
    ? searchParams.get(ONTOLOGY_DEEPLINK_REVIEW_KEY)
    : null;
  const preserveReviewContext = useCallback(
    (href: string) => {
      if (!insightsReturnTab) return href;
      const next = new URL(href, "http://ontology-atlas.local");
      next.searchParams.set(
        ONTOLOGY_DEEPLINK_VIA_KEY,
        `insights:${insightsReturnTab}`,
      );
      if (insightsReviewId) {
        next.searchParams.set(
          ONTOLOGY_DEEPLINK_REVIEW_KEY,
          insightsReviewId,
        );
      }
      return `${next.pathname}${next.search}`;
    },
    [insightsReturnTab, insightsReviewId],
  );

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
      exit: insightsReturnTab ? t("returnToReview") : t("exit"),
      moreRelations: t("moreRelations"),
      flowEyebrow: t("flowEyebrow"),
      flowCount: (filled, total) => `${t("flowCount", { filled, total })} ${flowHint(filled)}`,
      domainMembership: (domain) => t("domainMembership", { domain }),
      framePrompt: (name) => (isCreate ? t("create.framePrompt") : t("framePrompt", { name })),
      guideBadge: t("guideBadge"),
      bottomProgress: (filled, total) =>
        `${t("bottomProgress", { filled, total })} ${filled >= total ? t("bottomDone") : t("bottomRemain", { remain: total - filled })}`,
      save: t("save"),
      saveHint: t("saveHint"),
      foldMore: () => t("foldMore"),
      foldTitle: (label, total) => t("foldTitle", { label, total }),
      addMore: (label) => t("addMore", { label }),
      addMoreShort: t("addMoreShort"),
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
      createSlugCollision: (title, kindLabelText) =>
        t("create.slugCollision", { title, kind: kindLabelText }),
      createSlugCollisionHint: t("create.slugCollisionHint"),
      createSimilarOpen: t("create.similarOpen"),
      createSimilarAnyway: t("create.similarAnyway"),
      // Slice 1 — edit existing relations
      edit: t("edit"),
      editTitle: t("editTitle"),
      close: t("preview.close"),
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
      // Slice 4 — 나침반 산책 (compass walk)
      walkTo: t("walkTo"),
      walkBackAria: (name) => t("walkBackAria", { name }),
      walkConfirmTitle: (count) => t("walkConfirmTitle", { count }),
      walkConfirmSave: t("walkConfirmSave"),
      walkConfirmDiscard: t("walkConfirmDiscard"),
      // Slice 5 — 그래프 델타 미니뷰 (save preview)
      previewOpen: t("preview.open"),
      previewTitle: t("preview.title"),
      previewCloseAria: t("preview.closeAria"),
      previewClose: t("preview.close"),
      previewCenterNew: t("preview.centerNew"),
      previewMovedChip: t("preview.movedChip"),
      previewRemovedChip: t("preview.removedChip"),
      previewOverflow: (count) => t("preview.overflow", { count }),
      previewLegendExisting: t("preview.legendExisting"),
      previewLegendAdded: t("preview.legendAdded"),
      previewLegendMoved: t("preview.legendMoved"),
      previewLegendRemoved: t("preview.legendRemoved"),
    }),
    [t, isCreate, flowHint, insightsReturnTab],
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
      createCollapsed: (count) => t("summary.createCollapsed", { count }),
      createOriginLine: (name, relation) => t("summary.createOriginLine", { name, relation }),
      collapsedCount: (count) => t("summary.collapsed", { count }),
      empty: t("summary.empty"),
    }),
    [t, relationShort],
  );

  const enterCreate = useCallback(
    () => router.push(preserveReviewContext(CREATE_HREF)),
    [router, preserveReviewContext],
  );
  const exit = useCallback(
    () =>
      router.push(
        insightsReturnTab
          ? buildOntologyInsightsReturnHref(
              insightsReturnTab,
              insightsReviewId,
            )
          : "/topology",
      ),
    [router, insightsReturnTab, insightsReviewId],
  );
  const openNode = useCallback(
    (id: string) =>
      router.push(
        preserveReviewContext(
          `${STUDIO_BASE}?node=${encodeURIComponent(id)}`,
        ),
      ),
    [router, preserveReviewContext],
  );

  // Candidate picker for a relation — allowed kinds (per bearing × focal kind,
  // C12 ①), minus already-linked / self.
  const makeCandidatesFor = useCallback(
    (
      relation: StudioRelation,
      focalKind: string | null,
      query: string,
      exclude: ReadonlySet<string>,
    ): CreateCandidate[] => {
      const allow = allowedKindsFor(relation, focalKind);
      const q = query.trim().toLowerCase();
      return candidates
        .filter((c) => allow.has(c.kind))
        .filter((c) => !exclude.has(c.id))
        .filter((c) => (q ? c.title.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q) : true))
        .slice(0, 8);
    },
    [candidates],
  );

  // Near-dup nudge in the picker — the user typed the exact name of an existing node.
  const makeSimilarFor = useCallback(
    (
      relation: StudioRelation,
      focalKind: string | null,
      query: string,
      exclude: ReadonlySet<string>,
    ): CreateCandidate | null => {
      const q = normalize(query);
      if (q.length < 2) return null;
      const allow = allowedKindsFor(relation, focalKind);
      return (
        candidates.find(
          (c) => allow.has(c.kind) && !exclude.has(c.id) && normalize(c.title) === q,
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
  // C12③ — optional other-locale display name (primary name is the current locale).
  const [secondaryName, setSecondaryName] = useState("");

  // C2 — CREATE opened from a socket carries the origin (A --relation--> new) and
  // a name prefill via ?from & ?rel & ?name. Resolve A tolerantly; malformed /
  // stale context is simply ignored (falls back to a blank CREATE).
  const createContext = useMemo(() => {
    if (!isCreate) return null;
    const from = searchParams.get("from");
    const rel = searchParams.get("rel");
    if (!from || !rel || !(RELATIONS as string[]).includes(rel)) return null;
    const originId = resolveStudioFocalId(from, nodes);
    if (!originId) return null;
    const originNode = nodes.find((n) => n.id === originId);
    if (!originNode) return null;
    return {
      originId,
      originLabel: originNode.display ?? originNode.title,
      originKind: originNode.kind,
      originSourceSlug: originNode.evidenceIds?.[0] ?? candidateFromNode(originNode).ref,
      relation: rel as StudioRelation,
      name: searchParams.get("name") ?? "",
    };
  }, [isCreate, searchParams, nodes]);

  // Seed the CREATE draft from the origin context ONCE per context (React's
  // "reset state during render when input changes" pattern — same as the enhance
  // focal reset below). kind is pre-filtered to the bearing's allowed target kinds.
  const [prevCreateCtxKey, setPrevCreateCtxKey] = useState<string | null>(null);
  const createCtxKey = createContext
    ? `${createContext.originId}|${createContext.relation}|${createContext.name}`
    : null;
  if (isCreate && createCtxKey !== prevCreateCtxKey) {
    setPrevCreateCtxKey(createCtxKey);
    if (createContext) {
      setTitle(createContext.name);
      const allowed = allowedKindsFor(createContext.relation, createContext.originKind);
      setKind(CREATE_KINDS.find((k) => allowed.has(k)) ?? "capability");
      setDomainValue(null);
      setDefinition("");
      setRelations([]);
      setSecondaryName("");
      setSimilarDismissed(false);
    }
  }

  // ─────────────────────────────── ENHANCE staged changes ────────────────
  // Which existing node the enhance stage is centered on (deeplink or default).
  // Declared up here so the reset effect keeps a stable hook order across the
  // create/enhance early return.
  const enhanceFocalId = useMemo(() => {
    if (nodes.length === 0) return null;
    // C3 — resolve `?node=` tolerantly (canonical / folder-prefixed / bare tail /
    // NFD). A raw `n.id === requestedNode` missed every non-canonical form a
    // LOCAL vault produces, so a search click silently kept the default node.
    return resolveStudioFocalId(requestedNode, nodes) ?? selectDefaultStudioNodeId(nodes, edges);
  }, [requestedNode, nodes, edges]);

  // Slice 2 — enhance is STAGED: fills / retypes / deletes accumulate here and
  // only land on "확인하고 저장". Reset whenever the focal node changes so a new
  // node never inherits another node's pending edits — the React-recommended
  // "reset state during render when a prop changes" pattern (no effect).
  const [changes, setChanges] = useState<StudioChange[]>([]);
  const [prevFocalId, setPrevFocalId] = useState(enhanceFocalId);
  // Slice 4 — 나침반 산책. Remember the node we just walked FROM so the new stage
  // can (a) offer a quiet "← <이전 노드>" back affordance and (b) briefly highlight
  // the came-from satellite for arrival orientation. Captured here (not from
  // browser history) so the label always matches where the highlight lands.
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  if (prevFocalId !== enhanceFocalId) {
    setCameFrom(prevFocalId);
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

  // Slice 6 — 지도 엣지 딥링크. `?edit=<relation>:<targetId>` arrives when a map
  // edge's "공방에서 이 관계 고치기" is clicked. Resolve the target satellite on the
  // focal's BASE bearings (not the projection — a deep-link opens on saved data)
  // so the stage can open THAT relation's edit card with the satellite highlighted.
  const editRequest = useMemo(
    () => parseOntologyStudioEditParam(searchParams.get("edit")),
    [searchParams],
  );
  const editTarget = useMemo(() => {
    if (!editRequest || !enhanceItem) return null;
    const group = enhanceItem.bearings[BEARING_OF[editRequest.relation]];
    const neighbor = group.neighbors.find((n) => n.id === editRequest.targetId);
    return neighbor ? { relation: editRequest.relation, neighbor } : null;
  }, [editRequest, enhanceItem]);
  // Stale deep-link (edge no longer on the focal) → one quiet honest toast, then
  // just show the node. Guarded to fire once per (focal, edit) so re-renders and
  // data loads don't re-toast. Only fires once graph data is present (enhanceItem
  // resolved) so a mid-load miss isn't mistaken for a stale link.
  const staleEditToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editRequest || !enhanceItem || editTarget) return;
    const key = `${enhanceFocalId ?? ""}|${searchParams.get("edit") ?? ""}`;
    if (staleEditToastRef.current === key) return;
    staleEditToastRef.current = key;
    toast.show(t("staleEditLink"), "info");
  }, [editRequest, enhanceItem, editTarget, enhanceFocalId, searchParams, toast, t]);
  // The picker's discovery surface (추천 + 둘러보기) for a socket's relation —
  // excludes self + already-connected + staged targets. Read-only, deterministic.
  const discoveryFor = useCallback(
    (relation: StudioRelation) =>
      buildPickerDiscovery({
        focalId: enhanceItem?.node.id ?? "",
        nodes,
        edges,
        relation,
        allowedKinds: allowedKindsFor(relation, enhanceItem?.node.kind ?? null),
        stagedTargetIds: enhanceProjection?.pendingTargetIds,
      }),
    [enhanceItem, nodes, edges, enhanceProjection],
  );

  // C12③ — record BOTH locales' display names only when a secondary is supplied
  // (a half-filled pair leaves other-locale viewers seeing the raw title, so we
  // pair the current-locale title with the secondary name or write neither).
  const localeLabels = useMemo(
    () =>
      secondaryName.trim()
        ? { [locale]: title.trim(), [secondaryLocale]: secondaryName.trim() }
        : undefined,
    [secondaryName, locale, secondaryLocale, title],
  );
  const draft: CreateDraft = useMemo(
    () => ({ kind, title, domainValue, definition, relations, localeLabels }),
    [kind, title, domainValue, definition, relations, localeLabels],
  );

  const createSlugCollisionCandidate = useMemo(
    () => findCreateSlugCollision({ kind, title }, candidates),
    [kind, title, candidates],
  );
  const createSlugCollision = createSlugCollisionCandidate !== null;
  const createSimilarHit = useMemo(() => {
    if (!title.trim()) return null;
    if (createSlugCollisionCandidate) {
      return {
        slug: createSlugCollisionCandidate.ref,
        title: createSlugCollisionCandidate.title,
        kind: createSlugCollisionCandidate.kind,
      };
    }
    if (similarDismissed) return null;
    return findSimilarNodeByTitle(title, kind, similarCandidates);
  }, [title, kind, similarCandidates, similarDismissed, createSlugCollisionCandidate]);

  const openSimilarNode = useCallback(
    (slug: string) => {
      const node = candidates.find((c) => c.ref === slug);
      if (node) openNode(node.id);
    },
    [candidates, openNode],
  );

  const applyCreate = useCallback(async () => {
    if (!title.trim() || createSlugCollision) return;
    const newRef = buildCreateNodeSlug({ kind, title: title.trim() });
    if (writable) {
      try {
        const { slug, markdown } = buildCreateNodeDoc(draft);
        // C2 — create the node, then record A --relation--> new on A's own
        // frontmatter. Batched: the node write skips refresh so the origin
        // update triggers the single reload (both self-marked, one paint).
        const recordOrigin = Boolean(createContext && newRef);
        await localVault.createDoc(slug, markdown, { skipRefresh: recordOrigin });
        if (createContext && newRef) {
          const key = BEARING_FRONTMATTER_KEY[createContext.relation];
          const originDoc = localVault.manifest?.docs.find(
            (d) => d.slug === createContext.originSourceSlug,
          );
          const existing = originDoc ? asStringArray(originDoc.frontmatter[key]) : [];
          await localVault.updateFrontmatter(createContext.originSourceSlug, {
            [key]: Array.from(new Set([...existing, newRef])),
          });
        }
        toast.show(t("create.appliedDirect", { title: title.trim() }), "success");
        const tail = slug.split("/").at(-1) ?? "";
        openNode(`${kind}:${tail}`);
      } catch (err) {
        toast.show(t("create.applyFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
      }
      return;
    }
    try {
      // C2 — read-only: ONE packet with add_concept + the A→new origin relation.
      let origin: CreateOrigin | undefined;
      if (createContext) {
        const broaderRefsAfter =
          createContext.relation === "isA"
            ? [
                ...(buildStudioItem(createContext.originId, nodes, edges)?.bearings.up.neighbors.map(
                  (n) => n.ref,
                ) ?? []),
                ...(newRef ? [newRef] : []),
              ]
            : undefined;
        origin = {
          focalSlug: createContext.originSourceSlug,
          relation: createContext.relation,
          broaderRefsAfter,
        };
      }
      await navigator.clipboard.writeText(buildMcpPacket(draft, origin));
      toast.show(t("create.copiedAgent"), "success");
    } catch {
      toast.show(t("create.copyFailed"), "info");
    }
  }, [title, createSlugCollision, writable, draft, localVault, toast, t, kind, openNode, createContext, nodes, edges]);

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
        // Every create-mode relation is unsaved until 저장 — flow its strut.
        staged: filled,
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
    // C2 — the origin (A --relation--> new) surfaces as a quiet context line and
    // as the first line of the staged record summary.
    const originSummary = createContext
      ? { focalName: createContext.originLabel, bearingLabel: relationShort(createContext.relation) }
      : undefined;
    const createOriginNote = createContext
      ? t("create.originNote", {
          name: createContext.originLabel,
          bearing: relationShort(createContext.relation),
        })
      : null;
    const createSummary = summarizeStudioChanges(
      {
        mode: "create",
        kindLabel: kindLabel(kind),
        name: title.trim() || t("create.namePlaceholder"),
        domainLabel: domainLabelText,
        changes: createChanges,
        origin: originSummary,
      },
      summaryVocab,
    );
    // C2 — when opened from a socket, restrict the kind chooser to the bearing's
    // allowed target kinds (isA/dependsOn/… × A's kind); fall back to all kinds
    // if the window is empty so the chooser is never dead.
    const allowedCreateKinds = createContext
      ? CREATE_KINDS.filter((k) =>
          allowedKindsFor(createContext.relation, createContext.originKind).has(k),
        )
      : CREATE_KINDS;
    const createKindOptions = (allowedCreateKinds.length > 0 ? allowedCreateKinds : CREATE_KINDS).map(
      (k) => ({ value: k, label: kindLabel(k) }),
    );
    // Slice 5 — the save-preview mini-graph for a brand-new node: the center is
    // itself the delta (isNew), every staged relation an indigo "added" strut.
    const createDeltaPreview = buildDeltaPreview({
      center: {
        title: title.trim() || t("create.namePlaceholder"),
        kind,
        domainLabel: domainLabelText,
        isNew: true,
      },
      baseNeighborsByRelation: { isA: [], dependsOn: [], contains: [], relates: [] },
      changes: createChanges,
      capPerBearing: 2,
    });

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
        candidatesFor={(relation, query) => makeCandidatesFor(relation, kind, query, excludeFor(relation))}
        similarFor={(relation, query) => makeSimilarFor(relation, kind, query, excludeFor(relation))}
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
        canSave={Boolean(title.trim()) && !createSlugCollision}
        summary={title.trim() ? createSummary : null}
        deltaPreview={title.trim() ? createDeltaPreview : null}
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
        createOriginNote={createOriginNote}
        createKinds={createKindOptions}
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
        createSecondaryName={secondaryName}
        onCreateSecondaryName={setSecondaryName}
        createSecondaryNamePlaceholder={t("create.secondaryName")}
        createSimilarHit={createSimilarHit}
        createSlugCollision={createSlugCollision}
        onOpenSimilar={openSimilarNode}
        onDismissSimilar={() => setSimilarDismissed(true)}
      />
    );
  }

  // ─────────────────────────────── ENTRY CHOICE (#1) ─────────────────────
  // Bare open with a non-empty vault → let the user pick intent first instead
  // of silently dropping into enhance. Deep-links skip this; an empty vault
  // falls through to the enhance empty-state (which already offers create).
  if (!hasStudioDeepLink && !choiceDismissed && nodes.length > 0) {
    return (
      <StudioEntryChoice
        labels={{
          title: t("entryChoice.title"),
          enhanceTitle: t("entryChoice.enhanceTitle"),
          enhanceDesc: t("entryChoice.enhanceDesc"),
          enhanceRecommend: enhanceItem
            ? t("entryChoice.enhanceRecommend", { name: enhanceItem.node.label })
            : null,
          createTitle: t("entryChoice.createTitle"),
          createDesc: t("entryChoice.createDesc"),
          exit: t("entryChoice.exit"),
          dialogAria: t("entryChoice.dialogAria"),
        }}
        onEnhance={() => setChoiceDismissed(true)}
        onCreate={enterCreate}
        onExit={exit}
      />
    );
  }

  // ─────────────────────────────── ENHANCE ───────────────────────────────
  if (!enhanceItem || !enhanceProjection) {
    return (
      <main
        id="main"
        className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6"
      >
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
      </main>
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
      // A lane with a not-yet-saved neighbor flows its strut (저장 대기 = alive).
      staged: proj.neighbors.some((n) => projection.pendingTargetIds?.has(n.id)),
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

  // Slice 5 — the save-preview mini-graph. Existing neighborhood (achromatic
  // context) + only the staged delta in indigo. Same `changes` as the summary so
  // the picture and the sentences never disagree. `hasDelta` gates the affordance.
  const deltaPreview = buildDeltaPreview({
    center: {
      title: focalItem.node.label,
      kind: focalItem.node.kind,
      domainLabel: focalItem.node.domainLabel,
      isNew: false,
    },
    baseNeighborsByRelation: {
      isA: focalItem.bearings.up.neighbors,
      dependsOn: focalItem.bearings.right.neighbors,
      contains: focalItem.bearings.down.neighbors,
      relates: focalItem.bearings.left.neighbors,
    },
    changes,
    capPerBearing: 2,
  });

  // Returns true when the staged changes were persisted (writable) / copied
  // (read-only) — the walk guard's "저장하고 이동" only navigates on a real success.
  const commit = async (): Promise<boolean> => {
    if (changes.length === 0) {
      toast.show(t("nothingToCommit"), "info");
      return false;
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
        return true;
      } catch (err) {
        toast.show(t("commitFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
        return false;
      }
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
      return true;
    } catch {
      toast.show(t("fillCopyFailed"), "info");
      return false;
    }
  };

  // Save-then-walk for the pending-changes guard's "저장하고 이동" option. Only
  // re-centers when the commit actually succeeded (else the changes stay staged).
  const commitThenOpen = async (id: string) => {
    if (await commit()) openNode(id);
  };

  // "← <이전 노드>" back affordance + arrival highlight need the came-from node's
  // display label. Both are dropped when the came-from node is the current focal
  // (self) or no longer in the graph.
  const cameFromNode = cameFrom && cameFrom !== focalItem.node.id ? nodes.find((n) => n.id === cameFrom) : undefined;
  const backTo = cameFromNode ? { id: cameFromNode.id, label: cameFromNode.display ?? cameFromNode.title } : null;

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
      candidatesFor={(relation, query) =>
        makeCandidatesFor(relation, focalItem.node.kind, query, excludeFor(relation))
      }
      similarFor={(relation, query) =>
        makeSimilarFor(relation, focalItem.node.kind, query, excludeFor(relation))
      }
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
      initialEdit={editTarget}
      bearingLabelFor={relationShort}
      pendingNeighborIds={projection.pendingTargetIds}
      summary={summary}
      deltaPreview={deltaPreview}
      onUndoChange={(index) => stage({ type: "undo", index })}
      hasPendingChanges={changes.length > 0}
      canSave={changes.length > 0}
      onSave={commit}
      onExit={exit}
      onCreateNew={(ctx) => {
        // C2 — carry the socket's relation + typed query into CREATE so the new
        // node lands with the A --relation--> new link + a name prefill.
        if (!ctx) {
          enterCreate();
          return;
        }
        const params = new URLSearchParams({
          mode: "create",
          from: focalItem.node.id,
          rel: ctx.relation,
        });
        if (ctx.query.trim()) params.set("name", ctx.query.trim());
        router.push(preserveReviewContext(`${STUDIO_BASE}?${params.toString()}`));
      }}
      searchNodes={candidates}
      onOpenNode={openNode}
      onSaveAndOpenNode={commitThenOpen}
      // Slice 6 — a deep-link arrival highlights its edit target satellite (reuses
      // the Slice 4 arrival ring); otherwise the walked-from node keeps the ring.
      arrivedFrom={editTarget?.neighbor.id ?? backTo?.id ?? null}
      backTo={backTo}
      moreRelationsSoon={t("moreRelationsSoon")}
    />
  );
}
