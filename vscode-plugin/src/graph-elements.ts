import { VaultNode } from "./walk-vault";

/**
 * Pure function — vault nodes → cytoscape elements (nodes + edges).
 *
 * Separated from graph-view.ts (which imports vscode) so that this can be
 * unit-tested under `node --test` without VSCode runtime.
 *
 * Edges:
 *   - `domain:` inline string → edge to that domain (tail-only refs resolved)
 *   - `capabilities:` array → edge to each capability
 *   - `elements:` array → edge to each element node (path-like strings that
 *     don't match a vault slug are skipped — they reference source files,
 *     not graph nodes)
 *
 * De-duplicated. Self-edges removed.
 */

export interface CyElement {
  group: "nodes" | "edges";
  data: Record<string, string | undefined>;
}

export function buildGraphElements(
  nodes: ReadonlyArray<VaultNode>,
): CyElement[] {
  const slugs = new Set(nodes.map((n) => n.slug));
  const elements: CyElement[] = [];
  for (const node of nodes) {
    elements.push({
      group: "nodes",
      data: {
        id: node.slug,
        label: node.title,
        kind: node.kind,
      },
    });
  }
  for (const node of nodes) {
    if (node.domain) {
      const target = resolveSlug(node.domain, nodes, slugs);
      if (target && target !== node.slug) {
        elements.push({
          group: "edges",
          data: { source: node.slug, target, label: "domain" },
        });
      }
    }
    for (const key of ["capabilities", "elements"] as const) {
      const arr = (node as VaultNode)[key];
      if (!Array.isArray(arr)) continue;
      for (const ref of arr) {
        if (typeof ref !== "string") continue;
        const target = resolveSlug(ref, nodes, slugs);
        if (target && target !== node.slug) {
          elements.push({
            group: "edges",
            data: { source: node.slug, target, label: key },
          });
        }
      }
    }
  }
  return dedupe(elements);
}

function resolveSlug(
  ref: string,
  nodes: ReadonlyArray<VaultNode>,
  slugSet: Set<string>,
): string | null {
  if (slugSet.has(ref)) return ref;
  const tailMatches = nodes.filter(
    (n) => n.slug.endsWith(`/${ref}`) || n.slug === ref,
  );
  if (tailMatches.length === 1) return tailMatches[0].slug;
  return null;
}

function dedupe(elements: CyElement[]): CyElement[] {
  const seen = new Set<string>();
  const out: CyElement[] = [];
  for (const el of elements) {
    const key =
      el.group === "nodes"
        ? `n:${el.data.id}`
        : `e:${el.data.source}->${el.data.target}:${el.data.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(el);
  }
  return out;
}
