/**
 * 공방 (Compass Stage) STAGED-CHANGES model — Slice 1 (지지대 편집) + Slice 2
 * (평문 기록 요약). Pure + deterministic so the whole "what will be written"
 * story is unit-tested independent of React.
 *
 * The single source of truth for a workshop session is a list of `StudioChange`:
 *   - add    — fill an empty socket with a new neighbor.
 *   - remove — cut an existing relation (끊기).
 *   - retype — move an existing neighbor to a different bearing (이 관계 바꾸기).
 *
 * That ONE list feeds three consumers so they can never disagree:
 *   1. `projectBearings`     — optimistic stage render (struts/satellites move
 *      before the disk write; sockets show a "저장 대기" cue).
 *   2. `planRelationRefUpdates` — the direct-to-disk frontmatter arrays
 *      (`useLocalVault.updateFrontmatter`) for a writable vault.
 *   3. `summarizeStudioChanges` + the packet builders — the plain-Korean
 *      "이렇게 기록됩니다" sentence AND the read-only MCP command packet.
 *
 * Bearing → relation → frontmatter key (mirror of `build-studio-item`):
 *   UP 상위개념 isA → broader · RIGHT 기대는 곳 dependsOn → dependencies ·
 *   DOWN 담는 것 contains → contains · LEFT 비슷한 것 relates → relates.
 */

import { slugify } from "@/shared/lib/slugify";
import {
  BEARING_FRONTMATTER_KEY,
  type StudioRelation,
  type StudioSatellite,
} from "./build-studio-item";

// ── Change model ─────────────────────────────────────────────────────────────
export type StudioChange =
  | { op: "add"; relation: StudioRelation; target: StudioSatellite }
  | { op: "remove"; relation: StudioRelation; target: StudioSatellite }
  | { op: "retype"; from: StudioRelation; to: StudioRelation; target: StudioSatellite };

export type StudioChangeAction =
  | { type: "add"; relation: StudioRelation; target: StudioSatellite }
  | { type: "remove"; relation: StudioRelation; target: StudioSatellite }
  | { type: "retype"; from: StudioRelation; to: StudioRelation; target: StudioSatellite }
  | { type: "undo"; index: number }
  | { type: "clear" };

function withoutTarget(list: readonly StudioChange[], id: string): StudioChange[] {
  return list.filter((c) => c.target.id !== id);
}

function findForTarget(list: readonly StudioChange[], id: string): StudioChange | undefined {
  return list.find((c) => c.target.id === id);
}

/**
 * At most ONE pending change per neighbor id — a node can only end up in one
 * place. Later actions on the same node collapse into (or cancel) the earlier
 * one so the summary never lists a contradiction.
 */
export function reduceStudioChanges(
  prev: readonly StudioChange[],
  action: StudioChangeAction,
): StudioChange[] {
  switch (action.type) {
    case "clear":
      return [];
    case "undo":
      return prev.filter((_, i) => i !== action.index);
    case "add": {
      const rest = withoutTarget(prev, action.target.id);
      return [...rest, { op: "add", relation: action.relation, target: action.target }];
    }
    case "remove": {
      const existing = findForTarget(prev, action.target.id);
      // Removing a freshly-added (not-yet-saved) link just cancels the add.
      if (existing?.op === "add") return withoutTarget(prev, action.target.id);
      const rest = withoutTarget(prev, action.target.id);
      return [...rest, { op: "remove", relation: action.relation, target: action.target }];
    }
    case "retype": {
      const existing = findForTarget(prev, action.target.id);
      const rest = withoutTarget(prev, action.target.id);
      // A freshly-added link re-placed before save is still just an add.
      if (existing?.op === "add") {
        return [...rest, { op: "add", relation: action.to, target: action.target }];
      }
      // Preserve the TRUE original bearing across chained retypes.
      const from = existing?.op === "retype" ? existing.from : action.from;
      // Back to where it started → no net change.
      if (from === action.to) return rest;
      return [...rest, { op: "retype", from, to: action.to, target: action.target }];
    }
    default:
      return [...prev];
  }
}

// ── Direction detection (Slice 1 honest-note) ────────────────────────────────
function tailOf(ref: string): string {
  const t = ref.trim();
  const slash = t.lastIndexOf("/");
  return slash >= 0 ? t.slice(slash + 1) : t;
}

/**
 * True when a frontmatter array entry refers to the same node as `target`.
 * Tolerant of the forms the vault derivation accepts: folder-prefixed
 * (`capabilities/mcp-server`), bare tail (`mcp-server`), or the title.
 */
