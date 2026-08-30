import { createHash } from 'node:crypto';

import { extractSummaryExcerpt } from './vault.mjs';

const AGENT_BRIEF_COMPACT_CONTRACT = 'agentBriefCompact:v1';
export const AGENT_BRIEF_COMPACT_MAX_BYTES = 8_000;
export const AGENT_BRIEF_TASK_MAX_CHARS = 2_000;

const TASK_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'both', 'but', 'by',
  'actual', 'actually', 'behavior', 'can', 'change', 'contain', 'contains', 'cover', 'current', 'currently', 'does', 'during', 'earlier', 'element', 'elements', 'even', 'field', 'fields',
  'fix', 'for', 'from', 'has', 'have', 'if', 'in', 'into', 'is', 'it', 'its',
  'no', 'of', 'on', 'only', 'or', 'preserve', 'relevant', 'return', 'returns', 'run', 'so', 'than', 'that',
  'the', 'their', 'then', 'to', 'value', 'values', 'when', 'which', 'while',
  'whose', 'with', 'without',
]);

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-US');
}

function canonicalToken(token) {
  if (/^(?:writer|writes|writing|written)$/.test(token)) return 'write';
  if (/^(?:parser|parses|parsing|parsed)$/.test(token)) return 'parse';
  if (/^(?:encoder|encodes|encoding|encoded)$/.test(token)) return 'encode';
  if (/^serializ(?:e|es|ed|er|ers|ing|ation)$/.test(token)) return 'serialize';
  return token;
}

function lexicalTokens(value) {
  const normalized = normalizeText(value).replace(/[-_/]+/g, ' ');
  const tokens = [];
  const seen = new Set();
  for (const match of normalized.matchAll(/[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*/gu)) {
    const token = match[0];
    for (const candidate of [token, ...token.split('.')]) {
      for (const normalizedCandidate of [candidate, canonicalToken(candidate)]) {
        if (!normalizedCandidate || seen.has(normalizedCandidate)) continue;
        seen.add(normalizedCandidate);
        tokens.push(normalizedCandidate);
      }
    }
  }
  return tokens;
}

function taskTerms(task) {
  const seen = new Set();
  const terms = [];
  for (const term of lexicalTokens(task)) {
    if (term.length < 2 || TASK_STOP_WORDS.has(term) || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= 24) break;
  }
  const expansions = [];
  if (terms.some((term) => (
    ['encode', 'encoding', 'encoder'].includes(term)
    || /^(?:serializ|writ)/.test(term)
  ))) expansions.push('write');
  if (terms.some((term) => /^(?:decod|pars|read)/.test(term))) expansions.push('parse');
  return [...new Set([...expansions, ...terms])];
}

function markdownSection(body, heading) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const wanted = normalizeText(heading);
  let collecting = false;
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (collecting) break;
      collecting = normalizeText(match[1]) === wanted;
      continue;
    }
    if (collecting) rows.push(line);
  }
  return rows.join('\n').trim();
}

function boundedSection(body, heading, maxChars = 420) {
  const section = markdownSection(body, heading);
  if (!section) return '';
  return extractSummaryExcerpt(section, maxChars);
}

function compactDoc(doc) {
  if (!doc) return null;
  return {
    slug: doc.slug,
    title: doc.frontmatter?.title || doc.frontmatter?.name || doc.slug,
    kind: doc.frontmatter?.kind,
    ...(typeof doc.frontmatter?.path === 'string' && doc.frontmatter.path.trim()
      ? { path: doc.frontmatter.path.trim() }
      : {}),
  };
}

