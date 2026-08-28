'use client';

import { useState, type ComponentType } from 'react';
import { FileCode2, Folder } from 'lucide-react';

import { Chip, StaggeredFadeIn, TopologyV2KindGlyph } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { useGridColumns } from '../model/grid-columns';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';

/**
 * Everything one role carries, beside the drawing instead of inside it.
 *
 * ⚠️ **Why this is a panel and not a band.** Traffic arcs drawn onto the old full-width bands were
 * unreadable, because a block 250px tall gives an edge nothing to attach to; the fix is a box small
 * enough to be a graph node, which leaves the role's own contents with nowhere to live. Decision
 * 2026-08-28 (3) moves them here: the graph answers what the shape is and where the traffic goes,
 * and this panel answers what is actually in this layer. The band's own preserved dissent is that a
 * reader of 88 source modules is better served by a list than by a graph — this panel is where that
 * list survives, unchanged in content.
 *
 * **Props only.** It reads no profile and no record; every fact and every user-facing string
 * arrives from the caller, so the same panel serves whichever surface composed the graph.
 */

/* The occupant grids' track floor and gap — `minmax(200px, 1fr)` with `gap-2.5`. The preview row
   is derived from these, so the two numbers live once and the class strings quote them. */
const OCCUPANT_CARD_MIN = 200;
const OCCUPANT_CARD_GAP = 10;
/* What the preview shows before any layout can be measured — the count this grid carried before
   it was derived, so an unmeasurable surface loses nothing. */
const OCCUPANT_PREVIEW_FALLBACK = 3;

