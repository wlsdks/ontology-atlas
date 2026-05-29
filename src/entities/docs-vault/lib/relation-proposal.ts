import type { VaultManifest } from "../model/types";
import {
  inferOntologyRelationKey,
  type OntologyRelationKey,
} from "@/shared/lib/ontology-relation-key";

export type VaultRelationKey = OntologyRelationKey;

export interface VaultRelationProposal {
  sourceSlug: string;
  targetSlug: string;
  sourceKind: string;
  targetKind: string;
  inferredKey: VaultRelationKey;
}

export type VaultRelationPreflightDecision =
  | "safe_to_add"
  | "skip_existing"
  | "review_inverse"
  | "review_path";

export interface VaultRelationPreflight {
  decision: VaultRelationPreflightDecision;
  exactExists: boolean;
  inverseExists: boolean;
  pathExists: boolean;
  path: string[];
}

export interface VaultRelationWriteScope {
  filePath: string;
  changedFiles: readonly string[];
  unchangedFiles: readonly string[];
  frontmatterKey: VaultRelationKey;
  targetSlug: string;
  mutation: string;
}

export interface VaultRelationGraphEffect {
  edge: string;
  relationLabel: string;
  direction: "source_to_target";
  surfaces: readonly ["topology", "path", "impact", "mcp"];
  inferredMatchesSelected: boolean;
}

export const VAULT_RELATION_KEYS: VaultRelationKey[] = [
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "contains",
  "describes",
  "relates",
];

const GRAPH_KEYS = [
  "domains",
  "domain",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
] as const;

export function inferVaultRelationKey(
  sourceKind: string,
  targetKind: string,
): VaultRelationKey {
  return inferOntologyRelationKey(sourceKind, targetKind);
}

export function buildVaultRelationWritePreview(
  sourceSlug: string,
  key: VaultRelationKey,
  targetSlug: string,
): string {
  return `${sourceSlug}.${key} += ${targetSlug}`;
}

export function buildVaultRelationFrontmatterPatch(
  key: VaultRelationKey,
  targetSlug: string,
): string {
  return [`${key}:`, `  - ${targetSlug}`].join("\n");
}

export function buildVaultRelationWriteScope(
  sourceSlug: string,
  key: VaultRelationKey,
  targetSlug: string,
): VaultRelationWriteScope {
  return {
    filePath: `${sourceSlug}.md`,
    changedFiles: [`${sourceSlug}.md`],
    unchangedFiles: [`${targetSlug}.md`],
    frontmatterKey: key,
    targetSlug,
    mutation: buildVaultRelationWritePreview(sourceSlug, key, targetSlug),
  };
}

export function readVaultRelationValues(
  frontmatter: Record<string, unknown>,
  key: VaultRelationKey,
): string[] {
  const keys =
    key === "dependencies" ? (["dependencies", "depends_on"] as const) : [key];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const candidateKey of keys) {
    const value = frontmatter[candidateKey];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== "string" || seen.has(item)) continue;
      seen.add(item);
      values.push(item);
    }
  }
  return values;
}

export function buildVaultRelationPatch(
  frontmatter: Record<string, unknown>,
  key: VaultRelationKey,
  targetSlug: string,
): {
  alreadyExists: boolean;
  next: string[];
  patch: Partial<Record<VaultRelationKey | "depends_on", string[] | null>>;
} {
  const current = readVaultRelationValues(frontmatter, key);
  const alreadyExists = current.includes(targetSlug);
  const next = alreadyExists ? current : [...current, targetSlug];
  return {
    alreadyExists,
    next,
    patch:
      key === "dependencies"
        ? { dependencies: next, depends_on: null }
        : { [key]: next },
  };
}

