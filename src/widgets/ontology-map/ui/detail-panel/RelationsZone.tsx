import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { RowButton } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { GraphLineKind } from "../../flat-graph/attention";
import type { ConceptReach, ReachRow } from "../../model/concept-reach";
import { OntologyMapEdgeHoverCard } from "../OntologyMapEdgeHoverCard";
import { ConnectionGroup, type ReachListRow, type ReachRowHandlers } from "./ConnectionGroup";
import { reasonsByRelation, type V2ConnectionGroupsView } from "./map-datasheet";
import { GROUP_GLYPH_SLOT, RelationGroupShell } from "./RelationGroupShell";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

/** How long the pointer rests on a row before its reason shows, so a pass over the list stays quiet. */
const REASON_REST_MS = 150;
/** The hover card's own gap from its anchor (`OntologyMapEdgeHoverCard`), cancelled so the card sits level with the row. */
const CARD_ANCHOR_OFFSET_PX = 14;
const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

type ListKey = "needs" | "neededBy" | "other" | "contains" | "describes";
/** An open folded line, or an opened "show more" inside one of the lists. */
type OpenKey = ListKey | `${ListKey}:all`;

interface PointedRow {
  row: ReachListRow;
  heading: string;
  x: number;
  y: number;
}

/** The concept kinds whose lines the map draws in the selection's own ink. */
const DRAWN_REACH_KINDS = new Set(["capability", "domain"]);
const CONTAINED_KINDS: Readonly<Record<string, ReadonlySet<string>>> = {
  capability: new Set(["element"]),
  domain: new Set(["capability", "element"]),
  project: new Set(["domain"]),
};

function uniqueById(rows: readonly ReachListRow[]): ReachListRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

/**
 * The compact panel's relations: what the concept needs and what needs it, counted as the map's
 * count line counts them, then at most two folded lines (other links, what it contains). A reason
 * shows only for the row pointed at, in the edge hover card beside the panel.
 */
