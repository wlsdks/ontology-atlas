'use client';

import { useState, type ComponentType } from 'react';
import { FileCode2, Folder } from 'lucide-react';

import { Chip, StaggeredFadeIn, OntologyMapKindGlyph } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { useGridColumns } from '../model/grid-columns';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';

/**
 * Everything one role carries, beside the drawing instead of inside it (decision 2026-08-28 (3)):
 * the graph answers shape and traffic, this panel what is in the layer. Props only: it reads no
 * profile or record, so any surface that composed the graph can use it.
 */

/* The occupant grids' track floor and gap (`minmax(200px, 1fr)`, `gap-2.5`); the class strings quote them. */
const OCCUPANT_CARD_MIN = 200;
const OCCUPANT_CARD_GAP = 10;
/* The preview count where layout cannot be measured, so an unmeasurable surface loses nothing. */
const OCCUPANT_PREVIEW_FALLBACK = 3;
/* A one-column dock would preview a single card; the preview ends on a whole row but never before this many. */
const OCCUPANT_PREVIEW_MIN = 4;

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
  /** Carries its own count, so the heading does not stutter the noun beside a separate count. */
  layerConceptsLabel: (count: number) => string;
}) {
  /* Keyed by role, so selecting another box starts at its preview row instead of inheriting expansion. */
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

  /* Both grids preview exactly one full row, measured on each grid's own wrapper. */
  const [setModuleGridNode, modulePreview] = useGridColumns(OCCUPANT_CARD_MIN, OCCUPANT_CARD_GAP, {
    fallback: OCCUPANT_PREVIEW_FALLBACK,
  });
  const [setConceptGridNode, conceptPreview] = useGridColumns(OCCUPANT_CARD_MIN, OCCUPANT_CARD_GAP, {
    fallback: OCCUPANT_PREVIEW_FALLBACK,
  });

  const roleModules = modules ?? [];
  const wholeRows = (columns: number) =>
    Math.ceil(OCCUPANT_PREVIEW_MIN / Math.max(1, columns)) * Math.max(1, columns);
  const modulePreviewCount = wholeRows(modulePreview);
  const visibleModules = showAllModules ? roleModules : roleModules.slice(0, modulePreviewCount);
  const hiddenModules = roleModules.length - modulePreviewCount;

  /* Concepts in a reviewed relation preview first, so strokes exist at rest; path order breaks ties. */
  const orderedConcepts = edgeParticipants.size
    ? [...concepts].sort(
        (a, b) => Number(edgeParticipants.has(b.slug)) - Number(edgeParticipants.has(a.slug)),
      )
    : concepts;
  const visibleConcepts = showAllConcepts
    ? orderedConcepts
    : orderedConcepts.slice(0, wholeRows(conceptPreview));
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
                {/* A stable number lets a reader name a layer out loud. */}
                <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                  {/* Zero-padded like the canvas, so both name a role the same way. */}
                  {String(index).padStart(2, '0')}
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
              {/* This role's own empty state, only where a listing exists; a surface that cannot list says so once. */}
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
          {/* The reach is written out under both policies: the ordering alone does not tell a new reader what a role may depend on. */}
          <p
            className="mt-0.5 text-caption text-[color:var(--color-text-tertiary)]"
            data-testid={`architecture-reach-${roleId}`}
          >
            {reach.length === 0
              ? sinkLabel
              : reachInlineLabel(reach.map(roleLabel).join(' · '))}
          </p>
          {/* A role id is a folder name, which carries no intent (decision 2026-08-26); the sentence says what the role is for. */}
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

        {/* Source modules from a read-only directory walk; no edges between cards are invented and no import is read. */}
        <div ref={setModuleGridNode} className="min-w-0">
          {roleModules.length > 0 ? (
            <div className="min-w-0" data-testid={`architecture-modules-${roleId}`}>
              {/* Revealed cards rise in sequence within the one expand beat. */}
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
              {/* The chip sits under the cards it reveals. */}
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

      {/* The meaning layer (decision 2026-08-27): reviewed concepts, never mixed with the source modules above. */}
      <div
        ref={setConceptGridNode}
        className="border-t border-[color:var(--color-divider)] px-[var(--card-pad)] pb-[var(--card-pad)] pt-3"
        data-testid={`architecture-concepts-${roleId}`}
      >
        <p className="text-caption text-[color:var(--color-text-quaternary)]">
          {layerConceptsLabel(concepts.length)}
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
                  <OntologyMapKindGlyph kind={concept.kind} size={18} />
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
