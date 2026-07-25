interface DocsVaultHrefInput {
  slug?: string | null;
  hash?: string | null;
  intent?: 'local' | null;
  dogfood?: boolean;
  /** 인사이트 검토 복귀 문맥. 유효한 via 마커와 exact row id만 전달한다. */
  via?: string | null;
  reviewId?: string | null;
}

/**
 * `/docs/?slug=...#section` 형식의 vault href 빌더.
 *
 * single-user OSS — slug / hash 만 인자. 빈 입력이면 `/docs/` 만, slug
 * 만 있으면 `/docs/?slug=...`, hash 까지 있으면 fragment 도 append.
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
