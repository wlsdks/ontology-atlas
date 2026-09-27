"use client";

import { useState } from "react";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";
import { ConceptEgoGraph } from "./ConceptEgoGraph";
import { controlClass } from '@/shared/ui/control-class';

/**
 * The chosen concept's properties plus its immediate neighbours, so the trail ends here
 * instead of at the map. The table on the left names neighbours, the drawing on the right
 * shows structure, and pointing at either lights its twin. Cells appear in reading order
 * (name, summary, owner, document, agent reference, relations), and a field without a
 * value gets no cell.
 */
export function ConceptEgoCard({
  ego,
  t,
  kindLabel,
  onSelect,
}: {
  ego: ConceptEgo | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  /** Kind names from the existing `kinds` namespace; a key minted here would drift from it. */
  kindLabel: (kind: string) => string;
  onSelect?: (nodeId: string) => void;
}) {
  // The neighbour pointed at or focused in either the table or the drawing; it links the two.
  const [activeId, setActiveId] = useState<string | null>(null);
  if (!ego) return null;

  // The Domain cell appears only when the domain is not already a drawn Belongs-to neighbour.
  const domainIsNeighbour =
    ego.domainLabel !== null && ego.neighbors.belongsTo.some((neighbor) => neighbor.label === ego.domainLabel);

  const facts: { label: string; value: string | null; mono?: boolean }[] = [
    // A domain or project never has an owning domain, so it gets no cell.
    ...(ego.kind === "domain" || ego.kind === "project" || domainIsNeighbour
      ? []
      : [{ label: t("egoDomain"), value: ego.domainLabel }]),
    ...(ego.projectLabels.length > 0
      ? [{ label: t("egoProject"), value: ego.projectLabels.join(", ") }]
      : []),
    // The agent slug falls back to the document slug; when they agree, one cell under the
    // agent label carries both.
    ...(ego.agentSlug && ego.agentSlug === ego.docSlug
      ? []
      : [{ label: t("egoDoc"), value: ego.docSlug, mono: true }]),
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
          <OntologyMapKindGlyph kind={ego.kind} size={15} />
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
        {ego.summary ? (
          <p className="line-clamp-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
            {ego.summary}
          </p>
        ) : null}
      </div>

      {/*
        Side by side only when the card itself is 48rem or wider (a container query, not the
        window); a narrower cell beside the table cannot keep dense labels apart.
      */}
      <div className="@container/ego">
      <div className="grid grid-cols-1 @3xl/ego:grid-cols-[minmax(220px,var(--git-ego-facts-w))_minmax(0,1fr)]">
        <dl className="grid content-start border-b border-[color:var(--color-divider)] @3xl/ego:border-r @3xl/ego:border-b-0">
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
          {/* Relations list names, not counts; each name navigates like a click on the drawing. */}
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
                          borderTopColor: "var(--map-edge-depends)",
                        }
                      : { borderTopColor: "var(--map-edge-contains)" }
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
                    onPointerEnter={() => setActiveId(neighbor.id)}
                    onPointerLeave={() => setActiveId(null)}
                    onFocus={() => setActiveId(neighbor.id)}
                    onBlur={() => setActiveId(null)}
                    data-active={activeId === neighbor.id ? "true" : undefined}
                    disabled={!onSelect}
                    className={controlClass({ hoverInk: 'strong', shape: "link", tone: "secondary", className: "min-w-0 gap-1.5 text-label enabled: disabled:cursor-default data-[active=true]:text-[color:var(--color-text-primary)]" })}
                  >
                    <OntologyMapKindGlyph kind={neighbor.kind} size={11} />
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
            activeId={activeId}
            onActive={setActiveId}
            // The table sets the card's height and the drawing meets it from a 13rem floor.
            className="min-h-52"
          />
        ) : (
          <div className="grid place-items-center px-4 py-10 text-label text-[color:var(--color-text-quaternary)]">
            {t("egoEmpty")}
          </div>
        )}
      </div>
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
