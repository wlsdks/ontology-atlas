/**
 * One wiki folder, as bytes, plus the exact findings it must produce.
 *
 * This plants the four codes the real fixture at
 * `/Users/jinan/scratch/atlas-library-fixture-20260911/vault` fires, and it lives here
 * rather than there because a contract test may not depend on somebody's scratch
 * directory. `wiki-validate` measured that folder on 2026-09-12 as 6 pages, 0/6 fit, 9
 * findings over 4 codes — `uncited-fact`, `citation-target-missing`, `orphan-page`,
 * `shared-source-unlinked` — which is the same four, one per reason a check can fire: a
 * page's own bullet, a page's own citation, a fact about the folder, and a fact about a
 * pair of pages.
 *
 * The expected set below is stated **whole**, so the contract fails closed. A surface that
 * silently drops an advisory row would pass a subset assertion, which is exactly the hole
 * both PO seats found in the slice's hand-written proof list on 2026-09-12.
 *
 * `docs/DECISIONS.md` 2026-09-11 makes the agreement load-bearing: *"a structural finding
 * differs between the app's report and `wiki-validate`"* is that record's falsifier.
 *
 * ## The link topology is deliberate
 *
 * `orphan-page` is true of every page nobody points at, so the links decide how many
 * orphans the folder has, and a fixture that forgot them would report four orphans and
 * teach nothing. Here: merchant ← refund, refund ← merchant and settlement,
 * settlement ← refund, and **settlement-ko ← nobody**. One orphan, on purpose.
 * `settlement` and `settlement-ko` are two write-ups of one document that do not link
 * each other, which is the pair `shared-source-unlinked` exists to name.
 */

const HASH = 'a'.repeat(64);

/** Frontmatter in the order the template writes it, with every required field. */
function frontmatter(title, sources) {
  return `---
title: ${title}
created_by: agent:claude
compiled_at: 2026-09-11T04:00:00Z
sources:
${sources.map((path) => `  - ${path}`).join('\n')}
source_hash:
${sources.map((path) => `  ${path}: ${HASH}`).join('\n')}
status: draft
summary: One sentence about ${title}.
---
`;
}

/**
 * The five sections in order. Every citation names the page's **own** first source, so the
 * only `citation-target-missing` in the folder is the one deliberately planted.
 */
function body({ facts, cite, links = [] }) {
  const linkLine = links.length > 0 ? `\n\nSee ${links.map((slug) => `[[wiki/${slug}]]`).join(' and ')}.` : '';
  return `
## Summary

What a reader needs before the facts.${linkLine}

## Facts

${facts}

## Decisions

- A decision the source records. [[src:${cite}#p4]]

## Open questions

- Something the source raises but does not settle.

## Not in sources

- Nothing.
`;
}

/** Every page in the folder, `path` vault-relative exactly as every surface names it. */
export const WIKI_REPORT_FOLDER = Object.freeze([
  // Two bullets under `## Facts` with no citation: this page's own bytes are wrong, so it
  // is off-template, and each finding carries the line a person has to open.
  Object.freeze({
    path: 'wiki/merchant-onboarding.md',
    raw:
      frontmatter('Merchant Onboarding', ['sources/merchant-onboarding.html']) +
      body({
        facts: '- Onboarding closes in three days.\n- Two reviewers sign off.',
        cite: 'sources/merchant-onboarding.html',
        links: ['refund-timing'],
      }),
  }),
  // A citation naming a file that is not in the folder: checkable by nobody.
  Object.freeze({
    path: 'wiki/refund-timing.md',
    raw:
      frontmatter('Refund Timing', ['sources/refund-policy-2025.md']) +
      body({
        facts: '- Refunds settle in five days. [[src:sources/refund-policy-2025.md#p2]]',
        cite: 'sources/refund-policy-2025.md',
        links: ['merchant-onboarding', 'settlement'],
      }),
  }),
  // Two write-ups of one document that do not link each other, disagreeing about T+2 and
  // T+3 — which is the disagreement only an agent can judge, and which neither page can
  // carry while they do not know about each other.
  Object.freeze({
    path: 'wiki/settlement.md',
    raw:
      frontmatter('Settlement', ['sources/settlement-policy.md']) +
      body({
        facts: '- Settlement runs on T+2. [[src:sources/settlement-policy.md#p3]]',
        cite: 'sources/settlement-policy.md',
        links: ['refund-timing'],
      }),
  }),
  Object.freeze({
    path: 'wiki/settlement-ko.md',
    raw:
      frontmatter('Settlement schedule and fees', ['sources/settlement-policy.md']) +
      body({
        facts: '- Settlement runs on T+3. [[src:sources/settlement-policy.md#p3]]',
        cite: 'sources/settlement-policy.md',
      }),
  }),
]);

/** The raw sources that exist on disk, so a citation naming one of them is not reported. */
export const WIKI_REPORT_SOURCES = Object.freeze([
  'sources/merchant-onboarding.html',
  'sources/settlement-policy.md',
]);

/** Every finding the folder must produce, as `<code>\t<page>`, sorted. */
export const WIKI_REPORT_EXPECTED = Object.freeze(
  [
    'citation-target-missing\twiki/refund-timing.md',
    'orphan-page\twiki/settlement-ko.md',
    'shared-source-unlinked\twiki/settlement-ko.md',
    'shared-source-unlinked\twiki/settlement.md',
    'uncited-fact\twiki/merchant-onboarding.md',
    'uncited-fact\twiki/merchant-onboarding.md',
  ].sort(),
);

/**
 * The groups the aggregator must build, in the order it must build them: blocking kinds
 * alphabetically, then advisory kinds alphabetically.
 */
export const WIKI_REPORT_EXPECTED_GROUPS = Object.freeze([
  Object.freeze({ code: 'citation-target-missing', advisory: false, count: 1, pages: ['wiki/refund-timing.md'] }),
  Object.freeze({ code: 'uncited-fact', advisory: false, count: 2, pages: ['wiki/merchant-onboarding.md'] }),
  Object.freeze({ code: 'orphan-page', advisory: true, count: 1, pages: ['wiki/settlement-ko.md'] }),
  Object.freeze({
    code: 'shared-source-unlinked',
    advisory: true,
    count: 2,
    pages: ['wiki/settlement-ko.md', 'wiki/settlement.md'],
  }),
]);

/**
 * **Two true totals for one folder, which is why each must say what it counts.**
 *
 * `blockingPageCount` is pages whose own bytes are wrong — merchant-onboarding and
 * refund-timing. `fitPageCount` is pages with no finding at all, and it is 0, because the
 * other two carry advisory folder findings. `wiki-validate` prints the second as
 * `0/4 pages fit`; the Library's footer says the first. Both were always correct, and a
 * screen showing them as two bare numbers is what the licensing record's falsifier
 * describes.
 */
export const WIKI_REPORT_EXPECTED_BLOCKING_PAGES = 2;
export const WIKI_REPORT_EXPECTED_FIT_PAGES = 0;
