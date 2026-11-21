"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";

import { sourceNeedsCompile, VAULT_SOURCES_DIR, type LibrarySourceRow, type LibraryWikiPage } from "@/entities/docs-vault";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { MOTION } from "@/shared/motion/tokens";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";

import { selectRecentPages } from "../model/recent-pages";
import { drawnSourceShare, formatSourceShare, sourceShare } from "../model/share";
import { SOURCE_STATE_ORDER } from "../model/source-states";
import type { SourceGroup, SourceGrouping } from "../model/source-group-index";
import {
  ALIKE_KEY_PREFIX,
  DEFAULT_SOURCE_SORT,
  foldAlikeFolders,
  nextSourceSort,
  sortTableRows,
  type SourceSort,
  type SourceSortColumn,
  type SourceTableRow,
} from "../model/table-rows";
import { NextPanel, PANEL_LIST_ROWS } from "./NextPanel";
import { RecentlyWritten } from "./RecentlyWritten";
import { SourceStateBar } from "./SourceStateBar";
import { SourcesTable, type SourcesTableColumn, type SourcesTableRowView } from "./SourcesTable";
import { useSourceGroups } from "./use-source-groups";

/** What the band's write button sends next and what is in flight (`ContinueBatch` on the page). */
export interface SourcesNextBatch {
  /** Sources the next press names, in list order. */
  next: readonly LibrarySourceRow[];
  /** Paths the request in flight named; empty while none runs. */
  running: ReadonlySet<string>;
  /** Waiting sources after the next press, or after the request in flight. */
  rest: number;
}

/** A picked row: one group, or every folder of an alike row. */
export interface SourcePick {
  grouping: SourceGrouping;
  keys: readonly string[];
  name: string;
}

const DAY_MS = 86_400_000;
/** While rows are still arriving they re-order at most this often, and never while a batch runs. */
const ARRIVAL_RESORT_MS = 500;
/** Rows mounted this soon after the widget count up from an empty bar, as a first arrival. */
const ARRIVAL_WINDOW_MS = 800;
const GLIDE_MS = MOTION.settle.duration * 1000;

function subscribeToDay(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

/** Today's local day number, held still all day. */
function localToday(): number {
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / DAY_MS);
}

function rowLatestDay(row: SourceTableRow, latestDay: (group: SourceGroup) => number): number {
  if (!row.members) return latestDay(row.group);
  let latest = -1;
  for (const member of row.members) latest = Math.max(latest, latestDay(member));
  return latest;
}

/**
 * Library, Sources home under the band: where the pile stands by folder or file type, the pages
 * written last, and what the write button sends next. It reads facts only (source rows, page titles,
 * sources and dates, the batch), never page text. Rows arrive as the first files are counted and fill
 * in place; they hold their order while a batch runs and re-sort, gliding, when it ends or a header
 * is pressed.
 */
/** The order rows are drawn in, held between re-sorts; `glide` holds each key's place before the last one. */
interface HeldOrder {
  keys: readonly string[];
  glide: ReadonlyMap<string, number> | null;
  grouping: SourceGrouping;
}

function heldOrder(previous: HeldOrder, keys: readonly string[], glide: boolean): HeldOrder {
  if (keys.length === previous.keys.length && keys.every((key, i) => key === previous.keys[i])) return previous;
  if (!glide) return { ...previous, keys, glide: null };
  // A re-sort during a glide keeps the rows' DOM order from before the first one, so each row retargets from where it is drawn.
  return { ...previous, keys, glide: new Map(previous.glide ?? previous.keys.map((key, i) => [key, i])) };
}

