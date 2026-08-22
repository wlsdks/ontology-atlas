/**
 * The guide's **table of contents** — the single source of truth for order and slugs.
 *
 * **Why one array.** This list decides three things at once: ① the order shown in the sidebar ② the
 * static paths `generateStaticParams` produces ③ prev/next navigation. If three places held their own
 * list, adding a chapter would fix only two of them, and that defect surfaces as **a page that does not
 * exist appearing in the sidebar, or one that does not appear**.
 *
 * **Why the titles live here** rather than in the body's `# H1`. The sidebar has to render without
 * reading the bodies — parsing all six markdown files to pull the first heading means opening every
 * document just to draw one list. And these names are **translated**, so they could not come from the
 * vault files (Korean originals) anyway.
 *
 * ⚠️ So `titleKey` points into `gatewayNav.guidePages` in `messages/*.json`, and a contract test checks
 * that the list and the message keys have not drifted. Add a key and forget the translation and the key
 * name itself appears on screen.
 */
export interface GuidePage {
  /** The vault slug (`guide/…`) — where the body lives. */
  readonly slug: string;
  /** The URL segment — `/guide/<segment>`. Equal to the slug with `guide/` stripped. */
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

/**
 * The chapter `/guide` (with no segment) shows.
 *
 * It **draws the first chapter in place** rather than redirecting — `/guide` is a shared address, and a
 * redirect that changes the URL leaves whoever received the link unsure what they clicked. The sidebar
 * already says which chapter it is.
 */
export const GUIDE_ENTRY_PAGE = GUIDE_PAGES[0]!;

/**
 * The result of resolving a segment — it states **which chapter to draw** and **whether that chapter is
 * the one requested**.
 *
 * **Why not just return a `GuidePage`** (measured in a 2026-08-14 walkthrough). The old
 * `findGuidePage()` returned chapter 1 for an unknown segment **silently**. When a relative `.md` link
 * in a guide body resolved to `/guide/ONTOLOGY-ATLAS-SPEC.md`, the screen drew neither a 404 nor the
 * specification but **chapter 1 pretending to be that address** — a misdelivery is harder to notice
 * than a 404. Static export makes real 404 routing limited (only paths from `generateStaticParams`
 * exist), so the fallback stays but `matched` is returned alongside it **so the screen can say a
 * substitution happened**. The render-side consumer is `app/[locale]/guide/[segment]/page.tsx`, which
 * adds a notice banner when `matched` is false.
 */
export interface GuidePageResolution {
  /** The chapter actually drawn. The first chapter when the request does not exist. */
  readonly page: GuidePage;
  /** Whether the requested segment was a real chapter — when false, the screen must announce the substitution. */
  readonly matched: boolean;
}

export function resolveGuidePage(segment: string | undefined): GuidePageResolution {
  // For a segmentless `/guide`, "draw the first chapter in place" is the defined behaviour (see the
  // `GUIDE_ENTRY_PAGE` comment above) — it is not a substitution, so it is matched.
  if (!segment) return { page: GUIDE_ENTRY_PAGE, matched: true };
  const page = GUIDE_PAGES.find((candidate) => candidate.segment === segment);
  return page ? { page, matched: true } : { page: GUIDE_ENTRY_PAGE, matched: false };
}
