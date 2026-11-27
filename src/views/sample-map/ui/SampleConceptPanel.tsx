'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { CloseButton } from '@/shared/ui/controls/close-button';
import { controlClass } from '@/shared/ui/control-class';
import { Surface } from '@/shared/ui/surfaces/surface';
import type { SampleConceptFacts } from '../lib/sample-map-graph';

/** Rows a relation group shows before the rest fold behind "show more". */
const ROWS_BEFORE_FOLD = 5;

type Role = keyof SampleConceptFacts['connections'];

/**
 * The compact panel at the map's right inset: what the concept is, and what it is joined to. It
 * answers a press on a mark and nothing else: the sample has no folder, so it offers no action.
 */
export function SampleConceptPanel({
  facts,
  onSelect,
  onClose,
}: {
  /** Null while the panel leaves; it keeps the last concept it showed until then. */
  facts: SampleConceptFacts | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(facts);
  if (facts && facts !== shown) setShown(facts);

  return (
    <Surface
      open={facts !== null}
      motion="overlay"
      as="aside"
      aria-label={shown?.name}
      data-testid="sample-concept-panel"
      data-topology-camera-obstacle="side-panel"
      className={cn(
        'absolute z-10 flex flex-col overflow-hidden',
        'inset-x-3 bottom-3 max-h-[55%] lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:max-h-[calc(100%-1.5rem)] lg:w-[var(--map-panel-width)]',
        'rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] shadow-[var(--map-panel-shadow)]',
      )}
    >
      {shown ? <PanelBody key={shown.id} facts={shown} onSelect={onSelect} onClose={onClose} /> : null}
    </Surface>
  );
}

function PanelBody({
  facts,
  onSelect,
  onClose,
}: {
  facts: SampleConceptFacts;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const tKinds = useTranslations('kinds');
  const tReach = useTranslations('conceptReach');
  const tEdge = useTranslations('edgeTypes');
  const tControls = useTranslations('topology.controls');

  const groups: ReadonlyArray<{ role: Role; label: string }> = [
    { role: 'dependsOn', label: tReach('needs') },
    { role: 'usedBy', label: tReach('neededBy') },
    { role: 'contains', label: tEdge('contains') },
    { role: 'belongsTo', label: tEdge('belongs_to') },
    { role: 'related', label: tEdge('related_to') },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-start gap-2 px-[var(--map-panel-pad)] pt-[var(--map-panel-pad)]">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--map-panel-text-tertiary)]">
            {tKinds(facts.kind)}
          </p>
          <h2 className="mt-1 break-words text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--map-panel-text-primary)]">
            {facts.name}
          </h2>
        </div>
        <CloseButton label={tControls('close')} onClick={onClose} data-testid="sample-concept-close" className="-mr-1 -mt-1" />
      </div>
      {facts.summary ? (
        <p className="px-[var(--map-panel-pad)] pt-2 text-body leading-prose text-[color:var(--map-panel-text-secondary)]">
          {facts.summary}
        </p>
      ) : null}
      {groups.map(({ role, label }) => (
        <RelationGroup key={role} label={label} rows={facts.connections[role]} onSelect={onSelect} />
      ))}
      <div className="h-[var(--map-panel-pad)] shrink-0" />
    </div>
  );
}

function RelationGroup({
  label,
  rows,
  onSelect,
}: {
  label: string;
  rows: SampleConceptFacts['connections'][Role];
  onSelect: (id: string) => void;
}) {
  const tKinds = useTranslations('kinds');
  const tReach = useTranslations('conceptReach');
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const folded = !open && rows.length > ROWS_BEFORE_FOLD;
  const visible = folded ? rows.slice(0, ROWS_BEFORE_FOLD - 1) : rows;

  return (
    <section className="mt-4 border-t border-[color:var(--map-panel-zone-divider)] px-[var(--map-panel-pad)] pt-3">
      <h3 className="text-label leading-label font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-tertiary)]">
        {label} <span className="tabular-nums">{rows.length}</span>
      </h3>
      <ul className="mt-1.5 flex flex-col">
        {visible.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              data-testid="sample-concept-neighbor"
              className={controlClass({
                shape: 'row',
                size: 'sm',
                tone: 'secondary',
                scope: 'panel',
                hoverSurface: 'lift',
                hoverInk: 'strong',
                className: 'justify-between gap-3',
              })}
            >
              <span className="min-w-0 truncate">{row.title}</span>
              <span className="shrink-0 font-mono text-caption uppercase text-[color:var(--map-panel-text-quaternary)]">
                {tKinds(row.kind)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > ROWS_BEFORE_FOLD ? (
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className={controlClass({ shape: 'link', tone: 'accent', className: 'touch-hit-expand mt-1 text-body' })}
        >
          {open ? tReach('showFewer') : tReach('showMore', { count: rows.length - (ROWS_BEFORE_FOLD - 1) })}
        </button>
      ) : null}
    </section>
  );
}
