interface DocsVaultHrefInput {
  slug?: string | null;
  collection?: 'ontology';
  hash?: string | null;
  intent?: 'local' | null;
  dogfood?: boolean;
  /** Return context; pass only a valid `via` marker. */
  via?: string | null;
}

/** Document address with return context and fragment. */
export function buildDocsVaultHref({
  slug,
  collection,
  hash,
  intent,
  dogfood,
  via,
}: DocsVaultHrefInput = {}): string {
  const normalizedSlug = slug?.trim();
  const normalizedHash = hash?.trim().replace(/^#/, '');
  const queryParts: string[] = [];

  if (collection === 'ontology') queryParts.push('tab=ontology');
  if (normalizedSlug) queryParts.push(`slug=${encodeURIComponent(normalizedSlug)}`);
  if (intent === 'local') queryParts.push('intent=local');
  if (dogfood) queryParts.push('dogfood=1');
  if (via) queryParts.push(`via=${encodeURIComponent(via)}`);

  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const pathname = collection === 'ontology' ? '/library/' : '/docs/';
  return `${pathname}${query}${normalizedHash ? `#${normalizedHash}` : ''}`;
}
