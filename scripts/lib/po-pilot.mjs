import {
  PO_BOUNDARY_SIGNALS,
  PO_BOUNDARY_STATES,
  PO_CHANGE_SIGNALS,
  PO_OUTCOMES,
  PO_RISK_ROUTES,
  routePoDecision,
} from './po-risk-router.mjs';
import { parseFrontmatter as parseSharedFrontmatter } from './parse-frontmatter.mjs';

const PO_PILOT_RUN_COLUMNS = Object.freeze([
  '#',
  'Date',
  'Decision',
  'Door',
  'Route',
  'Atlas outcome',
  'Changes',
  'Boundaries',
  'Risk',
  'First',
  'Rebuttal',
  'Delta',
  'Unique contribution',
]);

const PO_PILOT_UPDATE_COLUMNS = Object.freeze([
  'Run',
  'Date',
  'Recovery proof',
  'Owner clear',
  'Boundary miss',
  'Later result',
]);

const PO_DECISION_DELTAS = Object.freeze([
  'unchanged',
  'stopped',
  'narrowed',
  'redirected',
  'evidence-bounded',
  'verification-strengthened',
]);

const PILOT_OUTCOMES = Object.freeze(['pending', 'keep', 'adjust', 'revert']);
const PROOF_STATES = Object.freeze(['pending', 'pass', 'fail-caught', 'fail-shipped']);
const OWNER_STATES = Object.freeze(['pending', 'yes', 'no']);
const BOUNDARY_STATES = Object.freeze(['pending', 'no', 'yes']);
const LATER_RESULTS = Object.freeze(['pending', 'held', 'reopened', 'reversed']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const fail = (message) => {
  throw new Error(`[po-pilot] ${message}`);
};

const assertAllowed = (value, allowed, label) => {
  if (!allowed.includes(value)) fail(`${label} must be one of ${allowed.join(', ')}; received ${value}`);
};

const assertDate = (value, label) => {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail(`${label} must be an ISO date; received ${value}`);
  }
};

const integer = (value, label, minimum = 0) => {
  if (!/^\d+$/.test(value) || Number(value) < minimum) {
    fail(`${label} must be an integer >= ${minimum}; received ${value}`);
  }
  return Number(value);
};

const parseFrontmatter = (source) => {
  /*
   * Delegates to the shared frontmatter parser (2026-09-01 review). The private
   * line-split copy this replaces threw on valid YAML the six sibling scripts
   * already accept — a comment line, a block scalar, a block list — so an
   * innocuous owner edit to the register turned the required gates lane red on
   * every PR. The shared parser also carries the __proto__ and block-scalar
   * hardening this file's copy never received. What stays local is the register
   * strictness the shared parser deliberately does not impose: required keys,
   * date shapes, the outcome enum, and duplicate top-level keys.
   */
  if (!source.startsWith('---\n')) fail('frontmatter is required');
  const close = source.indexOf('\n---\n', 4);
  if (close < 0) fail('frontmatter is not closed');
  const seen = new Set();
  for (const line of source.slice(4, close).split('\n')) {
    const key = /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1];
    if (!key) continue;
    if (seen.has(key)) fail(`duplicate frontmatter key ${key}`);
    seen.add(key);
  }
  const parsed = parseSharedFrontmatter(source);
  if (Array.isArray(parsed.diagnostics) && parsed.diagnostics.length > 0) {
    fail(`invalid frontmatter: ${parsed.diagnostics[0].message}`);
  }
  const raw = {};
  for (const [key, value] of Object.entries(parsed.frontmatter)) {
    // The validators below judge the written text, so scalars flow as strings
    // regardless of the shared parser's typing.
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      raw[key] = String(value);
    }
  }

  const required = [
    'started',
    'decision_target',
    'decision_deadline',
    'sparse_extension_deadline',
    'outcome',
  ];
  for (const key of required) if (!raw[key]) fail(`frontmatter is missing ${key}`);

  assertDate(raw.started, 'started');
  assertDate(raw.decision_deadline, 'decision_deadline');
  assertDate(raw.sparse_extension_deadline, 'sparse_extension_deadline');
  if (raw.decision_deadline <= raw.started) fail('decision_deadline must be after started');
  if (raw.sparse_extension_deadline <= raw.decision_deadline) {
    fail('sparse_extension_deadline must be after decision_deadline');
  }
  assertAllowed(raw.outcome, PILOT_OUTCOMES, 'outcome');

  return {
    started: raw.started,
    decisionTarget: integer(raw.decision_target, 'decision_target', 1),
    decisionDeadline: raw.decision_deadline,
    sparseExtensionDeadline: raw.sparse_extension_deadline,
    outcome: raw.outcome,
  };
};

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

