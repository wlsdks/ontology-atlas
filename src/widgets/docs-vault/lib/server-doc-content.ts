function encodeSlugPath(slug: string): string {
  return slug
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function buildDocsVaultAssetCandidates(
  slug: string,
  locationHref?: string,
): string[] {
  const assetPath = `docs-vault/${encodeSlugPath(slug)}.md`;
  const candidates = [`/${assetPath}`];

  if (locationHref) {
    try {
      const base = new URL(locationHref);
      candidates.push(new URL(`/${assetPath}`, base).href);
      candidates.push(new URL(`./${assetPath}`, base).href);
      candidates.push(new URL(`../${assetPath}`, base).href);
      candidates.push(new URL(`../../${assetPath}`, base).href);
      candidates.push(new URL(`../../../${assetPath}`, base).href);
    } catch {
      candidates.push(assetPath);
    }
  } else {
    candidates.push(assetPath);
  }

  return [...new Set(candidates)];
}

export async function fetchServerDocContent(
  slug: string,
  options: {
    bundledContent?: Record<string, string>;
    locationHref?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const bundled = options.bundledContent?.[slug];
  if (typeof bundled === 'string') return bundled;

  const fetchImpl = options.fetchImpl ?? fetch;
  const candidates = buildDocsVaultAssetCandidates(slug, options.locationHref);
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetchImpl(candidate, { cache: 'no-cache' });
      if (response.ok) return response.text();
      failures.push(`${candidate}: HTTP ${response.status}`);
    } catch (err) {
      failures.push(
        `${candidate}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new Error(failures.join(' | '));
}
