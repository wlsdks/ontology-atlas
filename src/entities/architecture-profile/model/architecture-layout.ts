import type { ArchitectureProfile } from './architecture-profile';

/**
 * Role positions and arrows derived from the rules, not array order. `lower-only` draws an
 * ordered spine; `explicit` draws only the declared edges.
 */

interface ArchitectureLayoutNode {
  id: string;
  /** 0 is the deepest layer, which nothing may depend on. */
  depth: number;
  /** Left to right, stable across renders. */
  column: number;
  /** Nothing is allowed to leave this role. */
  isSink: boolean;
}

interface ArchitectureLayoutEdge {
  from: string;
  to: string;
  /** Skips at least one layer; drawn lighter. */
  skips: boolean;
}

export interface ArchitectureLayout {
  policy: 'explicit' | 'lower-only';
  nodes: ArchitectureLayoutNode[];
  edges: ArchitectureLayoutEdge[];
  /** Deepest last. */
  rows: string[][];
}

function allowedFor(profile: ArchitectureProfile, roleId: string, index: number): string[] {
  if (profile.dependencyPolicy === 'lower-only') {
    return profile.roles.slice(index + 1).map((role) => role.id);
  }
  return profile.allows[roleId] ?? [];
}

/** Longest path to a sink, so every arrow points down at least one row. */
function computeDepths(
  profile: ArchitectureProfile,
  allows: Map<string, string[]>,
): Map<string, number> {
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    /* A cycle returns 0 so a broken `explicit` profile still draws, as two roles on one row. */
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

  /* Deepest row last; declaration order within a row, so renders never reshuffle. */
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
