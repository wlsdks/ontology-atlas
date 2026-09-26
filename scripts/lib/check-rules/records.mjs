/** Immutable records and ledgers: backlog, lessons, decisions, changelog, and the development-checks reference. */

export const rules = [
  {
    order: 10,
    command: 'pnpm test:backlog && pnpm backlog:check',
    reason: 'independent backlog records, their writer, or current-state composition changed',
    matches: [/^scripts\/backlog(?:\.test)?\.mjs$/, /^docs\/records\/backlog\//, /^docs\/BACKLOG(?:-SNAPSHOT-[^/]+)?\.md$/],
  },
  {
    order: 20,
    command: 'pnpm test:lessons && pnpm lessons:check',
    reason: 'harness lessons, their writer, or verdict composition changed',
    matches: [/^scripts\/(?:lessons|new-record)(?:\.test)?\.mjs$/, /^docs\/records\/lessons\//],
  },
  {
    order: 150,
    command: 'pnpm test:records',
    reason: 'immutable record composition or writers changed',
    matches: [/^scripts\/(?:lib\/(?:record-ledgers|po-pilot-records)|new-record|po-record)(?:\.test)?\.mjs$/, /^docs\/records\//],
  },
  {
    order: 540,
    // The finder is the only retrieval the ledger has; its parser is pinned
    // against the live label census, so its own edits re-run that pin.
    command: 'pnpm test:decisions',
    reason: 'the decision-ledger finder, its record template, or the gate that applies them changed',
    matches: [
      /^scripts\/decisions-find(?:\.test)?\.mjs$/,
      /^scripts\/lib\/decision-record-template(?:\.test)?\.mjs$/,
      /^scripts\/check-decision-record\.mjs$/,
    ],
  },
  {
    order: 550,
    command: 'pnpm changelog:check',
    reason: 'a changelog entry was added or edited; it must fit the entry template',
    matches: [/^docs\/CHANGELOG\.md$/, /^docs\/records\/(?:changes|releases)\//],
  },
  {
    order: 560,
    command: 'pnpm dev-checks:check',
    reason: 'the development-checks reference or the README command table changed; entries must fit the template, name real scripts and stay in key order',
    matches: [/^docs\/DEVELOPMENT-CHECKS\.md$/, /^README\.md$/],
  },
  {
    order: 570,
    command: 'pnpm test:dev-checks',
    reason: 'the development-checks entry template or its gate changed',
    matches: [/^scripts\/lib\/dev-checks-template(?:\.test)?\.mjs$/, /^scripts\/check-dev-checks\.mjs$/],
  },
  {
    order: 580,
    command: 'pnpm test:changelog',
    reason: 'the changelog entry template or its gate changed',
    matches: [/^scripts\/lib\/changelog-entry-template(?:\.test)?\.mjs$/, /^scripts\/check-changelog\.mjs$/],
  },
  {
    order: 1040,
    command: 'pnpm decisions:check',
    reason: 'a route or design-spec surface moved, or a record was appended: the ledger must move with the surface and a new record must fit the template',
    matches: [/^app\/(?:.+\/)?(?:page|not-found)\.tsx$/, /^docs\/DECISIONS\.md$/],
  },
];
