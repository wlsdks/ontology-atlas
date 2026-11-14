"use client";

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  buildArchitectureLayout,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

import {
  buildRoleArcs,
  estimateLabelWidthPx,
  placeArcLabels,
  type RoleArc,
} from '../model/role-arcs';
import type { RoleConcept } from '../model/role-concepts';
import { buildRoleMembers, patternPathLabel } from '../model/role-members';
import type { RoleSourceModule } from '../model/source-modules';
import { ARC_LABEL_HEIGHT_PX, RoleArcs } from './sketch/RoleArcs';
import { RoleBand } from './sketch/RoleBand';

const ROW_MAX_PX = 60;
const ROW_MIN_PX = 34;
const ROW_GAP_PX = 12;
const TIGHT_ROW_GAP_PX = 6;
/** The stage padding plus the legend line, which the rows share the height with. */
const STAGE_CHROME_Y_PX = 26 * 2 + 30;
/** Below this stage width the arcs are dropped and each band names its busiest crossing. */
const ARCS_MIN_STAGE_PX = 600;
const ARC_ROOM_SHARE = 0.17;
const ARC_ROOM_MIN_PX = 90;
const ARC_ROOM_MAX_PX = 220;
/** Room right of an allowed arc's apex for its count number. */
const COUNT_ROOM_PX = 30;
/** A violation's label starts this far right of its own apex. */
const VIOLATION_LABEL_OFFSET_PX = 8;
const LABEL_GAP_PX = 10;
/** The width from which the workbench holds the stage to the window's height (`xl`). */
const WORKBENCH_QUERY = '(min-width: 1280px)';

interface StageSize {
  width: number;
  height: number;
}

function rowMetrics(rows: number, stageHeight: number): { rowPx: number; gapPx: number } {
  if (stageHeight <= 0 || rows === 0) return { rowPx: ROW_MAX_PX, gapPx: ROW_GAP_PX };
  const room = stageHeight - STAGE_CHROME_Y_PX;
  const fit = (gap: number) => Math.floor((room - (rows - 1) * gap) / rows);
  const roomy = fit(ROW_GAP_PX);
  if (roomy >= 44) return { rowPx: Math.min(ROW_MAX_PX, roomy), gapPx: ROW_GAP_PX };
  return { rowPx: Math.max(ROW_MIN_PX, Math.min(ROW_MAX_PX, fit(TIGHT_ROW_GAP_PX))), gapPx: TIGHT_ROW_GAP_PX };
}

/**
 * Measures the frame the panel may grow into, through a callback ref since an effect fires while a
 * plain ref is still null. Width is the stage's content box; height is the frame's, so the rows the
 * panel hugs never feed back into their own size.
 */
