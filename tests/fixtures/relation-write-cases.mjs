/**
 * One relation written two ways from the same source document: by hand on the map
 * (`buildOntologyRelationEditPlan`) and by `add_relation` over MCP. Both must leave the same
 * frontmatter; `tests/contract/analysis/relation-write.contract.test.ts` runs every row through both.
 */

const BILLING = { slug: 'domains/billing', kind: 'domain', frontmatter: ['title: Billing', 'capabilities: [capabilities/refunds]'] };
const INVOICES = { slug: 'capabilities/invoices', kind: 'capability', frontmatter: ['title: Invoices', 'domain: domains/billing', 'elements: []'] };
const LEDGER = { slug: 'elements/ledger', kind: 'element', frontmatter: ['title: Ledger', 'domain: domains/billing'] };

const refunds = (...extra) => ({
  slug: 'capabilities/refunds',
  kind: 'capability',
  frontmatter: ['title: Refunds', 'domain: domains/billing', 'elements: []', ...extra],
});

export const RELATION_WRITE_CASES = [
  {
    name: 'a dependency with its reason',
    source: refunds(),
    target: INVOICES,
    hand: 'dependsOn',
    mcp: 'depends_on',
    why: 'A refund reverses an issued invoice.',
    others: [BILLING],
  },
  {
    name: 'a dependency joins a sorted list',
    source: refunds('dependencies: [capabilities/zebra]'),
    target: INVOICES,
    hand: 'dependsOn',
    mcp: 'depends_on',
    why: 'A refund reverses an issued invoice.',
    others: [BILLING, { slug: 'capabilities/zebra', kind: 'capability', frontmatter: ['title: Zebra', 'domain: domains/billing', 'elements: []'] }],
  },
  {
    name: 'a dependency folds the alias spelling into one key',
    source: refunds('depends_on: [elements/ledger]'),
    target: INVOICES,
    hand: 'dependsOn',
    mcp: 'depends_on',
    why: 'A refund reverses an issued invoice.',
    others: [BILLING, LEDGER],
  },
  {
    name: 'a plain relation without a reason',
    source: refunds(),
    target: INVOICES,
    hand: 'relates',
    mcp: 'relates',
    why: '',
    others: [BILLING],
  },
  {
    name: 'a capability holding an element is stored under elements',
    source: refunds(),
    target: LEDGER,
    hand: 'contains',
    mcp: 'contains',
    why: '',
    others: [BILLING],
  },
  {
    name: 'a domain holding a capability is stored under capabilities',
    source: { slug: 'domains/billing', kind: 'domain', frontmatter: ['title: Billing', 'capabilities: [capabilities/refunds]'] },
    target: INVOICES,
    hand: 'contains',
    mcp: 'contains',
    why: '',
    others: [refunds()],
  },
];
