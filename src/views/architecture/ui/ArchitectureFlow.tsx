'use client';

import { useMemo, useState } from 'react';
import {
  AppWindow,
  Blocks,
  Cable,
  Cog,
  Cpu,
  Database,
  Landmark,
  LayoutGrid,
  Layers,
  Package,
  PanelsTopLeft,
  Plug,
  Route,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

import {
  buildArchitectureLayout,
  type ArchitectureOccupant,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import { buildOntologyNodeHref } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { Chip, RowButton, TopologyV2KindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

/**
 * The dependency policy: a ladder of layers, and the matrix that states the whole rule.
 *
 * ⚠️ **Five rounds got here, and the research says why four of them failed.**
 *
 * Rounds 1–4 were a *list of roles with decoration attached* — cards with an arrow between every
 * consecutive pair, boxes in a column, bands with arcs in a gutter, bands with dots in the corner.
 * Round 5 was nested rings. The owner rejected each one, latterly with *"can you see a flow in
 * this? a flow.."*, and the last rejection is the one with a measured cause behind it: the
 * nested-rectangle literature is blunt that **beyond 2–3 levels of nesting the form stops being
 * readable**, because deep nesting leaves no room for labels. Feature-Sliced Design has seven
 * layers. The onion was not a near miss; it was the wrong instrument for this depth.
 *
 * **What the evidence actually supports for 4–8 layers.**
 *
 * - **One nesting level, not seven.** Full-width bands in dependency order, constant height, label
 *   in a leading strip. A long name truncates horizontally instead of deforming the geometry.
 * - **A policy matrix beside them.** Ghoniem, Fekete and Castagliola measured the crossover: past
 *   about twenty vertices a matrix beats node-link at everything except path-finding, and below it
 *   the graph wins. At four to eight, the matrix is sixteen to sixty-four cells — small enough to
 *   read at a glance, and the only form in which *"there are no exceptions"* is a visible claim
 *   rather than an absence. A legal layering draws a filled triangle; a hole is an empty cell where
 *   the triangle should be solid, and needs no separate mark because its **position** is the
 *   exception. Concentric rings could not say this at all, which is why they needed a paragraph of
 *   disclaimer underneath.
 * - **One arrow, not n².** A single stroke down the gutter carrying one stated semantic. Arrow
 *   direction is genuinely ambiguous here — source-code dependency and data flow run in *opposite*
 *   directions across a boundary — so the legend names which one this is, once.
 * - **Motion that answers a question.** Hovering or focusing a layer raises it and everything it
 *   may reach and dims the rest, and lights its row and column in the matrix. That is Shneiderman's
 *   focus-plus-context and Heer and Shneiderman's linked highlighting, and it is the same ego-focus
 *   behaviour the map already uses. This is what makes the reach legible: a static picture of seven
 *   rows cannot show it, and no amount of restyling the rows was ever going to.
 *
 * ⚠️ **No layout library.** Every candidate — ELK, dagre, Cytoscape, Reaflow — solves *layout
 * search*, and there is nothing to search: the order is the data. ELK alone is 455 KB gzipped to
 * place eight boxes, and it is the one non-permissive licence among them. The geometry here is a
 * loop over an array.
 */


/**
 * A recognizable mark per conventional role id, one neutral ink — the reference mockup leads every
 * layer with an icon, and the known role vocabulary (the same ids `roleLabels` translates) can
 * carry that without inventing colour. An unknown role id falls back to the generic layer mark;
 * the icon decorates the reviewed name and never substitutes for it.
 */
const ROLE_ICONS: Record<string, LucideIcon> = {
  routing: Route,
  app: AppWindow,
  views: PanelsTopLeft,
  widgets: LayoutGrid,
  features: SlidersHorizontal,
  entities: Database,
  shared: Package,
  domain: Landmark,
  application: Cog,
  port: Plug,
  adapter: Cable,
  core: Cpu,
  integration: Blocks,
};
/**
 * Occupant cards shown per band before the rest folds behind a "+N" control. Unbounded occupants
 * once pushed the deepest band 181px below the fold (the selected direction's stated falsifier),
 * answered first by a cap and then, by owner decision, traded in part for generous scale. Three
 * is one full card row at the widest stage; the "+N" control lives in the label column so the
 * card region holds only cards and the control never wraps into a lonely row of its own.
 */
const CARD_PREVIEW = 3;

export function ArchitectureFlow({
  profile,
  occupants,
  roleLabel,
  reachLabel,
  sinkLabel,
  directionLabel,
  occupantCountLabel,
  moreLabel,
  showFewerLabel,
  noOccupantsBody,
  reachInlineLabel,
}: {
  profile: ArchitectureProfile;
  /**
   * The role-glob × vault-`path` join, per role id. Reviewed facts only — this component draws
   * whatever the entity derived and never resolves paths itself.
   */
  occupants: Readonly<Record<string, ArchitectureOccupant[]>>;
  roleLabel: (id: string) => string;
  /** Reads one layer's reach aloud, because a matrix is not a sentence. */
  reachLabel: (role: string, targets: string) => string;
  /** What "depends on nothing" is called. */
  sinkLabel: string;
  /** Names the one arrow's semantic. Ambiguity here is the most common misread. */
  directionLabel: string;
  /** "N concepts" for a band header; derived counts only. */
  occupantCountLabel: (count: number) => string;
  /** "+N more" on a band whose occupants exceed the preview; the count is the derived remainder. */
  moreLabel: (count: number) => string;
  /** Collapses an expanded band back to its preview. */
  showFewerLabel: string;
  /** The one honest sentence for a vault whose concepts record no matching paths at all. */
  noOccupantsBody: string;
  /** "may depend on {targets}", written in role names — the explicit policy's visible reach. */
  reachInlineLabel: (targets: string) => string;
}) {
  const layout = useMemo(() => buildArchitectureLayout(profile), [profile]);
  const [focus, setFocus] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<ReadonlySet<string>>(new Set());

  const pathsOf = useMemo(
    () => new Map(profile.roles.map((role) => [role.id, role.paths])),
    [profile],
  );
  /** Outer to inner. Roles sharing a depth share a rung: neither may depend on the other. */
  const rungs = layout.rows;
  const order = rungs.flat();
  const allows = useMemo(() => {
    const map = new Map<string, Set<string>>(order.map((id) => [id, new Set<string>()]));
    for (const edge of layout.edges) map.get(edge.from)?.add(edge.to);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
  }, [layout]);

  const reaches = (id: string) => allows.get(id) ?? new Set<string>();
  /** Focus keeps the focused layer and everything it may reach; everything else recedes. */
  const inFocus = (id: string) => focus === null || focus === id || reaches(focus).has(id);

  const rowIndexOf = useMemo(() => {
    const map = new Map<string, number>();
    rungs.forEach((row, index) => row.forEach((id) => map.set(id, index)));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rungs is derived from layout
  }, [layout]);
  /*
   * The flow run: focusing a layer sends one staggered pulse down every gap between it and its
   * deepest reach — the dependency direction seen as motion, on request, never as an ambient loop.
   */
  const focusRow = focus === null ? null : rowIndexOf.get(focus) ?? null;
  const deepestReachRow =
    focus === null || focusRow === null
      ? null
      : [...reaches(focus)].reduce(
          (deepest, id) => Math.max(deepest, rowIndexOf.get(id) ?? -1),
          focusRow,
        );

  /*
   * Occupancy changes the drawing only when it exists. An all-empty join keeps every band at the
   * proven constant pitch — the ladder the five rejected rounds converged on — plus one honest
   * sentence below, instead of seven repeated "0 matched" lines saying the same nothing.
   */
  const totalOccupants = order.reduce((sum, id) => sum + (occupants[id]?.length ?? 0), 0);

  return (
    <div
      className="flex w-full flex-col gap-3"
      data-testid="architecture-flow"
      onMouseLeave={() => setFocus(null)}
    >
      {/*
        ⚠️ **A layer is a container, and its policy stays with the layer.** The dot matrix that
        once stated the policy is gone by owner decision (2026-08-27): under `lower-only` the
        sentence above the stage, the band order, and the connectors already say the entire rule,
        so the dots were a second notation for the same fact; under `explicit` the rule really is a
        graph, so each label writes its reach in role names instead of cells. The bands are
        separate surfaces with the spine running between them — the owner's reference reads as
        boxes holding parts inside one framed stage, carried here with the charter's neutral
        surfaces instead of per-layer hues.
      */}
      <div className="flex flex-col gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        <ol
          className="relative m-0 flex list-none flex-col gap-4 p-0"
          data-testid="architecture-matrix"
        >
          {rungs.map((rung, depth) => (
            <li
              key={rung.join('+')}
              className={`relative rounded-card border bg-[color:var(--color-elevated)] transition-[opacity,border-color] duration-[var(--motion-fast)] ${
                rung.some((id) => focus === id)
                  ? 'border-[color:var(--color-indigo-a30)]'
                  : 'border-[color:var(--color-border-soft)]'
              } ${rung.every((id) => !inFocus(id)) ? 'opacity-40' : 'opacity-100'}`}
              onMouseEnter={() => setFocus(rung[0] ?? null)}
            >
              {/*
                The ordered spine, drawn where the reference draws it: one downward connector in
                each gap between adjacent layers, all carrying the single legend meaning. This is
                not the rejected arrow-per-permitted-pair — rows are ordered by reach depth, so
                every real dependency points down and one stroke per gap states exactly that.
              */}
              {depth < rungs.length - 1 ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-full h-4 w-4 -translate-x-1/2"
                  data-testid={depth === 0 ? 'architecture-flow-inward' : undefined}
                >
                  <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-[color:var(--color-indigo-a60)]" />
                  <svg
                    className="absolute -bottom-px left-1/2 -translate-x-1/2"
                    width={8}
                    height={6}
                    viewBox="0 0 8 6"
                  >
                    <path d="M0,0 L4,6 L8,0 Z" fill="var(--color-indigo-a60)" />
                  </svg>
                  {focusRow !== null &&
                  deepestReachRow !== null &&
                  depth >= focusRow &&
                  depth < deepestReachRow ? (
                    <span
                      key={`${focus}-${depth}`}
                      className="architecture-flow-run absolute -ml-[3px] left-1/2 top-0 size-1.5 rounded-full bg-[color:var(--color-indigo-brand)]"
                      style={
                        {
                          '--architecture-flow-delay': `${(depth - focusRow) * 100}ms`,
                        } as React.CSSProperties
                      }
                      data-testid={`architecture-flow-run-${depth}`}
                    />
                  ) : null}
                </span>
              ) : null}
              {/*
                The band reads as a diagram region, the way the reference draws a layer: the label
                column leads and the occupant cards fill the rest.
              */}
              <div className="flex items-center gap-5 p-3.5">
                <div className="flex w-52 shrink-0 flex-col gap-2">
                  {rung.map((id) => (
                    <div key={id} className="min-w-0" data-testid={`architecture-rung-${id}`}>
                      <RowButton
                        active={focus === id}
                        hoverInk="strong"
                        hoverSurface="lift"
                        /*
                         * Hover and keyboard focus set the same state, so the reach is reachable
                         * without a pointer. `RowButton` is the registered primitive; a
                         * hand-written control would raise a ratchet that has stood at zero.
                         */
                        onMouseEnter={() => setFocus(id)}
                        onFocus={() => setFocus(id)}
                        onBlur={() => setFocus(null)}
                        onClick={() => setFocus((current) => (current === id ? null : id))}
                        data-testid={`architecture-role-${id}`}
                        data-focus-state={
                          focus === null
                            ? 'rest'
                            : focus === id
                              ? 'focused'
                              : inFocus(id)
                                ? 'reached'
                                : 'dimmed'
                        }
                        className="w-full justify-start px-2 py-1.5 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          {(() => {
                            const RoleIcon = ROLE_ICONS[id] ?? Layers;
                            return (
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-secondary)]">
                                <RoleIcon size={ICON_SIZE.lg} aria-hidden />
                              </span>
                            );
                          })()}
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              {/*
                                The index is how a reader decodes a matrix column: seven layer
                                names cannot be written above 112px of cells, and numbering rows
                                and columns alike is what every dependency-structure matrix does.
                              */}
                              <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                                {depth + 1}
                              </span>
                              <span
                                className={
                                  reaches(id).size === 0
                                    ? 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]'
                                    : 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]'
                                }
                              >
                                {roleLabel(id)}
                              </span>
                            </span>
                            {/*
                              The count is the band's own empty state: "0 concepts" under the name
                              says the gap once and where it belongs. It appears only while the
                              join found anything at all — an all-empty vault gets one sentence for
                              the whole stage instead of this row-by-row echo.
                            */}
                            {totalOccupants > 0 ? (
                              <span
                                className="block text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
                                data-testid={`architecture-occupant-count-${id}`}
                              >
                                {occupantCountLabel((occupants[id] ?? []).length)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </RowButton>
                      {/*
                        Under `explicit` the allowed reach really is a graph, so it is written in
                        role names a person can read without decoding cells. `lower-only` writes
                        nothing here: the stage subtitle plus the band order already state the
                        whole rule, and repeating it seven times was the dot matrix's mistake.
                      */}
                      {layout.policy === 'explicit' ? (
                        <p
                          className="mt-0.5 px-2 text-caption text-[color:var(--color-text-tertiary)]"
                          data-testid={`architecture-reach-${id}`}
                        >
                          {reaches(id).size === 0
                            ? sinkLabel
                            : reachInlineLabel([...reaches(id)].map(roleLabel).join(' · '))}
                        </p>
                      ) : null}
                      <p
                        className="mt-0.5 truncate px-2 font-mono text-caption text-[color:var(--color-text-quaternary)]"
                        title={(pathsOf.get(id) ?? []).join('  ·  ')}
                      >
                        {(pathsOf.get(id) ?? []).join('  ·  ')}
                      </p>
                      {(() => {
                        const roleOccupants = occupants[id] ?? [];
                        const isExpanded = expandedRoles.has(id);
                        const hidden = roleOccupants.length - CARD_PREVIEW;
                        if (hidden <= 0 && !isExpanded) return null;
                        return (
                          <div className="mt-1.5 px-2">
                            <Chip
                              size="sm"
                              aria-expanded={isExpanded}
                              data-testid={`architecture-occupants-toggle-${id}`}
                              onClick={() =>
                                setExpandedRoles((current) => {
                                  const next = new Set(current);
                                  if (isExpanded) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                            >
                              {isExpanded ? showFewerLabel : moreLabel(hidden)}
                            </Chip>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>

                {/*
                  The band's middle: the reviewed concepts whose `path` the role's globs place
                  here, drawn as cards the way the reference draws components inside a layer —
                  glyph, canonical title, implementation path. A card navigates to its concept on
                  the map (the ontology reading surface), which is a real action on a typed fact;
                  what this screen still refuses to invent is edges between cards. Kind is carried
                  by the same glyph family every other surface draws.
                */}
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  {rung.map((id) => {
                    const roleOccupants = occupants[id] ?? [];
                    if (roleOccupants.length === 0) return null;
                    const isExpanded = expandedRoles.has(id);
                    const visible = isExpanded ? roleOccupants : roleOccupants.slice(0, CARD_PREVIEW);
                    return (
                      <div key={id} className="min-w-0" data-testid={`architecture-occupants-${id}`}>
                        {rung.length > 1 ? (
                          <p className="mb-1.5 text-caption text-[color:var(--color-text-quaternary)]">
                            {roleLabel(id)}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
                          {visible.map((occupant) => (
                            <Link
                              key={occupant.slug}
                              href={buildOntologyNodeHref(
                                `${occupant.kind}:${occupant.slug.split('/').pop() || occupant.slug}`,
                              )}
                              title={occupant.path}
                              className={controlClass({
                                shape: 'card',
                                size: 'lg',
                                tone: 'secondary',
                                hoverBorder: 'strong',
                                className: 'h-14 min-w-0 gap-3 px-3',
                              })}
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-micro border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)]">
                                <TopologyV2KindGlyph kind={occupant.kind} size={18} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                                  {occupant.title}
                                </span>
                                <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                                  {occupant.path}
                                </span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {totalOccupants === 0 ? (
          <p data-testid="architecture-occupants-empty">
            <span className="block rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-3 text-caption text-[color:var(--color-text-quaternary)]">
              {noOccupantsBody}
            </span>
          </p>
        ) : null}

        {/*
          One mark is left on the stage, so one sentence explains it. The old three-part legend
          died with the dot matrix; keeping its rows would explain marks that no longer exist.
        */}
        <p className="mt-1 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-quaternary)]">
          {directionLabel}
        </p>
      </div>

      {/* The drawing is hidden from assistive technology, so the same facts are stated here. */}
      <ol className="sr-only">
        {order.map((id) => {
          const allowed = [...reaches(id)];
          return (
            <li key={id}>
              {allowed.length === 0
                ? `${roleLabel(id)}: ${sinkLabel}`
                : reachLabel(roleLabel(id), allowed.map(roleLabel).join(', '))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
