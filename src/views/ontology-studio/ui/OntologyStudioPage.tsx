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
  type StudioItem,
  type StudioRelation,
} from "../lib/build-studio-item";
import {
  buildCreateNodeDoc,
  buildFillPacket,
  buildMcpPacket,
  candidateFromNode,
  kindExpectsDomain,
  type CreateCandidate,
  type CreateDraft,
  type CreateNodeKind,
  type PendingRelation,
} from "../lib/build-create-node";
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
      pickerTitle: (question) => question,
      pickerSub: t("picker.sub"),
      pickerPlaceholder: t("picker.placeholder"),
      pickerEmpty: t("picker.empty"),
      pickerKind: (kindLabelText) => kindLabelText,
      pickerCreateNew: t("picker.createNew"),
      similarSuggest: (title) => t("picker.similar", { title }),
      similarAccept: t("picker.similarAccept"),
      createName: t("kindLabel"),
      createNamePlaceholder: t("create.namePlaceholder"),
      createDomainNone: t("create.domainNone"),
      createDefinitionPlaceholder: t("create.definitionPlaceholder"),
      createSimilar: (title, kindLabelText) => t("create.similar", { title, kind: kindLabelText }),
      createSimilarOpen: t("create.similarOpen"),
      createSimilarAnyway: t("create.similarAnyway"),
    }),
    [t, isCreate, flowHint],
  );

  const enterCreate = useCallback(() => router.push(CREATE_HREF), [router]);
  const exit = useCallback(() => router.push(EXIT_HREF), [router]);

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

    return (
      <StudioCompass
        mode="create"
        labels={labels}
        kindLabelFor={kindLabel}
        focal={{
          kindLabel: kindLabel(kind),
          domainLabel: domains.find((d) => d.value === domainValue)?.title ?? null,
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
        canSave={Boolean(title.trim())}
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
  const item: StudioItem | null = (() => {
    if (nodes.length === 0) return null;
    const targetId =
      (requestedNode && nodes.some((n) => n.id === requestedNode) ? requestedNode : null) ??
      selectDefaultStudioNodeId(nodes, edges);
    if (!targetId) return null;
    return buildStudioItem(targetId, nodes, edges);
  })();

  if (!item) {
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

  const focalItem = item;
  const focalDoc =
    writable && localVault.manifest
      ? localVault.manifest.docs.find((d) => d.slug === focalItem.node.sourceSlug)
      : undefined;

  const bearings: CompassBearingView[] = focalItem.order.map((g) => ({
    bearing: g.bearing,
    relation: g.relation,
    question: questionFor(g.relation),
    laneLabel: laneLabelFor(g.relation),
    emptyHint: emptyHintFor(g.relation),
    neighbors: g.neighbors,
    filled: g.filled,
    recommended: g.recommended,
    expected: g.expected,
  }));

  const excludeFor = (relation: StudioRelation) =>
    new Set<string>([
      focalItem.node.id,
      ...(focalItem.bearings[BEARING_OF[relation]]?.neighbors.map((n) => n.id) ?? []),
    ]);

  const onFill = async (relation: StudioRelation, candidate: CreateCandidate) => {
    const key = BEARING_FRONTMATTER_KEY[relation];
    if (writable) {
      try {
        const current = focalDoc ? asStringArray(focalDoc.frontmatter[key]) : [];
        const next = Array.from(new Set([...current, candidate.ref]));
        await localVault.updateFrontmatter(focalItem.node.sourceSlug, { [key]: next });
        toast.show(t("fillSaved", { title: candidate.title }), "success");
      } catch (err) {
        toast.show(t("fillFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(buildFillPacket(focalItem.node.sourceSlug, relation, candidate.ref));
      toast.show(t("fillCopied"), "success");
    } catch {
      toast.show(t("fillCopyFailed"), "info");
    }
  };

  return (
    <StudioCompass
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
      filledBearings={focalItem.filledBearings}
      writable={writable}
      candidatesFor={(relation, query) => makeCandidatesFor(relation, query, excludeFor(relation))}
      similarFor={(relation, query) => makeSimilarFor(relation, query, excludeFor(relation))}
      onFill={onFill}
      onSave={() => toast.show(t("autoSaved"), "info")}
      onExit={exit}
      onCreateNew={enterCreate}
    />
  );
}