export function RelationsZone({
  kind,
  reach,
  groups,
  labels,
  onSelectConnection,
  onHoverConnection,
}: {
  kind: string;
  reach: ConceptReach | null;
  groups: V2ConnectionGroupsView;
  labels: OntologyMapDetailPanelLabels;
  onSelectConnection: OntologyMapDetailPanelProps["onSelectConnection"];
  onHoverConnection: OntologyMapDetailPanelProps["onHoverConnection"];
}) {
  const t = useTranslations("conceptReach");
  const tDial = useTranslations("mapDial");
  const tReview = useTranslations("analysisWorkbench");
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const restTimer = useRef<number | null>(null);
  const descriptionPrefix = useId();
  const [openLists, setOpenLists] = useState<ReadonlySet<OpenKey>>(() => new Set());
  const [pointed, setPointed] = useState<PointedRow | null>(null);
  const [tabStopId, setTabStopId] = useState<string | null>(null);

  const reasons = useMemo(() => reasonsByRelation(groups), [groups]);
  const drawn = DRAWN_REACH_KINDS.has(kind);
  const toRow = useCallback(
    (r: ReachRow): ReachListRow => {
      if (r.links !== null) return { id: r.id, label: r.label, kind: r.kind, links: r.links };
      const reason =
        r.line === "needs" ? reasons.get(`out:${r.id}`)
        : r.line === "neededBy" ? reasons.get(`in:${r.id}`)
        : reasons.get(`out:${r.id}`) ?? reasons.get(`in:${r.id}`);
      const sample = drawn && (r.line === "relates" || r.line === "broader") ? r.line : undefined;
      return { id: r.id, label: r.label, kind: r.kind, reason: reason ?? null, ...(sample ? { sample } : {}) };
    },
    [reasons, drawn],
  );
  const needs = useMemo(() => reach?.needs.map(toRow) ?? [], [reach, toRow]);
  const neededBy = useMemo(() => reach?.neededBy.map(toRow) ?? [], [reach, toRow]);
  const other = useMemo(() => reach?.other.map(toRow) ?? [], [reach, toRow]);
  const contained = useMemo(() => {
    const kinds = CONTAINED_KINDS[kind];
    const rows = kinds ? (groups.contains.allRows ?? groups.contains.rows).filter((row) => kinds.has(row.kind)) : [];
    return rows.map((row): ReachListRow => ({ id: row.id, label: row.title, kind: row.kind }));
  }, [groups, kind]);
  const described = useMemo(() => {
    if (kind !== "document") return [];
    const views = [groups.dependsOn, groups.usedBy, groups.related, groups.contains, groups.belongsTo];
    return uniqueById(views.flatMap((view) => (view.allRows ?? view.rows).map((row) => ({ id: row.id, label: row.title, kind: row.kind }))));
  }, [groups, kind]);

  const firstRowId = needs[0]?.id ?? neededBy[0]?.id ?? described[0]?.id ?? null;
  const activeTabStop = tabStopId ?? firstRowId;

  const clearRest = () => {
    if (restTimer.current !== null) window.clearTimeout(restTimer.current);
    restTimer.current = null;
  };
  useEffect(() => clearRest, []);

  const headingOf = (row: ReachListRow): string =>
    needs.includes(row) ? t("needs") : neededBy.includes(row) ? t("neededBy") : t("otherLinks", { count: other.length });
  const pointAt = (row: ReachListRow, button: HTMLButtonElement) => {
    if (!row.reason) return;
    const panel = button.closest('[data-testid="map-detail-panel"]') ?? button;
    const rowBox = button.getBoundingClientRect();
    setPointed({
      row,
      heading: headingOf(row),
      x: panel.getBoundingClientRect().left,
      y: rowBox.top - CARD_ANCHOR_OFFSET_PX,
    });
  };

  const handlers: ReachRowHandlers = {
    onSelect: onSelectConnection,
    onPointerEnter: (row, event: PointerEvent<HTMLButtonElement>) => {
      onHoverConnection?.(row.id);
      clearRest();
      const button = event.currentTarget;
      restTimer.current = window.setTimeout(() => pointAt(row, button), REASON_REST_MS);
    },
    onPointerLeave: () => {
      clearRest();
      onHoverConnection?.(null);
      setPointed(null);
    },
    onFocus: (row, event: FocusEvent<HTMLButtonElement>) => {
      setTabStopId(row.id);
      onHoverConnection?.(row.id);
      pointAt(row, event.currentTarget);
    },
    onBlur: () => {
      onHoverConnection?.(null);
      setPointed(null);
    },
    onKeyDown: (_row, event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Escape" && pointed) {
        event.preventDefault();
        event.stopPropagation();
        setPointed(null);
        return;
      }
      if (!NAVIGATION_KEYS.has(event.key) || !zoneRef.current) return;
      const rows = Array.from(zoneRef.current.querySelectorAll<HTMLButtonElement>("[data-reach-row]"));
      const at = rows.indexOf(event.currentTarget);
      const next =
        event.key === "Home" ? 0
        : event.key === "End" ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      rows[next]?.focus();
    },
    tabStopId: activeTabStop,
    reasonId: (row) => `${descriptionPrefix}-${row.id}`,
  };
  const listLabels = {
    noReason: tReview("rationaleMissingShort"),
    showMore: (count: number) => t("showMore", { count }),
    showFewer: t("showFewer"),
    domainLinks: labels.domainLinks,
  };
  const toggle = (key: OpenKey) =>
    setOpenLists((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const list = (key: ListKey, rows: readonly ReachListRow[]) => (
    <ConnectionGroup
      groupKey={key}
      rows={rows}
      open={openLists.has(`${key}:all`)}
      onToggle={() => toggle(`${key}:all`)}
      labels={listLabels}
      handlers={handlers}
    />
  );
  const group = (key: "needs" | "neededBy", rows: readonly ReachListRow[]) => (
    <RelationGroupShell groupKey={key} sample={drawn ? (key as GraphLineKind) : null} label={t(key)} count={rows.length}>
      {list(key, rows)}
    </RelationGroupShell>
  );
  const foldedLine = (key: "other" | "contains", text: string, rows: readonly ReachListRow[]) => {
    const open = openLists.has(key);
    return (
      <div className="flex flex-col" data-datasheet-group={key}>
        <RowButton
          size="sm"
          aria-expanded={open}
          data-reach-line={key}
          data-reach-line-count={rows.length}
          onClick={() => toggle(key)}
          className="-mx-2 w-auto rounded-chip hover:bg-[color:var(--map-panel-row-hover)] active:bg-[color:var(--map-panel-row-active)]"
        >
          <span className={`${GROUP_GLYPH_SLOT} text-[color:var(--map-panel-text-tertiary)]`}>
            <ChevronRight size={ICON_SIZE.sm} aria-hidden className={open ? "rotate-90" : undefined} />
          </span>
          <span className="min-w-0 flex-1 truncate text-body text-[color:var(--map-panel-text-secondary)]">{text}</span>
        </RowButton>
        {open ? list(key, rows) : null}
      </div>
    );
  };

  const reachShown = needs.length > 0 || neededBy.length > 0;
  const containsText =
    contained.length === 0 ? null
    : kind === "domain"
      ? tDial("units", {
          capabilities: contained.filter((row) => row.kind === "capability").length,
          elements: contained.filter((row) => row.kind === "element").length,
        })
    : kind === "project" ? t("domains", { count: contained.length })
    : t("elements", { count: contained.length });
  const folded = other.length > 0 || containsText !== null;

  if (!reachShown && !folded && described.length === 0) {
    return (
      <div className="px-[var(--map-panel-pad)] py-3">
        <span className="text-label text-[color:var(--map-panel-text-tertiary)]">{labels.noConnections}</span>
      </div>
    );
  }

  return (
    <div ref={zoneRef} data-reach-zone="" className="flex flex-col">
      {reachShown || described.length > 0 ? (
        <div className="flex flex-col gap-2 px-[var(--map-panel-pad)] py-3">
          {reachShown ? (
            <>
              {group("needs", needs)}
              {group("neededBy", neededBy)}
            </>
          ) : null}
          {described.length > 0 ? (
            <RelationGroupShell groupKey="describes" sample={null} label={t("describes")} count={described.length}>
              {list("describes", described)}
            </RelationGroupShell>
          ) : null}
        </div>
      ) : null}
      {folded ? (
        <div className={`flex flex-col px-[var(--map-panel-pad)] py-1.5 ${reachShown || described.length > 0 ? "border-t border-[color:var(--map-panel-zone-divider)]" : ""}`}>
          {other.length > 0 ? foldedLine("other", t("otherLinks", { count: other.length }), other) : null}
          {containsText !== null ? foldedLine("contains", containsText, contained) : null}
        </div>
      ) : null}
      {pointed?.row.reason && typeof document !== "undefined"
        ? createPortal(
            <OntologyMapEdgeHoverCard
              sentence={pointed.row.label}
              typeLabel={pointed.heading}
              why={pointed.row.reason}
              x={pointed.x}
              y={pointed.y}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
