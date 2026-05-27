import type { VaultManifest } from "@/entities/docs-vault";

const RELATION_KEYS = [
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
] as const;

const KIND_RANK: Record<string, number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
};

export type BuilderEntryAnchor = {
  id: string;
  kind: string;
  label: string;
  degree: number;
};

export function buildBuilderEntryAnchors(
  manifest: VaultManifest,
  limit = 6,
): BuilderEntryAnchor[] {
  const cappedLimit = Math.max(0, limit);
  const nodes = manifest.docs
    .filter((doc) => typeof doc.frontmatter?.kind === "string")
    .filter((doc) => ["project", "domain", "capability", "element"].includes(String(doc.frontmatter.kind)));
  const degree = new Map(nodes.map((doc) => [doc.slug, 0]));

  for (const doc of nodes) {
    const fm = doc.frontmatter as Record<string, unknown>;
    for (const key of RELATION_KEYS) {
      const refs = normalizeRelationRefs(fm[key]);
      if (refs.length === 0) continue;
      degree.set(doc.slug, (degree.get(doc.slug) ?? 0) + refs.length);
      for (const ref of refs) {
        if (degree.has(ref)) {
          degree.set(ref, (degree.get(ref) ?? 0) + 1);
        }
      }
    }
    const domain = typeof fm.domain === "string" ? fm.domain : null;
    if (domain) {
      degree.set(doc.slug, (degree.get(doc.slug) ?? 0) + 1);
      if (degree.has(domain)) {
        degree.set(domain, (degree.get(domain) ?? 0) + 1);
      }
    }
  }

  const ranked = nodes
    .map((doc) => ({
      id: doc.slug,
      kind: String(doc.frontmatter.kind),
      label: doc.title || doc.slug,
      degree: degree.get(doc.slug) ?? 0,
    }))
    .sort(compareBuilderEntryAnchors);

  const selected = new Map<string, BuilderEntryAnchor>();
  const add = (anchor: BuilderEntryAnchor | undefined) => {
    if (!anchor || selected.size >= cappedLimit) return;
    selected.set(anchor.id, anchor);
  };

  add(ranked.find((anchor) => anchor.kind === "project"));
  for (const kind of ["domain", "capability", "element"]) {
    add(ranked.find((anchor) => anchor.kind === kind));
  }
  for (const anchor of ranked) {
    add(anchor);
  }

  return Array.from(selected.values()).slice(0, cappedLimit);
}

function normalizeRelationRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function compareBuilderEntryAnchors(
  a: BuilderEntryAnchor,
  b: BuilderEntryAnchor,
): number {
  if (a.kind === "project" && b.kind !== "project") return -1;
  if (b.kind === "project" && a.kind !== "project") return 1;
  if (b.degree !== a.degree) return b.degree - a.degree;
  const kindDiff = (KIND_RANK[a.kind] ?? 99) - (KIND_RANK[b.kind] ?? 99);
  if (kindDiff !== 0) return kindDiff;
  return a.id.localeCompare(b.id);
}