function scoreDocument(doc, terms) {
  const fields = [
    ['title', 8, new Set(lexicalTokens(doc.frontmatter?.title || doc.frontmatter?.name || ''))],
    ['slug', 6, new Set(lexicalTokens(doc.slug))],
    ['path', 4, new Set(lexicalTokens(doc.frontmatter?.path || ''))],
    ['definition', 3, new Set(lexicalTokens(markdownSection(doc.body, 'Definition')))],
    ['body', 1, new Set(lexicalTokens(doc.body))],
  ];
  let score = 0;
  const matchedTerms = [];
  const matchedFields = new Set();
  for (const term of terms) {
    let termScore = 0;
    for (const [field, weight, tokens] of fields) {
      if (!tokens.has(term)) continue;
      termScore = Math.max(termScore, weight);
      matchedFields.add(field);
    }
    if (termScore === 0) continue;
    score += termScore;
    matchedTerms.push(term);
  }
  return { score, matchedTerms, matchedFields: [...matchedFields].sort() };
}

function defensibleMatch(row) {
  if (!row || row.score <= 0) return false;
  const fields = new Set(row.matchedFields);
  if (row.matchedTerms.length >= 2 && row.score >= 6) return true;
  return fields.has('title') && (fields.has('slug') || fields.has('path'));
}

function selectCapability(docs, terms) {
  const capabilities = docs.filter((doc) => doc.frontmatter?.kind === 'capability');
  const elements = docs.filter((doc) => doc.frontmatter?.kind === 'element');
  const elementScores = new Map(elements.map((doc) => [doc.slug, { doc, ...scoreDocument(doc, terms) }]));
  const rows = capabilities.map((doc) => {
    const direct = scoreDocument(doc, terms);
    const matchedChildren = (Array.isArray(doc.frontmatter?.elements) ? doc.frontmatter.elements : [])
      .map((slug) => elementScores.get(slug))
      .filter((row) => defensibleMatch(row))
      .sort((left, right) => right.score - left.score || left.doc.slug.localeCompare(right.doc.slug));
    const directQualified = defensibleMatch(direct);
    const childScore = matchedChildren
      .slice(0, 3)
      .reduce((sum, row) => sum + Math.floor(row.score / 2), 0);
    const matchedTerms = [...new Set([
      ...(directQualified ? direct.matchedTerms : []),
      ...matchedChildren.flatMap((row) => row.matchedTerms),
    ])].sort();
    return {
      doc,
      score: (directQualified ? direct.score : 0) + childScore,
      matchedTerms,
      matchedChildren,
      qualified: directQualified || matchedChildren.length > 0,
    };
  }).filter((row) => row.qualified);
  rows.sort((left, right) => right.score - left.score || left.doc.slug.localeCompare(right.doc.slug));
  if (rows.length === 0 || rows[0].score <= 0) return null;
  if (rows[1]?.score === rows[0].score) return null;
  return rows[0];
}

function compactSourceCurrentness(projectSource) {
  const receipt = projectSource?.receipt;
  return {
    status: projectSource?.status ?? 'review_required',
    currentness: projectSource?.currentness ?? 'unavailable',
    measuredAt: projectSource?.measuredAt ?? null,
    topGap: projectSource?.topGap ?? null,
    nextAction: projectSource?.nextAction ?? null,
    witnessSummary: receipt?.witnessSummary ?? { total: 0, supported: 0, missing: 0 },
  };
}

function compactMeaningCurrentness(assessment) {
  return {
    status: assessment?.status ?? 'invalid',
    topGap: assessment?.topGap ?? null,
    nextAction: assessment?.nextAction ?? null,
    questions: Array.isArray(assessment?.dimensions?.competency?.questions)
      ? assessment.dimensions.competency.questions.map((row) => ({
          id: row.id,
          status: row.status,
          witnessStatus: row.witnessStatus,
        }))
      : [],
  };
}

