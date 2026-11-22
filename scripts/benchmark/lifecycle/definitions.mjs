// What the lifecycle benchmark asks and what counts as a good answer: the
// answer schema, the paired subjects, their tasks and the run plan.

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'evidence', 'nextAction', 'unknowns'],
  properties: {
    answer: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    nextAction: { type: 'string' },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
};

// Required evidence is sorted by who could have written it. `vocabulary` items (Atlas concept
// names such as `capabilities/checkout`) exist only in the prepared vault, so a gap there shows
// a lookup, not a better answer; `path` and `phrase` items are comparable across sides.
// The sorting is derived here and proved in `validateDefinitions`.
const VAULT_KINDS = Object.freeze(['projects', 'domains', 'capabilities', 'elements']);

export function classifyEvidence(token) {
  if (VAULT_KINDS.some((kind) => token.startsWith(`${kind}/`))) return 'vocabulary';
  return token.includes('/') ? 'path' : 'phrase';
}

export const TASKS = Object.freeze({
  greenfield: Object.freeze([
    Object.freeze({
      id: 'G1',
      axis: 'orientation',
      prompt:
        'A teammate wants to add a discount rule. Which existing responsibility should own the change, which capabilities does it touch, what implementation paths should be read first, and what remains unknown? Give a bounded answer; do not invent behavior.',
      required: [
        'domains/purchase',
        'capabilities/checkout',
        'capabilities/inventory-sync',
        'src/features/checkout/index.ts',
      ],
      requiredAny: ['unknown', 'not proven', 'not measured', 'unmeasured', 'cannot prove'],
      forbidden: [],
    }),
    Object.freeze({
      id: 'G2',
      axis: 'boundary',
      prompt:
        'A receiving agent proposes moving inventory reconciliation into checkout. According to the recorded project meaning, should it? State the boundary, the recorded relationship and its reason, and the next verification path.',
      required: [
        'capabilities/checkout',
        'capabilities/inventory-sync',
        'src/features/inventory-sync/index.ts',
        'excludes',
      ],
      requiredAny: ['because', 'reason', 'depends', 'boundary'],
      forbidden: [],
    }),
  ]),
  brownfield: Object.freeze([
    Object.freeze({
      id: 'B1',
      axis: 'impact',
      prompt:
        'If acknowledgement state changes, which domain and capabilities are involved, which source paths should be read first, and which part remains a recorded product dependency rather than proven runtime impact?',
      required: [
        'domains/coordination',
        'capabilities/decision-broadcast',
        'capabilities/acknowledgement-tracking',
        'apps/web',
        'packages/realtime',
      ],
      requiredAny: ['not proven', 'not measured', 'unknown', 'recorded', 'bounded'],
      forbidden: [],
    }),
    Object.freeze({
      id: 'B2',
      axis: 'handoff',
      prompt:
        'An engineer asks to put permission evaluation in coordination. Based on the recorded ontology, where does it belong, what is explicitly outside coordination, and what should the receiving agent verify next?',
      required: [
        'domains/access-control',
        'capabilities/workspace-authorization',
        'domains/coordination',
        'capabilities/decision-broadcast',
        'packages/policy',
        'excludes',
      ],
      requiredAny: ['verify', 'verification', 'next', 'unknown'],
      forbidden: [],
    }),
  ]),
});

