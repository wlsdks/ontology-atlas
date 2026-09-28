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
  // Hand-authored project roots can predate `agentSlug`; use the graph hash's frontmatter/filename
  // fallback, or a project-level README can never satisfy the scope evidence contract.
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
    // One path may support several roles; dedupe only per node.
    const claim = `${candidate.nodeSlug}\0${path}`;
    // A repository-root `path:` such as README.md is allowed but still checked against the
    // inspected inventory.
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

  return candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
