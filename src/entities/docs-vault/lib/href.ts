interface DocsVaultHrefInput {
  slug?: string | null;
  accountId?: string | null;
  hash?: string | null;
}

export function buildDocsVaultHref({
  slug,
  accountId,
  hash,
}: DocsVaultHrefInput = {}): string {
  const params = new URLSearchParams();
  const normalizedAccountId = accountId?.trim();
  const normalizedSlug = slug?.trim();
  const normalizedHash = hash?.trim().replace(/^#/, '');

  if (normalizedAccountId) params.set('account', normalizedAccountId);
  if (normalizedSlug) params.set('slug', normalizedSlug);

  const query = params.toString();
  return `/docs/${query ? `?${query}` : ''}${
    normalizedHash ? `#${normalizedHash}` : ''
  }`;
}
