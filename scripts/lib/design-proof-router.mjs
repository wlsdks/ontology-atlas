/**
 * Atlas design-proof routing policy.
 *
 * The caller supplies observable change classes. The policy derives divergent
 * design work, council use, specialist seats, and runtime proof. A builder may
 * not replace those facts with "small", "meaningful", or "looks safe".
 */

const DESIGN_POLICY_VERSION = 1;

const DESIGN_SEAT_ORDER = Object.freeze([
  'design-lead',
  'design-system',
  'design-interaction',
  'design-motion',
  'design-infoviz',
  'design-workbench',
  'design-responsive',
  'design-handoff',
]);

const proof = (name, scope) => Object.freeze({ name, scope });

export const DESIGN_CHANGE_SIGNALS = Object.freeze({
  copy: Object.freeze({
    reason: 'only visible words changed; add responsive when length or wrapping can change geometry',
    directions: false,
    council: false,
    seats: [],
    proofs: [proof('computer-use-loop', 'affected-state')],
  }),
  'local-visual': Object.freeze({
    reason: 'rendered colour, type, spacing, radius, shadow, or local hierarchy changed inside the existing system',
    directions: false,
    council: false,
    seats: ['design-lead'],
    proofs: [
      proof('design-audit', 'affected-state'),
      proof('computer-use-loop', 'affected-state'),
    ],
  }),
  layout: Object.freeze({
    reason: 'rendered geometry changed without creating a new information architecture',
    directions: false,
    council: false,
    seats: ['design-lead'],
    proofs: [
      proof('design-audit', 'affected-state'),
      proof('computer-use-loop', 'affected-state'),
    ],
  }),
  responsive: Object.freeze({
    reason: 'breakpoint, reflow, touch target, safe area, or scroll reserve changed',
    directions: false,
    council: false,
    seats: ['design-responsive'],
    proofs: [
      proof('design-audit', 'affected-state'),
      proof('responsive-sweep', 'affected-bands'),
      proof('computer-use-loop', 'affected-bands'),
    ],
  }),
  interaction: Object.freeze({
    reason: 'visible state, keyboard path, modality, discoverability, or reversibility changed',
    directions: false,
    council: false,
    seats: ['design-interaction'],
    proofs: [
      proof('design-audit', 'affected-state'),
      proof('computer-use-loop', 'affected-state'),
    ],
  }),
  motion: Object.freeze({
    reason: 'timing, easing, animation, camera travel, or reduced-motion output changed',
    directions: false,
    council: false,
    seats: ['design-motion'],
    proofs: [
      proof('motion-verify', 'changed-sequence'),
      proof('computer-use-loop', 'changed-sequence'),
    ],
  }),
  'topology-encoding': Object.freeze({
    reason: 'a topology mark, relation channel, density rule, or graph-readable fact changed',
    directions: false,
    council: false,
    seats: ['design-infoviz'],
    proofs: [
      proof('design-audit', 'affected-map-state'),
      proof('graph-readability', 'changed-map-state'),
      proof('contrast', 'changed-mark-pairs'),
      proof('computer-use-loop', 'affected-map-state'),
    ],
  }),
  'topology-gesture': Object.freeze({
    reason: 'node drag, pan, zoom, hit testing, layout work, or the map frame loop changed',
    directions: false,
    council: false,
    seats: ['design-interaction'],
    proofs: [
      proof('map-perf', 'changed-gesture'),
      proof('computer-use-loop', 'changed-gesture'),
    ],
  }),
  journey: Object.freeze({
    reason: 'the order, destination, next step, or completion signal of a user journey changed',
    directions: false,
    council: false,
    seats: ['design-interaction'],
    proofs: [
      proof('user-walkthrough', 'changed-path'),
      proof('computer-use-loop', 'changed-path'),
    ],
  }),
  'desktop-shell': Object.freeze({
    reason: 'window, menu, AppKit/Tauri bridge, WKWebView, restoration, or desktop lifecycle changed',
    directions: false,
    council: false,
    seats: ['design-workbench'],
    proofs: [
      proof('installed-app', 'touched-state'),
      proof('computer-use-loop', 'touched-state'),
    ],
  }),
  'agent-handoff': Object.freeze({
    reason: 'the visible MCP/CLI next action or state-bound handoff changed',
    directions: false,
    council: false,
    seats: ['design-handoff'],
    proofs: [
      proof('user-walkthrough', 'agent-handoff-path'),
      proof('computer-use-loop', 'agent-handoff-path'),
    ],
  }),
  'design-contract': Object.freeze({
    reason: 'a canonical token, ramp, primitive, design rule, or enforcement contract changed',
    directions: false,
    council: true,
    seats: ['design-system', 'design-lead'],
    proofs: [
      proof('design-system-audit', 'changed-contract'),
      proof('gate-probe', 'changed-gate'),
    ],
  }),
  'new-surface': Object.freeze({
    reason: 'a primary user-facing surface is added or removed',
    directions: true,
    council: true,
    seats: ['design-lead', 'design-interaction', 'design-responsive'],
    proofs: [
      proof('design-audit', 'full-surface'),
      proof('responsive-sweep', 'full-matrix'),
      proof('user-walkthrough', 'north-star-path'),
      proof('computer-use-loop', 'full-surface'),
    ],
  }),
  'information-architecture': Object.freeze({
    reason: 'navigation, primary hierarchy, or the grouping of product information changed',
    directions: true,
    council: true,
    seats: ['design-lead', 'design-interaction', 'design-responsive'],
    proofs: [
      proof('design-audit', 'full-surface'),
      proof('responsive-sweep', 'full-matrix'),
      proof('user-walkthrough', 'changed-journey'),
      proof('computer-use-loop', 'full-surface'),
    ],
  }),
  'interaction-model': Object.freeze({
    reason: 'the primary way a person selects, edits, confirms, or reverses work changed',
    directions: true,
    council: true,
    seats: ['design-lead', 'design-interaction'],
    proofs: [
      proof('design-audit', 'full-interaction-state'),
      proof('user-walkthrough', 'changed-journey'),
      proof('computer-use-loop', 'full-interaction-state'),
    ],
  }),
  'attention-model': Object.freeze({
    reason: 'which Atlas fact or action wins attention changed across a primary workbench state',
    directions: true,
    council: true,
    seats: ['design-lead', 'design-infoviz'],
    proofs: [
      proof('design-audit', 'full-surface'),
      proof('computer-use-loop', 'full-surface'),
    ],
  }),
});

