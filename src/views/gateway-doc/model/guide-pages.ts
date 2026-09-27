/**
 * The guide's table of contents, the single source of order and slugs for the sidebar,
 * `generateStaticParams` and prev/next. Titles are translated message keys
 * (`gatewayNav.guidePages` in `messages/*.json`), so the sidebar renders without reading bodies; a
 * contract test keeps the list and the keys in step.
 */
export interface GuidePage {
  /** The vault slug (`guide/…`) — where the body lives. */
  readonly slug: string;
  /** The URL segment, `/guide/<segment>`: the slug without `guide/`. */
  readonly segment: string;
  /** The `gatewayNav.guidePages.<key>` message key. */
  readonly titleKey: string;
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  { slug: 'guide/what-is-atlas', segment: 'what-is-atlas', titleKey: 'whatIsAtlas' },
  { slug: 'guide/first-five-minutes', segment: 'first-five-minutes', titleKey: 'firstFiveMinutes' },
  { slug: 'guide/reading-the-map', segment: 'reading-the-map', titleKey: 'readingTheMap' },
  { slug: 'guide/vault-structure', segment: 'vault-structure', titleKey: 'vaultStructure' },
  { slug: 'guide/what-becomes-a-node', segment: 'what-becomes-a-node', titleKey: 'whatBecomesANode' },
  { slug: 'guide/relations', segment: 'relations', titleKey: 'relations' },
  { slug: 'guide/studio', segment: 'studio', titleKey: 'studio' },
  { slug: 'guide/from-your-repo', segment: 'from-your-repo', titleKey: 'fromYourRepo' },
  { slug: 'guide/connect-agent', segment: 'connect-agent', titleKey: 'connectAgent' },
  { slug: 'guide/growing-vault', segment: 'growing-vault', titleKey: 'growingVault' },
  { slug: 'guide/insights', segment: 'insights', titleKey: 'insights' },
  { slug: 'guide/cli', segment: 'cli', titleKey: 'cli' },
  { slug: 'guide/trust', segment: 'trust', titleKey: 'trust' },
] as const;

/** `/guide` draws the first chapter in place rather than redirecting, so a shared address stays what was sent. */
export const GUIDE_ENTRY_PAGE = GUIDE_PAGES[0]!;

/** Chapter one renders at `/guide/` and its segment route; the shared entry route is its one canonical address. */
export function guideCanonicalPath(page: GuidePage): string {
  return page.segment === GUIDE_ENTRY_PAGE.segment ? 'guide' : `guide/${page.segment}`;
}

/**
 * Which chapter to draw and whether it is the one requested. Static export cannot route real 404s,
 * so an unknown segment falls back to chapter one with `matched: false`, and
 * `app/[locale]/guide/[segment]/page.tsx` shows a substitution banner instead of misdelivering.
 */
export interface GuidePageResolution {
  /** The chapter actually drawn. The first chapter when the request does not exist. */
  readonly page: GuidePage;
  /** Whether the requested segment was a real chapter; when false the screen must announce the substitution. */
  readonly matched: boolean;
}

export function resolveGuidePage(segment: string | undefined): GuidePageResolution {
  // A segmentless `/guide` drawing the first chapter is defined behaviour, not a substitution.
  if (!segment) return { page: GUIDE_ENTRY_PAGE, matched: true };
  const page = GUIDE_PAGES.find((candidate) => candidate.segment === segment);
  return page ? { page, matched: true } : { page: GUIDE_ENTRY_PAGE, matched: false };
}
