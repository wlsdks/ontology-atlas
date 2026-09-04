import { createHash } from 'node:crypto';

import {
  buildTaskNavigationEvidence,
  verifyTaskNavigationEvidencePath,
} from './task-navigation-evidence.mjs';
import { extractSummaryExcerpt } from './vault.mjs';

const AGENT_BRIEF_COMPACT_CONTRACT = 'agentBriefCompact:v2';
export const AGENT_BRIEF_COMPACT_MAX_BYTES = 12_000;
export const AGENT_BRIEF_TASK_MAX_CHARS = 2_000;

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
  if (/^(?:writer|writes|writing|written|produce|produces|produced|producing|production)$/.test(token)) return 'write';
  if (/^(?:parser|parses|parsing|parsed|interpret|interprets|interpreted|interpreting|interpretation)$/.test(token)) return 'parse';
  if (/^(?:encoder|encodes|encoding|encoded)$/.test(token)) return 'encode';
  if (/^serializ(?:e|es|ed|er|ers|ing|ation)$/.test(token)) return 'serialize';
  if (/^reject(?:s|ed|ing|ion)?$/.test(token)) return 'reject';
  if (/^(?:decide|decides|decided|deciding|decision)$/.test(token)) return 'decide';
  if (/^(?:evaluate|evaluates|evaluated|evaluating|evaluation)$/.test(token)) return 'evaluate';
  if (/^(?:appraise|appraises|appraised|appraising|appraisal)$/.test(token)) return 'appraise';
  if (/^(?:accept|accepts|accepted|accepting|acceptable|acceptance)$/.test(token)) return 'accept';
  if (/^(?:expire|expires|expired|expiring|expiry)$/.test(token)) return 'expire';
  if (/^(?:diagnostic|diagnostics)$/.test(token)) return 'diagnostic';
  if (/^(?:report|reports|reported|reporting)$/.test(token)) return 'report';
  if (/^(?:remain|remains|remained|remaining)$/.test(token)) return 'remain';
  if (token.length > 4 && /[^s]s$/.test(token) && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
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

const NON_GOAL_CLAUSE = /\b(?:do\s+not|must\s+not|should\s+not|never|without|out\s+of\s+scope|not\s+in\s+scope|(?:leave|keep)\b.*\bunchanged|(?:must|should)\s+(?:remain|stay)\s+unchanged|(?:are|is)\s+unchanged)\b/iu;

function splitInlineBoundaryClause(clause) {
  for (const pattern of [
    /\s+(?:and|but|while)\s+(?=(?:do\s+not|must\s+not|should\s+not|never)\b|(?:leave|keep)\b.*\bunchanged\b)/iu,
    /\s+(?=without\b)/iu,
  ]) {
    const match = pattern.exec(clause);
    if (match?.index > 0) {
      return [clause.slice(0, match.index), clause.slice(match.index + match[0].length)];
    }
  }
  return [clause];
}

function stripNonGoalMarker(clause) {
  return clause
    .replace(/\b(?:do\s+not|must\s+not|should\s+not|never)\s+(?:add|change|modify|replace|remove|introduce)?\b/giu, ' ')
    .replace(/\b(?:must|should)\s+(?:remain|stay)\s+unchanged\b/giu, ' ')
    .replace(/\b(?:are|is)\s+unchanged\b/giu, ' ')
    .replace(/\b(?:are|is)\s+out\s+of\s+scope\b/giu, ' ')
    .replace(/\b(?:are|is)\s+not\s+in\s+scope\b/giu, ' ')
    .replace(/\bnot\s+in\s+scope\b/giu, ' ')
    .replace(/\b(?:leave|keep)\b/giu, ' ')
    .replace(/\bunchanged\b/giu, ' ')
    .replace(/\bwithout\b/giu, ' ');
}

function taskIntent(task) {
  const clauses = String(task)
    .split(/[;,.!?\n]+/u)
    .flatMap((clause) => splitInlineBoundaryClause(clause.trim()))
    .map((clause) => clause.trim())
    .filter(Boolean);
  const desiredClauses = [];
  const nonGoalClauses = [];
  for (const clause of clauses) {
    if (NON_GOAL_CLAUSE.test(clause)) nonGoalClauses.push(stripNonGoalMarker(clause));
    else desiredClauses.push(clause);
  }
  return {
    allTerms: taskTerms(task),
    desiredTerms: taskTerms(desiredClauses.join(' ')),
    nonGoalTerms: taskTerms(nonGoalClauses.join(' ')),
  };
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

function scoreLexicalDocument(doc, terms) {
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

function matchedTermsIn(terms, tokens) {
  return terms.filter((term) => tokens.has(term));
}

function matchedTermsOnlyIn(terms, included, excluded) {
  return terms.filter((term) => included.has(term) && !excluded.has(term));
}

/**
 * The persisted claim a capability makes about itself, read from its Markdown.
 *
 * Three headings carry the claim: `## Definition`, `## Includes`, `## Excludes`.
 * Two older shapes are read as the same claim so a document written before the
 * construction rules does not fall through to its whole body: `## Inclusions` /
 * `## Exclusions`, and one `## Inclusions / Exclusions` section whose bullets
 * start with `Included:` and `Excluded:`.
 *
 * A document that states none of these is scored on its first prose paragraph —
 * the same excerpt `get_concept` returns — never on its full body. Measured
 * 2026-09-04 on the dogfood vault: the 25k-character MCP server document, which
 * had no `## Definition`, matched every task on generic nouns (`display`,
 * `name`, `result`) and beat the capability whose title named the task.
 */
function claimSections(doc) {
  const body = doc?.body;
  const definition = markdownSection(body, 'Definition');
  let includes = markdownSection(body, 'Includes') || markdownSection(body, 'Inclusions');
  let excludes = markdownSection(body, 'Excludes') || markdownSection(body, 'Exclusions');
  const combined = markdownSection(body, 'Inclusions / Exclusions') || markdownSection(body, 'Inclusions/Exclusions');
  if (combined) {
    const buckets = { includes: [], excludes: [] };
    let bucket = null;
    for (const line of combined.split('\n')) {
      const bullet = line.match(/^\s*[-*]\s*(?:\*\*)?(Included|Includes|Inclusions?|Excluded|Excludes|Exclusions?)(?:\*\*)?\s*:\s*(.*)$/iu);
      if (bullet) {
        bucket = /^(inc|inclu)/iu.test(bullet[1]) ? 'includes' : 'excludes';
        buckets[bucket].push(bullet[2]);
        continue;
      }
      if (bucket && /^\s+\S/.test(line)) buckets[bucket].push(line.trim());
      else if (/^\s*[-*]\s/.test(line)) bucket = null;
    }
    includes = [includes, buckets.includes.join(' ')].filter(Boolean).join(' ');
    excludes = [excludes, buckets.excludes.join(' ')].filter(Boolean).join(' ');
  }
  const structured = Boolean(definition || includes || excludes);
  return {
    definition: new Set(lexicalTokens(definition)),
    includes: new Set(lexicalTokens(includes)),
    excludes: new Set(lexicalTokens(excludes)),
    excerpt: structured ? new Set() : new Set(lexicalTokens(extractSummaryExcerpt(body, 420))),
    structured,
  };
}

function scoreCapabilityClaim(doc, intent) {
  const { definition, includes, excludes, excerpt } = claimSections(doc);
  // The name a person gave the capability is part of its claim: a task that
  // says "topology map" belongs to "Topology Map Rendering & Search" before it
  // belongs to a document whose prose merely mentions maps. Identity enters
  // the positive set *before* the Excludes subtraction, so a title can never
  // override an explicit boundary, and it feeds the non-goal conflict check,
  // so refusal only gets stricter.
  const identity = new Set(lexicalTokens([
    doc.frontmatter?.title || doc.frontmatter?.name || '',
    doc.slug,
    doc.frontmatter?.path || '',
  ].join(' ')));
  const positive = new Set([...definition, ...includes, ...excerpt, ...identity]);
  const desiredPositive = matchedTermsOnlyIn(intent.desiredTerms, positive, excludes);
  const desiredExcluded = matchedTermsOnlyIn(intent.desiredTerms, excludes, positive);
  const desiredTermSet = new Set(intent.desiredTerms);
  const distinctNonGoalTerms = intent.nonGoalTerms.filter((term) => !desiredTermSet.has(term));
  const nonGoalPositive = matchedTermsOnlyIn(distinctNonGoalTerms, positive, excludes);
  const nonGoalExcluded = matchedTermsOnlyIn(distinctNonGoalTerms, excludes, positive);
  const identitySupport = desiredPositive.filter((term) => identity.has(term));
  const hasClaimSupport = desiredPositive.length >= 2
    || (desiredPositive.length >= 1 && nonGoalExcluded.length >= 1)
    || identitySupport.length >= 1;
  const conflict = desiredExcluded.length > 0 || nonGoalPositive.length > 0;
  const termWeight = (term) => (
    includes.has(term) || identity.has(term) ? 6 : definition.has(term) ? 4 : 2
  );
  const score = desiredPositive.reduce((sum, term) => sum + termWeight(term), 0)
    + nonGoalExcluded.length * 4;
  return {
    score,
    excludes,
    matchedTerms: [...new Set([...desiredPositive, ...nonGoalExcluded])].sort(),
    matchedFields: [
      ...(matchedTermsIn(intent.desiredTerms, definition).length > 0 ? ['definition'] : []),
      ...(matchedTermsIn(intent.desiredTerms, includes).length > 0 ? ['includes'] : []),
      ...(nonGoalExcluded.length > 0 ? ['excludes'] : []),
      ...(identitySupport.length > 0 ? ['identity'] : []),
    ],
    qualified: hasClaimSupport && !conflict && score > 0,
  };
}

function defensibleMatch(row) {
  if (!row || row.score <= 0) return false;
  const fields = new Set(row.matchedFields);
  if (row.matchedTerms.length >= 2 && row.score >= 6) return true;
  return fields.has('title') && (fields.has('slug') || fields.has('path'));
}

function selectCapability(docs, intent) {
  const capabilities = docs.filter((doc) => doc.frontmatter?.kind === 'capability');
  const elements = docs.filter((doc) => doc.frontmatter?.kind === 'element');
  const elementScores = new Map(elements.map((doc) => [doc.slug, {
    doc,
    ...scoreLexicalDocument(doc, intent.allTerms),
  }]));
  const rows = capabilities.map((doc) => {
    const claim = scoreCapabilityClaim(doc, intent);
    const matchedChildren = (Array.isArray(doc.frontmatter?.elements) ? doc.frontmatter.elements : [])
      .map((slug) => elementScores.get(slug))
      .filter((row) => defensibleMatch(row))
      .sort((left, right) => right.score - left.score || left.doc.slug.localeCompare(right.doc.slug));
    const matchedTerms = [...new Set([
      ...claim.matchedTerms,
      ...matchedChildren.flatMap((row) => row.matchedTerms),
    ])].sort();
    // An element the capability declares it owns is persisted evidence of what
    // the capability covers: "Topology Index Panel" under "Topology Map
    // Rendering & Search" says more about an INDEX-panel task than a
    // neighbouring capability whose definition happens to mention the panel.
    // Only the element's own name, slug, and path count, only distinct desired
    // terms, capped at four, and only once the parent's own claim qualified —
    // a child never rescues a conflicting or empty parent claim (2026-09-02).
    const childIdentityTerms = new Set();
    if (claim.qualified) {
      for (const row of matchedChildren) {
        const identity = new Set(lexicalTokens([
          row.doc.frontmatter?.title || row.doc.frontmatter?.name || '',
          row.doc.slug,
          row.doc.frontmatter?.path || '',
        ].join(' ')));
        for (const term of intent.desiredTerms) {
          if (identity.has(term) && !claim.excludes.has(term)) childIdentityTerms.add(term);
        }
      }
    }
    return {
      doc,
      score: claim.score + Math.min(childIdentityTerms.size, 4) * 3,
      matchedTerms,
      matchedChildren,
      qualified: claim.qualified,
    };
  }).filter((row) => row.qualified);
  rows.sort((left, right) => right.score - left.score || left.doc.slug.localeCompare(right.doc.slug));
  if (rows.length === 0 || rows[0].score <= 0) return null;
  if (rows[1]?.score === rows[0].score) return null;
  return rows[0];
}

function liveWitnessesSupported(projectSource) {
  return projectSource?.status !== 'verified_current'
    && projectSource?.live?.status === 'witnesses_supported';
}

function compactSourceCurrentness(projectSource) {
  const receipt = projectSource?.receipt;
  const live = projectSource?.live;
  return {
    status: projectSource?.status ?? 'review_required',
    currentness: projectSource?.currentness ?? 'unavailable',
    measuredAt: projectSource?.measuredAt ?? null,
    topGap: projectSource?.topGap ?? null,
    nextAction: projectSource?.nextAction ?? null,
    witnessSummary: receipt?.witnessSummary ?? { total: 0, supported: 0, missing: 0 },
    // The receipt is a person's measurement and stays stale until remeasured;
    // `live` is what the same bounded probe saw just now. Both are reported so
    // a reader sees which one a coordinate was verified against.
    ...(live
      ? {
          live: {
            status: live.status,
            sourceRevision: typeof live.sourceRevision === 'string' ? live.sourceRevision.slice(0, 12) : null,
            witnessSummary: live.witnessSummary,
            ...(Array.isArray(live.missingPaths) && live.missingPaths.length > 0
              ? { missingPaths: live.missingPaths.slice(0, 5) }
              : {}),
          },
        }
      : {}),
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
    return liveWitnessesSupported(brief.projectSource) ? 'supported_live' : 'stale_or_unavailable';
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

function compactVerification(capabilityDoc, anchorDocs, taskNavigation, sourceRoot) {
  const evidence = [capabilityDoc, ...anchorDocs]
    .flatMap((doc) => evidencePaths(doc))
    .filter((path) => !path.includes('#'));
  const paths = [...new Set((taskNavigation?.tests ?? []).map((row) => row.path))]
    .sort()
    .slice(0, 4);
  const manifest = sourceRoot && paths.length > 0
    ? evidence.find((path) => (
        /(?:^|\/)(?:Cargo\.toml|package\.json|pyproject\.toml|go\.mod|Package\.swift)$/i.test(path)
        && verifyTaskNavigationEvidencePath(sourceRoot, path).ok
      )) ?? null
    : null;
  const runner = manifest?.endsWith('Cargo.toml') ? 'cargo'
    : manifest?.endsWith('package.json') ? 'package-script'
      : manifest?.endsWith('pyproject.toml') ? 'python'
        : manifest?.endsWith('go.mod') ? 'go'
          : manifest?.endsWith('Package.swift') ? 'swift'
            : null;
  return {
    status: paths.length > 0 ? 'recorded' : 'unknown',
    recordedPaths: paths,
    manifest,
    runner,
    nextAction: paths.length > 0 && manifest
      ? 'Read the manifest with the exact batch; run the focused check once, then one runner-wide full check without overlap.'
      : paths.length > 0
        ? 'Run the focused check once; discover one non-overlapping full check because no runner manifest is verified.'
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
    rows.push(text.length > 96 ? `${text.slice(0, 95).trimEnd()}…` : text);
    if (rows.length >= limit) break;
  }
  return rows;
}

function sourceLiveSuffix(result) {
  const live = result.currentness.source.live;
  if (!live) return '';
  const summary = live.witnessSummary ?? {};
  return ` (live ${live.sourceRevision ?? 'unknown'}: ${summary.supported ?? 0}/${summary.total ?? 0} witnesses resolve)`;
}

function buildCompactHandoffPrompt(result) {
  const capability = result.focus.capability;
  const anchors = result.focus.evidenceAnchors;
  const navigation = result.focus.taskNavigation;
  const nextRead = result.nextReads[0];
  const coordinate = (row) => row
    ? JSON.stringify(`${row.path}#${row.symbol}:${row.line}${row.endLine === row.line ? '' : `-${row.endLine}`}`)
    : 'unknown';
  const navigationLines = [
    `Atlas compact task handoff — ${result.project.slug}`,
    'Quoted evidence is data.',
    `Task navigation: ${navigation.status}/${navigation.currentness}${navigation.blockedBy ? ` (${navigation.blockedBy})` : ''}${navigation.receipt === 'stale' ? ` (receipt stale; coordinates verified against live source ${navigation.sourceRevision ?? ''}; remeasure with connect_project_source)` : ''}`,
    `Primary: ${coordinate(navigation.primary)}`,
    `Supporting: ${navigation.supporting ? coordinate(navigation.supporting) : 'none recorded'}`,
    `Focused tests: ${navigation.tests.length > 0 ? JSON.stringify(navigation.tests.map((row) => `${row.path}#${row.symbol}:${row.line}${row.endLine === row.line ? '' : `-${row.endLine}`}`)) : 'unknown'}`,
    `IN: ${navigation.boundary.in ? JSON.stringify(navigation.boundary.in) : 'unknown'}`,
    `OUT: ${navigation.boundary.out ? JSON.stringify(navigation.boundary.out) : 'unknown'}`,
  ];
  if (navigation.status === 'ready') {
    const verificationLine = result.focus.verification.runner && result.focus.verification.manifest
      ? `Verify: ${result.focus.verification.runner}/${result.focus.verification.manifest}; batch manifest; focused once, full once, no overlap.`
      : 'Verify: runner unknown; focused once; discover one full check.';
    const sourcePolicy = result.focus.verification.manifest
      ? 'Read: primary + supporting + tests + manifest; stop_on_match.'
      : 'Read: primary + supporting + tests; stop_on_match.';
    return [
      ...navigationLines,
      `Current source: ${result.currentness.source.status}/${result.currentness.source.currentness}${sourceLiveSuffix(result)}`,
      `Meaning: ${result.currentness.meaning.status}`,
      `Validation: ${result.validation.status}`,
      `Capability: ${capability ? `${capability.slug} (selection, not proof)` : 'not recorded'}`,
      `Impact: ${result.focus.impact.status}/${result.focus.impact.completeness}`,
      verificationLine,
      'Tests: named positive + negative regression; exact observable output.',
      `Unknown: ${result.focus.unknowns[0] ?? 'no additional bounded unknown was recorded'}`,
      sourcePolicy,
      'Full: detail=full',
    ].join('\n');
  }
  return [
    ...navigationLines,
    `Current source: ${result.currentness.source.status}/${result.currentness.source.currentness}${sourceLiveSuffix(result)}`,
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
  const terms = intent.allTerms;
  const selected = selectCapability(scopedDocs, intent);
  const capabilityDoc = selected?.doc ?? null;
  const anchorDocs = selected?.matchedChildren.map((row) => row.doc).slice(0, 3) ?? [];
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
        stopWhen: ['source_changed_during_navigation'],
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
  const capabilityUncertainty = boundedSection(capabilityDoc?.body, 'Uncertainty', 220);
  const anchorUncertainty = anchorDocs.map((doc) => boundedSection(doc.body, 'Uncertainty', 180));
  const projectDefinition = boundedSection(projectDoc?.body, 'Definition', 260);
  const projectExcludes = boundedSection(projectDoc?.body, 'Excludes', 180);
  const projectUncertainty = boundedSection(projectDoc?.body, 'Uncertainty', 180);
  const meaningGap = effectiveMeaningAssessment?.topGap?.id
    ? `Meaning remains ${effectiveMeaningAssessment.status}: ${effectiveMeaningAssessment.topGap.id}${effectiveMeaningAssessment.topGap.questionId ? ` (${effectiveMeaningAssessment.topGap.questionId})` : ''}.`
    : '';
  const unknowns = uniqueBoundedStrings([
    sourceChangedDuringNavigation
      ? 'Source changed during exact navigation; every coordinate was withdrawn and must be remeasured.'
      : '',
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
    meaningRepair: effectiveMeaningRepair,
    purpose: {
      slug: brief.projectSlug,
      statement: projectDefinition,
      scopeLimit: projectExcludes || projectUncertainty,
    },
    focus: {
      status: capabilityDoc
        ? evidenceAnchors.length > 0 ? 'matched_with_evidence' : 'matched_without_element_evidence'
        : 'not_recorded',
      selectionPolicy: 'Persisted Definition, Includes, and Excludes compatibility selects evidence; it is not behavior proof or approval.',
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
      taskNavigation,
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