const PROOF_ORDER = Object.freeze([
  'checks:changed',
  'design-audit',
  'responsive-sweep',
  'motion-verify',
  'map-perf',
  'graph-readability',
  'contrast',
  'user-walkthrough',
  'installed-app',
  'computer-use-loop',
  'design-system-audit',
  'gate-probe',
]);

const SCOPE_RANK = Object.freeze({
  'changed-paths': 0,
  'affected-state': 1,
  'affected-map-state': 1,
  'changed-map-state': 1,
  'changed-mark-pairs': 1,
  'changed-sequence': 1,
  'changed-gesture': 1,
  'changed-path': 1,
  'agent-handoff-path': 1,
  'touched-state': 1,
  'changed-contract': 1,
  'changed-gate': 1,
  'affected-bands': 2,
  'full-interaction-state': 2,
  'changed-journey': 2,
  'full-surface': 3,
  'north-star-path': 3,
  'full-matrix': 3,
});

const allowed = (value, label) => {
  if (!Object.hasOwn(DESIGN_CHANGE_SIGNALS, value)) {
    throw new Error(`${label} must be one of ${Object.keys(DESIGN_CHANGE_SIGNALS).join(', ')}; received ${String(value)}`);
  }
};

const uniqueSignals = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('at least one observable design change is required');
  }
  const changes = [...new Set(value)];
  for (const change of changes) allowed(change, 'changes');
  return changes;
};

const mergeProofs = (contracts) => {
  const selected = new Map([['checks:changed', 'changed-paths']]);
  for (const contract of contracts) {
    for (const item of contract.proofs) {
      const current = selected.get(item.name);
      if (current === undefined || SCOPE_RANK[item.scope] > SCOPE_RANK[current]) {
        selected.set(item.name, item.scope);
      }
    }
  }
  return Object.freeze(
    PROOF_ORDER.filter((name) => selected.has(name)).map((name) => proof(name, selected.get(name))),
  );
};

/** @param {{changes?: readonly string[]}} input */
export function routeDesignProof(input = {}) {
  const changes = uniqueSignals(input.changes);
  const contracts = changes.map((change) => DESIGN_CHANGE_SIGNALS[change]);
  const directions = contracts.some((contract) => contract.directions);
  const councilRequired = contracts.some((contract) => contract.council);
  const touchedSeats = new Set(contracts.flatMap((contract) => contract.seats));
  const seats = councilRequired
    ? DESIGN_SEAT_ORDER.filter((seat) => touchedSeats.has(seat))
    : [];
  if (councilRequired && seats.length < 2) {
    throw new Error('a council route must derive at least two contrasting seats');
  }

  const proofs = mergeProofs(contracts);
  const sequence = directions
    ? ['directions', 'build', 'proof', ...(councilRequired ? ['council'] : []), 'remeasure-changed-proof']
    : ['build', 'proof', ...(councilRequired ? ['council', 'remeasure-changed-proof'] : [])];

  return Object.freeze({
    policyVersion: DESIGN_POLICY_VERSION,
    changes: Object.freeze(changes),
    directions,
    council: Object.freeze({
      required: councilRequired,
      seats: Object.freeze(seats),
      crossCritique: councilRequired ? 'only-on-material-conflict' : 'none',
      record: councilRequired,
    }),
    proofs,
    sequence: Object.freeze(sequence),
    reasons: Object.freeze(changes.map((change) => `change:${change} — ${DESIGN_CHANGE_SIGNALS[change].reason}`)),
  });
}
