import { createHash } from 'node:crypto';
import {
  buildCompactHandoffText,
  compactMeaningRepair,
  compactReaderRules,
} from './compact-handoff-text.mjs';
import { createUncertaintyPlan, projectUncertainty } from './recorded-evidence.mjs';
import { buildTaskNavigationEvidence } from './task-navigation-evidence.mjs';
import { extractSummaryExcerpt } from '../vault/documents.mjs';
import { taskIntent } from './task-intent.mjs';
import { selectCapability } from './capability-selection.mjs';
import {
  compactDoc,
  compactSourceCurrentness,
  compactMeaningCurrentness,
  compactValidation,
  taskEvidenceAnchors,
  compactImpact,
  compactVerification,
  compactRecordedQualifiers,
} from './compact-brief-sections.mjs';

const AGENT_BRIEF_COMPACT_CONTRACT = 'agentBriefCompact:v3';
export const AGENT_BRIEF_COMPACT_MAX_BYTES = 12_000;
export const AGENT_BRIEF_TASK_MAX_CHARS = 2_000;

/** `handoffPrompt` is the text channel; the rest is `structuredContent`. */
export function compactChannelBytes({ handoffPrompt, ...structure }) {
  const structureBytes = Buffer.byteLength(JSON.stringify(structure), 'utf8');
  const text = Buffer.byteLength(handoffPrompt, 'utf8');
  return { structure: structureBytes, text, total: structureBytes + text };
}

export function projectSourceSnapshotUnchanged(before, after) {
  const left = before?.receipt;
  const right = after?.receipt;
  return before?.status === 'verified_current'
    && before?.currentness === 'current'
    && after?.status === 'verified_current'
    && after?.currentness === 'current'
    && typeof left?.sourceId === 'string'
    && left.sourceId === right?.sourceId
    && left.sourceFingerprint === right?.sourceFingerprint
    && left.sourceRevision === right?.sourceRevision
    && left.graphHash === right?.graphHash;
}