export function ArchitectureRoleDetail({
  roleId,
  index,
  label,
  summary,
  paths,
  reach,
  modules,
  concepts,
  edgeParticipants,
  icon: RoleIcon,
  roleLabel,
  sinkLabel,
  reachInlineLabel,
  moduleCountLabel,
  moreLabel,
  showFewerLabel,
  layerConceptsLabel,
  conceptCountLabel,
}: {
  /** The selected role's id — used for the test hooks the surface already names. */
  roleId: string;
  /** The role's position in reach order, already 1-based: the number a reader says out loud. */
  index: number;
  /** The reviewed role name. */
  label: string;
  /** One sentence for what the role is for; `null` for a role written before the field existed. */
  summary: string | null;
  /** The role's globs — where it lives, as opposed to what it is for. */
  paths: readonly string[];
  /** Role ids this role may reach; empty means it depends on nothing. */
  reach: readonly string[];
  /** Source modules the role's globs contain, or `null` where this surface cannot list source. */
  modules: readonly RoleSourceModule[] | null;
  /** Reviewed concepts whose `path` sits inside the role's globs. */
  concepts: readonly RoleConcept[];
  /** Slugs taking part in any reviewed relation — the preview shows these first. */
  edgeParticipants: ReadonlySet<string>;
  /** The role's mark, from the caller's own icon table; the panel invents no icon of its own. */
  icon?: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  /** Reads a role id as its reviewed name, for the reach sentence. */
  roleLabel: (id: string) => string;
  /** What "depends on nothing" is called. */
  sinkLabel: string;
  /** "may depend on {targets}", written in role names. */
  reachInlineLabel: (targets: string) => string;
  /** "N modules"; derived counts only. */
  moduleCountLabel: (count: number) => string;
  /** "+N more" where the occupants exceed the preview row; the count is the derived remainder. */
  moreLabel: (count: number) => string;
  /** Collapses an expanded grid back to its preview row. */
  showFewerLabel: string;
  layerConceptsLabel: string;
  conceptCountLabel: (count: number) => string;
}) {
  /*
   * Expansion belongs to the panel, and it is keyed by the role so selecting another box starts
   * that role at its preview row rather than inheriting the previous role's "show everything".
   */
  const [expansion, setExpansion] = useState<{
    role: string;
    modules: boolean;
    concepts: boolean;
  }>({ role: roleId, modules: false, concepts: false });
  const showAllModules = expansion.role === roleId && expansion.modules;
  const showAllConcepts = expansion.role === roleId && expansion.concepts;
  const setModulesExpanded = (next: boolean) =>
    setExpansion((current) => ({
      role: roleId,
      modules: next,
      concepts: current.role === roleId ? current.concepts : false,
    }));
  const setConceptsExpanded = (next: boolean) =>
    setExpansion((current) => ({
      role: roleId,
      modules: current.role === roleId ? current.modules : false,
      concepts: next,
    }));

  /*
   * Both occupant grids preview exactly one full row, and the row is measured rather than assumed.
   * A fixed three-card preview once ended every grid with a half-width hole on the installed app,
   * whose stage resolves to two columns (2026-08-28). Each grid's own wrapper carries the width, so
   * neither measurement needs an inset.
   */
  const [setModuleGridNode, modulePreview] = useGridColumns(OCCUPANT_CARD_MIN, OCCUPANT_CARD_GAP, {
    fallback: OCCUPANT_PREVIEW_FALLBACK,
  });
  const [setConceptGridNode, conceptPreview] = useGridColumns(OCCUPANT_CARD_MIN, OCCUPANT_CARD_GAP, {
    fallback: OCCUPANT_PREVIEW_FALLBACK,
  });

  const roleModules = modules ?? [];
  const visibleModules = showAllModules ? roleModules : roleModules.slice(0, modulePreview);
  const hiddenModules = roleModules.length - modulePreview;

  /*
   * The preview shows the connective tissue first: concepts that participate in a reviewed
   * relation outrank isolated ones, so the strokes between placed concepts exist at rest instead of
   * hiding behind "+N more". Stable within each half — the path order stays the tiebreak.
   */
  const orderedConcepts = edgeParticipants.size
    ? [...concepts].sort(
        (a, b) => Number(edgeParticipants.has(b.slug)) - Number(edgeParticipants.has(a.slug)),
      )
    : concepts;
  const visibleConcepts = showAllConcepts
    ? orderedConcepts
    : orderedConcepts.slice(0, conceptPreview);
  const hiddenConcepts = concepts.length - visibleConcepts.length;

  return (
    <section
      className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
      data-testid="architecture-role-detail"
      data-role={roleId}
    >
      <div className="flex min-w-0 flex-col gap-2.5 p-[var(--card-pad)]">
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-2.5">
            {RoleIcon ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-micro border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-text-soft)]">
                <RoleIcon size={ICON_SIZE.lg} aria-hidden />
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="flex min-w-0 items-baseline gap-1.5">
                {/*
                  The index is how a reader decodes the order out loud: seven layer names need a
                  stable number to talk about, and numbering the layers is what every
                  layered-architecture drawing does.
                */}
                <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                  {index}
                </span>
                <span
                  className={
                    reach.length === 0
                      ? 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]'
                      : 'truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]'
                  }
                >
                  {label}
                </span>
              </span>
              {/*
                The count is this role's own empty state: "0 modules" under the name says the gap
                once and where it belongs. It exists only where a listing exists — a surface that
                cannot list source says so once for the whole stage.
              */}
              {modules !== null ? (
                <span
                  className="block text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
                  data-testid={`architecture-module-count-${roleId}`}
                >
                  {moduleCountLabel(roleModules.length)}
                </span>
              ) : null}
            </span>
          </span>
          {/*
            ⚠️ **The reach is written out under both policies, because the ordering does not say
            it.** This block used to render only under `explicit`, on the reasoning that the stage
            subtitle plus the layer order already state the whole `lower-only` rule. A walkthrough
            on 2026-08-28, walked by a reader who had never heard of this pattern, measured that
            reasoning failing: on the explicit profile they answered "what may this role depend on"
            in one glance by quoting the row, and on the lower-only profile they could not answer it
            at all. The sentence they needed did exist — inside the `sr-only` list, measured at 1px
            wide. A fact only the accessibility tree carries is a fact the screen does not state.
          */}
          <p
            className="mt-0.5 text-caption text-[color:var(--color-text-tertiary)]"
            data-testid={`architecture-reach-${roleId}`}
          >
            {reach.length === 0
              ? sinkLabel
              : reachInlineLabel(reach.map(roleLabel).join(' · '))}
          </p>
          {/*
            ⚠️ **A role id is a folder name, and a folder name is what decision (2026-08-26) forbids
            reading intent from.** Without this sentence the panel could only say
            `widgets · src/widgets/**`, which answers nothing for a reader who does not already know
            the answer — the owner's own question on the installed build was "how would someone who
            does not know this tell what these are?". The sentence outranks the glob because the
            glob is the address and this is the purpose.
          */}
          {summary ? (
            <p
              className="mt-1 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]"
              data-testid={`architecture-role-summary-${roleId}`}
            >
              {summary}
            </p>
          ) : null}
          <p
            className="mt-1 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]"
            title={paths.join('  ·  ')}
          >
            {paths.join('  ·  ')}
          </p>
        </div>

        {/*
          The source modules the role's globs actually contain, from a read-only directory walk of
          the bound project source — name and repo-relative path, the way the reference draws
          components inside a layer. No edges between cards are invented, and no import is ever read
          here.
        */}
        <div ref={setModuleGridNode} className="min-w-0">
          {roleModules.length > 0 ? (
            <div className="min-w-0" data-testid={`architecture-modules-${roleId}`}>
              {/*
                Revealed cards rise in sequence — the expand is one event, so the first card starts
                with it and the rest follow inside the same beat.
              */}
              <StaggeredFadeIn
                key={`${roleId}-${showAllModules ? 'open' : 'closed'}`}
                as="div"
                className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5"
                stagger={24}
                duration={180}
                translateY={6}
              >
                {visibleModules.map((module) => (
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
              {/* The chip sits under the cards it reveals: "show 10 more" above the row it grows
                  would point at nothing. */}
              {hiddenModules > 0 || showAllModules ? (
                <div className="mt-2">
                  <Chip
                    size="sm"
                    aria-expanded={showAllModules}
                    data-testid={`architecture-modules-toggle-${roleId}`}
                    onClick={() => setModulesExpanded(!showAllModules)}
                  >
                    {showAllModules ? showFewerLabel : moreLabel(hiddenModules)}
                  </Chip>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        The labeled meaning layer. Decision (2026-08-27): the source modules answer "what does this
        layer contain"; this section answers "which reviewed concepts live here" — two named layers,
        never mixed. Kind is carried by the same glyph family the map draws, distinct from the
        folder/file marks of the source layer above.
      */}
      <div
        ref={setConceptGridNode}
        className="border-t border-[color:var(--color-divider)] px-[var(--card-pad)] pb-[var(--card-pad)] pt-3"
        data-testid={`architecture-concepts-${roleId}`}
      >
        <p className="text-caption text-[color:var(--color-text-quaternary)]">
          {layerConceptsLabel} · {conceptCountLabel(concepts.length)}
        </p>
        {concepts.length > 0 ? (
          <StaggeredFadeIn
            key={`${roleId}-concepts-${showAllConcepts ? 'all' : 'preview'}`}
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
        {hiddenConcepts > 0 || showAllConcepts ? (
          <div className="mt-2">
            <Chip
              size="sm"
              aria-expanded={showAllConcepts}
              data-testid={`architecture-concepts-toggle-${roleId}`}
              onClick={() => setConceptsExpanded(!showAllConcepts)}
            >
              {showAllConcepts ? showFewerLabel : moreLabel(hiddenConcepts)}
            </Chip>
          </div>
        ) : null}
      </div>
    </section>
  );
}
