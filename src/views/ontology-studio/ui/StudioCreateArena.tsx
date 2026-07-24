"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Bot, Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { SimilarNodeWarning } from "@/shared/ui";
import {
  findSimilarNodeByTitle,
  type SimilarNodeCandidate,
} from "@/shared/lib/similar-node-title";
import {
  CREATE_NODE_KINDS,
  CREATE_RELATION_TYPES,
  buildCreateNodeSlug,
  computeCreateCompleteness,
  kindExpectsDomain,
  type CreateCandidate,
  type CreateDraft,
  type CreateNodeKind,
  type CreateRelationType,
  type PendingRelation,
} from "../lib/build-create-node";

/**
 * Studio CREATE (만들기) — the assemble-by-clicking surface for a brand-new
 * ontology node. Enhance (Slice 1) mutates a live item; Create ASSEMBLES: a
 * left identity form (kind · name · domain · definition + near-dup guard) and
 * right relation cards you fill one connection at a time with a node picker,
 * with a rising completeness gauge and a mini "지금까지 이런 모양" preview.
 *
 * Two apply routes (owner: "직접+위임 둘 다"):
 *   - 직접 적용  → `onApplyDirect(draft)` writes the node .md to the local vault
 *                 (only when a writable local vault is loaded).
 *   - 에이전트에게 맡기기 → `onApplyAgent(draft)` copies an MCP command packet —
 *                 the ONLY active path in read-only / sample mode.
 *
 * SCOPED CHARTER EXCEPTION: game visuals (gems, glow) come only from
 * `--studio-*` tokens under `.studio-stage`. Presentational: every string is a
 * resolved label so it renders in isolation and is unit-testable.
 */

export interface StudioCreateLabels {
  mode: string;
  title: string;
  close: string;
  kindLabelHead: string;
  nameLabel: string;
  namePlaceholder: string;
  domainLabel: string;
  domainNone: string;
  definitionLabel: string;
  definitionPlaceholder: string;
  gaugeLabel: string;
  gaugeNote: (filled: number, total: number) => string;
  assembleTitle: string;
  assembleSubtitle: string;
  progress: (filled: number, total: number) => string;
  relation: Record<CreateRelationType, { title: string; type: string; hint: string; add: string }>;
  isaTag: string;
  optionalTag: string;
  emptyCard: string;
  pickerPlaceholder: string;
  pickerEmpty: string;
  pickerHint: string;
  previewLabel: string;
  previewGhostIsa: string;
  similarMessage: (title: string, kindLabel: string, domainLabel: string) => string;
  similarOpen: string;
  similarCreateAnyway: string;
  ledgerCount: (count: number) => string;
  pendingNode: (kindLabel: string) => string;
  pendingRelation: (relationLabel: string, target: string) => string;
  applyDirect: string;
  applyDirectSub: string;
  applyDirectDisabled: string;
  applyAgent: string;
  applyAgentSub: string;
}

const GEM_CLASS: Record<CreateRelationType, string> = {
  dependsOn: "studio-gem--dep",
  contains: "studio-gem--con",
  relates: "studio-gem--rel",
  isA: "studio-gem--isa",
};

const OPTIONAL_TYPES = new Set<CreateRelationType>(["relates"]);

/** Which existing-node kinds each relation card offers as picker candidates. */
const CANDIDATE_KINDS: Record<CreateRelationType, ReadonlySet<string> | null> = {
  isA: new Set(["capability", "domain", "project"]),
  dependsOn: new Set(["capability", "element"]),
  contains: new Set(["capability", "element"]),
  relates: null, // any non-container
};

export interface StudioCreateArenaProps {
  labels: StudioCreateLabels;
  kindLabel: (kind: string) => string;
  /** Existing `kind: domain` nodes → `{ value: tail-slug, title }`. */
  domains: ReadonlyArray<{ value: string; title: string }>;
  /** All pickable existing nodes (frontmatter-ref precomputed). */
  candidates: ReadonlyArray<CreateCandidate>;
  /** Near-dup candidates (title/kind) — reuses the shared similar-node guard. */
  similarCandidates: ReadonlyArray<SimilarNodeCandidate>;
  /** True only when a writable local vault is loaded — gates 직접 적용. */
  writable: boolean;
  onApplyDirect: (draft: CreateDraft) => void;
  onApplyAgent: (draft: CreateDraft) => void;
  onOpenSimilar: (slug: string) => void;
  onExit: () => void;
  particleSeeds: ReadonlyArray<{ left: number; top: number; dur: number; delay: number; opacity: number }>;
}

