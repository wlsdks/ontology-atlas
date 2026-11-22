"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { holdOrder, rowsInHeldOrder, type HeldOrder } from "../model/held-row-order";
import type { SourceGroup, SourceGrouping } from "../model/source-group-index";
import { rowLatestDay, sortTableRows, type SourceSort, type SourceTableRow } from "../model/table-rows";

/** While rows are still arriving they re-order at most this often, and never while a batch runs. */
const ARRIVAL_RESORT_MS = 500;

/**
 * The rows in a held order: it changes on a header press, a group switch, a batch's end, or
 * (throttled) while rows are still arriving; rows that appear in between join at the end.
 */
export function useHeldRowOrder({
  rows,
  sort,
  grouping,
  latestOf,
  applied,
  arriving,
  running,
  revision,
}: {
  rows: readonly SourceTableRow[];
  sort: SourceSort;
  grouping: SourceGrouping;
  latestOf: (group: SourceGroup) => number;
  applied: boolean;
  arriving: boolean;
  running: boolean;
  revision: number;
}): { ordered: SourceTableRow[]; resort: (by?: SourceSort) => void } {
  const [order, setOrder] = useState<HeldOrder>({ keys: [], grouping });
  const sortedKeys = useCallback(
    (by: SourceSort) => sortTableRows(rows, by, (row) => rowLatestDay(row, latestOf)).map((row) => row.key),
    [latestOf, rows],
  );
  const resort = useCallback(
    (by: SourceSort = sort) => {
      const keys = sortedKeys(by);
      setOrder((previous) => holdOrder(previous, keys));
    },
    [sort, sortedKeys],
  );
  // A grouping switch and the first rows counted set the order before they paint.
  if (order.grouping !== grouping || (order.keys.length === 0 && rows.length > 0)) {
    setOrder({ keys: sortedKeys(sort), grouping });
  }
  const lastArrivalSort = useRef(0);
  // A batch's end and the read's end each re-sort once, so the last rows to arrive are sorted too.
  const wasRunning = useRef(running);
  const wasArriving = useRef(arriving);
  const sortWhenApplied = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) sortWhenApplied.current = true;
    if (wasArriving.current && !arriving) sortWhenApplied.current = true;
    wasRunning.current = running;
    wasArriving.current = arriving;
    if (sortWhenApplied.current && applied && !running) {
      sortWhenApplied.current = false;
      resort();
    }
  }, [applied, arriving, resort, running]);
  useEffect(() => {
    if (!arriving || running) return undefined;
    const wait = Math.max(0, lastArrivalSort.current + ARRIVAL_RESORT_MS - performance.now());
    const id = setTimeout(() => {
      lastArrivalSort.current = performance.now();
      resort();
    }, wait);
    return () => clearTimeout(id);
  }, [arriving, resort, revision, running]);

  const ordered = useMemo(
    () => (order.keys.length === 0 ? sortTableRows(rows, sort, (row) => rowLatestDay(row, latestOf)) : rowsInHeldOrder(rows, order.keys)),
    // The held order is read as it stands; `sort` matters only before the first one exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order.keys, rows],
  );
  return { ordered, resort };
}
