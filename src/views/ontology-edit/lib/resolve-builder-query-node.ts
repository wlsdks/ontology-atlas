interface BuilderQueryDoc {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

export function resolveBuilderQueryNodeSlug(
  queryNodeId: string | null,
  docs: readonly BuilderQueryDoc[],
): string | null {
  const normalized = queryNodeId?.trim().replace(/^\/+/, "");
  if (!normalized) return null;

  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  if (bySlug.has(normalized)) return normalized;

  const unprefixed = normalized.replace(/^ontology\//, "");
  const ontologyPrefixed = `ontology/${unprefixed}`;
  if (bySlug.has(ontologyPrefixed)) return ontologyPrefixed;

  const frontmatterMatch = docs.find((doc) => {
    const frontmatterSlug = doc.frontmatter?.slug;
    if (typeof frontmatterSlug !== "string") return false;
    const normalizedFrontmatterSlug = frontmatterSlug.replace(/^ontology\//, "");
    return (
      frontmatterSlug === normalized ||
      frontmatterSlug === ontologyPrefixed ||
      normalizedFrontmatterSlug === unprefixed
    );
  });

  return frontmatterMatch?.slug ?? null;
}
