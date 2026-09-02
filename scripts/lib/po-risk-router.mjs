/**
 * Atlas product-decision routing policy.
 *
 * The caller supplies inspectable facts about the change. The policy derives
 * reversibility and the primary risk; accepting those verdicts from the builder
 * would let the same real change self-route to skip, solo, or review.
 */

import { FIELDS } from './decision-record-template.mjs';

const PO_POLICY_VERSION = 3;

export const PO_EVIDENCE_STATES = Object.freeze(['observed', 'inferred', 'unknown']);

export const PO_OUTCOMES = Object.freeze({
  orient: 'a person can find the right product or implementation starting point',
  explain: 'a person can explain what exists and why it has that shape',
  judge: 'a person can judge evidence, uncertainty, and likely impact',
  correct: 'a person can inspect, reject, or correct agent-authored meaning',
  handoff: 'the next person or agent can reuse accepted meaning and its verification path',
});

export const PO_BOUNDARY_SIGNALS = Object.freeze({
  truth: 'the location or status of canonical truth changes',
  transfer: 'information newly leaves the machine or crosses a trust boundary',
  'agent-write': 'what an agent may write or approve changes',
  'human-correction': "a person's ability to inspect, reject, or correct changes",
});

export const PO_BOUNDARY_STATES = Object.freeze(['unchanged', 'affected', 'unknown']);

export const PO_CHANGE_SIGNALS = Object.freeze({
  'rollback-cheap': Object.freeze({
    door: 'two-way',
    risk: 'none',
    reason: 'the internal change is cheap to undo and carries no one-way signal',
  }),
  'public-contract': Object.freeze({
    door: 'one-way',
    risk: 'meaning',
    reason: 'a public MCP, CLI, vault, or source-of-truth contract changes',
  }),
  positioning: Object.freeze({
    door: 'one-way',
    risk: 'positioning',
    reason: 'product direction, category, first-contact words, launch claims, or reputation changes',
  }),
  'surface-inventory': Object.freeze({
    door: 'one-way',
    risk: 'scope',
    reason: 'a user-facing surface is added or removed',
  }),
  'substantial-investment': Object.freeze({
    door: 'one-way',
    risk: 'scope',
    reason: 'the slice is expensive or difficult to unwind',
  }),
});

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
  'Human loss and moment',
  'Atlas outcome',
  'Evidence state',
  'Change signals',
  'Computed route',
  'Recovery proof',
  'Decision',
]);

// The ledger record is the six-field template `pnpm decisions:check` enforces
// on every record; route, evidence state, footprint, and delta are typed per
// run in docs/PO-PILOT.md instead of repeated here. One source, so the council
// skill, the operating system, and the gate cannot drift apart.
export const PO_REVIEW_RECORD_FIELDS = Object.freeze([...FIELDS]);

const RISK_PRIORITY = Object.freeze(['meaning', 'positioning', 'scope']);
const RETIRED_INPUTS = Object.freeze(['door', 'primaryRisk', 'sovereigntyAffected']);

const allowed = (values, value, label) => {
  if (!values.includes(value)) {
    throw new Error(`${label} must be one of ${values.join(', ')}; received ${String(value)}`);
  }
};

const normalizedSignals = (value, vocabulary, label) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const result = [...new Set(value)];
  for (const signal of result) allowed(vocabulary, signal, label);
  return result;
};

const normalizedBoundaries = (value) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('all four boundary assessments are required');
  }
  const expected = Object.keys(PO_BOUNDARY_SIGNALS);
  const received = Object.keys(value);
  if (received.length !== expected.length || expected.some((name) => !Object.hasOwn(value, name))) {
    throw new Error('all four boundary assessments are required');
  }
  for (const name of received) {
    allowed(expected, name, 'boundary');
    allowed(PO_BOUNDARY_STATES, value[name], `boundary:${name}`);
  }
  return Object.freeze(Object.fromEntries(expected.map((name) => [name, value[name]])));
};

const frozen = (values) => Object.freeze([...values]);

