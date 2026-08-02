import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { ProjectSourceWitnessInput } from "@/shared/lib/project-source-receipt";
import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";

interface WitnessDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function roleForKind(kind: unknown): string {
  return kind === "capability" || kind === "project" ? "entrypoint" : "implementation";
}

export function deriveProjectSourceWitnesses(input: {
  projectSlug: string;
  nodes: readonly Pick<KnowledgeGraphNode, "id" | "kind" | "title" | "projectIds" | "agentSlug">[];
  docs: readonly WitnessDoc[];
}): ProjectSourceWitnessInput[] {
  const relevantNodes = input.nodes.filter((node) => (
    node.projectIds.includes(input.projectSlug)
    || (node.kind === "project" && (node.id === input.projectSlug || node.id.endsWith(`:${input.projectSlug}`)))
  ));
  const relevantDocSlugs = new Set(
    relevantNodes.map((node) => node.agentSlug).filter((slug): slug is string => Boolean(slug)),
  );
  const candidates: ProjectSourceWitnessInput[] = [];
  const seenPaths = new Set<string>();
  const add = (candidate: ProjectSourceWitnessInput) => {
    const path = normalizedPath(candidate.path);
    if (!looksLikeCodePath(path) || seenPaths.has(path)) return;
    seenPaths.add(path);
    candidates.push({ ...candidate, path });
  };

  for (const doc of input.docs) {
    if (!relevantDocSlugs.has(doc.slug)) continue;
    const path = doc.frontmatter.path;
    if (typeof path === "string" && path.trim()) {
      add({
        id: `${doc.slug}:path`,
        nodeSlug: doc.slug,
        role: roleForKind(doc.frontmatter.kind),
        path,
      });
    }
    const elements = doc.frontmatter.elements;
    if (Array.isArray(elements)) {
      for (const element of elements) {
        if (typeof element !== "string" || !looksLikeCodePath(element)) continue;
        const normalized = normalizedPath(element);
        add({
          id: `${doc.slug}:element:${normalized}`,
          nodeSlug: doc.slug,
          role: "implementation",
          path: normalized,
        });
      }
    }
  }

  // Undocumented raw-path element refs are still explicit source-role claims.
  for (const node of relevantNodes) {
    if (node.kind !== "element" || !looksLikeCodePath(node.title)) continue;
    add({
      id: `${node.id}:path`,
      nodeSlug: node.agentSlug ?? node.id,
      role: "implementation",
      path: node.title,
    });
  }

  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}
