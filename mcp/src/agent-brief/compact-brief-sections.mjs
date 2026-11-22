// The measured sections of a compact agent brief: source and meaning currentness,
// validation, impact, verification and the recorded qualifiers.

import { completeMarkdownUnits } from './recorded-evidence.mjs';
import { readReviewedEvidence } from './reviewed-evidence.mjs';
import { verifyTaskNavigationEvidencePath } from './task-navigation-evidence.mjs';
import { lexicalTokens } from './task-intent.mjs';

export function compactDoc(doc) {
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

function liveWitnessesSupported(projectSource) {
  return projectSource?.status !== 'verified_current'
    && projectSource?.live?.status === 'witnesses_supported';
}

export function compactSourceCurrentness(projectSource) {
  const receipt = projectSource?.receipt;
  const live = projectSource?.live;
  return {
    status: projectSource?.status ?? 'review_required',
    currentness: projectSource?.currentness ?? 'unavailable',
    measuredAt: projectSource?.measuredAt ?? null,
    topGap: projectSource?.topGap ?? null,
    nextAction: projectSource?.nextAction ?? null,
    witnessSummary: receipt?.witnessSummary ?? { total: 0, supported: 0, missing: 0 },
    // The receipt is a person's measurement, stale until remeasured; `live` is what
    // the probe saw now. Both are reported.
    ...(live
      ? {
          live: {
            status: live.status,
            ...(live.basis ? { basis: live.basis } : {}),
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

export function compactMeaningCurrentness(assessment) {
  return {
    status: assessment?.status ?? 'invalid',
    topGap: assessment?.topGap ?? null,
    nextAction: assessment?.nextAction ?? null,
    questionCount: Array.isArray(assessment?.dimensions?.competency?.questions)
      ? assessment.dimensions.competency.questions.length
      : 0,
  };
}

export function compactValidation(brief) {
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

export function taskEvidenceAnchors(selected, brief) {
  const capabilityDoc = selected?.doc;
  if (!capabilityDoc) return [];
  return selected.matchedChildren
    .slice(0, 3)
    .map(({ doc }) => {
      const node = compactDoc(doc);
      return {
        ...node,
        claimStatus: node.path ? 'recorded_path_anchor' : 'recorded_element_without_path',
        sourceStatus: node.path
          ? currentWitnessStatus(brief, doc.slug, node.path)
          : 'not_measured',
      };
    });
}

export function compactImpact(artifact, capabilitySlug) {
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
  return readReviewedEvidence(doc.body).paths
    .map((path) => path.trim())
    .filter(Boolean);
}

export function compactVerification(capabilityDoc, anchorDocs, taskNavigation, sourceRoot) {
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
  };
}

const QUALIFIER_SECTIONS = [
  ['Definition', 'definition'],
  ['Includes', 'condition'],
  ['Excludes', 'exception'],
  ['Uncertainty', 'uncertainty'],
];

export function compactRecordedQualifiers(capabilityDoc, anchorDocs, intent) {
  if (!capabilityDoc) return null;
  const docs = [capabilityDoc, ...anchorDocs];
  const eligible = docs.flatMap((doc) => QUALIFIER_SECTIONS.flatMap(([section, role]) => (
    completeMarkdownUnits(doc, section, role)
  )));
  const unitTokens = (unit) => {
    const tokens = new Set(lexicalTokens(unit.text));
    for (const left of intent.allTerms) {
      for (const right of intent.allTerms) {
        if (left !== right && tokens.has(`${left}${right}`)) {
          tokens.add(left);
          tokens.add(right);
        }
      }
    }
    return tokens;
  };
  const score = (unit) => {
    const tokens = unitTokens(unit);
    return intent.allTerms.filter((term) => tokens.has(term)).length;
  };
  const ordered = (units) => [...units].sort((left, right) => (
    score(right) - score(left)
    || left.slug.localeCompare(right.slug)
    || left.section.localeCompare(right.section)
    || left.text.localeCompare(right.text)
  ));
  const selected = [];
  const add = (unit) => {
    if (unit && !selected.some((row) => (
      row.slug === unit.slug && row.section === unit.section && row.text === unit.text
    ))) selected.push(unit);
  };
  const capabilityConditionPool = eligible.filter((unit) => (
    unit.slug === capabilityDoc.slug && unit.role === 'condition'
  ));
  const capabilityIdentity = new Set(lexicalTokens([
    capabilityDoc.frontmatter?.title || capabilityDoc.frontmatter?.name || '',
    capabilityDoc.frontmatter?.display_en || '',
    capabilityDoc.frontmatter?.display_ko || '',
    capabilityDoc.slug,
    capabilityDoc.frontmatter?.path || '',
  ].join(' ')));
  const distinguishingTerms = intent.allTerms.filter((term) => !capabilityIdentity.has(term));
  const conditionTerms = distinguishingTerms.length > 0 ? distinguishingTerms : intent.allTerms;
  const taskTermFrequency = new Map(conditionTerms.map((term) => [
    term,
    capabilityConditionPool.filter((unit) => unitTokens(unit).has(term)).length,
  ]));
  const capabilityConditions = [...capabilityConditionPool].sort((left, right) => {
    const rarityScore = (unit) => {
      const tokens = unitTokens(unit);
      return conditionTerms.reduce((total, term) => (
        tokens.has(term) ? total + (1 / Math.max(1, taskTermFrequency.get(term))) : total
      ), 0);
    };
    return rarityScore(right) - rarityScore(left)
      || score(right) - score(left)
      || left.text.localeCompare(right.text);
  }).slice(0, 1);
  for (const unit of capabilityConditions) add(unit);
  add(ordered(eligible.filter((unit) => (
    unit.slug === capabilityDoc.slug && unit.role === 'exception'
  )))[0]);
  const uncertaintyRiskTerms = new Set([
    'authorization', 'default', 'delivery', 'retry', 'runtime', 'validation',
    'unverified', 'unknown',
  ]);
  const capabilityUncertainty = eligible
    .filter((unit) => unit.slug === capabilityDoc.slug && unit.role === 'uncertainty')
    .sort((left, right) => {
      const riskScore = (unit) => [...unitTokens(unit)]
        .filter((term) => uncertaintyRiskTerms.has(term)).length;
      return riskScore(right) - riskScore(left)
        || score(right) - score(left)
        || left.text.localeCompare(right.text);
    });
  add(capabilityUncertainty[0] ?? ordered(eligible.filter((unit) => unit.role === 'uncertainty'))[0]);
  const primaryAnchor = anchorDocs[0]?.slug;
  const capabilityConditionTerms = new Set(capabilityConditions.flatMap((unit) => [...unitTokens(unit)]));
  const anchorConditions = eligible.filter((row) => (
    row.slug === primaryAnchor && row.role === 'condition'
  )).sort((left, right) => {
    const scopeTerms = new Set(['independent', 'independently', 'only', 'remain', 'separate']);
    const scopeScore = (unit) => [...unitTokens(unit)]
      .filter((term) => scopeTerms.has(term)).length;
    const overlap = (unit) => [...unitTokens(unit)]
      .filter((term) => capabilityConditionTerms.has(term)).length;
    return scopeScore(right) - scopeScore(left)
      || overlap(left) - overlap(right)
      || score(right) - score(left)
      || left.text.localeCompare(right.text);
  });
  add(anchorConditions[0]);
  for (const unit of ordered(eligible)) {
    if (selected.length >= 4) break;
    add(unit);
  }
  const units = selected.slice(0, 4);
  const omitted = Math.max(0, eligible.length - units.length);
  return {
    claimState: 'recorded_claims',
    acceptance: 'not_asserted',
    coverage: {
      total: eligible.length,
      returned: units.length,
      omitted,
      complete: omitted === 0,
      status: omitted === 0 ? 'complete' : 'incomplete_full_body_required',
    },
    units,
  };
}