/**
 * @param {{
 *   mechanical?: boolean,
 *   evidence?: string,
 *   outcome?: string,
 *   changes?: readonly string[],
 *   boundaries?: Record<string, 'unchanged' | 'affected' | 'unknown'>,
 *   door?: never,
 *   primaryRisk?: never,
 *   sovereigntyAffected?: never,
 * }} input
 */
export function routePoDecision(input = {}) {
  const retired = RETIRED_INPUTS.filter((name) => Object.hasOwn(input, name));
  if (retired.length > 0) {
    throw new Error('door and primaryRisk are derived from change signals; retired verdict inputs are not accepted');
  }

  const changes = normalizedSignals(input.changes, Object.keys(PO_CHANGE_SIGNALS), 'changes');
  if (input.mechanical === true) {
    if (
      changes.length > 0 ||
      (input.boundaries && Object.keys(input.boundaries).length > 0) ||
      input.evidence !== undefined ||
      input.outcome !== undefined
    ) {
      throw new Error('mechanical work cannot carry product or sovereignty change signals');
    }
    return Object.freeze({
      policyVersion: PO_POLICY_VERSION,
      door: 'mechanical',
      route: 'skip',
      record: false,
      reviewers: frozen([]),
      nextAction: 'maintenance-checks',
      rebuttal: 'none',
      outcome: null,
      primaryRisk: 'none',
      changes: frozen([]),
      boundaries: Object.freeze({}),
      routeReasons: frozen(['maintenance only; no product or sovereignty signal']),
    });
  }

  allowed(PO_EVIDENCE_STATES, input.evidence, 'evidence');
  allowed(Object.keys(PO_OUTCOMES), input.outcome, 'outcome');
  const boundaries = normalizedBoundaries(input.boundaries);
  const boundarySignals = Object.entries(boundaries)
    .filter(([, state]) => state !== 'unchanged')
    .map(([name]) => name);

  if (changes.length === 0 && boundarySignals.length === 0) {
    throw new Error('at least one change or boundary signal is required');
  }

  const oneWayChanges = changes.filter((name) => PO_CHANGE_SIGNALS[name].door === 'one-way');
  const door = oneWayChanges.length > 0 || boundarySignals.length > 0 ? 'one-way' : 'two-way';
  const detectedRisks = new Set(oneWayChanges.map((name) => PO_CHANGE_SIGNALS[name].risk));
  if (boundarySignals.length > 0) detectedRisks.add('meaning');
  const primaryRisk = RISK_PRIORITY.find((risk) => detectedRisks.has(risk)) ?? 'none';

  const routeReasons = [
    ...boundarySignals.map(
      (name) => `boundary:${name}=${boundaries[name]} — ${PO_BOUNDARY_SIGNALS[name]}`,
    ),
    ...oneWayChanges.map((name) => `change:${name} — ${PO_CHANGE_SIGNALS[name].reason}`),
  ];
  if (door === 'two-way') routeReasons.push(PO_CHANGE_SIGNALS['rollback-cheap'].reason);
  else if (changes.includes('rollback-cheap')) {
    routeReasons.push('rollback-cheap is overridden by a one-way change or boundary signal');
  }

  const common = {
    policyVersion: PO_POLICY_VERSION,
    door,
    outcome: input.outcome,
    primaryRisk,
    changes: frozen(changes),
    boundaries,
    routeReasons: frozen(routeReasons),
  };

  if (door === 'two-way') {
    return Object.freeze({
      ...common,
      route: 'solo',
      record: false,
      reviewers: frozen([]),
      nextAction: input.evidence === 'unknown' ? 'probe-first' : 'build-and-verify',
      rebuttal: 'none',
    });
  }

  const specialist = PO_RISK_ROUTES[primaryRisk].reviewer;
  return Object.freeze({
    ...common,
    route: 'review',
    record: true,
    reviewers: frozen(['po-evidence', specialist]),
    nextAction: input.evidence === 'observed' ? 'independent-review' : 'evidence-first-review',
    rebuttal: 'only-on-material-conflict',
  });
}
