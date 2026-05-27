interface BuilderProofDoc {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

export interface BuilderProofTarget {
  graphNodeId: string;
  vaultSlug: string;
}

export function resolveBuilderProofNodeId(doc: BuilderProofDoc | null | undefined): string | null {
  return resolveBuilderProofTarget(doc)?.graphNodeId ?? null;
}

export function resolveBuilderProofTarget(
  doc: BuilderProofDoc | null | undefined,
): BuilderProofTarget | null {
  const rawKind = typeof doc?.frontmatter?.kind === "string" ? doc.frontmatter.kind.trim() : "";
  if (!doc || !rawKind) return null;

  const frontmatterSlug =
    typeof doc.frontmatter?.slug === "string" ? doc.frontmatter.slug.trim() : "";
  const tailSlug = doc.slug.split("/").pop() || doc.slug;
  const idSlug = rawKind === "project" && frontmatterSlug ? frontmatterSlug : tailSlug;
  const vaultSlug = frontmatterSlug || doc.slug;
  return idSlug ? { graphNodeId: `${rawKind}:${idSlug}`, vaultSlug } : null;
}
