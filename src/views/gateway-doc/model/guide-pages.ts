/**
 * The guide's table of contents: the one source of order and slugs for the sidebar,
 * `generateStaticParams` and prev/next. Titles are `gatewayNav.guidePages` keys in `messages/*.json`,
 * so the sidebar needs no bodies; a contract test keeps list and keys in step.
 */
export interface GuidePage {
  readonly slug: string;
  readonly segment: string;
  readonly titleKey: string;
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  { slug: 'guide/what-is-atlas', segment: 'what-is-atlas', titleKey: 'whatIsAtlas' },
  { slug: 'guide/what-is-an-ontology', segment: 'what-is-an-ontology', titleKey: 'whatIsAnOntology' },
  { slug: 'guide/atlas-compared', segment: 'atlas-compared', titleKey: 'atlasCompared' },
  { slug: 'guide/first-five-minutes', segment: 'first-five-minutes', titleKey: 'firstFiveMinutes' },
  { slug: 'guide/connect-agent', segment: 'connect-agent', titleKey: 'connectAgent' },
  { slug: 'guide/from-your-repo', segment: 'from-your-repo', titleKey: 'fromYourRepo' },
  { slug: 'guide/reading-the-map', segment: 'reading-the-map', titleKey: 'readingTheMap' },
  { slug: 'guide/vault-structure', segment: 'vault-structure', titleKey: 'vaultStructure' },
  { slug: 'guide/what-becomes-a-node', segment: 'what-becomes-a-node', titleKey: 'whatBecomesANode' },
  { slug: 'guide/relations', segment: 'relations', titleKey: 'relations' },
  { slug: 'guide/studio', segment: 'studio', titleKey: 'studio' },
  { slug: 'guide/growing-vault', segment: 'growing-vault', titleKey: 'growingVault' },
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
 * `app/(gateway)/[locale]/guide/[segment]/page.tsx` shows a substitution banner instead of misdelivering.
 */
export interface GuidePageResolution {
  readonly page: GuidePage;
  readonly matched: boolean;
}

export function resolveGuidePage(segment: string | undefined): GuidePageResolution {
  // A segmentless `/guide` drawing the first chapter is defined behaviour, not a substitution.
  if (!segment) return { page: GUIDE_ENTRY_PAGE, matched: true };
  const page = GUIDE_PAGES.find((candidate) => candidate.segment === segment);
  return page ? { page, matched: true } : { page: GUIDE_ENTRY_PAGE, matched: false };
}
