/**
 * GitHub's heading-anchor rule, for documents that are read in two places.
 *
 * A file under `docs/` is rendered twice: by GitHub, and by this app's docs
 * viewer. The viewer's own heading id (`slugFromChildren`) collapses runs of
 * whitespace and drops `_`; GitHub does neither. Measured across `docs/**.md`:
 * the two rules disagree on 1,650 of 3,324 headings, because an em dash
 * surrounded by spaces leaves two spaces and therefore two hyphens.
 *
 * So a link written `#the-library--three-kinds-of-file` works on GitHub and
 * nowhere else, and its collapsed twin works in the app and nowhere else. The
 * viewer resolves that by emitting this slug as a second anchor beside its own,
 * which costs one empty span per heading and keeps both links live.
 *
 * Every expectation in `github-anchor-slug.test.ts` was read off GitHub's
 * rendered `id=` attribute rather than derived from this code, and
 * `tests/contract/anchor-slug-parity.contract.test.ts` holds this function and
 * `headingAnchorSlug` in `scripts/lib/doc-links.mjs` — the link gate's copy — to
 * the same output. This is the app-side copy: they are separate module systems,
 * so parity is enforced rather than shared.
 */
export function githubAnchorSlug(heading: string): string {
  return heading
    .replace(/`/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/\s/g, "-");
}