function compactValidation(brief) {
  const summary = brief.health?.validation?.summary;
  const pathDrift = brief.health?.validation?.pathDrift;
  const problemFiles = Number.isInteger(summary?.problemFiles) ? summary.problemFiles : 0;
  const errorFiles = Number.isInteger(summary?.errorFiles) ? summary.errorFiles : 0;
  const warningFiles = Number.isInteger(summary?.warningFiles) ? summary.warningFiles : 0;
  return {
    status: !summary
      ? 'not_checked'
      : errorFiles > 0 ? 'fail' : warningFiles > 0 || problemFiles > 0 ? 'warn' : 'pass',
    scope: 'whole_vault',
    problemFiles,
    errorFiles,
    warningFiles,
    sourcePathsChecked: pathDrift?.checked === true,
    driftCount: Array.isArray(pathDrift?.drifts) ? pathDrift.drifts.length : 0,
  };
}

function currentWitnessStatus(brief, slug, path) {
  const witnesses = Array.isArray(brief.projectSource?.receipt?.witnesses)
    ? brief.projectSource.receipt.witnesses
    : [];
  const row = witnesses.find((witness) => witness.nodeSlug === slug && witness.path === path);
  if (!row) return 'not_measured';
  if (row.supported !== true) return 'missing_or_changed';
  if (brief.projectSource?.status !== 'verified_current' || brief.projectSource?.currentness !== 'current') {
    return 'stale_or_unavailable';
  }
  return 'supported_current';
}

function taskEvidenceAnchors(selected, brief) {
  const capabilityDoc = selected?.doc;
  if (!capabilityDoc) return [];
  return selected.matchedChildren
    .slice(0, 3)
    .map(({ doc }) => {
      const node = compactDoc(doc);
      return {
        ...node,
        relation: `${capabilityDoc.slug} --elements--> ${doc.slug}`,
        claimStatus: node.path ? 'recorded_path_anchor' : 'recorded_element_without_path',
        sourceStatus: node.path
          ? currentWitnessStatus(brief, doc.slug, node.path)
          : 'not_measured',
      };
    });
}

function compactImpact(artifact, capabilitySlug) {
  const dependencyEdges = (Array.isArray(artifact?.edges) ? artifact.edges : [])
    .filter((edge) => (
      ['dependencies', 'depends_on'].includes(edge.via)
      && (edge.from === capabilitySlug || edge.to === capabilitySlug)
    ));
  const declaredWithRationale = dependencyEdges.filter((edge) => typeof edge.rationale === 'string' && edge.rationale.trim()).length;
  return {
    status: dependencyEdges.length === 0
      ? 'unknown'
      : declaredWithRationale === dependencyEdges.length
        ? 'declared_with_rationale'
        : 'review_required',
    basis: 'declared_dependencies',
    completeness: 'unknown',
    sourceBacked: false,
    declaredEdges: dependencyEdges.length,
    edges: dependencyEdges.slice(0, 3).map((edge) => ({
      from: edge.from,
      to: edge.to,
      relation: 'depends_on',
      qualification: edge.rationale ? 'declared_with_rationale' : 'review_required',
    })),
  };
}