export function StudioCreateArena({
  labels,
  kindLabel,
  domains,
  candidates,
  similarCandidates,
  writable,
  onApplyDirect,
  onApplyAgent,
  onOpenSimilar,
  onExit,
  particleSeeds,
}: StudioCreateArenaProps) {
  const [kind, setKind] = useState<CreateNodeKind>("capability");
  const [title, setTitle] = useState("");
  const [domainValue, setDomainValue] = useState<string | null>(null);
  const [definition, setDefinition] = useState("");
  const [relations, setRelations] = useState<PendingRelation[]>([]);
  const [pickerFor, setPickerFor] = useState<CreateRelationType | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [similarDismissed, setSimilarDismissed] = useState(false);

  const draft: CreateDraft = useMemo(
    () => ({ kind, title, domainValue, definition, relations }),
    [kind, title, domainValue, definition, relations],
  );
  const completeness = useMemo(() => computeCreateCompleteness(draft), [draft]);
  const slug = buildCreateNodeSlug({ kind, title });
  const canApply = Boolean(title.trim()) && slug !== null;

  const similar = useMemo(() => {
    if (similarDismissed || !title.trim()) return null;
    return findSimilarNodeByTitle(title, kind, similarCandidates);
  }, [title, kind, similarCandidates, similarDismissed]);

  const changeKind = (next: CreateNodeKind) => {
    setKind(next);
    if (!kindExpectsDomain(next)) setDomainValue(null);
    setSimilarDismissed(false);
  };

  const addRelation = (type: CreateRelationType, candidate: CreateCandidate) => {
    setRelations((prev) =>
      prev.some((r) => r.type === type && r.candidate.id === candidate.id)
        ? prev
        : [...prev, { type, candidate }],
    );
    setPickerFor(null);
    setPickerQuery("");
  };
  const removeRelation = (type: CreateRelationType, id: string) => {
    setRelations((prev) => prev.filter((r) => !(r.type === type && r.candidate.id === id)));
  };
  const togglePicker = (type: CreateRelationType) => {
    setPickerFor((cur) => (cur === type ? null : type));
    setPickerQuery("");
  };

  const relationsByType = (type: CreateRelationType) => relations.filter((r) => r.type === type);

  const pickerCandidates = useMemo(() => {
    if (!pickerFor) return [];
    const allow = CANDIDATE_KINDS[pickerFor];
    const q = pickerQuery.trim().toLowerCase();
    const taken = new Set(relations.map((r) => `${r.type}:${r.candidate.id}`));
    return candidates
      .filter((c) => (allow ? allow.has(c.kind) : c.kind !== "project" && c.kind !== "domain"))
      .filter((c) => !taken.has(`${pickerFor}:${c.id}`))
      .filter((c) => (q ? c.title.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [pickerFor, pickerQuery, candidates, relations]);

  return (
    <div
      className="studio-stage relative grid h-[100dvh] min-h-0 grid-rows-[54px_1fr_82px] overflow-hidden"
      data-testid="studio-create-stage"
    >
      <div className="studio-bg" aria-hidden />
      <div className="studio-rays studio-anim-spin" aria-hidden />
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
        {particleSeeds.map((p, i) => (
          <span
            key={i}
            className="studio-particle studio-anim-rise"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      {/* Header — breadcrumb + 만들기 mode badge + close. */}
      <header className="relative z-[5] flex items-center gap-4 border-b border-[color:var(--color-divider)] px-[22px]">
        <div className="flex items-center gap-2.5 text-label text-[color:var(--color-text-tertiary)]">
          <span className="font-semibold text-[color:var(--color-text-secondary)]">{labels.title}</span>
          <span
            className="ml-1 rounded-md border px-2 py-1 text-caption font-bold uppercase tracking-[0.14em]"
            style={{
              color: "var(--studio-indigo-bright)",
              background: "var(--studio-indigo-a20)",
              borderColor: "var(--studio-indigo-a45)",
            }}
          >
            {labels.mode}
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          data-testid="studio-create-close"
          className="ml-auto rounded-lg border border-[color:var(--color-border-soft)] px-2.5 py-1.5 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        >
          {labels.close}
        </button>
      </header>

      {/* Body — left identity form · right relation assembly. */}
      <div className="relative z-[3] grid min-h-0 grid-cols-1 lg:grid-cols-[376px_1fr]">
        {/* Left — identity + near-dup + gauge. */}
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-[color:var(--color-divider)] bg-[color:var(--color-panel)]">
          <div className="flex flex-col gap-3.5 border-b border-[color:var(--color-divider)] p-5">
            <Field label={labels.kindLabelHead}>
              <div
                role="group"
                aria-label={labels.kindLabelHead}
                className="flex gap-1 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[3px]"
              >
                {CREATE_NODE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    data-testid={`studio-create-kind-${k}`}
                    aria-pressed={kind === k}
                    onClick={() => changeKind(k)}
                    className={cn(
                      "flex-1 rounded-[5px] py-1.5 text-label transition-colors",
                      kind === k
                        ? "text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
                    )}
                    style={kind === k ? { background: "var(--studio-indigo-a20)" } : undefined}
                  >
                    {kindLabel(k)}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={labels.nameLabel}>
              <input
                data-testid="studio-create-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSimilarDismissed(false);
                }}
                placeholder={labels.namePlaceholder}
                className="w-full rounded-[9px] border bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-body-lg font-semibold tracking-[-0.02em] text-[color:var(--color-text-primary)] outline-none placeholder:text-[color:var(--color-text-quaternary)] placeholder:font-normal"
                style={{ borderColor: "var(--studio-indigo-a45)" }}
              />
            </Field>

            {kindExpectsDomain(kind) ? (
              <Field label={labels.domainLabel}>
                <select
                  data-testid="studio-create-domain"
                  value={domainValue ?? ""}
                  onChange={(e) => setDomainValue(e.target.value || null)}
                  className="w-full rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-label text-[color:var(--color-text-secondary)] outline-none"
                >
                  <option value="">{labels.domainNone}</option>
                  {domains.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {similar ? (
              <div data-testid="studio-create-similar">
                <SimilarNodeWarning
                  message={labels.similarMessage(similar.title, kindLabel(similar.kind), similar.slug)}
                  openLabel={labels.similarOpen}
                  createAnywayLabel={labels.similarCreateAnyway}
                  onOpen={() => onOpenSimilar(similar.slug)}
                  onCreateAnyway={() => setSimilarDismissed(true)}
                />
              </div>
            ) : null}

            <Field label={labels.definitionLabel}>
              <textarea
                data-testid="studio-create-definition"
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                placeholder={labels.definitionPlaceholder}
                rows={3}
                className="w-full resize-none rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-label leading-[1.55] text-[color:var(--color-text-secondary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
              />
            </Field>
          </div>

          {/* Completeness gauge. */}
          <div className="mt-auto flex flex-col gap-2.5 border-t border-[color:var(--color-divider)] p-5" data-testid="studio-create-gauge">
            <div className="flex items-baseline gap-2">
              <span className="text-caption font-bold uppercase tracking-[0.05em] text-[color:var(--color-text-quaternary)]">
                {labels.gaugeLabel}
              </span>
              <span
                className="ml-auto text-display font-semibold tabular-nums tracking-[-0.02em]"
                style={{ color: "var(--studio-gold-bright)", textShadow: "0 0 12px var(--studio-gold-a45)" }}
              >
                {completeness.percent}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
              <span
                className="block h-full rounded-full transition-[width] duration-300"
                style={{ width: `${completeness.percent}%`, background: "var(--studio-indigo)" }}
              />
            </div>
            <span className="text-label leading-[1.5] text-[color:var(--color-text-tertiary)]">
              {labels.gaugeNote(completeness.filledCount, completeness.total)}
            </span>
          </div>
        </aside>

        {/* Right — relation assembly. */}
        <section className="flex min-h-0 flex-col overflow-y-auto bg-[color:var(--color-canvas)]">
          <div className="sticky top-0 z-[5] flex items-baseline gap-3 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-6 py-3.5">
            <span className="text-title font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.assembleTitle}
            </span>
            <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.assembleSubtitle}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex gap-1">
                {completeness.pips.map((p, i) => (
                  <span
                    key={i}
                    className={cn(
                      "studio-pip",
                      p === "on" && "studio-pip--on",
                      p === "next" && "studio-pip--next studio-anim-pip",
                    )}
                  />
                ))}
              </div>
              <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                {labels.progress(completeness.filledCount, completeness.total)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 content-start gap-3.5 p-6 xl:grid-cols-2">
            {CREATE_RELATION_TYPES.map((type) => {
              const rels = relationsByType(type);
              const isIsa = type === "isA";
              const optional = OPTIONAL_TYPES.has(type);
              const meta = labels.relation[type];
              const open = pickerFor === type;
              return (
                <div
                  key={type}
                  data-testid={`studio-create-card-${type}`}
                  data-count={rels.length}
                  className={cn(
                    "relative flex flex-col gap-2.5 rounded-[13px] border p-[14px]",
                    isIsa && "xl:col-span-2",
                  )}
                  style={{
                    background: "var(--color-panel)",
                    borderColor: open
                      ? "var(--studio-gold-a45)"
                      : rels.length > 0
                        ? "var(--studio-indigo-a45)"
                        : "var(--color-border-soft)",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn("studio-gem h-8 w-7 flex-none text-[11px]", GEM_CLASS[type])}
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-[color:var(--color-text-primary)]">
                        {meta.title}
                        <span
                          className="rounded bg-[color:var(--color-overlay-2)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.04em] text-[color:var(--color-text-quaternary)]"
                        >
                          {meta.type}
                        </span>
                        {isIsa ? (
                          <span
                            className="rounded px-1.5 py-px text-[9px] font-bold"
                            style={{ color: "var(--studio-gold-bright)", background: "var(--studio-gold-a20)" }}
                          >
                            {labels.isaTag}
                          </span>
                        ) : optional ? (
                          <span className="rounded bg-[color:var(--color-overlay-2)] px-1.5 py-px text-[9px] font-bold text-[color:var(--color-text-quaternary)]">
                            {labels.optionalTag}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-caption leading-[1.45] text-[color:var(--color-text-quaternary)]">
                        {meta.hint}
                      </span>
                    </div>
                    <span className="flex-none font-mono text-caption text-[color:var(--color-text-quaternary)]">
                      {rels.length}
                    </span>
                  </div>

                  {rels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rels.map((r) => (
                        <span
                          key={r.candidate.id}
                          data-testid={`studio-create-chip-${type}-${r.candidate.id}`}
                          className="inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-label text-[color:var(--color-text-secondary)]"
                          style={{ background: "var(--studio-indigo-a10)", borderColor: "var(--studio-indigo-a45)" }}
                        >
                          <span className={cn("studio-gem h-3 w-2.5 flex-none", GEM_CLASS[type])} aria-hidden />
                          {r.candidate.title}
                          <button
                            type="button"
                            aria-label="remove"
                            data-testid="studio-create-chip-remove"
                            onClick={() => removeRelation(type, r.candidate.id)}
                            className="text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                          >
                            <X size={12} aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : !open ? (
                    <div className="rounded-lg border border-dashed border-[color:var(--color-border-soft)] px-2.5 py-2 text-center text-label text-[color:var(--color-text-quaternary)]">
                      {labels.emptyCard}
                    </div>
                  ) : null}

                  {open ? (
                    <NodePicker
                      query={pickerQuery}
                      onQuery={setPickerQuery}
                      candidates={pickerCandidates}
                      kindLabel={kindLabel}
                      placeholder={labels.pickerPlaceholder}
                      emptyLabel={labels.pickerEmpty}
                      hint={labels.pickerHint}
                      onPick={(c) => addRelation(type, c)}
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid={`studio-create-add-${type}`}
                      onClick={() => togglePicker(type)}
                      className="inline-flex items-center gap-2 self-start rounded-lg border border-dashed px-3 py-1.5 text-label font-semibold transition-colors"
                      style={{
                        color: isIsa ? "var(--studio-gold-bright)" : "var(--studio-indigo-bright)",
                        borderColor: isIsa ? "var(--studio-gold-a45)" : "var(--studio-indigo-a45)",
                        background: isIsa ? "var(--studio-gold-a20)" : "var(--studio-indigo-a10)",
                      }}
                    >
                      <Plus size={13} aria-hidden />
                      {meta.add}
                    </button>
                  )}
                </div>
              );
            })}

            {/* 지금까지 이런 모양 — compact preview of the assembled node. */}
            <div
              className="flex items-center gap-4 rounded-[12px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3.5 xl:col-span-2"
              data-testid="studio-create-preview"
            >
              <span className="flex-none text-caption font-bold uppercase leading-[1.3] tracking-[0.05em] text-[color:var(--color-text-quaternary)]">
                {labels.previewLabel}
              </span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-primary)]"
                  style={{ borderColor: "var(--studio-gold-a45)", background: "var(--color-elevated)" }}
                >
                  <span className="studio-gem studio-gem--isa h-3.5 w-3 flex-none" aria-hidden />
                  {title.trim() || labels.namePlaceholder}
                </span>
                {relations.map((r) => (
                  <span
                    key={`${r.type}:${r.candidate.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1 text-label text-[color:var(--color-text-tertiary)]"
                  >
                    <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                      {labels.relation[r.type].type} →
                    </span>
                    <span className={cn("studio-gem h-3 w-2.5 flex-none", GEM_CLASS[r.type])} aria-hidden />
                    {r.candidate.title}
                  </span>
                ))}
                {relations.length === 0 ? (
                  <span className="rounded-lg border border-dashed border-[color:var(--color-border-soft)] px-2.5 py-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {labels.previewGhostIsa}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer — pending ledger + two apply routes. */}
      <footer className="relative z-[5] flex items-center gap-4 border-t border-[color:var(--color-divider)] px-[22px]">
        <div className="flex min-w-0 items-center gap-3 text-label text-[color:var(--color-text-tertiary)]">
          <span className="text-body-lg font-bold tabular-nums text-[color:var(--color-text-primary)]">
            {relations.length + (canApply ? 1 : 0)}
          </span>
          <span>{labels.ledgerCount(relations.length + (canApply ? 1 : 0))}</span>
          <div className="hidden items-center gap-1.5 overflow-hidden md:flex">
            {canApply ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-caption text-[color:var(--color-text-tertiary)]">
                <span style={{ color: "var(--studio-emerald)" }}>＋</span>
                {labels.pendingNode(kindLabel(kind))}
              </span>
            ) : null}
            {relations.slice(0, 3).map((r) => (
              <span
                key={`${r.type}:${r.candidate.id}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-caption text-[color:var(--color-text-tertiary)]"
              >
                <span style={{ color: "var(--studio-indigo-bright)" }}>＋</span>
                {labels.pendingRelation(labels.relation[r.type].title, r.candidate.title)}
              </span>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            data-testid="studio-create-apply-agent"
            disabled={!canApply}
            onClick={() => onApplyAgent(draft)}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-strong)] px-4 py-2.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)] disabled:opacity-40 disabled:hover:text-[color:var(--color-text-secondary)]"
          >
            <Bot size={15} aria-hidden />
            <span className="flex flex-col items-start leading-tight">
              <span>{labels.applyAgent}</span>
              <span className="text-caption text-[color:var(--color-text-quaternary)]">{labels.applyAgentSub}</span>
            </span>
          </button>
          <button
            type="button"
            data-testid="studio-create-apply-direct"
            disabled={!canApply || !writable}
            onClick={() => onApplyDirect(draft)}
            title={!writable ? labels.applyDirectDisabled : undefined}
            className="studio-enhance inline-flex items-center gap-2.5 rounded-[12px] px-6 py-3 text-body font-extrabold tracking-[0.02em] text-white transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-40"
          >
            <Check size={16} aria-hidden />
            <span className="flex flex-col items-start leading-tight">
              <span>{labels.applyDirect}</span>
              <span className="text-caption font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                {writable ? labels.applyDirectSub : labels.applyDirectDisabled}
              </span>
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-bold uppercase tracking-[0.05em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function NodePicker({
  query,
  onQuery,
  candidates,
  kindLabel,
  placeholder,
  emptyLabel,
  hint,
  onPick,
}: {
  query: string;
  onQuery: (q: string) => void;
  candidates: ReadonlyArray<CreateCandidate>;
  kindLabel: (kind: string) => string;
  placeholder: string;
  emptyLabel: string;
  hint: string;
  onPick: (c: CreateCandidate) => void;
}) {
  return (
    <div
      data-testid="studio-create-picker"
      className="overflow-hidden rounded-[10px] border bg-[color:var(--color-elevated)]"
      style={{ borderColor: "var(--color-border-strong)", boxShadow: "0 16px 40px rgba(0,0,0,0.55)" } as CSSProperties}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-2.5 py-2">
        <Search size={13} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
        <input
          autoFocus
          data-testid="studio-create-picker-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-label text-[color:var(--color-text-secondary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
        />
      </div>
      {candidates.length === 0 ? (
        <div className="px-3 py-3 text-center text-label text-[color:var(--color-text-quaternary)]">{emptyLabel}</div>
      ) : (
        candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`studio-create-picker-row-${c.id}`}
            onClick={() => onPick(c)}
            className="flex w-full items-center gap-2.5 border-b border-[color:var(--color-border-soft)] px-3 py-2 text-left text-label text-[color:var(--color-text-secondary)] transition-colors last:border-b-0 hover:bg-[color:var(--color-overlay-1)]"
          >
            <span className="font-medium text-[color:var(--color-text-secondary)]">{c.title}</span>
            <span className="ml-auto text-caption text-[color:var(--color-text-quaternary)]">{kindLabel(c.kind)}</span>
          </button>
        ))
      )}
      <div className="bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-caption text-[color:var(--color-text-quaternary)]">
        {hint}
      </div>
    </div>
  );
}
