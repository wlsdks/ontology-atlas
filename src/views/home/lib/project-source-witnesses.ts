import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { ProjectSourceWitnessInput } from "@/shared/lib/project-source-receipt";
import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";

interface WitnessDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
  meaningEvidencePaths?: readonly string[];
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function looksLikeSourceWitnessPath(value: string): boolean {
  if (value === ".") return true;
  if (
    !value
    || value.trim() !== value
    || value.startsWith("/")
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) return false;
  const normalized = normalizedPath(value);
  return normalized.length > 0
    && normalized.length <= 500
    && normalized.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
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
  // Hand-authored project roots can predate `agentSlug` derivation. The graph
  // hash already keeps the same exact frontmatter/filename fallback; source
  // witnesses must use that identical containment boundary or a project-level
  // README can never satisfy the scope competency evidence contract.
  for (const doc of input.docs) {
    if (
      doc.frontmatter.kind === "project"
      && (doc.slug === input.projectSlug || doc.frontmatter.slug === input.projectSlug)
    ) {
      relevantDocSlugs.add(doc.slug);
    }
  }
  const candidates: ProjectSourceWitnessInput[] = [];
  const seenClaims = new Set<string>();
  const add = (candidate: ProjectSourceWitnessInput) => {
    if (!looksLikeSourceWitnessPath(candidate.path)) return;
    const path = normalizedPath(candidate.path);
    // The same path can support more than one ontology role. Keep each node's
    // claim while collapsing duplicate declarations on that same node.
    const claim = `${candidate.nodeSlug}\0${path}`;
    // An explicit frontmatter `path:` can legitimately be a repository-root
    // artifact such as README.md or package.json. It is still checked against
    // the inspected source inventory before becoming supported evidence.
    if (seenClaims.has(claim)) return;
    seenClaims.add(claim);
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

  const projectDoc = input.docs.find((doc) => (
    relevantDocSlugs.has(doc.slug)
    && doc.frontmatter.kind === "project"
    && (doc.slug === input.projectSlug || doc.frontmatter.slug === input.projectSlug)
  ));
  if (projectDoc) {
    for (const [index, path] of (projectDoc.meaningEvidencePaths ?? []).entries()) {
      add({
        id: `competency-evidence:${index + 1}`,
        nodeSlug: projectDoc.slug,
        role: "competency-evidence",
        path,
      });
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
