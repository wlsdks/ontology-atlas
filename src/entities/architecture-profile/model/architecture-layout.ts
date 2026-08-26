import type { ArchitectureProfile } from './architecture-profile';

/**
 * Where each role sits, and which arrows are real.
 *
 * ⚠️ **The old drawing was wrong, not merely plain** (owner, on the installed build: *"this is
 * poor — 'roles and dependency direction' is neither good-looking nor a flow you can read at a
 * glance"*). It stacked the roles in declaration order and put a down-arrow between every
 * consecutive pair, whatever the rules said. On the storefront profile that produced a picture
 * contradicting its own data: `domain` allows nothing yet had an arrow leaving it, and
 * `port → domain` was drawn as domain-above-port, pointing the wrong way.
 *
 * So the layout is derived from the rules instead of from array order.
 *
 * **The two policies are genuinely different pictures, and flattening them into one is what broke.**
 * Under `lower-only` the rule is a single sentence — every role may reach every role beneath it —
 * so drawing all 21 edges of a seven-role profile is noise, and an ordered spine says it exactly.
 * Under `explicit` the rule *is* a graph, and only the declared edges exist.
 */

interface ArchitectureLayoutNode {
  id: string;
  /** Row index. 0 is the deepest layer — the one nothing may depend upon. */
  depth: number;
  /** Position within the row, left to right, stable across renders. */
  column: number;
  /** Nothing is allowed to leave this role. */
  isSink: boolean;
}

interface ArchitectureLayoutEdge {
  from: string;
  to: string;
  /** True when the arrow skips at least one layer — drawn lighter so the spine stays legible. */
  skips: boolean;
}

export interface ArchitectureLayout {
  policy: 'explicit' | 'lower-only';
  nodes: ArchitectureLayoutNode[];
  edges: ArchitectureLayoutEdge[];
  /** Rows, deepest last, so a renderer can lay out top-to-bottom without recomputing. */
  rows: string[][];
}

function allowedFor(profile: ArchitectureProfile, roleId: string, index: number): string[] {
  if (profile.dependencyPolicy === 'lower-only') {
    return profile.roles.slice(index + 1).map((role) => role.id);
  }
  return profile.allows[roleId] ?? [];
}

/**
 * Depth is the **longest** path to a sink, not the shortest.
 *
 * ⚠️ With shortest-path depth, a role that both reaches its neighbour and skips past it would land
 * on the same row as the thing it depends on, and the arrow between them would run sideways. The
 * longest path guarantees every arrow points down at least one row, which is the property that
 * makes the picture readable at all.
 */
function computeDepths(
  profile: ArchitectureProfile,
  allows: Map<string, string[]>,
): Map<string, number> {
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    /*
     * ⚠️ A cycle is a broken profile, not an impossible one: `explicit` lets somebody write
     * `allow_a: [b]` and `allow_b: [a]`. Returning 0 keeps the screen drawable instead of hanging,
     * and the cycle stays visible as two roles on the same row with arrows both ways.
     */
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let deepest = 0;
    for (const target of allows.get(id) ?? []) {
      if (!allows.has(target)) continue;
      deepest = Math.max(deepest, walk(target) + 1);
    }
    visiting.delete(id);
    depth.set(id, deepest);
    return deepest;
  };

  for (const role of profile.roles) walk(role.id);
  return depth;
}

export function buildArchitectureLayout(profile: ArchitectureProfile): ArchitectureLayout {
  const allows = new Map<string, string[]>();
  profile.roles.forEach((role, index) => {
    allows.set(role.id, allowedFor(profile, role.id, index));
  });

  const depth = computeDepths(profile, allows);
  const maxDepth = Math.max(0, ...[...depth.values()]);

  /*
   * Rows read top-to-bottom as "reaches the most" → "reaches nothing", so the deepest role is drawn
   * last. Inside a row, declaration order is preserved: the profile's author chose it, and a
   * renderer reshuffling equals every render would make the picture move for no reason.
   */
  const rows: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const role of profile.roles) {
    rows[maxDepth - (depth.get(role.id) ?? 0)]!.push(role.id);
  }

  const nodes: ArchitectureLayoutNode[] = [];
  rows.forEach((row, rowIndex) => {
    row.forEach((id, column) => {
      nodes.push({
        id,
        depth: rowIndex,
        column,
        isSink: (allows.get(id) ?? []).length === 0,
      });
    });
  });

  const rowOf = new Map(nodes.map((node) => [node.id, node.depth]));
  const edges: ArchitectureLayoutEdge[] = [];
  for (const role of profile.roles) {
    for (const target of allows.get(role.id) ?? []) {
      if (!allows.has(target)) continue;
      const from = rowOf.get(role.id) ?? 0;
      const to = rowOf.get(target) ?? 0;
      edges.push({ from: role.id, to: target, skips: to - from > 1 });
    }
  }

  return { policy: profile.dependencyPolicy, nodes, edges, rows };
}