function evidencePaths(doc) {
  if (!doc) return [];
  const section = markdownSection(doc.body, 'Evidence');
  return [...section.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function compactVerification(capabilityDoc, anchorDocs) {
  const paths = [...new Set([capabilityDoc, ...anchorDocs]
    .flatMap((doc) => evidencePaths(doc))
    .filter((path) => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|(?:test|spec)\.[^.\/]+$/i.test(path)))]
    .sort()
    .slice(0, 4);
  return {
    status: paths.length > 0 ? 'recorded' : 'unknown',
    recordedPaths: paths,
    nextAction: paths.length > 0
      ? 'Run the recorded focused verification after checking its full-body evidence and current source status.'
      : 'Inspect tests near the recorded anchors; no exact test path is recorded.',
  };
}

function uniqueBoundedStrings(values, limit = 3) {
  const seen = new Set();
  const rows = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    rows.push(text.length > 160 ? `${text.slice(0, 159).trimEnd()}…` : text);
    if (rows.length >= limit) break;
  }
  return rows;
}

function buildCompactHandoffPrompt(result) {
  const capability = result.focus.capability;
  const anchors = result.focus.evidenceAnchors;
  const nextRead = result.nextReads[0];
  return [
    `Atlas compact task handoff — ${result.project.slug}`,
    `Current source: ${result.currentness.source.status}/${result.currentness.source.currentness}`,
    `Meaning: ${result.currentness.meaning.status}`,
    `Validation: ${result.validation.status} (${result.validation.errorFiles} errors, ${result.validation.warningFiles} warnings)`,
    `Purpose: ${result.purpose.statement || 'not recorded'}`,
    `Task match: ${capability ? `${capability.slug} (selection, not proof)` : 'not recorded'}`,
    `Known evidence: ${anchors.length > 0 ? anchors.map((row) => `${row.slug}${row.path ? ` at ${row.path}` : ''}`).join(', ') : 'none recorded'}`,
    `Impact: ${result.focus.impact.status}/${result.focus.impact.completeness}`,
    `Unknown: ${result.focus.unknowns[0] ?? 'no additional bounded unknown was recorded'}`,
    `Verify: ${result.focus.verification.status}${result.focus.verification.recordedPaths.length > 0 ? ` at ${result.focus.verification.recordedPaths.join(', ')}` : '; discover near the anchor'}`,
    `Next read: ${nextRead ? `${nextRead.tool} ${JSON.stringify(nextRead.arguments)}` : 'inspect source from the recorded anchor'}`,
    `Full detail: ${result.fullDetail.tool} ${JSON.stringify(result.fullDetail.arguments)}`,
  ].join('\n');
}

export function buildCompactAgentBrief({ brief, artifact, docs, task }) {
  if (typeof task !== 'string' || task.trim() === '') {
    throw new Error('agent_brief detail "compact" requires task.');
  }
  if (task.length > AGENT_BRIEF_TASK_MAX_CHARS) {
    throw new Error(`task must contain at most ${AGENT_BRIEF_TASK_MAX_CHARS} characters.`);
  }
  const scopedDocs = Array.isArray(docs) ? docs : [];
  const projectDoc = scopedDocs.find((doc) => doc.slug === brief.projectSlug && doc.frontmatter?.kind === 'project') ?? null;
  const terms = taskTerms(task);
  const selected = selectCapability(scopedDocs, terms);
  const capabilityDoc = selected?.doc ?? null;
  const anchorDocs = selected?.matchedChildren.map((row) => row.doc).slice(0, 3) ?? [];
  const evidenceAnchors = taskEvidenceAnchors(selected, brief);
  const impact = compactImpact(artifact, capabilityDoc?.slug);
  const verification = compactVerification(capabilityDoc, anchorDocs);
  const capabilityUncertainty = boundedSection(capabilityDoc?.body, 'Uncertainty', 220);
  const anchorUncertainty = anchorDocs.map((doc) => boundedSection(doc.body, 'Uncertainty', 180));
  const projectDefinition = boundedSection(projectDoc?.body, 'Definition', 260);
  const projectExcludes = boundedSection(projectDoc?.body, 'Excludes', 180);
  const projectUncertainty = boundedSection(projectDoc?.body, 'Uncertainty', 180);
  const meaningGap = brief.meaningAssessment?.topGap?.id
    ? `Meaning remains ${brief.meaningAssessment.status}: ${brief.meaningAssessment.topGap.id}${brief.meaningAssessment.topGap.questionId ? ` (${brief.meaningAssessment.topGap.questionId})` : ''}.`
    : '';
  const unknowns = uniqueBoundedStrings([
    capabilityUncertainty,
    ...anchorUncertainty,
    projectUncertainty,
    meaningGap,
  ]);
  const nextSlugs = [...new Set([
    capabilityDoc?.slug,
    ...evidenceAnchors.map((row) => row.slug),
    ...(capabilityDoc ? [] : [brief.projectSlug]),
  ].filter(Boolean))].slice(0, 4);
  const compact = {
    contract: AGENT_BRIEF_COMPACT_CONTRACT,
    operation: 'agent_brief',
    detail: 'compact',
    sideEffect: false,
    project: {
      slug: brief.projectSlug,
      title: projectDoc?.frontmatter?.title || projectDoc?.frontmatter?.name || brief.projectSlug,
      scope: {
        nodes: brief.graph?.nodes ?? 0,
        domains: brief.graph?.domains ?? 0,
        capabilities: brief.graph?.capabilities ?? 0,
        elements: brief.graph?.elements ?? 0,
        internalEdges: brief.graph?.edges ?? 0,
      },
    },
    task: {
      requestLocal: true,
      persisted: false,
      digest: `sha256:${createHash('sha256').update(task).digest('hex')}`,
      terms: terms.slice(0, 5),
    },
    status: brief.status,
    readiness: {
      status: brief.readiness?.status,
      score: brief.readiness?.score,
    },
    currentness: {
      source: compactSourceCurrentness(brief.projectSource),
      meaning: compactMeaningCurrentness(brief.meaningAssessment),
    },
    validation: compactValidation(brief),
    meaningRepair: brief.meaningRepair,
    purpose: {
      slug: brief.projectSlug,
      statement: projectDefinition,
      scopeLimit: projectExcludes || projectUncertainty,
    },
    focus: {
      status: capabilityDoc
        ? evidenceAnchors.length > 0 ? 'matched_with_evidence' : 'matched_without_element_evidence'
        : 'not_recorded',
      selectionPolicy: 'Lexical match selects persisted evidence; it is not behavior proof or approval.',
      capability: capabilityDoc
        ? {
            ...compactDoc(capabilityDoc),
            claimStatus: 'recorded_bounded_claim',
            matchedTerms: selected.matchedTerms,
            statement: boundedSection(capabilityDoc.body, 'Definition', 240),
          }
        : null,
      evidenceAnchors,
      startingPointStatus: evidenceAnchors.some((row) => row.path) ? 'partial' : 'unknown',
      impact,
      verification,
      unknowns,
    },
    nextReads: [
      ...(nextSlugs.length > 0
        ? [{
            reason: 'Read complete bodies and qualifiers before use.',
            tool: 'get_concepts',
            arguments: { slugs: nextSlugs, body: 'full' },
          }]
        : []),
      {
        reason: evidenceAnchors.some((row) => row.path)
          ? 'Inspect source from the anchors; task behavior remains unproven.'
          : 'No task path is recorded; preserve the unknown during source search.',
        kind: 'source_follow_up',
      },
    ],
    safety: {
      humanApprovalRequiredForMeaningWrites: true,
      automaticWrite: false,
      automaticFinalize: false,
      structuralReadinessIsSemanticApproval: false,
    },
    fullDetail: {
      tool: 'query_ontology',
      arguments: { operation: 'agent_brief', project: brief.projectSlug, detail: 'full' },
      reason: 'Read complete diagnostics only when compact is insufficient.',
    },
  };
  const result = { ...compact, handoffPrompt: buildCompactHandoffPrompt(compact) };
  const bytes = Buffer.byteLength(JSON.stringify(result, null, 2), 'utf8');
  if (bytes > AGENT_BRIEF_COMPACT_MAX_BYTES) {
    const largestFields = Object.entries(result)
      .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value), 'utf8')])
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([key, fieldBytes]) => `${key}:${fieldBytes}`)
      .join(', ');
    throw new Error(
      `agent_brief compact response is ${bytes} bytes, above the ${AGENT_BRIEF_COMPACT_MAX_BYTES}-byte budget (largest fields: ${largestFields}). Use detail "full" and report this compact-budget defect; do not drop currentness, meaningRepair, qualifiers, or unknowns.`,
    );
  }
  return result;
}
