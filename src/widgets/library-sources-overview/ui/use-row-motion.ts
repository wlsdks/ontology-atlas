import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { MOTION } from "@/shared/motion/tokens";

import type { SourceTableRow } from "../model/table-rows";

const GLIDE_MS = MOTION.settle.duration * 1000;
const GLIDE_EASING = `cubic-bezier(${MOTION.settle.ease.join(", ")})`;
const GLIDE_ID = "sources-row-glide";
/** Past the glide, so its last frame is drawn before the DOM is re-ordered. */
const SETTLE_MARGIN_MS = 60;

export interface LeavingRow {
  row: SourceTableRow;
  /** Its place in the order drawn before it left. */
  index: number;
}

/** What a change of the drawn rows is doing; null at rest. */
export interface RowMotion {
  /** Each key's place in the rows drawn just before the change. */
  fromIndex: ReadonlyMap<string, number>;
  /** The rows drawn just before the change, for the window they filled. */
  fromRows: readonly SourceTableRow[];
  /** Each key's rank in the DOM order when the motion began; the DOM keeps it until the rows settle. */
  domRank: ReadonlyMap<string, number>;
  leaving: readonly LeavingRow[];
}

interface Drawn {
  rows: readonly SourceTableRow[];
  motion: RowMotion | null;
  id: number;
}

/**
 * The motion between two drawn orders: whenever a row's place changes, a row leaves or one arrives,
 * each mounted row glides from where it is drawn (mid-glide included) to its new place over the
 * whole `--motion-settle`, and a row that left fades where it was. O(G) once per change of `rows`.
 * Web Animations, not a transition: a reversed transition is shortened to the distance it covered.
 */
export function useRowMotion(rows: readonly SourceTableRow[], reduced: boolean, bodyRef: RefObject<HTMLElement | null>, rowPx: number): RowMotion | null {
  const [drawn, setDrawn] = useState<Drawn>({ rows, motion: null, id: 0 });
  let current = drawn;
  if (drawn.rows !== rows) {
    const motion = reduced ? null : motionBetween(drawn.rows, rows, drawn.motion);
    current = motion === undefined ? { rows, motion: drawn.motion, id: drawn.id } : { rows, motion, id: drawn.id + 1 };
    setDrawn(current);
  }

  const { motion, id } = current;
  useLayoutEffect(() => {
    if (motion && bodyRef.current) glideRows(bodyRef.current, motion.fromIndex, rowPx);
  }, [bodyRef, motion, rowPx]);
  useEffect(() => {
    if (!motion) return undefined;
    const timer = setTimeout(() => setDrawn((now) => (now.id === id ? { ...now, motion: null } : now)), GLIDE_MS + SETTLE_MARGIN_MS);
    return () => clearTimeout(timer);
  }, [id, motion]);

  return motion;
}

/** Starts each mounted row's glide from its drawn place to the place it is now styled at. */
function glideRows(body: HTMLElement, fromIndex: ReadonlyMap<string, number>, rowPx: number): void {
  for (const element of body.querySelectorAll<HTMLElement>("[data-key]")) {
    if (typeof element.animate !== "function" || element.dataset.testid === "sources-row-leaving") continue;
    const to = element.style.translate;
    const running = element.getAnimations().find((animation) => animation.id === GLIDE_ID);
    let from: string | null = null;
    if (running) {
      from = getComputedStyle(element).translate;
      running.cancel();
    } else {
      const index = fromIndex.get(element.dataset.key ?? "");
      if (index !== undefined) from = `0 ${index * rowPx}px`;
    }
    if (from === null || from === to) continue;
    element.animate([{ translate: from }, { translate: to }], { duration: GLIDE_MS, easing: GLIDE_EASING, id: GLIDE_ID });
  }
}

/** A new motion, or undefined when no row moved, left or arrived. */
function motionBetween(previous: readonly SourceTableRow[], next: readonly SourceTableRow[], ongoing: RowMotion | null): RowMotion | undefined {
  const fromIndex = new Map<string, number>();
  for (let i = 0; i < previous.length; i += 1) fromIndex.set(previous[i]!.key, i);
  let moved = false;
  let kept = 0;
  for (let i = 0; i < next.length; i += 1) {
    const before = fromIndex.get(next[i]!.key);
    if (before === undefined) moved = true;
    else {
      kept += 1;
      if (before !== i) moved = true;
    }
  }
  const left = kept < previous.length;
  if (!moved && !left) return undefined;

  const leaving: LeavingRow[] = [];
  if (left) {
    const present = new Set(next.map((row) => row.key));
    for (let i = 0; i < previous.length; i += 1) if (!present.has(previous[i]!.key)) leaving.push({ row: previous[i]!, index: i });
    for (const gone of ongoing?.leaving ?? []) if (!present.has(gone.row.key) && !fromIndex.has(gone.row.key)) leaving.push(gone);
  }
  return { fromIndex, fromRows: previous, domRank: domRankAfter(ongoing, previous, fromIndex), leaving };
}

/** Keys ranked after every ranked key keep their drawn order, as the last render placed them. */
const UNRANKED_BASE = 1e9;

/** The DOM order as it stands: the ongoing motion's ranks, then the keys it had not ranked, by place. */
function domRankAfter(ongoing: RowMotion | null, previous: readonly SourceTableRow[], fromIndex: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  if (!ongoing) return fromIndex;
  const ranks = new Map(ongoing.domRank);
  for (let i = 0; i < previous.length; i += 1) {
    const key = previous[i]!.key;
    if (!ranks.has(key)) ranks.set(key, UNRANKED_BASE + i);
  }
  return ranks;
}
