import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCouplingMatrix } from "@/entities/knowledge-graph";

/** One real edge between two domains, for the click-to-inspect example list. */
interface DomainCouplingExampleRow {
  id: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  type: string;
}

/** One cross connection, domain A to domain B. */
export interface DomainCouplingPairRow {
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  count: number;
  relationCounts: Array<{ type: string; count: number }>;
  examples: DomainCouplingExampleRow[];
}

/** One domain's self versus cross share: the boundary-pressure signal. */
export interface DomainCouplingBoundaryRow {
  id: string;
  title: string;
  selfEdges: number;
  crossEdges: number;
  /** The formula crossEdges / (crossEdges + selfEdges), zero with no edges. */
  crossRatio: number;
}

/** A domain on one grid axis; `index` is its row and column in `cells`. */
interface DomainCouplingGridDomain {
  id: string;
  title: string;
}

/**
 * The domain x domain heat grid: `cells[from][to]` counts connections in that direction, and the diagonal counts
 * connections inside one domain. A grid shows unentangled pairs as empty cells, which a list never shows.
 */
export interface DomainCouplingGrid {
  domains: DomainCouplingGridDomain[];
  cells: number[][];
  /** The largest off-diagonal cell, the basis of the cross ramp; zero means no crossings. */
  maxCross: number;
  /**
   * The largest diagonal cell, the basis of the neutral diagonal-only ramp. Internal cohesion and boundary crossing
   * count different things, and on one ruler the diagonal would saturate and hide the cross signal.
   */
  maxSelf: number;
  /** All domains, beyond those on the grid, for the truncation copy. */
  totalDomainCount: number;
  /** Cross relations involving domains off the grid; above zero, the card says so. */
  hiddenCrossEdgeCount: number;
}

export interface DomainCouplingSummary {
  domainCount: number;
  crossDomainEdgeCount: number;
  /** Every cross pair: the lookup a grid cell expands to. */
  pairs: DomainCouplingPairRow[];
  totalPairCount: number;
  grid: DomainCouplingGrid;
  boundaries: DomainCouplingBoundaryRow[];
  /** Domains with at least one connection, so the card can say "top N / M total". */
  boundaryTotalCount: number;
  /** Fewer than two domains or zero cross edges: nothing to compute, so the card draws an explicit empty state. */
  isColdStart: boolean;
}

/**
 * The most domains on the grid: past 6x6 the number in a cell no longer reads at the card width on a 14-inch
 * display. `computeDomainCouplingMatrix` already sorts by cross connections, so cutting from the front keeps the
 * noisiest boundaries; cut domains' crossings are counted in `hiddenCrossEdgeCount`.
 */
const DOMAIN_GRID_LIMIT = 6;

/**
 * Reshapes `computeDomainCouplingMatrix` (the computation behind MCP `domain_matrix`) into view rows,
 * adding only title lookup and the self/cross ratio.
 */
export function buildDomainCouplingSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  boundaryLimit = 6,
  gridLimit = DOMAIN_GRID_LIMIT,
): DomainCouplingSummary {
  // The grid needs every pair (an empty cell is a fact), and `pairs` is a cell lookup, so neither is truncated.
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
  // Select by cross volume (the `matrix.domains` order), so a tiny all-cross domain cannot crowd out large leaking
  // ones; display by cross share, the value the caption names and the bar draws. Ties go to the larger total.
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
