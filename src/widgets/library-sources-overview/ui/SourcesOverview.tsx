import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "use-intl";

import { VAULT_SOURCES_DIR, type LibrarySourceRow, type LibraryWikiPage } from "@/entities/docs-vault";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";

import { FoldCursor } from "../model/fold-cursor";
import { selectRecentPages } from "../model/recent-pages";
import { drawnSourceShare, formatSourceShare, sourceShare } from "../model/share";
import { SOURCE_STATE_ORDER } from "../model/source-states";
import { automaticGrouping, type SourceGroup, type SourceGrouping } from "../model/source-group-index";
import { pickedRowOf, pickedWaitingSources, type SourcePick } from "../model/source-pick";
import {
  DEFAULT_SOURCE_SORT,
  nextSourceSort,
  rowLatestDay,
  type SourceSort,
  type SourceSortColumn,
  type SourceTableRow,
} from "../model/table-rows";
import { NextPanel, PANEL_LIST_ROWS } from "./NextPanel";
import { RecentlyWritten } from "./RecentlyWritten";
import { SourceStateBar } from "./SourceStateBar";
import { SourcesTable, type SourcesTableColumn, type SourcesTableRowView } from "./SourcesTable";
import { useHeldRowOrder } from "./use-held-row-order";
import { usePickClearing } from "./use-pick-clearing";
import { useSourceGroups } from "./use-source-groups";
import { useTableFit } from "./use-table-fit";

/** What the band's write button sends next and what is in flight (`ContinueBatch` on the page). */
export interface SourcesNextBatch {
  /** Sources the next press names, in list order. */
  next: readonly LibrarySourceRow[];
  /** Paths the request in flight named; empty while none runs. */
  running: ReadonlySet<string>;
  /** Waiting sources after the next press, or after the request in flight. */
  rest: number;
}

const DAY_MS = 86_400_000;
/** Rows mounted this soon after the widget count up from an empty bar, as a first arrival. */
const ARRIVAL_WINDOW_MS = 800;

function subscribeToDay(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

/** Today's local day number, held still all day. */
function localToday(): number {
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / DAY_MS);
}

const NO_KEYS: ReadonlySet<string> = new Set();

/** Folders whose bars already filled from empty this session; a later visit draws them at once. */
const arrived = new Set<string>();

/**
 * Library, Sources home under the band: where the pile stands by folder or file type, the pages
 * written last, and what the write button sends next. It reads facts only (source rows, page titles,
 * sources and dates, the batch), never page text. Rows arrive as the first files are counted and fill
 * in place; they hold their order while a batch runs and re-sort, gliding, when it ends or a header
 * is pressed.
 */