const tableAfter = (source, heading, expectedColumns) => {
  const start = source.indexOf(heading);
  if (start < 0) fail(`missing ${heading}`);
  const rest = source.slice(start + heading.length);
  const nextHeading = rest.search(/^##\s/m);
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading);
  const lines = section.split('\n').filter((line) => line.trim().startsWith('|'));
  if (lines.length < 3) fail(`${heading} must contain a header, divider, and at least one row`);
  const header = cells(lines[0]);
  if (header.join('\u0000') !== expectedColumns.join('\u0000')) {
    fail(`${heading} columns must be ${expectedColumns.join(' | ')}`);
  }
  if (!cells(lines[1]).every((cell) => /^:?-{3,}:?$/.test(cell))) fail(`${heading} divider is invalid`);
  return lines.slice(2).map((line, index) => {
    const row = cells(line);
    if (row.length !== expectedColumns.length) {
      fail(`${heading} row ${index + 1} has ${row.length} cells; expected ${expectedColumns.length}`);
    }
    return Object.fromEntries(expectedColumns.map((column, cellIndex) => [column, row[cellIndex]]));
  });
};

const parseContributors = (value, label) => {
  if (value === 'none') return [];
  const contributors = [...new Set(value.split('+').map((part) => part.trim()).filter(Boolean))];
  if (contributors.length === 0) fail(`${label} must name a reviewer or none`);
  return contributors;
};

const parseChanges = (value, label) => {
  const changes = [...new Set(value.split('+').map((part) => part.trim()).filter(Boolean))];
  if (changes.length === 0) fail(`${label} must name at least one change signal`);
  for (const change of changes) assertAllowed(change, Object.keys(PO_CHANGE_SIGNALS), label);
  return changes;
};

const parseBoundaries = (value, label) => {
  const entries = value.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    if (separator < 1) fail(`${label} must use name=state pairs`);
    return [part.slice(0, separator), part.slice(separator + 1)];
  });
  const result = Object.fromEntries(entries);
  const expected = Object.keys(PO_BOUNDARY_SIGNALS);
  if (entries.length !== expected.length || expected.some((name) => !Object.hasOwn(result, name))) {
    fail(`${label} must assess all four boundaries`);
  }
  for (const [name, state] of entries) {
    assertAllowed(name, expected, label);
    assertAllowed(state, PO_BOUNDARY_STATES, `${label} ${name}`);
  }
  return result;
};

