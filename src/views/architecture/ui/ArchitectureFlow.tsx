'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  ChevronDown,
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
import { Chip, RowButton, StaggeredFadeIn, TopologyV2KindGlyph } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useGridColumns } from '../model/grid-columns';
import { deriveConceptEdges, type ConceptEdge, type RoleConcept } from '../model/role-concepts';
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
/* The occupant grids' track floor and gap — `minmax(200px, 1fr)` with `gap-2.5`. The preview row
   is derived from these, so the two numbers live once and the class strings quote them. */
const OCCUPANT_CARD_MIN = 200;
const OCCUPANT_CARD_GAP = 10;
/* `px-3.5` on both sides of a concept section. */
const CONCEPT_SECTION_INSET = 28;
/* What the preview shows before any layout can be measured — the count this grid carried before
   it was derived, so an unmeasurable surface loses nothing. */
const OCCUPANT_PREVIEW_FALLBACK = 3;

interface BandProps {
  rung: string[];
  depth: number;
  isLast: boolean;
  policy: 'explicit' | 'lower-only';
  focus: string | null;
  /** The flow run's origin row and deepest reach — set only by a deliberate act (click or
   *  keyboard focus), never by hover, so scanning the pointer down the page stays quiet. */
  runRow: number | null;
  runDeepestRow: number | null;
  /** Bumped per deliberate trigger; keys the dots so a re-run replays instead of resuming. */
  runSeq: number;
  onFocus: (id: string | null) => void;
  onFocusToggle: (id: string) => void;
  onRun: (id: string) => void;
  onRunClear: () => void;
  /** Injected by the entrance cascade (`StaggeredFadeIn` clones its children). */
  className?: string;
  style?: React.CSSProperties;
  reachesOf: (id: string) => Set<string>;
  inFocus: (id: string) => boolean;
  roleLabel: (id: string) => string;
  pathsOf: ReadonlyMap<string, string[]>;
  /** `null` while no source listing exists on this surface. */
  modules: Readonly<Record<string, RoleSourceModule[]>> | null;
  /** The labeled meaning layer: reviewed concepts whose `path` sits inside the role's globs. */
  concepts: Readonly<Record<string, RoleConcept[]>>;
  expandedRoles: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  /** Roles whose click-open detail (the concepts section) is showing. */
  openRoles: ReadonlySet<string>;
  onToggleOpen: (id: string) => void;
  /** Concept sections showing every card instead of the preview row. */
  conceptsMore: ReadonlySet<string>;
  onToggleConceptsMore: (id: string) => void;
  moreLabelForConcepts: (count: number) => string;
  /** Slugs taking part in any reviewed relation — the preview shows these first. */
  edgeParticipants: ReadonlySet<string>;
  layerConceptsLabel: string;
  conceptCountLabel: (count: number) => string;
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
  runRow,
  runDeepestRow,
  runSeq,
  onFocus,
  onFocusToggle,
  onRun,
  onRunClear,
  reachesOf,
  inFocus,
  roleLabel,
  pathsOf,
  modules,
  concepts,
  expandedRoles,
  onToggleExpanded,
  openRoles,
  onToggleOpen,
  conceptsMore,
  onToggleConceptsMore,
  moreLabelForConcepts,
  edgeParticipants,
  layerConceptsLabel,
  conceptCountLabel,
  moduleCountLabel,
  moreLabel,
  showFewerLabel,
  sinkLabel,
  reachInlineLabel,
  className,
  style,
}: BandProps) {
  const expandKey = rung
    .map(
      (id) =>
        `${expandedRoles.has(id) ? '1' : '0'}${openRoles.has(id) ? 'o' : '-'}${
          conceptsMore.has(id) ? '+' : '.'
        }`,
    )
    .join('');
  const { hostRef: swapHostRef, capture: captureSwapHeight } = useSwapHeight(expandKey);
  /*
   * Both occupant grids preview exactly one full row. The module grid fills its own flex column,
   * so it is measured directly; the concept sections sit inside the band host behind `px-3.5`,
   * which `CONCEPT_SECTION_INSET` subtracts — change that class and the constant moves with it.
   */
  const [setModuleGridNode, modulePreview] = useGridColumns(
    OCCUPANT_CARD_MIN,
    OCCUPANT_CARD_GAP,
    { fallback: OCCUPANT_PREVIEW_FALLBACK },
  );
  const [setBandHostNode, conceptPreview] = useGridColumns(OCCUPANT_CARD_MIN, OCCUPANT_CARD_GAP, {
    inset: CONCEPT_SECTION_INSET,
    fallback: OCCUPANT_PREVIEW_FALLBACK,
  });
  /* The band host carries two readers: `useSwapHeight` animates it, and the concept grid takes
     its width from it. One callback ref feeds both so neither has to know about the other. */
  const bandHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      swapHostRef.current = node;
      setBandHostNode(node);
    },
    [swapHostRef, setBandHostNode],
  );

  return (
    /*
     * The outer li is the entrance cascade's target: StaggeredFadeIn injects inline
     * opacity/transform onto it, which must not fight the focus dim — so the dim and the border
     * live one element down, on the band box itself.
     */
    <li className={className} style={style}>
    <div
      className={`relative rounded-card border bg-[color:var(--color-elevated)] transition-[opacity,border-color] duration-[var(--motion-fast)] ${
        rung.some((id) => focus === id)
          ? 'border-[color:var(--color-indigo-a60)]'
          : 'border-[color:var(--color-border-soft)]'
      } ${rung.every((id) => !inFocus(id)) ? 'opacity-40' : 'opacity-100'}`}
      onPointerEnter={(event) => {
        /* Hover is a mouse concept. On touch, Chromium synthesizes mouseenter right before the
           tap's click, which turned the first tap into an instant focus-then-toggle-off — the
           screen's only interaction produced nothing (measured 2026-08-27). */
        if (event.pointerType === 'mouse') onFocus(rung[0] ?? null);
      }}
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
          className="pointer-events-none absolute left-1/2 top-[calc(100%+1px)] h-4 w-4 -translate-x-1/2"
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
          {runRow !== null &&
          runDeepestRow !== null &&
          depth >= runRow &&
          depth < runDeepestRow ? (
            <span
              key={`${runSeq}-${depth}`}
              className="architecture-flow-run absolute -ml-[3px] left-1/2 top-0 size-1.5 rounded-full bg-[color:var(--color-indigo-brand)]"
              style={
                {
                  '--architecture-flow-step': depth - runRow,
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
      <div ref={bandHostRef} className="overflow-hidden">
      {modules === null ? (
        <div className="flex items-center gap-3 px-3.5 py-2">
          {rung.map((id) => (
            <div key={id} className="flex min-w-0 flex-1 items-center" data-testid={`architecture-rung-${id}`}>
              <RowButton
                active={focus === id}
                hoverInk="strong"
                hoverSurface="lift"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') onFocus(id);
                }}
                onFocus={() => {
                  onFocus(id);
                  /* The run is a deliberate act's answer — keyboard focus and click land here;
                     a pointer merely passing over a band does not. */
                  onRun(id);
                }}
                onBlur={() => {
                  onFocus(null);
                  onRunClear();
                }}
                onClick={() => {
                  /* Click is the detail act: it pins the focus AND opens the layer in place.
                     Height is measured before the DOM changes so the opening is a movement. */
                  captureSwapHeight();
                  onFocusToggle(id);
                  onToggleOpen(id);
                }}
                aria-expanded={openRoles.has(id)}
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
                {/*
                  One row on md and up; two rows below it. Measured at 390px: a single row left
                  the reach span painting 37px past the band and the glob caption truncated to
                  zero width — a fact deleted without notice. Below md, identity takes row one
                  and the facts take row two at full width.
                */}
                <span className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {(() => {
                      const RoleIcon = ROLE_ICONS[id] ?? Layers;
                      return (
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-micro border transition-colors duration-[var(--motion-fast)] ${
                            focus === id
                              ? 'border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-text-soft)]'
                              : 'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-secondary)]'
                          }`}
                        >
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
                          ? 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]'
                          : 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]'
                      }
                    >
                      {roleLabel(id)}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-2.5">
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-caption text-[color:var(--color-text-quaternary)] md:min-w-[10ch]"
                      title={(pathsOf.get(id) ?? []).join('  ·  ')}
                    >
                      {(pathsOf.get(id) ?? []).join('  ·  ')}
                    </span>
                    {policy === 'explicit' ? (
                      <span
                        className="min-w-0 truncate text-caption text-[color:var(--color-text-tertiary)] md:shrink-0"
                        title={
                          reachesOf(id).size === 0
                            ? sinkLabel
                            : reachInlineLabel([...reachesOf(id)].map(roleLabel).join(' · '))
                        }
                        data-testid={`architecture-reach-${id}`}
                      >
                        {reachesOf(id).size === 0
                          ? sinkLabel
                          : reachInlineLabel([...reachesOf(id)].map(roleLabel).join(' · '))}
                      </span>
                    ) : null}
                  </span>
                </span>
              </RowButton>
            </div>
          ))}
        </div>
      ) : (
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
                  onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') onFocus(id);
                }}
                  onFocus={() => onFocus(id)}
                  onBlur={() => onFocus(null)}
                  onClick={() => {
                    captureSwapHeight();
                    onFocusToggle(id);
                    onToggleOpen(id);
                  }}
                  aria-expanded={openRoles.has(id)}
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
                        <span
                          className={`flex size-9 shrink-0 items-center justify-center rounded-micro border transition-colors duration-[var(--motion-fast)] ${
                            focus === id
                              ? 'border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-text-soft)]'
                              : 'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-secondary)]'
                          }`}
                        >
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
                    <ChevronDown
                      size={ICON_SIZE.sm}
                      aria-hidden
                      className={`ml-auto shrink-0 text-[color:var(--color-text-quaternary)] transition-transform duration-[var(--motion-fast)] ${
                        openRoles.has(id) ? 'rotate-180' : ''
                      }`}
                    />
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
                  const hidden = roleModules.length - modulePreview;
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
          <div ref={setModuleGridNode} className="flex min-w-0 flex-1 flex-col gap-2.5">
            {rung.map((id) => {
              const roleModules = modules?.[id] ?? [];
              if (roleModules.length === 0) return null;
              const isExpanded = expandedRoles.has(id);
              const visible = isExpanded ? roleModules : roleModules.slice(0, modulePreview);
              return (
                <div key={id} className="min-w-0" data-testid={`architecture-modules-${id}`}>
                  {rung.length > 1 ? (
                    <p className="mb-1.5 text-caption text-[color:var(--color-text-quaternary)]">
                      {roleLabel(id)}
                    </p>
                  ) : null}
                  {/*
                    Revealed cards rise in sequence — the expand is one event, so the height swap
                    and the first card start together and the rest follow inside the same beat.
                  */}
                  <StaggeredFadeIn
                    key={`${id}-${isExpanded ? 'open' : 'closed'}`}
                    as="div"
                    className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5"
                    stagger={24}
                    duration={180}
                    translateY={6}
                  >
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
                  </StaggeredFadeIn>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/*
        The click-open detail: the labeled meaning layer. Decision (2026-08-27): the source
        modules row answers "what does this layer contain"; this section answers "which reviewed
        concepts live here" — two named layers, never mixed. Kind is carried by the same glyph
        family the map draws, distinct from the folder/file marks of the source layer above.
      */}
      {rung.map((id) => {
        if (!openRoles.has(id)) return null;
        const roleConcepts = concepts[id] ?? [];
        const showAll = conceptsMore.has(id);
        /*
         * The preview shows the connective tissue first: concepts that participate in a reviewed
         * relation outrank isolated ones, so the strokes between bands exist at rest instead of
         * hiding behind "+N more". Stable within each half — the path order stays the tiebreak.
         */
        const ordered = edgeParticipants.size
          ? [...roleConcepts].sort(
              (a, b) =>
                Number(edgeParticipants.has(b.slug)) - Number(edgeParticipants.has(a.slug)),
            )
          : roleConcepts;
        const visibleConcepts = showAll ? ordered : ordered.slice(0, conceptPreview);
        const hiddenConcepts = roleConcepts.length - visibleConcepts.length;
        return (
          <div
            key={`${id}-concepts`}
            className="border-t border-[color:var(--color-divider)] px-3.5 pb-3.5 pt-3"
            data-testid={`architecture-concepts-${id}`}
          >
            <p className="text-caption text-[color:var(--color-text-quaternary)]">
              {rung.length > 1 ? `${roleLabel(id)} · ` : ''}
              {layerConceptsLabel} · {conceptCountLabel(roleConcepts.length)}
            </p>
            {roleConcepts.length > 0 ? (
              <StaggeredFadeIn
                key={`${id}-concepts-grid-${showAll ? 'all' : 'preview'}`}
                as="div"
                className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5"
                stagger={24}
                duration={180}
                translateY={6}
              >
                {visibleConcepts.map((concept) => (
                  <div
                    key={concept.slug}
                    title={concept.path}
                    data-concept-slug={concept.slug}
                    className="flex h-14 min-w-0 items-center gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)]">
                      <TopologyV2KindGlyph kind={concept.kind} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                        {concept.title}
                      </span>
                      <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {concept.path}
                      </span>
                    </span>
                  </div>
                ))}
              </StaggeredFadeIn>
            ) : null}
            {hiddenConcepts > 0 || showAll ? (
              <div className="mt-2">
                <Chip
                  size="sm"
                  aria-expanded={showAll}
                  data-testid={`architecture-concepts-toggle-${id}`}
                  onClick={() => {
                    captureSwapHeight();
                    onToggleConceptsMore(id);
                  }}
                >
                  {showAll ? showFewerLabel : moreLabelForConcepts(hiddenConcepts)}
                </Chip>
              </div>
            ) : null}
          </div>
        );
      })}
      </div>
    </div>
    </li>
  );
}

/**
 * The card-to-card strokes, and the rule that licenses them: every edge here is a **reviewed
 * vault relation** (`dependencies` solid, `relates` dashed) between two placed concepts — never
 * an inferred import, never a decoration. Geometry is measured from the rendered cards
 * (offset chains ignore the entrance transforms), so an edge exists exactly when both of its
 * endpoints are on screen; collapsing a band retracts its strokes with it.
 */
function ConceptEdgeLayer({
  edges,
  containerRef,
  refreshKey,
}: {
  edges: ConceptEdge[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  refreshKey: string;
}) {
  const [paths, setPaths] = useState<
    { d: string; type: ConceptEdge['type']; from: string; to: string }[]
  >([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const anchorOf = (el: HTMLElement) => {
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = el;
        while (node && node !== container) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return { x, y, w: el.offsetWidth, h: el.offsetHeight };
      };
      const bySlug = new Map<string, { x: number; y: number; w: number; h: number }>();
      container.querySelectorAll<HTMLElement>('[data-concept-slug]').forEach((el) => {
        const slug = el.dataset.conceptSlug;
        if (slug) bySlug.set(slug, anchorOf(el));
      });
      const next: { d: string; type: ConceptEdge['type']; from: string; to: string }[] = [];
      for (const edge of edges) {
        const a = bySlug.get(edge.from);
        const b = bySlug.get(edge.to);
        if (!a || !b) continue;
        const downward = b.y >= a.y;
        const sx = a.x + a.w / 2;
        const sy = downward ? a.y + a.h : a.y;
        const tx = b.x + b.w / 2;
        const ty = downward ? b.y : b.y + b.h;
        const bend = Math.max(24, Math.abs(ty - sy) / 2);
        const c1 = downward ? sy + bend : sy - bend;
        const c2 = downward ? ty - bend : ty + bend;
        next.push({
          d: `M ${sx} ${sy} C ${sx} ${c1}, ${tx} ${c2}, ${tx} ${ty}`,
          type: edge.type,
          from: edge.from,
          to: edge.to,
        });
      }
      setPaths(next);
    };
    measure();
    /* The band height swap pins heights for --motion-base; measure again after it settles. */
    const settle = setTimeout(measure, 260);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', onResize);
    };
  }, [edges, containerRef, refreshKey]);

  if (paths.length === 0) return null;
  return (
    <svg
      aria-hidden
      data-testid="architecture-concept-edges"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <defs>
        <marker
          id="architecture-concept-arrow"
          viewBox="0 0 8 8"
          refX="6.5"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="var(--color-indigo-a60)" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          key={`${path.from}->${path.to}-${path.type}`}
          d={path.d}
          fill="none"
          stroke={path.type === 'dependency' ? 'var(--color-indigo-a60)' : 'var(--color-indigo-a30)'}
          strokeWidth={1.5}
          strokeDasharray={path.type === 'related' ? '4 4' : undefined}
          markerEnd={path.type === 'dependency' ? 'url(#architecture-concept-arrow)' : undefined}
        />
      ))}
    </svg>
  );
}

export function ArchitectureFlow({
  profile,
  modules,
  concepts,
  roleLabel,
  reachLabel,
  sinkLabel,
  directionLabel,
  moduleCountLabel,
  moreLabel,
  showFewerLabel,
  sourceUnavailableBody,
  reachInlineLabel,
  layerConceptsLabel,
  conceptCountLabel,
  legendDependency,
  legendRelated,
}: {
  profile: ArchitectureProfile;
  /**
   * Source modules per role id, from the read-only directory walk of the bound project source —
   * or `null` when this surface has no listing (browser, unbound project, still loading).
   */
  modules: Readonly<Record<string, RoleSourceModule[]>> | null;
  /** Reviewed concepts per role id (the labeled meaning layer for the click-open detail). */
  concepts: Readonly<Record<string, RoleConcept[]>>;
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
  layerConceptsLabel: string;
  conceptCountLabel: (count: number) => string;
  /** Legend entries for the two reviewed relation strokes. */
  legendDependency: string;
  legendRelated: string;
}) {
  const layout = useMemo(() => buildArchitectureLayout(profile), [profile]);
  const [focus, setFocus] = useState<string | null>(null);
  /*
   * The flow run's trigger is separate from hover focus on purpose (measured 2026-08-27: bound to
   * hover, reading down the page fired the cascade three times in 276ms). Only a deliberate act —
   * click or keyboard focus — starts a run; `runSeq` keys the dots so a repeat replays cleanly.
   */
  const [run, setRun] = useState<{ origin: string | null; seq: number }>({ origin: null, seq: 0 });
  const [expandedRoles, setExpandedRoles] = useState<ReadonlySet<string>>(new Set());
  /*
   * The detail sections open by default — the resting state is the full diagram, the click
   * collapses or re-focuses (owner direction, 2026-08-27: the first impression must be the
   * living picture, not a list of rows waiting to be asked).
   *
   * A role holding nothing rests closed (2026-08-28 inspection). Opening it draws a labelled
   * strip with "0 concepts" under it, and on the installed app's own first screen — a sample
   * whose globs match nothing yet — that was every band on the stage: four empty strips where
   * the redesign promised occupants. An empty region instead of a compact row is the exact
   * thing the source-modules record refused, so the rest state refuses it too. The click still
   * opens the empty band and still answers "0"; it is only the resting picture that stops
   * claiming there is something to see.
   */
  const restOpenRoles = () =>
    new Set(profile.roles.filter((role) => (concepts[role.id] ?? []).length > 0).map((role) => role.id));
  const [openState, setOpenState] = useState<{ key: string; roles: ReadonlySet<string> }>(() => ({
    key: profile.slug,
    roles: restOpenRoles(),
  }));
  const openRoles = openState.key === profile.slug ? openState.roles : restOpenRoles();
  const setOpenRoles = (updater: (current: ReadonlySet<string>) => ReadonlySet<string>) =>
    setOpenState(() => ({ key: profile.slug, roles: updater(openRoles) }));
  /* Concept sections showing all cards instead of the preview row. */
  const [conceptsMore, setConceptsMore] = useState<ReadonlySet<string>>(new Set());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const conceptEdges = useMemo(() => deriveConceptEdges(concepts), [concepts]);
  const edgeParticipants = useMemo(() => {
    const set = new Set<string>();
    for (const edge of conceptEdges) {
      set.add(edge.from);
      set.add(edge.to);
    }
    return set;
  }, [conceptEdges]);
  const edgeRefreshKey = `${profile.slug}|${[...openRoles].sort().join(',')}|${[...conceptsMore]
    .sort()
    .join(',')}|${[...expandedRoles].sort().join(',')}|${modules ? 'm' : '-'}`;

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
   * The flow run: a deliberate act on a layer sends one staggered pulse down every gap between it
   * and its deepest reach — dependency direction seen as motion, on request, never an ambient loop.
   */
  const runRow = run.origin === null ? null : rowIndexOf.get(run.origin) ?? null;
  const runDeepestRow =
    run.origin === null || runRow === null
      ? null
      : [...reaches(run.origin)].reduce(
          (deepest, id) => Math.max(deepest, rowIndexOf.get(id) ?? -1),
          runRow,
        );

  return (
    <div
      className="flex w-full flex-col gap-3"
      data-testid="architecture-flow"
      onMouseLeave={() => setFocus(null)}
    >
      <div
        ref={stageRef}
        className="relative flex flex-col gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <ConceptEdgeLayer edges={conceptEdges} containerRef={stageRef} refreshKey={edgeRefreshKey} />
        {sourceUnavailableBody !== null ? (
          /* Before the bands, so a reader learns why they are bare before wondering. */
          <p className="mb-2" data-testid="architecture-source-unavailable">
            <span className="block break-keep rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-3 text-caption text-[color:var(--color-text-quaternary)]">
              {sourceUnavailableBody}
            </span>
          </p>
        ) : null}
        {/*
          The entrance cascade: bands rise in dependency order on mount and on every profile
          switch (the wrapper is keyed by the profile). The system's one stagger primitive owns
          the pattern — reduced motion shows everything immediately through its motion-reduce
          overrides.
        */}
        <StaggeredFadeIn
          key={profile.slug}
          as="ol"
          className="relative m-0 flex list-none flex-col gap-4 p-0"
          stagger={45}
          duration={240}
          translateY={10}
        >
          {rungs.map((rung, depth) => (
            <ArchitectureBand
              key={rung.join('+')}
              rung={rung}
              depth={depth}
              isLast={depth === rungs.length - 1}
              policy={layout.policy}
              focus={focus}
              runRow={runRow}
              runDeepestRow={runDeepestRow}
              runSeq={run.seq}
              onFocus={setFocus}
              onFocusToggle={(id) => setFocus((current) => (current === id ? null : id))}
              onRun={(id) => setRun((current) => ({ origin: id, seq: current.seq + 1 }))}
              onRunClear={() => setRun((current) => ({ origin: null, seq: current.seq }))}
              reachesOf={reaches}
              inFocus={inFocus}
              roleLabel={roleLabel}
              pathsOf={pathsOf}
              modules={modules}
              concepts={concepts}
              openRoles={openRoles}
              onToggleOpen={(id) =>
                setOpenRoles((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              conceptsMore={conceptsMore}
              edgeParticipants={edgeParticipants}
              onToggleConceptsMore={(id) =>
                setConceptsMore((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              moreLabelForConcepts={moreLabel}
              layerConceptsLabel={layerConceptsLabel}
              conceptCountLabel={conceptCountLabel}
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
        </StaggeredFadeIn>

        {/*
          One mark is left on the stage, so one sentence explains it. The old three-part legend
          died with the dot matrix; keeping its rows would explain marks that no longer exist.
        */}
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-quaternary)]">
          <span>{directionLabel}</span>
          {/*
            A legend for a mark nobody drew is noise: on a profile whose roles hold no reviewed
            concepts there is no stroke on the stage, and the two stroke rows described nothing
            (2026-08-28 inspection, installed app's default sample). The arrow sentence stays —
            the spine arrows are always drawn.
          */}
          {conceptEdges.length === 0 ? null : (
          <>
          <span className="flex items-center gap-1.5">
            <svg width={18} height={6} aria-hidden>
              <line x1={0} y1={3} x2={18} y2={3} stroke="var(--color-indigo-a60)" strokeWidth={1.5} />
            </svg>
            {legendDependency}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width={18} height={6} aria-hidden>
              <line
                x1={0}
                y1={3}
                x2={18}
                y2={3}
                stroke="var(--color-indigo-a30)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            </svg>
            {legendRelated}
          </span>
          </>
          )}
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
