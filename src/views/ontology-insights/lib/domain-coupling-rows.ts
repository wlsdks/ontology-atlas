import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCouplingMatrix } from "@/shared/lib/ontology-tree";

/** One real edge between a pair of domains — used by the click-to-inspect example list. */
interface DomainCouplingExampleRow {
  id: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  type: string;
}

/** One cross connection, domain A → domain B — top N by count, descending. */
export interface DomainCouplingPairRow {
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  count: number;
  relationCounts: Array<{ type: string; count: number }>;
  examples: DomainCouplingExampleRow[];
}

/** One domain's self (inside the same domain) vs cross (out to another) share — the boundary-pressure signal. */
export interface DomainCouplingBoundaryRow {
  id: string;
  title: string;
  selfEdges: number;
  crossEdges: number;
  /** crossEdges / (crossEdges + selfEdges). Zero when there are no edges at all. */
  crossRatio: number;
}

/** A domain on one axis of the heat grid. `index` is its row/column number in `cells`. */
interface DomainCouplingGridDomain {
  id: string;
  title: string;
}

/**
 * The domain × domain heat grid. `cells[from][to]` is the number of connections in that
 * direction, and the diagonal (`from === to`) is the number of connections inside one domain.
 *
 * Why a grid rather than a list: standing 22 pairs up vertically requires scrolling to read
 * "which two are entangled", and combinations that are *not* entangled never appear at all, so
 * there is no way to see where the boundary broke. A grid shows empty cells as facts too.
 */
export interface DomainCouplingGrid {
  domains: DomainCouplingGridDomain[];
  cells: number[][];
  /** The largest cell value excluding the diagonal — the basis of the cross saturation ramp. Zero means no crossings. */
  maxCross: number;
  /**
   * The largest diagonal value (connections inside one domain) — the basis of the neutral ramp
   * used **for the diagonal only**.
   *
   * Why it does not share the cross ruler: the two count different things (internal cohesion vs
   * boundary crossing). Measured 2026-07-26 against the dogfood vault, the internal maximum was
   * 14 and the cross maximum 5 — measured on one ruler, the whole diagonal saturates at maximum
   * and the cross signal, which is this card's actual question, disappears. So there are two
   * scales, and the diagonal states "a different scale" through a channel other than colour:
   * neutral fill plus a dashed border.
   */
  maxSelf: number;
  /** Total domains, beyond the ones placed on the grid — for the truncation copy. */
  totalDomainCount: number;
  /** Cross relations involving domains outside the grid. Above zero, "outside the grid" is stated. */
  hiddenCrossEdgeCount: number;
}

export interface DomainCouplingSummary {
  domainCount: number;
  crossDomainEdgeCount: number;
  /** Every cross domain pair — the lookup table for the detail a grid cell expands to. */
  pairs: DomainCouplingPairRow[];
  /** The number of distinct domain pairs. */
  totalPairCount: number;
  grid: DomainCouplingGrid;
  boundaries: DomainCouplingBoundaryRow[];
  /**
   * The number of domains with at least one connection — decides whether `boundaries` was
   * truncated at the limit, so the card can say "top N / M total" instead of quietly reducing.
   */
  boundaryTotalCount: number;
  /**
   * Cold start — with fewer than two domains or zero cross-domain edges there is no basis to
   * compute coupling at all. The signal for the card to draw an explicit empty state rather than
   * an empty or misleading table.
   */
  isColdStart: boolean;
}

/**
 * Reshapes `computeDomainCouplingMatrix` (shared/lib, already the same computation as MCP
 * `domain_matrix`) into view rows this tab can draw directly. The algorithm is untouched — this
 * layer adds only node title lookup and the self/cross ratio arithmetic ("raw matrix →
 * presentational row").
 */
/**
 * The maximum domains placed on the grid. 6×6 is the largest size at which the number inside a
 * cell still reads within the card width on a full-screen 14-inch display — beyond that only the
 * colour remains, and with only colour left you have to ask "how many?" again.
 *
 * The truncation rule: `computeDomainCouplingMatrix` has already sorted `domains` by cross
 * connections, so it is cut from the front — the noisiest boundaries survive. Cross relations
 * involving the truncated domains are counted separately as `hiddenCrossEdgeCount` so the screen
 * does not quietly reduce anything.
 */
const DOMAIN_GRID_LIMIT = 6;