const parseRun = (row) => {
  const id = integer(row['#'], 'run #', 1);
  assertDate(row.Date, `run ${id} date`);
  if (!row.Decision) fail(`run ${id} decision is empty`);
  assertAllowed(row.Door, ['two-way', 'one-way'], `run ${id} door`);
  assertAllowed(row.Route, ['solo', 'review', 'owner-review'], `run ${id} route`);
  assertAllowed(row['Atlas outcome'], Object.keys(PO_OUTCOMES), `run ${id} Atlas outcome`);
  const changes = parseChanges(row.Changes, `run ${id} changes`);
  const boundaries = parseBoundaries(row.Boundaries, `run ${id} boundaries`);
  assertAllowed(row.Risk, ['none', ...Object.keys(PO_RISK_ROUTES)], `run ${id} risk`);
  assertAllowed(row.Delta, PO_DECISION_DELTAS, `run ${id} delta`);

  const firstTurns = integer(row.First, `run ${id} first turns`);
  const rebuttalTurns = integer(row.Rebuttal, `run ${id} rebuttal turns`);
  const uniqueContributors = parseContributors(row['Unique contribution'], `run ${id} contribution`);

  const derived = routePoDecision({
    evidence: 'observed',
    outcome: row['Atlas outcome'],
    changes,
    boundaries,
  });
  const ownerException = row.Route === 'owner-review';
  const routeMatches = ownerException
    ? derived.door === 'two-way' && row.Door === 'two-way' && row.Risk !== 'none'
    : row.Door === derived.door && row.Route === derived.route && row.Risk === derived.primaryRisk;
  if (!routeMatches) {
    fail(
      `run ${id} route must match the policy: ${derived.door}/${derived.route}/${derived.primaryRisk}`,
    );
  }

  if (row.Route === 'solo') {
    if (row.Door !== 'two-way' || row.Risk !== 'none') fail(`run ${id} solo route must be two-way with risk none`);
    if (firstTurns !== 0 || rebuttalTurns !== 0 || uniqueContributors.length > 0) {
      fail(`run ${id} solo route cannot report reviewer activity`);
    }
    if (row.Delta !== 'unchanged') fail(`run ${id} solo route cannot claim a review delta`);
  } else {
    if (row.Risk === 'none') fail(`run ${id} review route must name a risk`);
    if (firstTurns !== 2) fail(`run ${id} review route must record exactly two first positions`);
    if (![0, 2].includes(rebuttalTurns)) fail(`run ${id} rebuttal turns must be 0 or 2`);
    const allowedReviewers = ['po-evidence', PO_RISK_ROUTES[row.Risk].reviewer];
    for (const reviewer of uniqueContributors) {
      if (!allowedReviewers.includes(reviewer)) {
        fail(`run ${id} contribution ${reviewer} is outside ${allowedReviewers.join(', ')}`);
      }
    }
    if (row.Delta === 'unchanged' && uniqueContributors.length > 0) {
      fail(`run ${id} unchanged review cannot claim a unique contribution`);
    }
    if (row.Delta !== 'unchanged' && uniqueContributors.length === 0) {
      fail(`run ${id} material review delta must name a unique contributor`);
    }
  }

  if (row.Door === 'one-way' && row.Route !== 'review') fail(`run ${id} one-way door must use review`);
  if (row.Route === 'owner-review' && row.Door !== 'two-way') {
    fail(`run ${id} owner-review must be a two-way exception`);
  }

  return {
    id,
    date: row.Date,
    decision: row.Decision,
    door: row.Door,
    route: row.Route,
    outcome: row['Atlas outcome'],
    changes,
    boundaries,
    risk: row.Risk,
    firstTurns,
    rebuttalTurns,
    delta: row.Delta,
    uniqueContributors,
  };
};

const parseUpdate = (row, runsById) => {
  const runId = integer(row.Run, 'update run', 1);
  const run = runsById.get(runId);
  if (!run) fail(`update references unknown run ${runId}`);
  assertDate(row.Date, `run ${runId} update date`);
  if (row.Date < run.date) fail(`run ${runId} update predates its decision`);
  assertAllowed(row['Recovery proof'], PROOF_STATES, `run ${runId} recovery proof`);
  assertAllowed(row['Owner clear'], OWNER_STATES, `run ${runId} owner clear`);
  assertAllowed(row['Boundary miss'], BOUNDARY_STATES, `run ${runId} boundary miss`);
  assertAllowed(row['Later result'], LATER_RESULTS, `run ${runId} later result`);
  return {
    runId,
    date: row.Date,
    proof: row['Recovery proof'],
    ownerClear: row['Owner clear'],
    boundaryMiss: row['Boundary miss'],
    laterResult: row['Later result'],
  };
};

