/**
 * The anonymous, deterministic seeded folder drawn only when no folder is open: cube is a source,
 * sphere a wiki page, line a citation. Plain data in, plain numbers out, so placement is testable
 * without a GPU.
 */

/** One mark in the object, in a unit-radius space the scene scales as it likes. */
export interface ConstellationMark {
  kind: "source" | "page";
  x: number;
  y: number;
  z: number;
  /** 0–1. Drives size and brightness: a page that gathered several documents is larger and brighter. */
  weight: number;
}

/** A citation: indices into `marks`, page first. */
type ConstellationLink = readonly [pageIndex: number, sourceIndex: number];

export interface ConstellationModel {
  marks: ConstellationMark[];
  links: ConstellationLink[];
}

/** What the object needs to know about a real folder. Counts and shape, never contents. */
export interface ConstellationInput {
  /** How many documents the folder keeps verbatim. */
  sourceCount: number;
  /** One entry per wiki page: how many of those documents it was written from. */
  pageSourceCounts: readonly number[];
}

/** About a third of the sources stay unclaimed, which keeps the outer shell round: a young folder has mostly unwritten sources. */
const ANONYMOUS: ConstellationInput = {
  sourceCount: 26,
  pageSourceCounts: [3, 2, 2, 1, 1, 4, 2, 1],
};

/** Marks past this stop being placed; a backdrop is a texture, not an inventory. */
export const CONSTELLATION_MARK_CAP = 96;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** How far a cited document travels toward its page; more than this dents the outer shell. */
const PAGE_PULL = 0.24;

/** The `i`-th of `count` points spread evenly over a sphere of radius `radius`; a Fibonacci spiral, since random picks clump. */
function spherePoint(
  i: number,
  count: number,
  radius: number,
): { x: number; y: number; z: number } {
  // `count + 1` keeps the first point off the pole, where every line to it converges.
  const y = 1 - (2 * (i + 0.5)) / Math.max(1, count);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * i;
  return { x: Math.cos(theta) * r * radius, y: y * radius, z: Math.sin(theta) * r * radius };
}

/** Builds the object for a folder's counts, or the anonymous folder when given none. */
export function buildConstellation(input?: ConstellationInput): ConstellationModel {
  const source = input ?? ANONYMOUS;
  const pageCounts = source.pageSourceCounts.filter((count) => Number.isFinite(count));
  const wantedSources = Math.max(0, Math.floor(source.sourceCount));
  // The cap is spent on pages first, so a folder of 400 sources still shows what was written from them.
  const pageTotal = Math.min(pageCounts.length, CONSTELLATION_MARK_CAP);
  const sourceTotal = Math.min(wantedSources, CONSTELLATION_MARK_CAP - pageTotal);

  const marks: ConstellationMark[] = [];
  const links: ConstellationLink[] = [];
  if (pageTotal === 0 && sourceTotal === 0) return { marks, links };

  const heaviest = Math.max(1, ...pageCounts.slice(0, pageTotal));
  for (let i = 0; i < pageTotal; i += 1) {
    const point = spherePoint(i, pageTotal, 0.52);
    marks.push({ kind: "page", ...point, weight: Math.min(1, (pageCounts[i] ?? 0) / heaviest) });
  }

  const sourceStart = marks.length;
  for (let i = 0; i < sourceTotal; i += 1) {
    const point = spherePoint(i, sourceTotal, 1);
    marks.push({ kind: "source", ...point, weight: 0 });
  }

  // Each page claims the next `n` sources in order; nearest-first would claim one dense band and leave the far side bare.
  let cursor = sourceStart;
  for (let page = 0; page < pageTotal; page += 1) {
    const wanted = Math.max(0, Math.floor(pageCounts[page] ?? 0));
    for (let taken = 0; taken < wanted && cursor < marks.length; taken += 1, cursor += 1) {
      const sourceMark = marks[cursor]!;
      const pageMark = marks[page]!;
      sourceMark.x += (pageMark.x - sourceMark.x) * PAGE_PULL;
      sourceMark.y += (pageMark.y - sourceMark.y) * PAGE_PULL;
      sourceMark.z += (pageMark.z - sourceMark.z) * PAGE_PULL;
      links.push([page, cursor]);
    }
  }
  return { marks, links };
}