export function SourcesOverview({
  sources,
  pages,
  batch,
  inApp,
  readingCount,
  pick,
  onPick,
  onOpenPage,
  onOpenSource,
}: {
  sources: readonly LibrarySourceRow[];
  pages: readonly LibraryWikiPage[];
  batch: SourcesNextBatch;
  inApp: boolean;
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
  const { index, revision, applied } = useSourceGroups(sources);
  const [arrivalOpen, setArrivalOpen] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setArrivalOpen(false), ARRIVAL_WINDOW_MS);
    return () => clearTimeout(id);
  }, []);

  const shape = index.shape;
  // A folder walk publishes one folder first, so the shape is judged only once the read is complete.
  const automatic: SourceGrouping = readingCount === null && shape.folders === 1 && shape.types >= 2 ? "type" : "folder";
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

  const rows = useMemo(
    () => (grouping === "folder" ? foldAlikeFolders(index.list("folder"), writingKeys) : foldAlikeFolders(index.list("type"), new Set())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, grouping, writingKeys, revision],
  );
  const latestOf = useCallback((group: SourceGroup) => index.latestDay(group, today), [index, today]);

  // The order is held: it changes on a header press, a group switch, a batch's end, or (throttled)
  // while rows are still arriving; rows that appear in between join at the end.
  const [order, setOrder] = useState<HeldOrder>({ keys: [], glide: null, grouping });
  const sortedKeys = useCallback(
    (by: SourceSort) => sortTableRows(rows, by, (row) => rowLatestDay(row, latestOf)).map((row) => row.key),
    [latestOf, rows],
  );
  const resort = useCallback(
    (glide: boolean, by: SourceSort = sort) => {
      const keys = sortedKeys(by);
      setOrder((previous) => heldOrder(previous, keys, glide && !reduced));
    },
    [reduced, sort, sortedKeys],
  );
  // A grouping switch and the first rows counted set the order before they paint.
  if (order.grouping !== grouping || (order.keys.length === 0 && rows.length > 0)) {
    setOrder({ keys: sortedKeys(sort), glide: null, grouping });
  }
  const running = batch.running.size > 0;
  const arriving = readingCount !== null || !applied;
  const lastArrivalSort = useRef(0);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) resort(true);
    wasRunning.current = running;
  }, [resort, running]);
  useEffect(() => {
    if (!arriving || running) return undefined;
    const wait = Math.max(0, lastArrivalSort.current + ARRIVAL_RESORT_MS - performance.now());
    const id = setTimeout(() => {
      lastArrivalSort.current = performance.now();
      resort(true);
    }, wait);
    return () => clearTimeout(id);
  }, [arriving, resort, revision, running]);
  useEffect(() => {
    if (order.glide === null) return undefined;
    const id = setTimeout(() => setOrder((previous) => (previous.glide ? { ...previous, glide: null } : previous)), GLIDE_MS + 50);
    return () => clearTimeout(id);
  }, [order.glide]);

  const ordered = useMemo(() => {
    if (order.keys.length === 0) return sortTableRows(rows, sort, (row) => rowLatestDay(row, latestOf));
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const out: SourceTableRow[] = [];
    for (const key of order.keys) {
      const row = byKey.get(key);
      if (row) {
        out.push(row);
        byKey.delete(key);
      }
    }
    for (const row of byKey.values()) out.push(row);
    return out;
    // The held order is read as it stands; `sort` matters only before the first one exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.keys, rows]);

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
      if (members) {
        const range = t("sourcesHome.alike.range", { first: members[0]!.name, last: members[members.length - 1]!.name });
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

  const views: SourcesTableRowView[] = ordered.map((row) => {
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
  });

  const columns: SourcesTableColumn[] = [
    { column: "name", label: t(grouping === "folder" ? "sourcesHome.column.folder" : "sourcesHome.column.type"), align: "start" },
    { column: "sources", label: t("sourcesHome.column.sources"), align: "end" },
    { column: "withPage", label: t("sourcesHome.column.withPage"), align: "start" },
    { column: "waiting", label: t("sourcesHome.column.waiting"), align: "end" },
    { column: "latest", label: t("sourcesHome.column.latest"), align: "end", wideOnly: true },
  ];

  const pickedKey = pick && pick.grouping === grouping ? (pick.keys.length > 1 ? `${ALIKE_KEY_PREFIX}${pick.keys[0]}` : pick.keys[0] ?? null) : null;
  const press = useCallback(
    (row: SourceTableRow) => {
      const keys = row.members ? row.members.map((member) => member.key) : [row.key];
      const same = pick !== null && pick.grouping === grouping && pick.keys.length === keys.length && pick.keys.every((key, i) => key === keys[i]);
      onPick(same ? null : { grouping, keys, name: nameOf(row).name });
    },
    [grouping, nameOf, onPick, pick],
  );

  // Escape clears a pick; a picked folder that left the disk clears it too, said once in the panel.
  useEffect(() => {
    if (pick === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick, pick]);
  const vanishedPick = pick !== null && applied && readingCount === null && !pick.keys.some((key) => index.get(key)) ? pick : null;
  const [gone, setGone] = useState<string | null>(null);
  if (vanishedPick && gone !== vanishedPick.name) setGone(vanishedPick.name);
  useEffect(() => {
    if (vanishedPick) onPick(null);
  }, [onPick, vanishedPick]);

  // Table fit: the body takes whole rows of what the column leaves after the toolbar and Recently written.
  const columnRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const [availablePx, setAvailablePx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const used = (toolbarRef.current?.offsetHeight ?? 0) + (tailRef.current?.offsetHeight ?? 0);
      setAvailablePx(Math.max(0, column.clientHeight - used));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    if (tailRef.current) observer.observe(tailRef.current);
    return () => observer.disconnect();
  }, []);

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

  const picked = pickedKey ? ordered.find((row) => row.key === pickedKey) ?? null : null;
  const pickedFiles = useMemo(() => {
    if (!pick) return [];
    const keys = new Set(pick.keys);
    const out: LibrarySourceRow[] = [];
    for (const row of sources) {
      if (!sourceNeedsCompile(row)) continue;
      const key = index.keyOf(row.path, pick.grouping);
      if (key !== undefined && keys.has(key)) out.push(row);
      if (out.length === PANEL_LIST_ROWS) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pick, sources, revision]);

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
          : !inApp
            ? t("sourcesHome.panel.webNote")
            : running
              ? t("sourcesHome.panel.leadRunning")
              : t("sourcesHome.panel.lead", { action })
      }
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
    <section aria-label={t("sourcesHome.aria")} data-testid="sources-overview" className="flex min-h-0 flex-1 gap-7 px-10 py-6">
      <div ref={columnRef} className="@container flex min-h-0 min-w-0 flex-1 flex-col">
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
          views={views}
          columns={columns}
          sort={sort}
          onSort={(column: SourceSortColumn) => {
            const next = nextSourceSort(sort, column);
            setSort(next);
            resort(true, next);
          }}
          sortTitle={(column) => t("sourcesHome.sortBy", { column })}
          pickedKey={pickedKey}
          onPress={press}
          availablePx={availablePx}
          moreText={(count) => t("sourcesHome.more", { count })}
          glide={order.glide}
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
            firstStep={inApp ? action : null}
            reserve={recent.pages.length > 0 || readingCount !== null}
            t={t}
          />
        </div>
      </div>
      {panel}
    </section>
  );
}