export function parsePoPilot(source) {
  const metadata = parseFrontmatter(source);
  const runs = tableAfter(source, '## Structured runs', PO_PILOT_RUN_COLUMNS).map(parseRun);

  for (let index = 0; index < runs.length; index += 1) {
    if (runs[index].id !== index + 1) fail(`run ids must be consecutive from 1; found ${runs[index].id}`);
    if (runs[index].date < metadata.started) fail(`run ${runs[index].id} predates the pilot`);
    if (index > 0 && runs[index].date < runs[index - 1].date) fail('run dates must be append-ordered');
  }

  const runsById = new Map(runs.map((run) => [run.id, run]));
  const updates = tableAfter(source, '## Outcome updates', PO_PILOT_UPDATE_COLUMNS).map((row) =>
    parseUpdate(row, runsById),
  );
  const lastUpdateDate = new Map();
  const updatedRuns = new Set();
  for (const update of updates) {
    const prior = lastUpdateDate.get(update.runId);
    if (prior && update.date < prior) fail(`run ${update.runId} updates must be append-ordered`);
    lastUpdateDate.set(update.runId, update.date);
    updatedRuns.add(update.runId);
  }
  for (const run of runs) if (!updatedRuns.has(run.id)) fail(`run ${run.id} needs an outcome update row`);

  return { metadata, runs, updates };
}

const ratio = (numerator, denominator) => (denominator === 0 ? null : numerator / denominator);

