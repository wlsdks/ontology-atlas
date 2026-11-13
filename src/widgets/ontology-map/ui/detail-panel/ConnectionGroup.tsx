import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
import { RowButton } from "@/shared/ui";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import type { GraphLineKind } from "../../flat-graph/attention";
import { shownReachRows } from "./map-datasheet";
import { GROUP_GLYPH_SLOT, GROUP_ROW_LIST, ReachLineSample } from "./RelationGroupShell";

export interface ReachListRow {
  id: string;
  label: string;
  kind: string;
  /** Drawn before the glyph where one list mixes line kinds (the other links). */
  sample?: GraphLineKind;
  /** A partner domain's link count, shown in the right slot instead of a reason. */
  links?: number | null;
  /** The recorded reason; null shows the "no reason" slot, undefined shows nothing. */
  reason?: string | null;
}

export interface ReachRowHandlers {
  onSelect: (id: string) => void;
  onPointerEnter: (row: ReachListRow, event: PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave: (row: ReachListRow) => void;
  onFocus: (row: ReachListRow, event: FocusEvent<HTMLButtonElement>) => void;
  onBlur: (row: ReachListRow) => void;
  onKeyDown: (row: ReachListRow, event: KeyboardEvent<HTMLButtonElement>) => void;
  /** The one row that takes Tab; the rest are reached with the arrow keys. */
  tabStopId: string | null;
  reasonId: (row: ReachListRow) => string;
}

export interface ReachListLabels {
  noReason: string;
  showMore: (count: number) => string;
  showFewer: string;
  domainLinks: (count: number) => string;
}

/**
 * One reach list: one line per row, a name that truncates and a right slot. Six rows or fewer show
 * whole; past six, five rows and a row that opens the rest in place.
 */
export function ConnectionGroup({
  groupKey,
  rows,
  open,
  onToggle,
  labels,
  handlers,
}: {
  groupKey: string;
  rows: readonly ReachListRow[];
  open: boolean;
  onToggle: () => void;
  labels: ReachListLabels;
  handlers: ReachRowHandlers;
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, shownReachRows(rows.length, open));
  const hidden = rows.length - shownReachRows(rows.length, false);
  return (
    <ul className={GROUP_ROW_LIST} data-reach-list={groupKey}>
      {shown.map((row) => (
        <li key={`${groupKey}:${row.id}:${row.sample ?? ""}`}>
          <RowButton
            size="sm"
            data-reach-row=""
            data-datasheet-connection={row.id}
            data-datasheet-domain-row={row.links != null ? row.id : undefined}
            tabIndex={handlers.tabStopId === row.id ? 0 : -1}
            aria-describedby={row.reason ? handlers.reasonId(row) : undefined}
            onClick={() => handlers.onSelect(row.id)}
            onPointerEnter={(event) => handlers.onPointerEnter(row, event)}
            onPointerLeave={() => handlers.onPointerLeave(row)}
            onFocus={(event) => handlers.onFocus(row, event)}
            onBlur={() => handlers.onBlur(row)}
            onKeyDown={(event) => handlers.onKeyDown(row, event)}
            className="rounded-chip hover:bg-[color:var(--map-panel-row-hover)] focus-visible:bg-[color:var(--map-panel-row-hover)] active:bg-[color:var(--map-panel-row-active)]"
          >
            {row.sample ? <ReachLineSample shape={row.sample} /> : null}
            <span className={GROUP_GLYPH_SLOT}>
              <OntologyMapKindGlyph kind={row.kind} />
            </span>
            <span className="min-w-0 flex-1 truncate text-body text-[color:var(--map-panel-text-secondary)]">
              {row.label}
            </span>
            {row.links != null ? (
              <span className="shrink-0 font-mono text-label tabular-nums text-[color:var(--map-panel-text-tertiary)]">
                <span aria-hidden="true">{row.links}</span>
                <span className="sr-only">{`, ${labels.domainLinks(row.links)}`}</span>
              </span>
            ) : row.reason === null ? (
              <span data-reach-no-reason="" className="shrink-0 text-label text-[color:var(--map-panel-text-quaternary)]">
                {labels.noReason}
              </span>
            ) : null}
          </RowButton>
          {row.reason ? (
            <span id={handlers.reasonId(row)} className="sr-only">
              {row.reason}
            </span>
          ) : null}
        </li>
      ))}
      {hidden > 0 ? (
        <li>
          <RowButton
            size="sm"
            aria-expanded={open}
            data-datasheet-group-overflow={groupKey}
            data-testid={`map-group-more-${groupKey}`}
            onClick={onToggle}
            className="rounded-chip hover:bg-[color:var(--map-panel-row-hover)] active:bg-[color:var(--map-panel-row-active)]"
          >
            <span aria-hidden className={GROUP_GLYPH_SLOT} />
            <span className="min-w-0 flex-1 truncate text-label text-[color:var(--map-panel-text-tertiary)]">
              {open ? labels.showFewer : labels.showMore(hidden)}
            </span>
          </RowButton>
        </li>
      ) : null}
    </ul>
  );
}