export function frontmatterEntryMatchesTarget(
  entry: string,
  target: { ref: string; title: string },
): boolean {
  const e = entry.trim();
  if (!e) return false;
  if (e === target.ref) return true;
  const et = slugify(tailOf(e));
  return et !== "" && (et === slugify(tailOf(target.ref)) || et === slugify(target.title));
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

/**
 * Is `target` recorded on the FOCAL node's own frontmatter under `relation`'s
 * key? Only then can we edit/remove it by rewriting the focal doc. Otherwise the
 * edge is authored on the OTHER node (e.g. a child's `domain:` producing a
 * `contains`, or another node's `relates: focal`) and must be edited there —
 * the surface shows an honest note + re-center instead of a broken write.
 */
export function isRelationEditableFromFocal(
  focalFrontmatter: Record<string, unknown> | undefined,
  relation: StudioRelation,
  target: { ref: string; title: string },
): boolean {
  if (!focalFrontmatter) return false;
  const key = BEARING_FRONTMATTER_KEY[relation];
  return asStringArray(focalFrontmatter[key]).some((entry) =>
    frontmatterEntryMatchesTarget(entry, target),
  );
}

// ── Optimistic projection ────────────────────────────────────────────────────
export interface ProjectedBearing {
  relation: StudioRelation;
  neighbors: StudioSatellite[];
  filled: boolean;
}

export interface ProjectionResult {
  byRelation: Record<StudioRelation, ProjectedBearing>;
  /** neighbor ids touched by a pending change — drives the "저장 대기" cue. */
  pendingTargetIds: Set<string>;
  /** bearings whose neighbor set changed — the lane/socket shows a pending cue. */
  pendingRelations: Set<StudioRelation>;
}

const ALL_RELATIONS: StudioRelation[] = ["isA", "dependsOn", "contains", "relates"];

/**
 * Apply the pending changes to the base neighbor lists so the stage renders the
 * result BEFORE the disk write. Base data is never mutated.
 */
export function projectBearings(
  baseNeighborsByRelation: Record<StudioRelation, readonly StudioSatellite[]>,
  changes: readonly StudioChange[],
): ProjectionResult {
  const next: Record<StudioRelation, StudioSatellite[]> = {
    isA: [...baseNeighborsByRelation.isA],
    dependsOn: [...baseNeighborsByRelation.dependsOn],
    contains: [...baseNeighborsByRelation.contains],
    relates: [...baseNeighborsByRelation.relates],
  };
  const drop = (rel: StudioRelation, id: string) => {
    next[rel] = next[rel].filter((n) => n.id !== id);
  };
  const push = (rel: StudioRelation, sat: StudioSatellite) => {
    if (!next[rel].some((n) => n.id === sat.id)) next[rel].push(sat);
  };

  const pendingTargetIds = new Set<string>();
  const pendingRelations = new Set<StudioRelation>();
  for (const c of changes) {
    pendingTargetIds.add(c.target.id);
    if (c.op === "add") {
      push(c.relation, c.target);
      pendingRelations.add(c.relation);
    } else if (c.op === "remove") {
      drop(c.relation, c.target.id);
      pendingRelations.add(c.relation);
    } else {
      drop(c.from, c.target.id);
      push(c.to, c.target);
      pendingRelations.add(c.from);
      pendingRelations.add(c.to);
    }
  }

  const byRelation = {} as Record<StudioRelation, ProjectedBearing>;
  for (const rel of ALL_RELATIONS) {
    byRelation[rel] = { relation: rel, neighbors: next[rel], filled: next[rel].length > 0 };
  }
  return { byRelation, pendingTargetIds, pendingRelations };
}

// ── Writable-vault frontmatter plan ──────────────────────────────────────────
function dedupe(refs: readonly string[]): string[] {
  return Array.from(new Set(refs));
}

/**
 * Compute the next frontmatter ref array PER relation for the changed relations
 * only. `base` is the focal doc's current refs per relation (resolved by the
 * page from `focalDoc.frontmatter`). The page maps each returned relation to its
 * frontmatter key and calls `updateFrontmatter`.
 */
export function planRelationRefUpdates(
  base: Record<StudioRelation, readonly string[]>,
  changes: readonly StudioChange[],
): Partial<Record<StudioRelation, string[]>> {
  const working: Record<StudioRelation, string[]> = {
    isA: [...base.isA],
    dependsOn: [...base.dependsOn],
    contains: [...base.contains],
    relates: [...base.relates],
  };
  const touched = new Set<StudioRelation>();
  const removeRef = (rel: StudioRelation, ref: string, target: { ref: string; title: string }) => {
    working[rel] = working[rel].filter((r) => !frontmatterEntryMatchesTarget(r, target));
    touched.add(rel);
  };
  const addRef = (rel: StudioRelation, ref: string) => {
    working[rel] = dedupe([...working[rel], ref]);
    touched.add(rel);
  };
  for (const c of changes) {
    if (c.op === "add") {
      addRef(c.relation, c.target.ref);
    } else if (c.op === "remove") {
      removeRef(c.relation, c.target.ref, c.target);
    } else {
      removeRef(c.from, c.target.ref, c.target);
      addRef(c.to, c.target.ref);
    }
  }
  const out: Partial<Record<StudioRelation, string[]>> = {};
  for (const rel of ALL_RELATIONS) {
    if (touched.has(rel)) out[rel] = dedupe(working[rel]);
  }
  return out;
}

// ── Plain-language summary (Slice 2) ─────────────────────────────────────────
/**
 * Localized phrasing injected by the page (from next-intl `t`). Keeping every
 * string behind this bag lets one summary function serve both ko + en and stay
 * unit-testable with a fake vocab.
 */
export interface StudioSummaryVocab {
  relationLabel: (relation: StudioRelation) => string;
  /** e.g. "'상위개념: X' 추가" */
  addLine: (relationLabel: string, title: string) => string;
  /** e.g. "'Y' 를 '기대는 곳' 으로 이동" */
  moveLine: (title: string, toRelationLabel: string) => string;
  /** e.g. "'비슷한 것: Z' 끊기" */
  removeLine: (relationLabel: string, title: string) => string;
  /** e.g. "CLI Developer Entry 에 2가지를 기록해요" */
  enhanceHeadline: (focalName: string, count: number) => string;
  /** e.g. "파일 1개 수정." */
  enhanceFileEffect: () => string;
  /** e.g. "capability '결제 취소' 가 커머스 코어 도메인 아래 생겨요" */
  createHeadline: (kindLabel: string, name: string, domainLabel: string | null) => string;
  /** e.g. "파일 1개 생성 · 관계 2줄 기록." */
  createFileEffect: (relationLines: number) => string;
  /** create collapsed one-liner, e.g. "새 노드 1개 · 관계 2개" */
  createCollapsed: (relationLines: number) => string;
  /** collapsed one-liner, e.g. "기록될 내용 2가지" */
  collapsedCount: (count: number) => string;
  /** nothing staged yet */
  empty: string;
}

export interface StudioChangeSummary {
  count: number;
  headline: string;
  lines: string[];
  fileEffect: string;
  collapsed: string;
  empty: boolean;
}

export type StudioSummaryPlan =
  | { mode: "enhance"; focalName: string; changes: readonly StudioChange[] }
  | {
      mode: "create";
      kindLabel: string;
      name: string;
      domainLabel: string | null;
      changes: readonly StudioChange[];
    };

function changeLine(change: StudioChange, vocab: StudioSummaryVocab): string {
  if (change.op === "add") {
    return vocab.addLine(vocab.relationLabel(change.relation), change.target.title);
  }
  if (change.op === "remove") {
    return vocab.removeLine(vocab.relationLabel(change.relation), change.target.title);
  }
  return vocab.moveLine(change.target.title, vocab.relationLabel(change.to));
}

/**
 * Turn the staged changes into the human "이렇게 기록됩니다" story. `count` is
 * the number of change lines; empty when there's nothing to record.
 */
export function summarizeStudioChanges(
  plan: StudioSummaryPlan,
  vocab: StudioSummaryVocab,
): StudioChangeSummary {
  const lines = plan.changes.map((c) => changeLine(c, vocab));
  const count = lines.length;
  if (plan.mode === "enhance") {
    return {
      count,
      headline: count === 0 ? vocab.empty : vocab.enhanceHeadline(plan.focalName, count),
      lines,
      fileEffect: count === 0 ? "" : vocab.enhanceFileEffect(),
      collapsed: vocab.collapsedCount(count),
      empty: count === 0,
    };
  }
  // create — the node is always created; relation lines are additive.
  return {
    count,
    headline: vocab.createHeadline(plan.kindLabel, plan.name, plan.domainLabel),
    lines,
    fileEffect: vocab.createFileEffect(count),
    collapsed: vocab.createCollapsed(count),
    empty: false,
  };
}