export function SourcesOverview({
  scope,
  sources,
  pages,
  batch,
  readingCount,
  pick,
  onPick,
  onOpenPage,
  onOpenSource,
}: {
  /** The open folder; the bars fill from empty only on its first arrival this session. */
  scope: string;
  sources: readonly LibrarySourceRow[];
  pages: readonly LibraryWikiPage[];
  batch: SourcesNextBatch;
  /** Sources counted so far while the folder is still being read; null once it is read. */
  readingCount: number | null;
  pick: SourcePick | null;
  onPick: (pick: SourcePick | null) => void;
  onOpenPage: (slug: string) => void;
  onOpenSource: (path: string) => void;
}) {
  const t = useTranslations("library");
  const locale = useLocale();
  const reduced = usePrefersReducedMotion();
  const today = useSyncExternalStore(subscribeToDay, localToday, localToday);
  const grouped = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const { index, revision, applied, appliedOnce } = useSourceGroups(sources);
  const [arrivalOpen, setArrivalOpen] = useState(() => !arrived.has(scope));
  useEffect(() => {
    arrived.add(scope);
    const id = setTimeout(() => setArrivalOpen(false), ARRIVAL_WINDOW_MS);
    return () => clearTimeout(id);
  }, [scope]);

  const shape = index.shape;
  const automatic = automaticGrouping(shape, readingCount);
  const [chosen, setChosen] = useState<SourceGrouping | null>(null);
  const grouping = chosen ?? automatic;
  const [sort, setSort] = useState<SourceSort>(DEFAULT_SOURCE_SORT);

  const runningKey = [...batch.running].sort().join("\n");
  const writingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const path of runningKey === "" ? [] : runningKey.split("\n")) {
      const key = index.keyOf(path, grouping);
      if (key) keys.add(key);
    }
    return keys;
    // `revision` re-reads the keys once the running paths are counted.
  }, [index, grouping, runningKey, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const [folds] = useState(() => ({ folder: new FoldCursor(), type: new FoldCursor() }));
  const fold = folds[grouping];
  const rows = useMemo(
    () => fold.rows(index, grouping, grouping === "folder" ? writingKeys : NO_KEYS),
    // `revision` names a published count; the fold reads only the groups the index logged since its last read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fold, index, grouping, writingKeys, revision],
  );
  const latestOf = useCallback((group: SourceGroup) => index.latestDay(group, today), [index, today]);

  const running = batch.running.size > 0;
  // Rows are still arriving while the folder is read or its first count is not complete.
  const arriving = readingCount !== null || !appliedOnce;
  const { ordered, resort } = useHeldRowOrder({ rows, sort, grouping, latestOf, applied, arriving, running, revision });

  const shareText = useCallback(
    (withPage: number, total: number) => (drawn: number, settled: boolean) => {
      const final = sourceShare(withPage, total);
      return formatSourceShare(settled ? final : drawnSourceShare(drawn, final), t);
    },
    [t],
  );
  const dayText = useCallback(
    (day: number) => (day >= today ? t("sourcesHome.day.today") : t("sourcesHome.day.ago", { count: today - day })),
    [t, today],
  );
  const splitTitle = useCallback(
    (group: SourceGroup) =>
      SOURCE_STATE_ORDER.map((state, i) => ({ state, count: group.byState[i] ?? 0 }))
        .filter(({ count }) => count > 0)
        .map(({ state, count }) => `${t(`sources.state.${state}.label`)} ${grouped.format(count)}`)
        .join(" · "),
    [grouped, t],
  );

  const nameOf = useCallback(
    (row: SourceTableRow): { name: string; fullName: string; sub: string | null } => {
      const { group, members } = row;
      if (members && row.range) {
        const range = t("sourcesHome.alike.range", { first: row.range.first.name, last: row.range.last.name });
        return { name: t("sourcesHome.alike.row", { count: members.length }), fullName: range, sub: range };
      }
      if (group.kind === "root") return { name: VAULT_SOURCES_DIR, fullName: t("sourcesHome.topLevel"), sub: null };
      if (group.kind === "type") {
        const name = group.name ? group.name.toUpperCase() : t("sources.noFormat");
        return { name, fullName: name, sub: null };
      }
      return { name: group.name, fullName: group.name, sub: null };
    },
    [t],
  );

  // Called only for the rows the table mounts.
  const viewOf = (row: SourceTableRow): SourcesTableRowView => {
    const { group } = row;
    const label = nameOf(row);
    const latest = rowLatestDay(row, latestOf);
    const withPage = group.byState[0] ?? 0;
    return {
      row,
      ...label,
      icon: group.kind === "type" ? "file" : "folder",
      writing: !row.members && writingKeys.has(group.key),
      writingTitle: t("sourcesHome.writing"),
      aria: t("sourcesHome.rowAria", { name: label.fullName === label.name ? label.name : `${label.name} ${label.fullName}`, total: group.total, withPage, waiting: group.waiting }),
      total: grouped.format(group.total),
      waiting: grouped.format(group.waiting),
      latest: latest >= 0 ? dayText(latest) : withPage > 0 ? t("sourcesHome.day.undated") : t("sourcesHome.day.none"),
      bar: (
        <SourceStateBar
          byState={group.byState}
          total={group.total}
          reduced={reduced}
          fromZero={!reduced && arrivalOpen}
          title={splitTitle(group)}
          shareText={shareText(withPage, group.total)}
        />
      ),
    };
  };

  const columns: SourcesTableColumn[] = [
    { column: "name", label: t(grouping === "folder" ? "sourcesHome.column.folder" : "sourcesHome.column.type"), align: "start" },
    { column: "sources", label: t("sourcesHome.column.sources"), align: "end" },
    { column: "withPage", label: t("sourcesHome.column.withPage"), align: "start" },
    { column: "waiting", label: t("sourcesHome.column.waiting"), align: "end" },
    { column: "latest", label: t("sourcesHome.column.latest"), align: "end", wideOnly: true },
  ];

  const picked = pickedRowOf(fold.folds, pick, grouping);
  const press = useCallback(
    (row: SourceTableRow) => {
      const keys = row.members ? row.members.map((member) => member.key) : [row.key];
      const same = picked !== null && picked.key === row.key;
      // An alike row is named by the range of folders it holds, which is what the pick narrows to.
      const label = nameOf(row);
      onPick(same ? null : { grouping, keys, name: row.members ? label.fullName : label.name });
    },
    [grouping, nameOf, onPick, picked],
  );

  const gone = usePickClearing({
    pick,
    onPick,
    counted: applied && readingCount === null,
    hasGroup: (key) => index.get(key) !== undefined,
  });

  const { columnRef, toolbarRef, tailRef, availablePx } = useTableFit();

  const recent = useMemo(() => selectRecentPages(pages, today), [pages, today]);
  const action = t("progress.continue", { count: Math.max(1, batch.next.length) });

  const totalWaiting = rows.reduce((sum, row) => sum + row.group.waiting, 0);
  const folderCount = shape.folders;
  const alikeRow = ordered.find((row) => row.members);
  const meta =
    grouping === "type"
      ? t("sourcesHome.metaType", { groups: shape.types, sources: sources.length })
      : alikeRow?.members
        ? t("sourcesHome.alike.meta", { folders: folderCount, count: alikeRow.members.length })
        : t("sourcesHome.meta", { folders: folderCount, sources: sources.length });

  const pickedFiles = useMemo(
    () => pickedWaitingSources(sources, (path, by) => index.keyOf(path, by), pick, PANEL_LIST_ROWS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, pick, sources, revision],
  );

  const panel = picked ? (
    <NextPanel
      title={t("sourcesHome.panel.waitingTitle")}
      heading={
        <div className="mt-2 flex flex-col gap-2">
          <p className="truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{nameOf(picked).name}</p>
          <SourceStateBar
            byState={picked.group.byState}
            total={picked.group.total}
            reduced={reduced}
            fromZero={false}
            title={splitTitle(picked.group)}
            shareText={shareText(picked.group.byState[0] ?? 0, picked.group.total)}
            className="text-body"
          />
        </div>
      }
      lead={picked.group.waiting === 0 ? t("sourcesHome.panel.nextEmpty") : splitTitle(picked.group)}
      privacy={null}
      files={pickedFiles}
      running={batch.running}
      reserveRows={0}
      foot={(picked.group.byState[4] ?? 0) > 0 ? t("sourcesHome.panel.unreadable", { count: picked.group.byState[4] ?? 0 }) : null}
      clear={{ label: t("sourcesHome.panel.clear"), onClear: () => onPick(null) }}
      onOpenSource={onOpenSource}
      t={t}
    />
  ) : (
    <NextPanel
      title={t("sourcesHome.panel.nextTitle")}
      heading={gone ? <p data-testid="sources-pick-gone" className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">{t("sourcesHome.pickGone", { folder: gone })}</p> : null}
      lead={
        totalWaiting === 0 && !arriving
          ? t("sourcesHome.panel.nextEmpty")
          : running
              ? t("sourcesHome.panel.leadRunning")
              : t("sourcesHome.panel.lead", { action })
      }
      privacy={totalWaiting > 0 ? t("sourcesHome.panel.privacy") : null}
      files={batch.next}
      running={batch.running}
      reserveRows={batch.next.length > 0 ? 0 : Math.min(PANEL_LIST_ROWS, totalWaiting)}
      foot={batch.rest > 0 ? t("progress.batchRest", { count: batch.rest }) : null}
      clear={null}
      onOpenSource={onOpenSource}
      t={t}
    />
  );

  return (
    // Below 60rem (a 1440 window with the conversation open) the panel stands above the table, which keeps the pane's height.
    <div className="@container/overview flex min-h-0 min-w-0 flex-1">
    <section
      aria-label={t("sourcesHome.aria")}
      data-testid="sources-overview"
      className="flex min-h-0 min-w-0 flex-1 gap-7 px-10 py-6 @max-[60rem]/overview:flex-col @max-[60rem]/overview:overflow-y-auto @max-[40rem]/overview:px-5"
    >
      {/* The column is a size container, so its own flex must not ride the query: a stale `flex-none`
          after a resize collapsed it to 0px. Stacked, it only gains a floor of the pane's height. */}
      <div ref={columnRef} className="@container flex min-h-0 min-w-0 flex-1 flex-col @max-[60rem]/overview:min-h-full">
        <div ref={toolbarRef} className="flex flex-none items-center gap-3.5 pb-3">
          <SegmentedControl
            ariaLabel={t("sourcesHome.groupBy.label")}
            value={grouping}
            onChange={(next) => {
              setChosen(next);
            }}
            options={[
              { value: "folder", label: t("sourcesHome.groupBy.folder"), testId: "sources-group-folder" },
              { value: "type", label: t("sourcesHome.groupBy.type"), testId: "sources-group-type" },
            ]}
          />
          {/* While the folder is still being read, the count so far takes the meta's place, so nothing moves when it ends. */}
          <span data-testid={readingCount !== null ? "sources-reading" : "sources-meta"} className="min-w-0 flex-1 truncate text-right text-body tabular-nums text-[color:var(--color-text-tertiary)]">
            {readingCount !== null ? t("sourcesHome.reading", { count: readingCount }) : meta}
          </span>
        </div>
        {/* A switch of grouping cross-fades the table and returns its scroll to the top. */}
        <div key={grouping} className="motion-swap-in flex min-h-0 flex-none flex-col">
        <SourcesTable
          rows={ordered}
          viewOf={viewOf}
          columns={columns}
          sort={sort}
          onSort={(column: SourceSortColumn) => {
            const next = nextSourceSort(sort, column);
            setSort(next);
            resort(next);
          }}
          sortTitle={(column) => t("sourcesHome.sortBy", { column })}
          pickedKey={picked?.key ?? null}
          onPress={press}
          availablePx={availablePx}
          moreText={(count) => t(grouping === "type" ? "sourcesHome.moreType" : "sourcesHome.more", { count })}
          reduced={reduced}
          holdFit={readingCount !== null}
          label={t("sourcesHome.aria")}
        />
        </div>
        <div ref={tailRef} className="flex-none">
          <RecentlyWritten
            recent={recent}
            dayText={dayText}
            sourceExists={(path) => index.keyOf(path, "folder") !== undefined}
            onOpenPage={onOpenPage}
            firstStep={action}
            reserve={recent.pages.length > 0 || readingCount !== null}
            t={t}
          />
        </div>
      </div>
      {panel}
    </section>
    </div>
  );
}