export function buildCompactAgentBrief({
  brief,
  artifact,
  docs,
  sourceRoot = null,
  confirmSourceCurrent = null,
  sourceAccessRequired = false,
  task,
}) {
  if (typeof task !== 'string' || task.trim() === '') {
    throw new Error('agent_brief detail "compact" requires task.');
  }
  if (task.length > AGENT_BRIEF_TASK_MAX_CHARS) {
    throw new Error(`task must contain at most ${AGENT_BRIEF_TASK_MAX_CHARS} characters.`);
  }
  const scopedDocs = Array.isArray(docs) ? docs : [];
  const projectDoc = scopedDocs.find((doc) => doc.slug === brief.projectSlug && doc.frontmatter?.kind === 'project') ?? null;
  const intent = taskIntent(task);
  const selection = selectCapability(scopedDocs, intent);
  const selected = selection.selected;
  const capabilityDoc = selected?.doc ?? null;
  const anchorDocs = selected?.matchedChildren.map((row) => row.doc).slice(0, 3) ?? [];
  const qualifiers = compactRecordedQualifiers(capabilityDoc, anchorDocs, intent);
  let evidenceAnchors = taskEvidenceAnchors(selected, brief);
  const impact = compactImpact(artifact, capabilityDoc?.slug);
  let effectiveProjectSource = brief.projectSource;
  let effectiveMeaningAssessment = brief.meaningAssessment;
  let effectiveMeaningRepair = brief.meaningRepair;
  let effectiveStatus = brief.status;
  let effectiveReadiness = brief.readiness;
  let sourceChangedDuringNavigation = false;
  let taskNavigation = buildTaskNavigationEvidence({
    docs: [capabilityDoc, ...anchorDocs].filter(Boolean),
    sourceRoot,
    sourceStatus: brief.projectSource?.status,
    sourceCurrentness: brief.projectSource?.currentness,
    sourceLive: brief.projectSource?.live ?? null,
  });
  let verification = compactVerification(capabilityDoc, anchorDocs, taskNavigation, sourceRoot);
  const sourceAccessLost = sourceAccessRequired && !sourceRoot;
  if (sourceAccessLost || (sourceRoot && typeof confirmSourceCurrent === 'function')) {
    let stillCurrent = !sourceAccessLost;
    if (!sourceAccessLost) {
      try {
        stillCurrent = confirmSourceCurrent() === true;
      } catch {
        stillCurrent = false;
      }
    }
    if (!stillCurrent) {
      sourceChangedDuringNavigation = true;
      taskNavigation = buildTaskNavigationEvidence({
        docs: [capabilityDoc, ...anchorDocs].filter(Boolean),
        sourceRoot: null,
        sourceStatus: 'review_required',
        sourceCurrentness: 'stale',
        sourceBlockedBy: 'source_changed_during_navigation',
      });
      verification = compactVerification(capabilityDoc, anchorDocs, taskNavigation, null);
      effectiveProjectSource = {
        ...brief.projectSource,
        status: 'review_required',
        currentness: 'stale',
        topGap: { id: 'source_changed_during_navigation' },
        nextAction: { id: 'remeasure_source' },
      };
      effectiveMeaningAssessment = {
        ...brief.meaningAssessment,
        status: 'review_required',
        topGap: { dimension: 'source', id: 'source_changed_during_navigation' },
        nextAction: { id: 'remeasure_source' },
      };
      effectiveMeaningRepair = {
        ...brief.meaningRepair,
        status: 'blocked',
        blockedBy: 'source_changed_during_navigation',
        primaryQuestion: null,
        questionsNeedingReview: [],
        provenance: null,
        reviewRevision: null,
        questions: null,
        workflow: [],
      };
      effectiveStatus = 'needs_attention';
      effectiveReadiness = { ...brief.readiness, status: 'needs_attention' };
      evidenceAnchors = evidenceAnchors.map((row) => (
        row.sourceStatus === 'supported_current' || row.sourceStatus === 'supported_live'
          ? { ...row, sourceStatus: 'stale_or_unavailable' }
          : row
      ));
    }
  }
  const meaningGap = effectiveMeaningAssessment?.topGap?.id
    ? `Meaning remains ${effectiveMeaningAssessment.status}: ${effectiveMeaningAssessment.topGap.id}${effectiveMeaningAssessment.topGap.questionId ? ` (${effectiveMeaningAssessment.topGap.questionId})` : ''}.`
    : '';
  const uncertaintyDocs = [...new Map([
    projectDoc ?? { slug: brief.projectSlug, body: '' }, capabilityDoc, ...anchorDocs,
  ].filter(Boolean).map((doc) => [doc.slug, doc])).values()];
  const uncertaintyPlan = createUncertaintyPlan(uncertaintyDocs, [
    ...(sourceChangedDuringNavigation ? [{ code: 'source_changed_during_navigation', text: 'Source changed during exact navigation; every coordinate was withdrawn and must be remeasured.' }] : []),
    ...(meaningGap ? [{ code: 'meaning_gap', text: meaningGap }] : []),
  ]);
  const nextSlugs = [...new Set([
    ...uncertaintyDocs.map((doc) => doc.slug),
    ...(selection.refusal?.candidates.map((row) => row.slug) ?? []),
  ])];
  const meaningRepair = compactMeaningRepair(effectiveMeaningRepair, brief.meaningRepair.stopWhen.length);
  const compact = {
    contract: AGENT_BRIEF_COMPACT_CONTRACT,
    operation: 'agent_brief',
    detail: 'compact',
    sideEffect: false,
    project: {
      slug: brief.projectSlug,
      title: projectDoc?.frontmatter?.title || projectDoc?.frontmatter?.name || brief.projectSlug,
    },
    task: {
      requestLocal: true,
      persisted: false,
      digest: `sha256:${createHash('sha256').update(task).digest('hex')}`,
    },
    status: effectiveStatus,
    readiness: {
      status: effectiveReadiness?.status,
      score: effectiveReadiness?.score,
    },
    currentness: {
      source: compactSourceCurrentness(effectiveProjectSource),
      meaning: compactMeaningCurrentness(effectiveMeaningAssessment),
    },
    validation: compactValidation(brief),
    meaningRepair,
    focus: {
      status: capabilityDoc
        ? evidenceAnchors.length > 0 ? 'matched_with_evidence' : 'matched_without_element_evidence'
        : 'not_recorded',
      capability: capabilityDoc
        ? {
            ...compactDoc(capabilityDoc),
            claimStatus: 'recorded_bounded_claim',
            matchedTerms: selected.matchedTerms,
            statement: extractSummaryExcerpt(selected.definitionText, 240),
          }
        : null,
      ...(selection.refusal ? { refusal: selection.refusal } : {}),
      ...(qualifiers ? { qualifiers } : {}),
      evidenceAnchors,
      startingPointStatus: evidenceAnchors.some((row) => row.path) ? 'partial' : 'unknown',
      impact,
      verification,
      taskNavigation,
      ...projectUncertainty(uncertaintyPlan, []),
    },
    nextReads: [
      ...(nextSlugs.length > 0
        ? [{
            tool: 'get_concepts',
            arguments: { slugs: nextSlugs, body: 'full' },
          }]
        : []),
      { kind: 'source_follow_up' },
    ],
    safety: {
      humanApprovalRequiredForMeaningWrites: true,
      automaticWrite: false,
      automaticFinalize: false,
      structuralReadinessIsSemanticApproval: false,
    },
    readerRules: compactReaderRules({
      capability: capabilityDoc,
      navigation: taskNavigation,
      verification,
      meaningRepair,
    }),
    fullDetail: {
      tool: 'query_ontology',
      arguments: { operation: 'agent_brief', project: brief.projectSlug, detail: 'full' },
    },
  };
  const projectWithinBudget = (count, included = []) => {
    const original = compact.focus.qualifiers;
    const returned = Math.min(count, original?.units.length ?? 0);
    const omitted = Math.max(0, (original?.coverage.total ?? 0) - returned);
    const qualifiersForBudget = original ? {
      ...original,
      coverage: {
        ...original.coverage,
        returned,
        omitted,
        complete: omitted === 0,
        status: omitted === 0 ? 'complete' : 'incomplete_full_body_required',
      },
      units: original.units.slice(0, returned),
    } : null;
    const candidate = { ...compact, focus: {
      ...compact.focus,
      ...(qualifiersForBudget ? { qualifiers: qualifiersForBudget } : {}),
      ...projectUncertainty(uncertaintyPlan, included),
    } };
    return { ...candidate, handoffPrompt: buildCompactHandoffText(candidate) };
  };
  let qualifierCount = compact.focus.qualifiers?.units.length ?? 0;
  let result = projectWithinBudget(qualifierCount);
  let sizes = compactChannelBytes(result);
  while (sizes.total > AGENT_BRIEF_COMPACT_MAX_BYTES && qualifierCount > 0) {
    qualifierCount -= 1;
    result = projectWithinBudget(qualifierCount);
    sizes = compactChannelBytes(result);
  }
  if (sizes.total > AGENT_BRIEF_COMPACT_MAX_BYTES) {
    const largestFields = Object.entries(result)
      .filter(([key]) => key !== 'handoffPrompt')
      .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value), 'utf8')])
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([key, fieldBytes]) => `${key}:${fieldBytes}`)
      .join(', ');
    throw new Error(
      `agent_brief compact response is ${sizes.total} bytes (structuredContent ${sizes.structure}, handoff text ${sizes.text}), above the ${AGENT_BRIEF_COMPACT_MAX_BYTES}-byte budget (largest fields: ${largestFields}). Use detail "full" and report this compact-budget defect; do not drop currentness, meaningRepair, qualifiers, or unknowns.`,
    );
  }
  const included = [];
  for (const unit of uncertaintyPlan.candidates) {
    const candidate = projectWithinBudget(qualifierCount, [...included, unit]);
    if (compactChannelBytes(candidate).total > AGENT_BRIEF_COMPACT_MAX_BYTES) continue;
    included.push(unit);
    result = candidate;
  }
  return result;
}