export function evaluatePoPilot(pilot, asOf = new Date().toISOString().slice(0, 10)) {
  assertDate(asOf, 'as-of');
  const { metadata, runs, updates } = pilot;
  const latestUpdates = new Map();
  for (const update of updates) latestUpdates.set(update.runId, update);
  for (const run of runs) if (!latestUpdates.has(run.id)) fail(`run ${run.id} has no outcome update`);

  const reviews = runs.filter((run) => run.route !== 'solo');
  const materialDeltas = reviews.filter((run) => run.delta !== 'unchanged');
  const reversible = runs.filter((run) => run.door === 'two-way');
  const reversibleWithoutCouncil = reversible.filter((run) => run.route === 'solo');
  const currentUpdates = runs.map((run) => latestUpdates.get(run.id));
  const proofResolved = currentUpdates.filter((update) => update.proof !== 'pending');
  const ownerClear = currentUpdates.filter((update) => update.ownerClear === 'yes');
  const boundaryMisses = currentUpdates.filter((update) => update.boundaryMiss === 'yes').length;
  const unresolvedBoundaries = currentUpdates.filter((update) => update.boundaryMiss === 'pending').length;
  const shippedProofFailures = currentUpdates.filter((update) => update.proof === 'fail-shipped').length;

  const specialistContribution = Object.fromEntries(
    Object.values(PO_RISK_ROUTES).map(({ reviewer }) => [reviewer, { calls: 0, unique: 0 }]),
  );
  for (const run of reviews) {
    const specialist = PO_RISK_ROUTES[run.risk].reviewer;
    specialistContribution[specialist].calls += 1;
    if (run.uniqueContributors.includes(specialist)) specialistContribution[specialist].unique += 1;
  }
  const retireSpecialists = Object.entries(specialistContribution)
    .filter(([, value]) => value.calls >= 5 && value.unique === 0)
    .map(([reviewer]) => reviewer);

  const metrics = {
    eligibleDecisions: runs.length,
    reviews: reviews.length,
    reviewerTurns: reviews.reduce((sum, run) => sum + run.firstTurns + run.rebuttalTurns, 0),
    materialDeltaRate: ratio(materialDeltas.length, reviews.length),
    reversibleDecisions: reversible.length,
    reversibleCouncilAvoidanceRate: ratio(reversibleWithoutCouncil.length, reversible.length),
    proofResolvedRate: ratio(proofResolved.length, runs.length),
    shippedProofFailures,
    ownerClearRate: ratio(ownerClear.length, runs.length),
    boundaryMisses,
    unresolvedBoundaries,
    specialistContribution,
    retireSpecialists,
  };

  const criteria = {
    materialDecisionDelta: metrics.materialDeltaRate !== null && metrics.materialDeltaRate >= 0.2,
    reversibleCouncilAvoidance:
      metrics.reversibleCouncilAvoidanceRate !== null && metrics.reversibleCouncilAvoidanceRate >= 0.8,
    recoveryProof:
      metrics.proofResolvedRate !== null && metrics.proofResolvedRate >= 0.8 && shippedProofFailures === 0,
    ownerClarity: metrics.ownerClearRate === 1,
    boundarySafety: boundaryMisses === 0 && unresolvedBoundaries === 0,
    specialistUtility: retireSpecialists.length === 0,
  };
  const accepted = Object.values(criteria).every(Boolean);

  let dueReason = null;
  let basePhase = 'collecting';
  if (runs.length >= metadata.decisionTarget) dueReason = 'decision-target';
  else if (asOf >= metadata.sparseExtensionDeadline && runs.length < 10) {
    dueReason = 'sparse-extension-deadline';
  } else if (asOf >= metadata.decisionDeadline && runs.length >= 10) {
    dueReason = 'decision-deadline';
  } else if (asOf >= metadata.decisionDeadline && runs.length < 10) {
    basePhase = 'collecting-extension';
  }

  let phase = basePhase;
  if (metadata.outcome === 'keep') {
    phase = !dueReason ? 'premature-keep' : accepted ? 'kept' : 'invalid-keep';
  }
  else if (metadata.outcome === 'adjust') phase = 'adjusted';
  else if (metadata.outcome === 'revert') phase = 'reverted';
  else if (shippedProofFailures > 0 || boundaryMisses > 0) phase = 'safety-stop';
  else if (dueReason) phase = 'decision-required';

  return {
    asOf,
    phase,
    dueReason,
    outcome: metadata.outcome,
    accepted,
    criteria,
    metrics,
    deadlines: {
      decision: metadata.decisionDeadline,
      sparseExtension: metadata.sparseExtensionDeadline,
      target: metadata.decisionTarget,
    },
  };
}

export function pilotCheckFailures(result) {
  if (result.phase === 'adjusted' || result.phase === 'reverted') return [];
  if (result.phase === 'safety-stop') {
    const failures = [];
    if (result.metrics.shippedProofFailures > 0) {
      failures.push('a failed recovery proof shipped before the pilot was adjusted or reverted');
    }
    if (result.metrics.boundaryMisses > 0) {
      failures.push('a serious boundary miss requires the pilot to be adjusted or reverted');
    }
    return failures;
  }
  if (!['decision-required', 'invalid-keep', 'premature-keep'].includes(result.phase)) return [];

  const failures = [];
  if (result.phase === 'decision-required') failures.push('pilot outcome is still pending');
  if (result.phase === 'premature-keep') failures.push('keep was declared before the pilot became due');
  if (!result.criteria.materialDecisionDelta) {
    failures.push('fewer than 20% of reviews produced a material decision delta, or no review was measured');
  }
  if (!result.criteria.reversibleCouncilAvoidance) {
    failures.push('reversible council avoidance is below 80% or no reversible decision was measured');
  }
  if (!result.criteria.recoveryProof) {
    failures.push('recovery proof resolution is below 80% or a failed proof shipped');
  }
  if (!result.criteria.ownerClarity) failures.push('owner clarity is unresolved or below 100%');
  if (!result.criteria.boundarySafety) failures.push('a serious or unresolved boundary miss exists');
  if (!result.criteria.specialistUtility) {
    failures.push('a specialist reached five calls without one unique material contribution');
  }
  return failures;
}
