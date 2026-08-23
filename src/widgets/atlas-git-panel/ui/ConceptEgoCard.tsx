"use client";

import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";
import { ConceptEgoGraph } from "./ConceptEgoGraph";
import { controlClass } from '@/shared/ui/control-class';

/**
 * The chosen concept's **properties plus its immediate neighbours** — the trail
 * ends here instead of sending the reader out to the map.
 *
 * Reading on the left, drawing on the right. Relation names were pulled out of
 * the drawing and moved left because inside it they sit outside the fan and
 * widen the box, and a wider box shrinks the height-bound drawing (measured
 * fill rate 24%). The reading table's line swatches use the same tokens as the
 * drawing's lines, so no separate legend is needed.
 *
 * ## What it carries (2026-08-02 expansion)
 *
 * It used to be three cells (domain · evidence document · connection count),
 * while the graph node already carried a **one-line summary, an agent reference and
 * a project** that the screen was not using — withholding what you already know
 * is an omission, not a demotion.
 *
 * The order is the order a person reads in: name → **one-line summary** → what
 * it belongs to → where it is written down → **the reference an agent can use**
 * → what it connects to. The last two correspond to this product's
 * two users.
 *
 * ⚠️ **A missing field gets no slot** — a cell nobody fills is misinformation,
 * not a specification, so `summary`/`projectLabels` produce a cell only when
 * they have a value. (This is a single card, not a repeated set, so the
 * dimension-regularity rule does not apply.)
 */
export function ConceptEgoCard({
  ego,
  t,
  kindLabel,
  onSelect,
}: {
  ego: ConceptEgo | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  /**
   * Kind names — the existing `kinds` namespace is the source of truth. Minting
   * a key here writes the same fact in two places, and drift starts there.
   */
  kindLabel: (kind: string) => string;
  onSelect?: (nodeId: string) => void;
}) {
  if (!ego) return null;

  const facts: { label: string; value: string | null; mono?: boolean }[] = [
    { label: t("egoDomain"), value: ego.domainLabel },
    ...(ego.projectLabels.length > 0
      ? [{ label: t("egoProject"), value: ego.projectLabels.join(", ") }]
      : []),
    { label: t("egoDoc"), value: ego.docSlug, mono: true },
    { label: t("egoAgentReference"), value: ego.agentSlug, mono: true },
  ];

  const bearings = EGO_BEARINGS.map((bearing) => ({
    bearing,
    neighbors: ego.neighbors[bearing],
  })).filter((row) => row.neighbors.length > 0);

  return (
    <div
      data-testid="atlas-git-concept-ego"
      className="flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)]"
    >
      <div className="flex flex-col gap-1.5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TopologyV2KindGlyph kind={ego.kind} size={15} />
          <b className="truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {ego.label}
          </b>
          <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
            {kindLabel(ego.kind)}
          </span>
          <span className="ml-auto shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
            {t("egoLinkedCount", { count: ego.total })}
          </span>
        </div>
        {/* The human-written line. It is the first fact a person reads on this card. */}
        {ego.summary ? (
          <p className="line-clamp-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
            {ego.summary}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,var(--git-ego-facts-w))_minmax(0,1fr)]">
        <dl className="grid content-start border-b border-[color:var(--color-divider)] lg:border-r lg:border-b-0">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="min-w-0 border-b border-[color:var(--color-divider)] px-4 py-2.5"
            >
              <dt className="mb-0.5 text-caption text-[color:var(--color-text-quaternary)]">
                {fact.label}
              </dt>
              <dd
                className={
                  fact.value
                    ? "truncate text-label text-[color:var(--color-text-secondary)]"
                    : "truncate text-label text-[color:var(--color-text-quaternary)]"
                }
                title={fact.value ?? undefined}
              >
                {fact.value ? (
                  fact.mono ? (
                    <code className="font-mono">{fact.value}</code>
                  ) : (
                    fact.value
                  )
                ) : (
                  t("egoNone")
                )}
              </dd>
            </div>
          ))}
          {/*
            Relations show **names, not counts**. "Contains 3" cannot answer what
            the 3 are, and getting that answer meant counting them by eye in the
            drawing. With names this cell is enough on its own, and clicking one
            navigates there — a second door onto what the drawing's click does.
          */}
          {bearings.map((row) => (
            <div
              key={row.bearing}
              className="px-4 py-2.5 not-last:border-b not-last:border-[color:var(--color-divider)]"
            >
              <dt className="mb-1 flex items-center gap-2 text-caption text-[color:var(--color-text-quaternary)]">
                {/* Line swatch — same tokens as the drawing's solid/dashed lines, so no separate legend. */}
                <i
                  aria-hidden
                  className="h-0 w-3.5 shrink-0 border-t"
                  style={
                    row.bearing === "dependsOn" || row.bearing === "usedBy"
                      ? {
                          borderTopStyle: "dashed",
                          borderTopColor: "var(--topology-v2-edge-depends)",
                        }
                      : { borderTopColor: "var(--topology-v2-edge-contains)" }
                  }
                />
                {bearingLabel(t, row.bearing)}
                <b className="ml-auto font-normal tabular-nums">{row.neighbors.length}</b>
              </dt>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {row.neighbors.map((neighbor) => (
                  <button
                    key={neighbor.id}
                    type="button"
                    data-testid="atlas-git-ego-neighbor"
                    onClick={onSelect ? () => onSelect(neighbor.id) : undefined}
                    disabled={!onSelect}
                    className={controlClass({ hoverInk: 'strong', shape: "link", tone: "secondary", className: "min-w-0 gap-1.5 text-label enabled: disabled:cursor-default" })}
                  >
                    <TopologyV2KindGlyph kind={neighbor.kind} size={11} />
                    <span className="truncate">{neighbor.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </dl>

        {ego.total > 0 ? (
          <ConceptEgoGraph
            ego={ego}
            bearingLabel={(bearing) => bearingLabel(t, bearing)}
            moreLabel={(count) => t("moreSlugs", { count })}
            onSelect={onSelect}
          />
        ) : (
          <div className="grid place-items-center px-4 py-10 text-label text-[color:var(--color-text-quaternary)]">
            {t("egoEmpty")}
          </div>
        )}
      </div>
    </div>
  );
}

function bearingLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  bearing: EgoBearing,
): string {
  switch (bearing) {
    case "belongsTo":
      return t("bearingBelongsTo");
    case "contains":
      return t("bearingContains");
    case "dependsOn":
      return t("bearingDependsOn");
    default:
      return t("bearingUsedBy");
  }
}
