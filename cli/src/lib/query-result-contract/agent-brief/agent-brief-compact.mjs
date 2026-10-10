import { BLAST_RADIUS_QUALIFICATION_STATUSES } from '../blast-radius.mjs';
import {
  MEANING_ASSESSMENT_STATUSES,
  MEANING_QUESTION_IDS,
  MEANING_QUESTION_STATUSES,
  MEANING_WITNESS_STATUSES,
  PROJECT_SOURCE_CURRENTNESS,
  PROJECT_SOURCE_STATUSES,
  liveWitnessesSupported,
  validMeaningRepair,
  validProjectSourceLive,
} from '../project-source-meaning.mjs';
import { assertQueryOperation } from '../query-operation.mjs';
import { hasExactKeys, hasNonEmptyString, isPlainObject, validCount } from '../value-checks.mjs';
import { DIAGNOSIS_STATUSES } from '../workspace-health.mjs';

export const AGENT_READINESS_STATUSES = new Set(['ready', 'needs_attention', 'needs_shape']);
const AGENT_BRIEF_COMPACT_MAX_BYTES = 12_000;
const AGENT_BRIEF_EVIDENCE_SOURCE_STATUSES = new Set([
  'supported_current',
  // Verified against the live source while the person's receipt is stale.
  'supported_live',
  'stale_or_unavailable',
  'missing_or_changed',
  'not_measured',
]);
const TASK_NAVIGATION_STATUSES = new Set(['ready', 'partial', 'blocked', 'unknown']);
// `live_verified` is reserved for a stale receipt whose witnesses the live
// probe still supports; `current` stays the word for a receipt a person measured.
const TASK_NAVIGATION_CURRENTNESS = new Set(['current', 'live_verified', 'stale', 'unavailable']);

