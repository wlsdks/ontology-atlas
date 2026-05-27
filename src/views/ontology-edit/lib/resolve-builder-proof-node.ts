interface BuilderProofDoc {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

export function resolveBuilderProofNodeId(doc: BuilderProofDoc | null | undefined): string | null {
  const rawKind = typeof doc?.frontmatter?.kind === "string" ? doc.frontmatter.kind.trim() : "";
  if (!doc || !rawKind) return null;

  const frontmatterSlug =
    typeof doc.frontmatter?.slug === "string" ? doc.frontmatter.slug.trim() : "";
  const tailSlug = doc.slug.split("/").pop() || doc.slug;
  const idSlug = rawKind === "project" && frontmatterSlug ? frontmatterSlug : tailSlug;
  return idSlug ? `${rawKind}:${idSlug}` : null;
}
