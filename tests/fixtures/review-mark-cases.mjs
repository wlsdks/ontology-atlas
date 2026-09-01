/**
 * One table, two implementations — the R11 contract pattern.
 *
 * `reviewDigest` decides when a person's approval stops describing its node. The
 * MCP server checks it and the app writes it, and those live in packages with no
 * shared module, so the only thing keeping "unchanged" from meaning two
 * different things is this table.
 *
 * Each case states what changed relative to `base` and whether that change is
 * supposed to expire an approval. The reasons are the argument; if a case looks
 * wrong, the design is wrong, not the fixture.
 */

export const REVIEW_DIGEST_BASE = Object.freeze({
  frontmatter: {
    uid: '44444444-4444-4444-8444-444444444444',
    slug: 'capabilities/bound',
    kind: 'capability',
    title: 'Bound',
    domain: 'domains/example',
    elements: ['elements/one'],
  },
  body: 'The meaning a person read and accepted.',
});

export const REVIEW_DIGEST_CASES = Object.freeze([
  {
    name: 'identical content keeps the same digest',
    frontmatter: {},
    body: undefined,
    sameAsBase: true,
    why: 'Re-reading a file nobody touched must not expire the approval on it.',
  },
  {
    name: 'a rewritten body expires the approval',
    frontmatter: {},
    body: 'Something later replaced the prose.',
    sameAsBase: false,
    why: 'The body is the meaning a person judged. This is the drift observed in the 2026-09-02 probe.',
  },
  {
    name: 'a moved domain expires the approval',
    frontmatter: { domain: 'domains/elsewhere' },
    body: undefined,
    sameAsBase: false,
    why: 'Where a capability belongs is meaning, not bookkeeping — a person approved it under the old parent.',
  },
  {
    name: 'a changed relation array expires the approval',
    frontmatter: { elements: ['elements/one', 'elements/two'] },
    body: undefined,
    sameAsBase: false,
    why: 'Relations carry as much meaning as prose; an approval that survives them approves a different node.',
  },
  {
    name: 'a retitled node expires the approval',
    frontmatter: { title: 'Bound, renamed' },
    body: undefined,
    sameAsBase: false,
    why: 'The canonical name is what search and every agent answer says this node is.',
  },
  {
    name: 'adding a localized display name keeps the approval',
    frontmatter: { display_ko: '경계' },
    body: undefined,
    sameAsBase: true,
    why: 'A translation of a name is not a new claim. Expiring on it would void every approval in a vault the first time someone localized it.',
  },
  {
    name: 'the review keys themselves stay outside the digest',
    frontmatter: { review_state: 'confirmed', reviewed_by: 'jinan', reviewed_at: '2026-09-02' },
    body: undefined,
    sameAsBase: true,
    why: 'Recording the approval would otherwise change the thing the approval is bound to — the binding has to be computable before it is written.',
  },
  {
    name: 'trailing whitespace in the body is not a change',
    frontmatter: {},
    body: '  The meaning a person read and accepted.\n\n  ',
    sameAsBase: true,
    why: 'An editor adding a newline on save is not a person changing what the node claims.',
  },
]);