function useStageSize(): [StageSize, (element: HTMLDivElement | null) => void] {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((frame: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const stage = frame?.querySelector<HTMLElement>('[data-testid="architecture-stage"]');
    if (!frame || !stage) return;
    const read = () => {
      const style = getComputedStyle(stage);
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      /* Below workbench width the page scrolls and the frame is as tall as its rows. */
      const heightBound = window.matchMedia?.(WORKBENCH_QUERY).matches ?? false;
      setSize({
        width: Math.max(0, stage.clientWidth - (padX || 0)),
        height: heightBound ? frame.clientHeight : 0,
      });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(read);
    observer.current.observe(frame);
  }, []);
  return [size, attach];
}

/**
 * The cross-section: one band per role in profile order holding its real members, and beside the
 * bands one arc per observed role-to-role import crossing.
 */
export function ArchitectureFlow({
  profile,
  modules,
  concepts,
  roleTraffic,
  violatedPairs,
  selected,
  roleInspectorOpen,
  onSelect,
  roleLabel,
}: {
  profile: ArchitectureProfile;
  /** Source modules per role from the read-only listing, or null without one. */
  modules: Readonly<Record<string, RoleSourceModule[]>> | null;
  concepts: Readonly<Record<string, RoleConcept[]>>;
  /** Observed crossings from the last record; undefined draws no arc rather than guessing. */
  roleTraffic?: readonly ArchitectureRoleEdge[];
  /** `from>to` for each crossing the record counted against the rules. */
  violatedPairs: ReadonlySet<string>;
  selected: string | null;
  roleInspectorOpen: boolean;
  onSelect: (id: string, trigger: HTMLElement) => void;
  roleLabel: (id: string) => string;
}) {
  const t = useTranslations('architecture');
  const [stage, attachStage] = useStageSize();
  const order = useMemo(() => buildArchitectureLayout(profile).rows.flat(), [profile]);
  const members = useMemo(() => buildRoleMembers(profile, modules, concepts), [profile, modules, concepts]);
  const pathsOf = useMemo(() => new Map(profile.roles.map((role) => [role.id, role.paths])), [profile]);
  const activeRole = selected !== null && order.includes(selected) ? selected : null;

  const { rowPx, gapPx } = rowMetrics(order.length, stage.height);
  const rowsHeightPx = order.length * rowPx + Math.max(0, order.length - 1) * gapPx;
  const rowCenterY = useCallback((index: number) => index * (rowPx + gapPx) + rowPx / 2, [rowPx, gapPx]);

  /* Unmeasured counts as wide, so the first paint and a test renderer both draw the arcs. */
  const showsArcs = stage.width === 0 || stage.width >= ARCS_MIN_STAGE_PX;
  const roomPx = Math.round(
    Math.min(ARC_ROOM_MAX_PX, Math.max(ARC_ROOM_MIN_PX, (stage.width || 1200) * ARC_ROOM_SHARE)),
  );
  const arcs = useMemo(
    () =>
      buildRoleArcs({
        order,
        edges: roleTraffic ?? [],
        violatedPairs,
        rowCenterY,
        roomPx,
      }),
    [order, roleTraffic, violatedPairs, rowCenterY, roomPx],
  );

  const arcLabel = useCallback(
    (arc: Pick<RoleArc, 'from' | 'to' | 'count'>) =>
      t('arcLabel', { from: roleLabel(arc.from), to: roleLabel(arc.to), count: arc.count }),
    [t, roleLabel],
  );
  const arcSentence = (arc: RoleArc) =>
    t(arc.violated ? 'arcAgainstRules' : 'trafficEdge', {
      from: roleLabel(arc.from),
      to: roleLabel(arc.to),
      count: arc.count,
    });

  const violated = arcs.filter((arc) => arc.violated);
  const violationTexts = violated.map((arc) => ({ arc, text: arcLabel(arc), widthPx: estimateLabelWidthPx(arcLabel(arc)) }));
  const allowedReach = arcs
    .filter((arc) => !arc.violated)
    .reduce((most, arc) => Math.max(most, arc.apexX + COUNT_ROOM_PX), 0);
  const violationReach = violationTexts.reduce(
    (most, entry) => Math.max(most, entry.arc.apexX + VIOLATION_LABEL_OFFSET_PX + entry.widthPx),
    0,
  );
  const arcColumnPx =
    arcs.length === 0 || !showsArcs ? 0 : Math.ceil(Math.max(allowedReach, violationReach) + LABEL_GAP_PX);

  /* A violation's label already carries its count, so selection adds numbers to allowed arcs only. */
  const placed = placeArcLabels(
    [
      ...violationTexts.map(({ arc, widthPx }) => ({
        key: `violation:${arc.from}>${arc.to}`,
        x: arc.apexX + VIOLATION_LABEL_OFFSET_PX,
        widthPx,
        anchorY: arc.apexY,
      })),
      ...arcs
        .filter((arc) => !arc.violated && activeRole !== null && (arc.from === activeRole || arc.to === activeRole))
        .map((arc) => ({
          key: `${arc.from}>${arc.to}`,
          x: arc.apexX + 4,
          widthPx: estimateLabelWidthPx(String(arc.count)) + 8,
          anchorY: arc.apexY,
        })),
    ],
    ARC_LABEL_HEIGHT_PX,
    2,
  );
  const textOf = new Map(violationTexts.map(({ arc, text }) => [`violation:${arc.from}>${arc.to}`, text]));
  const violationLabels = placed
    .filter((label) => label.key.startsWith('violation:'))
    .map((label) => ({ ...label, key: label.key.slice('violation:'.length), text: textOf.get(label.key) ?? '' }));
  const countLabels = placed.filter((label) => !label.key.startsWith('violation:'));

  /* Without arcs, each band names its busiest outgoing crossing. O(E). */
  const strongestOutOf = useMemo(() => {
    const best = new Map<string, RoleArc>();
    for (const arc of arcs) {
      const current = best.get(arc.from);
      if (!current || arc.count > current.count) best.set(arc.from, arc);
    }
    return best;
  }, [arcs]);

  const drawsArcs = showsArcs && arcs.length > 0;

  return (
    <div ref={attachStage} className="flex min-h-0 w-full flex-1 flex-col">
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
        data-testid="architecture-flow"
      >
      <div
        data-testid="architecture-stage"
        className="flex min-h-0 flex-col overflow-y-auto overflow-x-hidden px-6 py-[26px] max-md:px-4"
      >
        <div
          data-testid="architecture-graph"
          data-arc-count={drawsArcs ? arcs.length : 0}
          className="grid w-full"
          style={{
            gridTemplateColumns: `fit-content(16rem) minmax(0, 1fr) ${arcColumnPx}px`,
            gridTemplateRows: `repeat(${order.length}, ${rowPx}px)`,
            rowGap: gapPx,
          }}
        >
          {order.map((id, index) => {
            const roleMembers = members[id] ?? { names: [], source: 'none' as const };
            const strongest = strongestOutOf.get(id);
            return (
              <RoleBand
                key={id}
                id={id}
                rowIndex={index}
                label={roleLabel(id)}
                pathLabel={patternPathLabel(pathsOf.get(id)?.[0] ?? '')}
                members={roleMembers.names}
                ariaLabel={
                  roleMembers.names.length === 0
                    ? roleLabel(id)
                    : `${roleLabel(id)} · ${t('moduleCount', { count: roleMembers.names.length })}`
                }
                selected={activeRole === id}
                expanded={activeRole === id && roleInspectorOpen}
                onSelect={onSelect}
                strongestOut={
                  !showsArcs && strongest
                    ? {
                        text: t('strongestOut', { to: roleLabel(strongest.to), count: strongest.count }),
                        violated: strongest.violated,
                      }
                    : null
                }
              />
            );
          })}
          {drawsArcs ? (
            <div style={{ gridColumn: 3, gridRow: `1 / ${order.length + 1}` }}>
              <RoleArcs
                arcs={arcs}
                selected={activeRole}
                widthPx={arcColumnPx}
                heightPx={rowsHeightPx}
                drawKey={profile.slug}
                sentenceOf={arcSentence}
                labelOf={arcLabel}
                countLabels={countLabels}
                violationLabels={violationLabels}
              />
            </div>
          ) : null}
        </div>
        {drawsArcs ? (
          <p
            data-testid="architecture-legend"
            className="mt-4 flex shrink-0 items-center justify-end gap-5 text-label text-[color:var(--color-text-tertiary)]"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg aria-hidden width="18" height="4" className="shrink-0">
                <line x1="1" y1="2" x2="17" y2="2" strokeWidth="2" strokeLinecap="round" className="stroke-[color:var(--color-text-quaternary)]" />
              </svg>
              {t('legendAllowedImport')}
            </span>
            {violated.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <svg aria-hidden width="18" height="4" className="shrink-0">
                  <line x1="1" y1="2" x2="17" y2="2" strokeWidth="1.5" strokeDasharray="4 3" className="stroke-[color:var(--color-danger-text)]" />
                </svg>
                {t('legendAgainstRules')}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      </div>
    </div>
  );
}