export function buildVaultRelationGraphEffect({
  inferredKey,
  selectedKey,
  sourceSlug,
  targetSlug,
}: {
  inferredKey: VaultRelationKey;
  selectedKey: VaultRelationKey;
  sourceSlug: string;
  targetSlug: string;
}): VaultRelationGraphEffect {
  return {
    edge: `${sourceSlug} --${selectedKey}--> ${targetSlug}`,
    relationLabel: selectedKey,
    direction: "source_to_target",
    surfaces: ["topology", "path", "impact", "mcp"],
    inferredMatchesSelected: inferredKey === selectedKey,
  };
}

export function preflightVaultRelation(
  manifest: VaultManifest,
  proposal: Pick<VaultRelationProposal, "sourceSlug" | "targetSlug">,
  key: VaultRelationKey,
): VaultRelationPreflight {
  const exactExists = hasRelation(manifest, proposal.sourceSlug, key, proposal.targetSlug);
  const directSourceExists = VAULT_RELATION_KEYS.some(
    (candidateKey) =>
      candidateKey !== key &&
      hasRelation(manifest, proposal.sourceSlug, candidateKey, proposal.targetSlug),
  );
  const inverseExists = VAULT_RELATION_KEYS.some((candidateKey) =>
    hasRelation(manifest, proposal.targetSlug, candidateKey, proposal.sourceSlug),
  );
  const path = findUndirectedPath(manifest, proposal.sourceSlug, proposal.targetSlug);
  const pathExists = directSourceExists || path.length > 2;

  if (exactExists) {
    return { decision: "skip_existing", exactExists, inverseExists, pathExists, path };
  }
  if (inverseExists) {
    return { decision: "review_inverse", exactExists, inverseExists, pathExists, path };
  }
  if (directSourceExists) {
    return {
      decision: "review_path",
      exactExists,
      inverseExists,
      pathExists,
      path: [proposal.sourceSlug, proposal.targetSlug],
    };
  }
  if (pathExists) {
    return { decision: "review_path", exactExists, inverseExists, pathExists, path };
  }
  return { decision: "safe_to_add", exactExists, inverseExists, pathExists, path };
}

function hasRelation(
  manifest: VaultManifest,
  sourceSlug: string,
  key: VaultRelationKey,
  targetSlug: string,
): boolean {
  const source = manifest.docs.find((doc) => doc.slug === sourceSlug);
  if (!source) return false;
  return readVaultRelationValues(source.frontmatter, key).includes(targetSlug);
}

function findUndirectedPath(
  manifest: VaultManifest,
  sourceSlug: string,
  targetSlug: string,
): string[] {
  if (sourceSlug === targetSlug) return [sourceSlug];
  const slugs = new Set(manifest.docs.map((doc) => doc.slug));
  if (!slugs.has(sourceSlug) || !slugs.has(targetSlug)) return [];

  const neighbors = new Map<string, Set<string>>();
  const addNeighbor = (from: string, to: string) => {
    if (!neighbors.has(from)) neighbors.set(from, new Set());
    neighbors.get(from)!.add(to);
  };

  for (const doc of manifest.docs) {
    for (const key of GRAPH_KEYS) {
      const value = doc.frontmatter[key];
      const refs = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? [value]
          : [];
      for (const ref of refs) {
        if (typeof ref !== "string" || !slugs.has(ref)) continue;
        addNeighbor(doc.slug, ref);
        addNeighbor(ref, doc.slug);
      }
    }
  }

  const queue = [sourceSlug];
  // head pointer 로 dequeue O(1) — `Array.shift()` 는 O(n) 이라 큰 vault 에서
  // 최단경로 BFS 가 O(n²) (depth.ts / reachability.ts 와 동일 패턴).
  let head = 0;
  const previous = new Map<string, string | null>([[sourceSlug, null]]);
  while (head < queue.length) {
    const current = queue[head++];
    for (const next of neighbors.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === targetSlug) {
        const path: string[] = [];
        let cursor: string | null = targetSlug;
        while (cursor) {
          path.push(cursor);
          cursor = previous.get(cursor) ?? null;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}