export const CASES = Object.freeze([
  Object.freeze({
    id: 'greenfield',
    label: 'small feature-sliced project',
    fixture: 'commerce-fsd',
    projectSlug: 'projects/northstar-commerce',
    nodes: Object.freeze([
      node({
        slug: 'projects/northstar-commerce',
        kind: 'project',
        title: 'Northstar Commerce',
        frontmatter: { domains: ['domains/inventory', 'domains/purchase'], path: '.' },
        body: `# Northstar Commerce\n\n## Definition\nA commerce workspace that keeps purchase completion and sellable inventory consistent.\n\nThis record preserves the cross-file responsibility map that the source does not express as one artifact.\n\n## Uncertainty\nThe fixture names implementation entrypoints but does not measure runtime behavior.`,
      }),
      node({
        slug: 'domains/purchase',
        kind: 'domain',
        title: 'Purchase',
        frontmatter: { capabilities: ['capabilities/checkout'] },
        body: '## Definition\nThe responsibility boundary for turning a reviewed cart into a confirmed order.\n\n## Includes\nPurchase owns order confirmation.\n\n## Excludes\nInventory owns sellable stock.',
      }),
      node({
        slug: 'domains/inventory',
        kind: 'domain',
        title: 'Inventory',
        frontmatter: { capabilities: ['capabilities/inventory-sync'] },
        body: '## Definition\nThe responsibility boundary for maintaining trustworthy sellable stock.\n\n## Includes\nInventory owns reconciliation across storefront and warehouse.\n\n## Excludes\nPurchase consumes availability before confirmation.',
      }),
      node({
        slug: 'capabilities/checkout',
        kind: 'capability',
        title: 'Checkout',
        frontmatter: {
          domain: 'domains/purchase',
          path: 'src/features/checkout/index.ts',
          elements: ['elements/checkout-entry'],
          dependencies: ['capabilities/inventory-sync'],
          relation_notes: {
            'capabilities/inventory-sync': 'Checkout depends on trustworthy sellable availability before it confirms a purchase.',
          },
        },
        body: '## Definition\nAuthorize a purchase and produce an order confirmation.\n\n## Includes\n- Includes turning a reviewed cart into a confirmed order.\n\n## Excludes\n- Excludes inventory reconciliation itself and interface preference changes.',
      }),
      node({
        slug: 'capabilities/inventory-sync',
        kind: 'capability',
        title: 'Inventory Sync',
        frontmatter: {
          domain: 'domains/inventory',
          path: 'src/features/inventory-sync/index.ts',
          elements: ['elements/inventory-sync-entry'],
        },
        body: '## Definition\nReconcile storefront availability with warehouse stock.\n\n## Includes\n- Includes sellable stock reconciliation.\n\n## Excludes\n- Excludes purchase confirmation.',
      }),
      node({
        slug: 'elements/checkout-entry',
        kind: 'element',
        title: 'Checkout entrypoint',
        frontmatter: { domain: 'domains/purchase', path: 'src/features/checkout/index.ts' },
        body: 'The implementation entrypoint named by the reviewed checkout capability.',
      }),
      node({
        slug: 'elements/inventory-sync-entry',
        kind: 'element',
        title: 'Inventory sync entrypoint',
        frontmatter: { domain: 'domains/inventory', path: 'src/features/inventory-sync/index.ts' },
        body: 'The implementation entrypoint named by the reviewed inventory capability.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'brownfield',
    label: 'multi-package collaboration project',
    fixture: 'collaboration-monorepo',
    projectSlug: 'projects/relay-collaboration',
    nodes: Object.freeze([
      node({
        slug: 'projects/relay-collaboration',
        kind: 'project',
        title: 'Relay Collaboration',
        frontmatter: { domains: ['domains/access-control', 'domains/coordination'], path: '.' },
        body: '# Relay Collaboration\n\n## Definition\nA shared operational picture for teams responding to an incident.\n\nThis project record connects responsibilities spread across packages; package names alone are not product capabilities.\n\n## Uncertainty\nThe package map is source evidence. Runtime and transitive impact remain unmeasured by this static benchmark.',
      }),
      node({
        slug: 'domains/coordination',
        kind: 'domain',
        title: 'Coordination',
        frontmatter: { capabilities: ['capabilities/acknowledgement-tracking', 'capabilities/decision-broadcast'] },
        body: '## Definition\nThe responsibility boundary for publishing and acknowledging incident decisions.\n\n## Includes\nCoordination owns decision state.\n\n## Excludes\nMember authority belongs to access control.',
      }),
      node({
        slug: 'domains/access-control',
        kind: 'domain',
        title: 'Access Control',
        frontmatter: { capabilities: ['capabilities/workspace-authorization'] },
        body: '## Definition\nThe responsibility boundary for incident workspace authority.\n\n## Includes\nAccess control owns permission evaluation.\n\n## Excludes\nIt does not own incident decision content.',
      }),
      node({
        slug: 'capabilities/decision-broadcast',
        kind: 'capability',
        title: 'Decision Broadcast',
        frontmatter: {
          domain: 'domains/coordination',
          path: 'packages/realtime',
          elements: ['elements/realtime-package'],
          dependencies: ['capabilities/acknowledgement-tracking'],
          relation_notes: {
            'capabilities/acknowledgement-tracking': 'Acknowledgement state is meaningful only after a decision has been published to responders.',
          },
        },
        body: '## Definition\nPublish an operational decision and distribute it to active responders.\n\n## Includes\n- Includes decision publication and distribution.\n\n## Excludes\n- Excludes workspace permission evaluation and member authority.\n\n## Uncertainty\nThe recorded dependency states a product relationship. It does not establish a complete runtime blast radius.',
      }),
      node({
        slug: 'capabilities/acknowledgement-tracking',
        kind: 'capability',
        title: 'Acknowledgement Tracking',
        frontmatter: {
          domain: 'domains/coordination',
          path: 'apps/web',
          elements: ['elements/web-console'],
          dependencies: ['capabilities/workspace-authorization'],
          relation_notes: {
            'capabilities/workspace-authorization': 'The receiving console must respect workspace authority while it shows acknowledgement state.',
          },
        },
        body: '## Definition\nShow which responders have acknowledged a decision.\n\n## Includes\n- Includes acknowledgement state in the incident workspace.\n\n## Excludes\n- Excludes evaluating who may read or administer the workspace.',
      }),
      node({
        slug: 'capabilities/workspace-authorization',
        kind: 'capability',
        title: 'Workspace Authorization',
        frontmatter: {
          domain: 'domains/access-control',
          path: 'packages/policy',
          elements: ['elements/policy-package'],
        },
        body: '## Definition\nEvaluate whether a member may read, coordinate, or administer an incident.\n\n## Includes\n- Includes workspace permission decisions.\n\n## Excludes\n- Excludes publishing or acknowledging incident decisions.',
      }),
      node({
        slug: 'elements/realtime-package',
        kind: 'element',
        title: 'Realtime package',
        frontmatter: { domain: 'domains/coordination', path: 'packages/realtime' },
        body: 'The package path used as source evidence for decision distribution.',
      }),
      node({
        slug: 'elements/web-console',
        kind: 'element',
        title: 'Web console',
        frontmatter: { domain: 'domains/coordination', path: 'apps/web' },
        body: 'The application path used as source evidence for acknowledgement display.',
      }),
      node({
        slug: 'elements/policy-package',
        kind: 'element',
        title: 'Policy package',
        frontmatter: { domain: 'domains/access-control', path: 'packages/policy' },
        body: 'The package path used as source evidence for workspace authorization.',
      }),
    ]),
  }),
]);

export const MODES = Object.freeze(['off', 'on']);

function node({ slug, kind, title, frontmatter = {}, body }) {
  return Object.freeze({ slug, kind, title, frontmatter: Object.freeze(frontmatter), body });
}

export function benchmarkPlan({ cases = CASES, modes = MODES, repeat = 1 } = {}) {
  return cases.flatMap((caseDefinition) => TASKS[caseDefinition.id].flatMap((task) => (
    modes.flatMap((mode) => Array.from({ length: repeat }, (_, index) => ({
      caseDefinition,
      caseId: caseDefinition.id,
      mode,
      task,
      iteration: index + 1,
    })))
  )));
}
