/**
 * Atlas product-decision routing policy.
 *
 * The router deliberately does not decide whether a product idea is good. It
 * decides how much independent judgment the idea needs before one accountable
 * owner decides. Keep the vocabulary small enough that a person can challenge
 * the classification in a review.
 */

export const PO_EVIDENCE_STATES = Object.freeze(['observed', 'inferred', 'unknown']);
export const PO_DOORS = Object.freeze(['two-way', 'one-way']);

export const PO_RISK_ROUTES = Object.freeze({
  meaning: Object.freeze({
    reviewer: 'po-steward',
    protects: 'durable meaning, evidence truth, local-first sovereignty, or human-agent authority',
  }),
  positioning: Object.freeze({
    reviewer: 'po-wedge',
    protects: 'category, product direction, first-contact claims, or one-shot reputation',
  }),
  scope: Object.freeze({
    reviewer: 'po-leverage',
    protects: 'a new or removed surface, expensive scope, or a difficult rollback boundary',
  }),
});

export const PO_SOLO_FIELDS = Object.freeze([
  'Prior decision',
  'Failure and moment',
  'Evidence state',
  'Atlas stake',
  'Local-first and human sovereignty',
  'Door',
  'Smallest proof',
  'Decision',
]);

export const PO_REVIEW_RECORD_FIELDS = Object.freeze([
  'Pre-review decision',
  'Evidence state',
  'Door',
  'Primary Atlas risk',
  'Confidence',
  'Accountable owner',
  'Decision',
  'Decision delta',
  'Review footprint',
  'Dissent and falsifier',
  'Revisit',
  'Outcome',
]);

const allowed = (values, value, label) => {
  if (!values.includes(value)) {
    throw new Error(`${label} must be one of ${values.join(', ')}; received ${String(value)}`);
  }
};

/**
 * @param {{
 *   mechanical?: boolean,
 *   door?: string,
 *   evidence?: string,
 *   primaryRisk?: string,
 *   sovereigntyAffected?: boolean,
 * }} input
 */
export function routePoDecision(input = {}) {
  const mechanical = input.mechanical === true;
  const sovereigntyAffected = input.sovereigntyAffected === true;

  if (mechanical) {
    if (sovereigntyAffected) {
      throw new Error('mechanical work cannot change local-first or human-sovereignty boundaries');
    }
    return Object.freeze({
      route: 'skip',
      record: false,
      reviewers: Object.freeze([]),
      nextAction: 'maintenance-checks',
      rebuttal: 'none',
    });
  }

  allowed(PO_DOORS, input.door, 'door');
  allowed(PO_EVIDENCE_STATES, input.evidence, 'evidence');

  let primaryRisk = input.primaryRisk ?? 'none';
  if (sovereigntyAffected) primaryRisk = 'meaning';

  const riskNames = ['none', ...Object.keys(PO_RISK_ROUTES)];
  allowed(riskNames, primaryRisk, 'primaryRisk');

  if (input.door === 'one-way' && primaryRisk === 'none') {
    throw new Error('one-way decisions require one primary Atlas risk');
  }

  if (input.door === 'two-way') {
    return Object.freeze({
      route: 'solo',
      record: false,
      reviewers: Object.freeze([]),
      nextAction: input.evidence === 'unknown' ? 'probe-first' : 'build-and-verify',
      rebuttal: 'none',
      primaryRisk,
    });
  }

  const specialist = PO_RISK_ROUTES[primaryRisk].reviewer;
  return Object.freeze({
    route: 'review',
    record: true,
    reviewers: Object.freeze(['po-evidence', specialist]),
    nextAction: input.evidence === 'observed' ? 'independent-review' : 'evidence-first-review',
    rebuttal: 'only-on-material-conflict',
    primaryRisk,
  });
}