export function assertAgentBriefCompactShape(result) {
  assertQueryOperation(result, 'agent_brief');
  if (result.contract !== 'agentBriefCompact:v2' || result.detail !== 'compact' || result.sideEffect !== false) {
    throw new Error('agent_brief compact response must use agentBriefCompact:v2, detail compact, and sideEffect false');
  }
  if (new TextEncoder().encode(JSON.stringify(result, null, 2)).byteLength > AGENT_BRIEF_COMPACT_MAX_BYTES) {
    throw new Error(`agent_brief compact response must fit ${AGENT_BRIEF_COMPACT_MAX_BYTES} UTF-8 JSON bytes`);
  }
  if (!isPlainObject(result.project) || !hasNonEmptyString(result.project.slug, result.project.title)) {
    throw new Error('agent_brief compact project must contain slug and title');
  }
  if (!isPlainObject(result.project.scope)) {
    throw new Error('agent_brief compact project.scope must be an object');
  }
  for (const field of ['nodes', 'domains', 'capabilities', 'elements', 'internalEdges']) {
    if (!validCount(result.project.scope[field])) {
      throw new Error(`agent_brief compact project.scope.${field} must be a non-negative integer`);
    }
  }
  if (
    !isPlainObject(result.task)
    || result.task.requestLocal !== true
    || result.task.persisted !== false
    || !/^sha256:[a-f0-9]{64}$/.test(result.task.digest)
    || !Array.isArray(result.task.terms)
    || !result.task.terms.every((term) => hasNonEmptyString(term))
    || Object.hasOwn(result.task, 'text')
  ) {
    throw new Error('agent_brief compact task must be request-local, non-persisted, digested, and omit raw text');
  }
  if (!DIAGNOSIS_STATUSES.has(result.status) || !isPlainObject(result.readiness)) {
    throw new Error('agent_brief compact status/readiness must use diagnosis statuses');
  }
  if (!AGENT_READINESS_STATUSES.has(result.readiness.status) || !validCount(result.readiness.score)) {
    throw new Error('agent_brief compact readiness must contain status and score');
  }
  const source = result.currentness?.source;
  const meaning = result.currentness?.meaning;
  if (
    !isPlainObject(source)
    || !PROJECT_SOURCE_STATUSES.has(source.status)
    || !PROJECT_SOURCE_CURRENTNESS.has(source.currentness)
    || !isPlainObject(source.witnessSummary)
    || !['total', 'supported', 'missing'].every((field) => validCount(source.witnessSummary[field]))
    || !validProjectSourceLive(source.live)
  ) {
    throw new Error('agent_brief compact currentness.source must preserve categorical source state and witness counts');
  }
  if (
    !isPlainObject(meaning)
    || !MEANING_ASSESSMENT_STATUSES.has(meaning.status)
    || !Array.isArray(meaning.questions)
    || !meaning.questions.every((row) => (
      isPlainObject(row)
      && MEANING_QUESTION_IDS.includes(row.id)
      && MEANING_QUESTION_STATUSES.has(row.status)
      && MEANING_WITNESS_STATUSES.has(row.witnessStatus)
    ))
  ) {
    throw new Error('agent_brief compact currentness.meaning must preserve categorical question state');
  }
  if (
    !isPlainObject(result.validation)
    || !['pass', 'warn', 'fail', 'not_checked'].includes(result.validation.status)
    || result.validation.scope !== 'whole_vault'
    || !['problemFiles', 'errorFiles', 'warningFiles', 'driftCount'].every((field) => validCount(result.validation[field]))
    || typeof result.validation.sourcePathsChecked !== 'boolean'
  ) {
    throw new Error('agent_brief compact validation must preserve whole-vault problem and source-path status');
  }
  if (!validMeaningRepair(result.meaningRepair, result.project.slug)) {
    throw new Error('agent_brief compact meaningRepair must preserve the action-first human review packet');
  }
  if (!isPlainObject(result.purpose) || result.purpose.slug !== result.project.slug) {
    throw new Error('agent_brief compact purpose must belong to the selected project');
  }
  if (!isPlainObject(result.focus) || !hasNonEmptyString(result.focus.selectionPolicy)) {
    throw new Error('agent_brief compact focus must explain that task match is selection, not proof');
  }
  if (result.focus.capability !== null && !validCompactNode(result.focus.capability, 'capability')) {
    throw new Error('agent_brief compact focus.capability must be null or a bounded capability row');
  }
  if (!Array.isArray(result.focus.evidenceAnchors) || !result.focus.evidenceAnchors.every((row) => validCompactNode(row, 'element'))) {
    throw new Error('agent_brief compact evidenceAnchors must contain bounded element rows');
  }
  for (const row of result.focus.evidenceAnchors) {
    if (
      !['recorded_path_anchor', 'recorded_element_without_path'].includes(row.claimStatus)
      || !AGENT_BRIEF_EVIDENCE_SOURCE_STATUSES.has(row.sourceStatus)
      || !hasNonEmptyString(row.relation)
    ) {
      throw new Error('agent_brief compact evidenceAnchors must preserve claim, relation, and categorical source status');
    }
    if (
      row.sourceStatus === 'supported_current'
      && (source.status !== 'verified_current' || source.currentness !== 'current')
    ) {
      throw new Error('agent_brief compact evidenceAnchors cannot claim supported_current when outer source currentness is not current');
    }
    if (row.sourceStatus === 'supported_live' && !liveWitnessesSupported(source)) {
      throw new Error('agent_brief compact evidenceAnchors cannot claim supported_live without a live witness check that supports every witness');
    }
  }
  if (
    !isPlainObject(result.focus.impact)
    || !BLAST_RADIUS_QUALIFICATION_STATUSES.has(result.focus.impact.status)
    || result.focus.impact.completeness !== 'unknown'
    || result.focus.impact.sourceBacked !== false
    || !validCount(result.focus.impact.declaredEdges)
    || !Array.isArray(result.focus.impact.edges)
  ) {
    throw new Error('agent_brief compact impact must remain bounded and non-source-backed');
  }
  if (
    !isPlainObject(result.focus.verification)
    || !['recorded', 'unknown'].includes(result.focus.verification.status)
    || !Array.isArray(result.focus.verification.recordedPaths)
    || !result.focus.verification.recordedPaths.every((path) => hasNonEmptyString(path))
    || !(result.focus.verification.manifest === null || hasNonEmptyString(result.focus.verification.manifest))
    || !(result.focus.verification.runner === null || ['cargo', 'package-script', 'python', 'go', 'swift'].includes(result.focus.verification.runner))
    || !hasNonEmptyString(result.focus.verification.nextAction)
  ) {
    throw new Error('agent_brief compact verification must distinguish recorded paths from unknown');
  }
  assertTaskNavigationShape(result.focus.taskNavigation, source);
  if (!Array.isArray(result.focus.unknowns) || !result.focus.unknowns.every((row) => hasNonEmptyString(row))) {
    throw new Error('agent_brief compact unknowns must be an array of non-empty bounded statements');
  }
  if (!Array.isArray(result.nextReads) || result.nextReads.length === 0) {
    throw new Error('agent_brief compact nextReads must contain an exact follow-up');
  }
  const bodyRead = result.nextReads.find((row) => row?.tool === 'get_concepts');
  if (
    !bodyRead
    || !isPlainObject(bodyRead.arguments)
    || bodyRead.arguments.body !== 'full'
    || !Array.isArray(bodyRead.arguments.slugs)
    || bodyRead.arguments.slugs.length === 0
    || bodyRead.arguments.slugs.length > 6
  ) {
    throw new Error('agent_brief compact nextReads must include one bounded get_concepts body full call');
  }
  if (
    !isPlainObject(result.safety)
    || !hasExactKeys(result.safety, [
      'humanApprovalRequiredForMeaningWrites',
      'automaticWrite',
      'automaticFinalize',
      'structuralReadinessIsSemanticApproval',
    ])
    || result.safety.humanApprovalRequiredForMeaningWrites !== true
    || result.safety.automaticWrite !== false
    || result.safety.automaticFinalize !== false
    || result.safety.structuralReadinessIsSemanticApproval !== false
  ) {
    throw new Error('agent_brief compact safety must preserve human approval and no-auto-write/finalize');
  }
  if (
    !isPlainObject(result.fullDetail)
    || result.fullDetail.tool !== 'query_ontology'
    || result.fullDetail.arguments?.operation !== 'agent_brief'
    || result.fullDetail.arguments?.project !== result.project.slug
    || result.fullDetail.arguments?.detail !== 'full'
    || !hasNonEmptyString(result.fullDetail.reason)
  ) {
    throw new Error('agent_brief compact fullDetail must point to the selected project full response');
  }
  const navigation = result.focus.taskNavigation;
  const promptCoordinate = (row) => row
    ? JSON.stringify(`${row.path}#${row.symbol}:${row.line}${row.endLine === row.line ? '' : `-${row.endLine}`}`)
    : 'unknown';
  const promptFacts = [
    `Task navigation: ${navigation.status}/${navigation.currentness}`,
    `Primary: ${promptCoordinate(navigation.primary)}`,
    `Supporting: ${navigation.supporting ? promptCoordinate(navigation.supporting) : 'none recorded'}`,
    `Focused tests: ${navigation.tests.length > 0 ? JSON.stringify(navigation.tests.map((row) => `${row.path}#${row.symbol}:${row.line}${row.endLine === row.line ? '' : `-${row.endLine}`}`)) : 'unknown'}`,
    `IN: ${navigation.boundary.in ? JSON.stringify(navigation.boundary.in) : 'unknown'}`,
    `OUT: ${navigation.boundary.out ? JSON.stringify(navigation.boundary.out) : 'unknown'}`,
    `Current source: ${source.status}/${source.currentness}`,
    `Meaning: ${meaning.status}`,
  ];
  if (navigation.status === 'ready') {
    const verifiedManifest = result.focus.verification.runner && result.focus.verification.manifest;
    promptFacts.push(
      verifiedManifest
        ? `Verify: ${result.focus.verification.runner}/${result.focus.verification.manifest}; batch manifest; focused once, full once, no overlap.`
        : 'Verify: runner unknown; focused once; discover one full check.',
      verifiedManifest
        ? 'Read: primary + supporting + tests + manifest; stop_on_match.'
        : 'Read: primary + supporting + tests; stop_on_match.',
      'Tests: named positive + negative regression; exact observable output.',
    );
  }
  if (
    !hasNonEmptyString(result.handoffPrompt)
    || promptFacts.some((fact) => !result.handoffPrompt.includes(fact))
  ) {
    throw new Error('agent_brief compact handoffPrompt must preserve the exact source batch, verification sequence, and final currentness facts');
  }
  for (const forbidden of ['playbooks', 'cliFallbackCommands', 'graphDbQueryPack', 'traversalStrategy', 'writePolicy']) {
    if (Object.hasOwn(result, forbidden)) {
      throw new Error(`agent_brief compact response must keep ${forbidden} behind full detail`);
    }
  }
  return result;
}

