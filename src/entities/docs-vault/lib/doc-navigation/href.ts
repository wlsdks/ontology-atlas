interface DocsVaultHrefInput {
  slug?: string | null;
  collection?: 'ontology';
  hash?: string | null;
  dogfood?: boolean;
  via?: string | null;
}

export function buildDocsVaultHref({
  slug,
  collection,
  hash,
  dogfood,
  via,
}: DocsVaultHrefInput = {}): string {
  const normalizedSlug = slug?.trim();
  const normalizedHash = hash?.trim().replace(/^#/, '');
  const queryParts: string[] = [];

  if (collection === 'ontology') queryParts.push('tab=ontology');
  if (normalizedSlug) queryParts.push(`slug=${encodeURIComponent(normalizedSlug)}`);
  if (dogfood) queryParts.push('dogfood=1');
  if (via) queryParts.push(`via=${encodeURIComponent(via)}`);

  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const pathname = collection === 'ontology' ? '/library/' : '/docs/';
  return `${pathname}${query}${normalizedHash ? `#${normalizedHash}` : ''}`;
}
