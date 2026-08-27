'use client';

import { useMemo, useState } from 'react';
import {
  AppWindow,
  Blocks,
  Cable,
  Cog,
  Cpu,
  Database,
  FileCode2,
  Folder,
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
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import { useSwapHeight } from '@/shared/lib/use-presence';
import { Chip, RowButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { RoleSourceModule } from '../model/source-modules';

/**
 * The dependency policy as a stage of layer regions: bands in reach order, the spine between them,
 * and each band occupied by the **source modules** its role globs actually contain.
 *
 * ⚠️ **Five rounds got here, and the research says why four of them failed.**
 *
 * Rounds 1–4 were a *list of roles with decoration attached* — cards with an arrow between every
 * consecutive pair, boxes in a column, bands with arcs in a gutter, bands with dots in the corner.
 * Round 5 was nested rings. The owner rejected each one, latterly with *"can you see a flow in
 * this? a flow.."*, and the nested-rectangle literature is blunt that beyond 2–3 levels of nesting
 * the form stops being readable — Feature-Sliced Design has seven layers.
 *
 * What survived, and why:
 *
 * - **One nesting level.** Full-width bands in dependency order; a long name truncates instead of
 *   deforming the geometry.
 * - **Order is the policy.** Under `lower-only` the subtitle sentence, the band order, and the
 *   connectors state the entire rule; under `explicit` each label writes its reach in role names.
 *   (The dot matrix that once encoded this was removed by owner decision, 2026-08-27 — see
 *   `docs/DECISIONS.md` for the preserved dissent.)
 * - **One connector meaning.** A single downward stroke per gap; the legend names its semantic
 *   once, because source-code dependency and data flow run in opposite directions across a
 *   boundary.
 * - **Motion answers a question.** Focusing a layer raises it and its reach, dims the rest, and
 *   sends one staggered pulse down the spine — Shneiderman's focus-plus-context, the same
 *   ego-focus the map uses.
 * - **Occupants are source truth.** Bands list a read-only directory walk of the bound project
 *   source (owner correction, 2026-08-27: the ontology is the meaning map; architecture is about
 *   the source). A browser cannot list a source folder, and the stage says so instead of
 *   pretending emptiness. No import is ever read here — conformance stays with the MCP and CLI.
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
 * Modules shown per band before the rest folds behind a "+N" control. Unbounded occupants once
 * pushed the deepest band 181px below the fold (the selected direction's stated falsifier),
 * answered first by a cap and then, by owner decision, traded in part for generous scale. Three
 * is one full card row at the widest stage; the "+N" control lives in the label column so the
 * card region holds only cards and the control never wraps into a lonely row of its own.
 */
const CARD_PREVIEW = 3;

interface BandProps {
  rung: string[];
  depth: number;
  isLast: boolean;
  policy: 'explicit' | 'lower-only';
  focus: string | null;
  focusRow: number | null;
  deepestReachRow: number | null;
  onFocus: (id: string | null) => void;
  onFocusToggle: (id: string) => void;
  reachesOf: (id: string) => Set<string>;
  inFocus: (id: string) => boolean;
  roleLabel: (id: string) => string;
  pathsOf: ReadonlyMap<string, string[]>;
  /** `null` while no source listing exists on this surface. */
  modules: Readonly<Record<string, RoleSourceModule[]>> | null;
  expandedRoles: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  moduleCountLabel: (count: number) => string;
  moreLabel: (count: number) => string;
  showFewerLabel: string;
  sinkLabel: string;
  reachInlineLabel: (targets: string) => string;
}

/**
 * One layer region. A component of its own so the expand/collapse of its card grid can animate
 * height through `useSwapHeight` — the hook needs a per-band host, and hooks cannot live in the
 * parent's loop.
 */
function ArchitectureBand({
  rung,
  depth,
  isLast,
  policy,
  focus,
  focusRow,
  deepestReachRow,
  onFocus,
  onFocusToggle,
  reachesOf,
  inFocus,
  roleLabel,
  pathsOf,
  modules,
  expandedRoles,
  onToggleExpanded,
  moduleCountLabel,
  moreLabel,
  showFewerLabel,
  sinkLabel,
  reachInlineLabel,
}: BandProps) {
  const expandKey = rung.map((id) => (expandedRoles.has(id) ? '1' : '0')).join('');
  const { hostRef: swapHostRef, capture: captureSwapHeight } = useSwapHeight(expandKey);

  return (
    <li
      className={`relative rounded-card border bg-[color:var(--color-elevated)] transition-[opacity,border-color] duration-[var(--motion-fast)] ${
        rung.some((id) => focus === id)
          ? 'border-[color:var(--color-indigo-a30)]'
          : 'border-[color:var(--color-border-soft)]'
      } ${rung.every((id) => !inFocus(id)) ? 'opacity-40' : 'opacity-100'}`}
      onMouseEnter={() => onFocus(rung[0] ?? null)}
    >
      {/*
        The ordered spine, drawn where the reference draws it: one downward connector in each gap
        between adjacent layers, all carrying the single legend meaning. This is not the rejected
        arrow-per-permitted-pair — rows are ordered by reach depth, so every real dependency
        points down and one stroke per gap states exactly that.
      */}
      {!isLast ? (
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
        Two shapes, honestly chosen by the data. Without a source listing (a browser, an unbound
        project) a band collapses to one compact identity row — a tall empty region would be a
        drawing of nothing, which is what the owner rejected on sight. With a listing, the band
        opens into the reference's diagram region: label column leading, module cards filling the
        rest, height animating on expand/collapse (`useSwapHeight`).
      */}
      {modules === null ? (
        <div className="flex items-center gap-3 px-3.5 py-2">
          {rung.map((id) => (
            <div key={id} className="flex min-w-0 flex-1 items-center" data-testid={`architecture-rung-${id}`}>
              <RowButton
                active={focus === id}
                hoverInk="strong"
                hoverSurface="lift"
                onMouseEnter={() => onFocus(id)}
                onFocus={() => onFocus(id)}
                onBlur={() => onFocus(null)}
                onClick={() => onFocusToggle(id)}
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
                className="min-w-0 flex-1 justify-start px-2 py-1.5 text-left"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {(() => {
                    const RoleIcon = ROLE_ICONS[id] ?? Layers;
                    return (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-secondary)]">
                        <RoleIcon size={ICON_SIZE.sm} aria-hidden />
                      </span>
                    );
                  })()}
                  <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                    {depth + 1}
                  </span>
                  <span
                    className={
                      reachesOf(id).size === 0
                        ? 'shrink-0 text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]'
                        : 'shrink-0 text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]'
                    }
                  >
                    {roleLabel(id)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]"
                    title={(pathsOf.get(id) ?? []).join('  ·  ')}
                  >
                    {(pathsOf.get(id) ?? []).join('  ·  ')}
                  </span>
                  {policy === 'explicit' ? (
                    <span
                      className="ml-2 shrink-0 text-caption text-[color:var(--color-text-tertiary)]"
                      data-testid={`architecture-reach-${id}`}
                    >
                      {reachesOf(id).size === 0
                        ? sinkLabel
                        : reachInlineLabel([...reachesOf(id)].map(roleLabel).join(' · '))}
                    </span>
                  ) : null}
                </span>
              </RowButton>
            </div>
          ))}
        </div>
      ) : (
      <div ref={swapHostRef} className="overflow-hidden">
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
                   * without a pointer. `RowButton` is the registered primitive; a hand-written
                   * control would raise a ratchet that has stood at zero.
                   */
                  onMouseEnter={() => onFocus(id)}
                  onFocus={() => onFocus(id)}
                  onBlur={() => onFocus(null)}
                  onClick={() => onFocusToggle(id)}
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
                          The index is how a reader decodes the order out loud: seven layer names
                          need a stable number to talk about, and numbering the bands is what
                          every layered-architecture drawing does.
                        */}
                        <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                          {depth + 1}
                        </span>
                        <span
                          className={
                            reachesOf(id).size === 0
                              ? 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]'
                              : 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]'
                          }
                        >
                          {roleLabel(id)}
                        </span>
                      </span>
                      {/*
                        The count is the band's own empty state: "0 modules" under the name says
                        the gap once and where it belongs. It exists only where a listing exists
                        — a surface that cannot list source says so once for the whole stage.
                      */}
                      {modules !== null ? (
                        <span
                          className="block text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
                          data-testid={`architecture-module-count-${id}`}
                        >
                          {moduleCountLabel((modules[id] ?? []).length)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </RowButton>
                {/*
                  Under `explicit` the allowed reach really is a graph, so it is written in role
                  names a person can read without decoding cells. `lower-only` writes nothing
                  here: the stage subtitle plus the band order already state the whole rule.
                */}
                {policy === 'explicit' ? (
                  <p
                    className="mt-0.5 px-2 text-caption text-[color:var(--color-text-tertiary)]"
                    data-testid={`architecture-reach-${id}`}
                  >
                    {reachesOf(id).size === 0
                      ? sinkLabel
                      : reachInlineLabel([...reachesOf(id)].map(roleLabel).join(' · '))}
                  </p>
                ) : null}
                <p
                  className="mt-0.5 truncate px-2 font-mono text-caption text-[color:var(--color-text-quaternary)]"
                  title={(pathsOf.get(id) ?? []).join('  ·  ')}
                >
                  {(pathsOf.get(id) ?? []).join('  ·  ')}
                </p>
                {(() => {
                  const roleModules = modules?.[id] ?? [];
                  const isExpanded = expandedRoles.has(id);
                  const hidden = roleModules.length - CARD_PREVIEW;
                  if (hidden <= 0 && !isExpanded) return null;
                  return (
                    <div className="mt-1.5 px-2">
                      <Chip
                        size="sm"
                        aria-expanded={isExpanded}
                        data-testid={`architecture-modules-toggle-${id}`}
                        onClick={() => {
                          /* Height can only be measured before the DOM changes. */
                          captureSwapHeight();
                          onToggleExpanded(id);
                        }}
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
            The band's middle: the source modules the role's globs actually contain, from a
            read-only directory walk of the bound project source — name and repo-relative path,
            the way the reference draws components inside a layer. No edges between cards are
            invented, and no import is ever read here.
          */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {rung.map((id) => {
              const roleModules = modules?.[id] ?? [];
              if (roleModules.length === 0) return null;
              const isExpanded = expandedRoles.has(id);
              const visible = isExpanded ? roleModules : roleModules.slice(0, CARD_PREVIEW);
              return (
                <div key={id} className="min-w-0" data-testid={`architecture-modules-${id}`}>
                  {rung.length > 1 ? (
                    <p className="mb-1.5 text-caption text-[color:var(--color-text-quaternary)]">
                      {roleLabel(id)}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
                    {visible.map((module) => (
                      <div
                        key={module.path}
                        title={module.path}
                        className="flex h-14 min-w-0 items-center gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-micro border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-text-soft)]">
                          {module.kind === 'dir' ? (
                            <Folder size={ICON_SIZE.lg} aria-hidden />
                          ) : (
                            <FileCode2 size={ICON_SIZE.lg} aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                            {module.name}
                          </span>
                          <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                            {module.path}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </li>
  );
}

export function ArchitectureFlow({
  profile,
  modules,
  roleLabel,
  reachLabel,
  sinkLabel,
  directionLabel,
  moduleCountLabel,
  moreLabel,
  showFewerLabel,
  sourceUnavailableBody,
  reachInlineLabel,
}: {
  profile: ArchitectureProfile;
  /**
   * Source modules per role id, from the read-only directory walk of the bound project source —
   * or `null` when this surface has no listing (browser, unbound project, still loading).
   */
  modules: Readonly<Record<string, RoleSourceModule[]>> | null;
  roleLabel: (id: string) => string;
  /** Reads one layer's reach aloud, because a drawing is not a sentence. */
  reachLabel: (role: string, targets: string) => string;
  /** What "depends on nothing" is called. */
  sinkLabel: string;
  /** Names the one arrow's semantic. Ambiguity here is the most common misread. */
  directionLabel: string;
  /** "N modules" for a band label; derived counts only. */
  moduleCountLabel: (count: number) => string;
  /** "+N more" on a band whose modules exceed the preview; the count is the derived remainder. */
  moreLabel: (count: number) => string;
  /** Collapses an expanded band back to its preview. */
  showFewerLabel: string;
  /**
   * The one honest sentence for a surface that cannot list source at all (a browser cannot read
   * a source folder; that is an impossibility, not a gap). `null` where a listing is possible.
   */
  sourceUnavailableBody: string | null;
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

  return (
    <div
      className="flex w-full flex-col gap-3"
      data-testid="architecture-flow"
      onMouseLeave={() => setFocus(null)}
    >
      <div className="flex flex-col gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        {sourceUnavailableBody !== null ? (
          /* Before the bands, so a reader learns why they are bare before wondering. */
          <p className="mb-2" data-testid="architecture-source-unavailable">
            <span className="block rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-3 text-caption text-[color:var(--color-text-quaternary)]">
              {sourceUnavailableBody}
            </span>
          </p>
        ) : null}
        <ol
          className="relative m-0 flex list-none flex-col gap-4 p-0"
          data-testid="architecture-matrix"
        >
          {rungs.map((rung, depth) => (
            <ArchitectureBand
              key={rung.join('+')}
              rung={rung}
              depth={depth}
              isLast={depth === rungs.length - 1}
              policy={layout.policy}
              focus={focus}
              focusRow={focusRow}
              deepestReachRow={deepestReachRow}
              onFocus={setFocus}
              onFocusToggle={(id) => setFocus((current) => (current === id ? null : id))}
              reachesOf={reaches}
              inFocus={inFocus}
              roleLabel={roleLabel}
              pathsOf={pathsOf}
              modules={modules}
              expandedRoles={expandedRoles}
              onToggleExpanded={(id) =>
                setExpandedRoles((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              moduleCountLabel={moduleCountLabel}
              moreLabel={moreLabel}
              showFewerLabel={showFewerLabel}
              sinkLabel={sinkLabel}
              reachInlineLabel={reachInlineLabel}
            />
          ))}
        </ol>

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
