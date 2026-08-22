interface DocsVaultHrefInput {
  slug?: string | null;
  hash?: string | null;
  intent?: 'local' | null;
  dogfood?: boolean;
  /** Return context for an insights review. Pass only a valid `via` marker and an exact row id. */
  via?: string | null;
  reviewId?: string | null;
}

/**
 * Builds a vault href of the form `/docs/?slug=...#section`.
 *
 * Empty input gives `/docs/`; a slug alone gives `/docs/?slug=...`; a hash appends the
 * fragment.
 */
export function buildDocsVaultHref({
  slug,
  hash,
  intent,
  dogfood,
  via,
  reviewId,
}: DocsVaultHrefInput = {}): string {
  const normalizedSlug = slug?.trim();
  const normalizedHash = hash?.trim().replace(/^#/, '');
  const queryParts: string[] = [];

  if (normalizedSlug) queryParts.push(`slug=${encodeURIComponent(normalizedSlug)}`);
  if (intent === 'local') queryParts.push('intent=local');
  if (dogfood) queryParts.push('dogfood=1');
  if (via) queryParts.push(`via=${encodeURIComponent(via)}`);
  if (via && reviewId) queryParts.push(`review=${encodeURIComponent(reviewId)}`);

  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return `/docs/${query}${normalizedHash ? `#${normalizedHash}` : ''}`;
}