function validCompactNode(row, expectedKind) {
  return isPlainObject(row)
    && hasNonEmptyString(row.slug, row.title)
    && row.kind === expectedKind
    && (row.path === undefined || hasNonEmptyString(row.path));
}

function safeTaskNavigationPath(value) {
  return hasNonEmptyString(value)
    && !value.startsWith('/')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes('\\')
    && !value.split('/').some((segment) => !segment || segment === '.' || segment === '..');
}

function validTaskNavigationTarget(row, role) {
  return isPlainObject(row)
    && safeTaskNavigationPath(row.path)
    && hasNonEmptyString(row.symbol)
    && row.role === role
    && Number.isInteger(row.line)
    && row.line > 0
    && Number.isInteger(row.endLine)
    && row.endLine >= row.line
    && row.sourceStatus === 'supported_current';
}

function assertTaskNavigationShape(navigation, source) {
  if (
    !isPlainObject(navigation)
    || navigation.contract !== 'taskNavigation:v1'
    || !TASK_NAVIGATION_STATUSES.has(navigation.status)
    || navigation.basis !== 'reviewed_markdown_evidence'
    || !TASK_NAVIGATION_CURRENTNESS.has(navigation.currentness)
  ) {
    throw new Error('agent_brief compact taskNavigation must preserve its reviewed-evidence contract and categorical state');
  }
  if (navigation.primary !== null && !validTaskNavigationTarget(navigation.primary, 'primary')) {
    throw new Error('agent_brief compact taskNavigation primary target is invalid');
  }
  if (navigation.supporting !== null && !validTaskNavigationTarget(navigation.supporting, 'supporting')) {
    throw new Error('agent_brief compact taskNavigation supporting target is invalid');
  }
  if (
    !Array.isArray(navigation.tests)
    || navigation.tests.length > 3
    || !navigation.tests.every((row) => validTaskNavigationTarget(row, 'test'))
  ) {
    throw new Error('agent_brief compact taskNavigation test target is invalid');
  }
  if (
    !isPlainObject(navigation.boundary)
    || typeof navigation.boundary.in !== 'string'
    || typeof navigation.boundary.out !== 'string'
    || !['recorded_non_exhaustive', 'unknown'].includes(navigation.boundary.completeness)
  ) {
    throw new Error('agent_brief compact taskNavigation boundary must preserve reviewed IN/OUT completeness');
  }
  if (
    !Array.isArray(navigation.diagnostics)
    || !navigation.diagnostics.every((row) => isPlainObject(row) && hasNonEmptyString(row.code, row.role))
  ) {
    throw new Error('agent_brief compact taskNavigation diagnostics must be bounded code/role rows');
  }
  if (
    !isPlainObject(navigation.readPlan)
    || navigation.readPlan.kind !== 'source_batch'
    || !validCount(navigation.readPlan.targetCount)
    || navigation.readPlan.policy !== 'stop_on_match'
  ) {
    throw new Error('agent_brief compact taskNavigation readPlan must be one bounded source batch');
  }
  const exactTargets = [navigation.primary, navigation.supporting, ...navigation.tests].filter(Boolean);
  if (navigation.readPlan.targetCount !== exactTargets.length) {
    throw new Error('agent_brief compact taskNavigation readPlan targetCount must equal the verified exact targets');
  }
  if (
    navigation.currentness === 'current'
    && (source.status !== 'verified_current' || source.currentness !== 'current')
  ) {
    throw new Error('agent_brief compact taskNavigation cannot be current when outer source currentness is not current');
  }
  if (navigation.currentness === 'live_verified') {
    if (
      !liveWitnessesSupported(source)
      || navigation.receipt !== 'stale'
      || !(navigation.sourceRevision === null || navigation.sourceRevision === undefined || hasNonEmptyString(navigation.sourceRevision))
    ) {
      throw new Error('agent_brief compact taskNavigation can be live_verified only over a stale receipt whose witnesses the live probe supports');
    }
  } else if (navigation.receipt !== undefined || navigation.sourceRevision !== undefined) {
    throw new Error('agent_brief compact taskNavigation carries receipt provenance only when live_verified');
  }
  if (navigation.evidenceElement !== undefined && !hasNonEmptyString(navigation.evidenceElement)) {
    throw new Error('agent_brief compact taskNavigation evidenceElement must name the element whose coordinates were read');
  }
  if (!['current', 'live_verified'].includes(navigation.currentness) && exactTargets.length > 0) {
    throw new Error('agent_brief compact taskNavigation cannot emit exact targets from stale or unavailable source');
  }
  if (
    navigation.status === 'blocked'
    && (!hasNonEmptyString(navigation.blockedBy) || exactTargets.length > 0)
  ) {
    throw new Error('agent_brief compact taskNavigation blocked state must name its blocker and emit no exact targets');
  }
  if (
    navigation.status === 'ready'
    && (
      navigation.primary === null
      || navigation.tests.length === 0
      || navigation.boundary.completeness !== 'recorded_non_exhaustive'
    )
  ) {
    throw new Error('agent_brief compact taskNavigation ready state requires primary, test, and reviewed boundary evidence');
  }
}