export function buildDomainCouplingSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  boundaryLimit = 6,
  gridLimit = DOMAIN_GRID_LIMIT,
): DomainCouplingSummary {
  // The grid needs **every** pair, not the top N (an empty cell is a fact too). `pairs` is now a
  // cell → detail lookup table rather than a vertical list, so it is not truncated either.
  const matrix = computeDomainCouplingMatrix(nodes, edges, Number.MAX_SAFE_INTEGER);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const titleOf = (node: KnowledgeGraphNode) => node.display ?? node.title;

  const gridDomains = matrix.domains.slice(0, Math.max(0, gridLimit));
  const gridIndexById = new Map(gridDomains.map((row, index) => [row.domain.id, index] as const));
  const cells: number[][] = gridDomains.map(() => gridDomains.map(() => 0));
  let maxSelf = 0;
  for (const [index, row] of gridDomains.entries()) {
    cells[index][index] = row.selfEdges;
    maxSelf = Math.max(maxSelf, row.selfEdges);
  }
  let maxCross = 0;
  let hiddenCrossEdgeCount = 0;
  for (const conn of matrix.connections) {
    const from = gridIndexById.get(conn.from.id);
    const to = gridIndexById.get(conn.to.id);
    if (from === undefined || to === undefined) {
      hiddenCrossEdgeCount += conn.count;
      continue;
    }
    cells[from][to] += conn.count;
    maxCross = Math.max(maxCross, cells[from][to]);
  }

  const pairs: DomainCouplingPairRow[] = matrix.connections.map((conn) => ({
    fromId: conn.from.id,
    fromTitle: titleOf(conn.from),
    toId: conn.to.id,
    toTitle: titleOf(conn.to),
    count: conn.count,
    relationCounts: conn.relationCounts,
    examples: conn.examples.map((edge) => buildExampleRow(edge, nodeById)),
  }));

  const connectedDomains = matrix.domains.filter(
    (row) => row.outgoing + row.incoming + row.selfEdges > 0,
  );
  // The two stages are deliberately separate.
  //
  // **Selection is by cross volume** (`matrix.domains` is already in that order) — selecting by
  // share would let a small domain with 1 crossing and 0 internal edges take the whole limit at
  // 100%, pushing the genuinely leaking large domains out of the list.
  //
  // **Display is by cross share** — the share is the signal this card's caption tells you to
  // read, and the bar draws the share. Ordered by total instead, the ranking the caption points
  // at diverges from the ranking on screen (measured 2026-07-26: the domain at 100% share was the
  // fifth bar). Ties break by the larger total — at equal share, the larger volume is seen first.
  const boundaries: DomainCouplingBoundaryRow[] = connectedDomains
    .slice(0, boundaryLimit)
    .map((row) => {
      const crossEdges = row.outgoing + row.incoming;
      const total = crossEdges + row.selfEdges;
      return {
        id: row.domain.id,
        title: titleOf(row.domain),
        selfEdges: row.selfEdges,
        crossEdges,
        crossRatio: total > 0 ? crossEdges / total : 0,
      };
    })
    .sort(
      (a, b) =>
        b.crossRatio - a.crossRatio ||
        b.crossEdges + b.selfEdges - (a.crossEdges + a.selfEdges) ||
        a.title.localeCompare(b.title),
    );

  return {
    domainCount: matrix.domainCount,
    crossDomainEdgeCount: matrix.crossDomainEdgeCount,
    pairs,
    totalPairCount: matrix.totalConnectionCount,
    grid: {
      domains: gridDomains.map((row) => ({ id: row.domain.id, title: titleOf(row.domain) })),
      cells,
      maxCross,
      maxSelf,
      totalDomainCount: matrix.domainCount,
      hiddenCrossEdgeCount,
    },
    boundaries,
    boundaryTotalCount: connectedDomains.length,
    isColdStart: matrix.domainCount < 2 || matrix.crossDomainEdgeCount === 0,
  };
}

function buildExampleRow(
  edge: KnowledgeGraphEdge,
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): DomainCouplingExampleRow {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  return {
    id: edge.id,
    fromId: edge.from,
    fromTitle: (from?.display ?? from?.title) ?? edge.from,
    toId: edge.to,
    toTitle: (to?.display ?? to?.title) ?? edge.to,
    type: edge.type,
  };
}
