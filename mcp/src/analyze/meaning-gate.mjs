// The business-first meaning gate. Business capability candidates derived from
// semantic evidence, the enrichment that binds a candidate to the sentence that
// witnesses it, the gate itself (what is already in the vault, what is proposed,
// what needs review), and the extraction contract its competency questions form.

import { COMPETENCY_QUESTION_CONTRACTS } from '../meaning-evaluation.mjs';
import {
  BUSINESS_CAPABILITY_CLUES,
  GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT,
  GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT,
  GENERIC_NARRATIVE_CAPABILITY_CLUES,
  IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS,
  STARTER_ONTOLOGY_SLUGS,
} from './constants.mjs';
import {
  matchDomainSlug,
  pathSemanticTokens,
  semanticTokens,
  tailSlug,
  uniqueStrings,
} from './text.mjs';

export function deriveBusinessCapabilityCandidates({
  domains,
  capabilities,
  elements,
  semanticEvidence,
}) {
  const trustedEvidence = semanticEvidence.filter(
    (row) => row.trust === 'candidate-evidence' && row.excerpt,
  );
  const businessNarrativeEvidence = trustedEvidence.filter((row) =>
    ['mission', 'product-contract', 'product-capabilities'].includes(row.role),
  );
  // A README containing only headings is structural evidence, not enough
  // material to suppress or promote implementation candidates. Preserve the
  // older review surface in that case; richer prose opts into the semantic
  // cross-check below.
  if (trustedEvidence.length === 0) return [];

  const implementationRows = [
    ...capabilities.map((row) => ({
      path: row.evidence?.source,
      slug: row.slug,
    })),
    ...elements.map((row) => ({
      path: row.path ?? row.evidence?.source,
      slug: row.slug,
    })),
  ].filter((row) => row.path);

  const candidates = [];
  for (const clue of BUSINESS_CAPABILITY_CLUES) {
    const matchedEvidence = businessNarrativeEvidence.filter((row) =>
      clue.prose.some((pattern) => pattern.test(`${row.headings.join('\n')}\n${row.excerpt}`)),
    );
    if (matchedEvidence.length === 0) continue;

    const matchedImplementations = implementationRows.filter((row) =>
      clue.implementation.some((pattern) => pattern.test(`${row.path}\n${row.slug}`)),
    );
    if (matchedImplementations.length === 0) continue;

    const structuralMatch = capabilities.find((row) =>
      matchedImplementations.some((implementation) => implementation.slug === row.slug),
    );
    const source = structuralMatch?.evidence?.source
      ?? matchedImplementations[0].path;
    const semanticSource = matchedEvidence[0].source;
    const domain = domains.some((row) => row.slug === clue.domain)
      ? clue.domain
      : matchDomainSlug(clue.title, domains);
    candidates.push({
      slug: clue.slug,
      title: clue.title,
      ...(domain ? { domain } : {}),
      reason: 'bounded business outcome prose cross-checked against implementation evidence',
      evidence: {
        source: semanticSource,
        implementation: source,
      },
      semanticSources: matchedEvidence.map((row) => row.source),
      implementationEvidence: matchedImplementations.map((row) => row.path),
    });
  }

  const emittedSlugs = new Set(candidates.map((row) => row.slug));
  // Generic candidates are intentionally stricter than the outcome clue table:
  // the prose must name the structural candidate and a separately observed
  // element path must carry the same normalized term. That keeps a documented
  // folder from becoming a capability when no implementation entrypoint exists.
  const genericBusinessEvidence = trustedEvidence
    .filter((row) =>
      ['mission', 'product-contract', 'product-capabilities', 'package-contract'].includes(
        row.role,
      ),
    )
    .sort((a, b) => a.source.localeCompare(b.source));
  const genericImplementationRows = elements
    .map((row) => ({
      path: row.path,
      slug: row.slug,
    }))
    .filter((row) => row.path)
    .sort((a, b) =>
      a.path.localeCompare(b.path) || a.slug.localeCompare(b.slug),
    );
  const genericCandidates = [];
  for (const capability of [...capabilities].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    if (emittedSlugs.has(capability.slug)) continue;
    const candidateTokens = semanticTokens(tailSlug(capability.slug));
    if (candidateTokens.size === 0) continue;
    if ([...candidateTokens].some((token) =>
      IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS.has(token),
    )) {
      continue;
    }
    const matchedEvidence = genericBusinessEvidence
      .filter((row) => {
        const evidenceTokens = semanticTokens(row.excerpt);
        return [...candidateTokens].every((token) => evidenceTokens.has(token));
      })
      .slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT);
    if (matchedEvidence.length === 0) continue;
    const matchedImplementations = genericImplementationRows
      .filter((row) => {
        const implementationTokens = pathSemanticTokens(`${row.path} ${row.slug}`);
        return [...candidateTokens].every((token) => implementationTokens.has(token));
      })
      .slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT);
    if (matchedImplementations.length === 0) continue;
    const domain = capability.domain
      ?? matchDomainSlug(tailSlug(capability.slug), domains);
    genericCandidates.push({
      slug: capability.slug,
      title: capability.title,
      ...(domain ? { domain } : {}),
      reason: 'proposal-only: bounded narrative terms cross-checked against an implemented element path; human approval required',
      evidence: {
        source: matchedEvidence[0].source,
        implementation: matchedImplementations[0].path,
      },
      semanticSources: matchedEvidence.map((row) => row.source),
      implementationEvidence: matchedImplementations.map((row) => row.path),
    });
  }
  for (const candidate of genericCandidates.slice(
    0,
    GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT,
  )) {
    candidates.push(candidate);
    emittedSlugs.add(candidate.slug);
  }

  const narrativeImplementationRows = elements
    .map((row) => ({
      path: row.path ?? row.evidence?.source,
      slug: row.slug,
    }))
    .filter((row) => row.path)
    .sort((a, b) => a.path.localeCompare(b.path) || a.slug.localeCompare(b.slug));
  for (const clue of GENERIC_NARRATIVE_CAPABILITY_CLUES) {
    if (emittedSlugs.has(clue.slug)) continue;
    const matchedEvidence = genericBusinessEvidence.filter((row) =>
      /[.!?]/.test(row.excerpt)
      && clue.prose.some((pattern) => pattern.test(row.excerpt)),
    );
    if (matchedEvidence.length === 0) continue;
    const matchedImplementations = narrativeImplementationRows
      .filter((row) => clue.implementation.some((pattern) => pattern.test(`${row.path}\n${row.slug}`)))
      .slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT);
    if (matchedImplementations.length === 0) continue;
    const domain = matchDomainSlug(clue.title, domains);
    candidates.push({
      slug: clue.slug,
      title: clue.title,
      ...(domain ? { domain } : {}),
      reason: 'proposal-only: bounded outcome prose cross-checked against implementation evidence; human approval required',
      evidence: {
        source: matchedEvidence[0].source,
        implementation: matchedImplementations[0].path,
      },
      semanticSources: matchedEvidence.map((row) => row.source),
      implementationEvidence: matchedImplementations.map((row) => row.path),
    });
    emittedSlugs.add(clue.slug);
  }

  return candidates;
}

export function enrichProjectCandidate(project, semanticEvidence) {
  if (!project) return project;
  const trustedRows = semanticEvidence.filter(
    (row) =>
      ['mission', 'product-contract', 'product-capabilities'].includes(row.role) &&
      row.trust === 'candidate-evidence' &&
      row.excerpt,
  );
  const purposeWitness = trustedRows
    .map((row) => ({ row, sentence: explicitPurposeSentence(row.excerpt, project.title) }))
    .find(({ sentence }) => sentence);
  const lead = purposeWitness?.row ?? trustedRows[0];
  const sentence = purposeWitness?.sentence ?? boundedEvidenceSentence(lead?.excerpt);
  // Project identity evidence can remain visible, but a second semantic source
  // corroborates this purpose only when its own bounded prose overlaps the
  // selected purpose claim. A trustworthy but unrelated product document is
  // still useful evidence elsewhere; it is not a purpose witness.
  const purposeCorroborators = sentence
    ? independentSemanticEvidenceRows(trustedRows.filter(
      (row) => row.source !== lead?.source && hasClaimSpecificSemanticOverlap(sentence, row.excerpt),
    ), [lead])
    : [];
  const sources = uniqueStrings([
    ...(project.evidence ?? []),
    lead?.source,
    ...purposeCorroborators.map((row) => row.source),
  ]).slice(0, 3);
  const definition = sentence
    ? `Proposed repository purpose from ${lead.source}: ${sentence}`
    : 'Repository purpose is not established by the bounded semantic evidence scan.';
  const limitations = [
    'shared business ownership is not established by repository evidence',
    'runtime, test, and external-system behavior remain outside this bounded scan',
  ];
  return {
    ...project,
    ...(sources.length > 0 ? { evidence: sources } : {}),
    definition,
    includes: ['repository-contained implementation evidence'],
    excludes: [],
    confidence: sources.length > 0 ? 0.5 : 0.2,
    uncertainty:
      `proposal-only: source prose is a bounded purpose witness, not a shared business assertion. Unknowns: ${limitations.join('; ')}.`,
  };
}

function enrichMeaningCandidate(candidate, kind, semanticEvidence, implementationPaths = []) {
  if (kind === 'domain') {
    return enrichDomainMeaningCandidate(candidate, semanticEvidence);
  }
  const sourceNames = uniqueStrings([
    ...(candidate.semanticSources ?? []),
    candidate.evidence?.source,
    candidate.evidence?.implementation,
  ]);
  const trustedRows = sourceNames
    .map((source) => semanticEvidence.find((row) => row.source === source))
    .filter((row) => row?.trust === 'candidate-evidence' && row.excerpt);
  const lead = trustedRows[0];
  const sentence = boundedEvidenceSentence(lead?.excerpt);
  const label = kind === 'domain' ? 'responsibility boundary' : 'ability';
  const definition = sentence
    ? `Proposed ${label} from ${lead.source}: ${sentence}`
    : `Proposed ${label} named by bounded repository evidence; shared meaning remains unconfirmed.`;
  const includes = kind === 'capability'
    ? uniqueStrings(implementationPaths).slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT)
    : [];
  const limitations = [
    'shared business ownership is not established by this repository scan',
    'runtime behavior outside the cited implementation evidence is not asserted',
  ];
  return {
    title: candidate.title,
    ...(candidate.domain ? { domain: candidate.domain } : {}),
    definition,
    ...(includes.length > 0 ? { includes } : {}),
    excludes: [],
    confidence: 0.5,
    uncertainty:
      `proposal-only: bounded prose and path evidence require semantic qualification before admission. Unknowns: ${limitations.join('; ')}.`,
    evidenceSources: sourceNames,
  };
}

function enrichDomainMeaningCandidate(candidate, semanticEvidence) {
  const nameSource = candidate.evidence?.source;
  const witness = findDomainResponsibilityWitness(candidate, semanticEvidence);
  const evidenceSources = witness
    ? uniqueStrings([nameSource, witness.row.source])
    : uniqueStrings([nameSource]);
  const definition = witness
    ? `Proposed responsibility boundary from ${witness.row.source}: ${witness.sentence}`
    : 'Proposed responsibility boundary named by README heading; repository-contained responsibility remains unconfirmed.';
  const limitations = [
    'shared business ownership is not established by this repository scan',
    'runtime behavior outside the cited implementation evidence is not asserted',
  ];
  const uncertainty = witness
    ? 'proposal-only: repository prose corroborates this boundary candidate; human approval is still required'
    : 'proposal-only: README heading names a candidate, but no separate repository responsibility witness was found';
  return {
    title: candidate.title,
    definition,
    excludes: [],
    confidence: 0.5,
    uncertainty: `${uncertainty}. Unknowns: ${limitations.join('; ')}.`,
    evidenceSources,
  };
}

function boundedEvidenceSentence(value) {
  const text = String(value ?? '')
    .replace(/[\*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const sentence = text.match(/^(.{24,360}?[.!?])(?:\s|$)/)?.[1];
  return (sentence ?? text.slice(0, 360)).trim();
}

function explicitPurposeSentence(value, projectTitle = '') {
  const text = String(value ?? '')
    .replace(/[\*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const sentences = text.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [];
  const candidates = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) =>
      sentence.length >= 24 &&
      sentence.length <= 360 &&
      !/^\d+(?:\.\d+)*\s/.test(sentence) &&
      !/^(?:release|version)\b/i.test(sentence) &&
      !/\b(?:was|is|has been) released\b/i.test(sentence));
  const normalizedTitle = normalizeSemanticText(projectTitle);
  const identityPurpose = normalizedTitle
    ? candidates.find((sentence) => {
      const normalized = normalizeSemanticText(sentence);
      return (
        (normalized.startsWith(`${normalizedTitle} is `) ||
          normalized.startsWith(`${normalizedTitle} are `)) &&
        /\b(?:app|application|client|database|engine|framework|library|platform|runtime|server|service|tool|workbench)\b/i.test(sentence) &&
        /\b(?:built|created|designed|made)\s+for\b|\bfor\b|\bto\b/i.test(sentence)
      );
    })
    : null;
  return (
    identityPurpose ??
    candidates
      .find(
        (sentence) =>
          /\b(?:provides|allows|lets|enables|helps|exists\s+to)\b/i.test(sentence),
      ) ?? ''
  );
}

function hasClaimSpecificSemanticOverlap(purposeSentence, candidateProse) {
  const purposeTerms = semanticClaimTerms(purposeSentence);
  if (purposeTerms.size < 2) return false;
  const candidateTerms = semanticClaimTerms(candidateProse);
  let overlap = 0;
  for (const term of purposeTerms) {
    if (!candidateTerms.has(term)) continue;
    overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

function semanticClaimTerms(value) {
  const genericTerms = new Set([
    'a', 'an', 'and', 'application', 'applications', 'codebase', 'developer', 'developers',
    'for', 'from', 'helps', 'local', 'of', 'operations', 'platform', 'product', 'project',
    'provides', 'repository', 'service', 'services', 'software', 'system', 'the', 'this',
    'to', 'tool', 'tools', 'user', 'users', 'with', 'workflow', 'workflows',
  ]);
  const tokens = String(value ?? '').toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g) ?? [];
  return new Set(tokens.filter((term) => (
    !genericTerms.has(term) && (term.length >= 4 || /^[가-힣]{2,}$/.test(term))
  )));
}

function findDomainResponsibilityWitness(candidate, semanticEvidence) {
  const nameSource = candidate.evidence?.source;
  const normalizedDomain = normalizeSemanticText(candidate.title);
  const nameFingerprint = semanticEvidenceFingerprint(
    semanticEvidence.find((row) => row.source === nameSource),
  );
  if (!normalizedDomain) return null;
  for (const row of semanticEvidence) {
    if (
      row.source === nameSource
      || !['product-contract', 'architecture'].includes(row.role)
      || row.trust !== 'candidate-evidence'
      || !row.excerpt
      || semanticEvidenceFingerprint(row) === nameFingerprint
    ) {
      continue;
    }
    const sentence = responsibilitySentenceForDomain(row.excerpt, normalizedDomain);
    if (sentence) return { row, sentence };
  }
  return null;
}

function independentSemanticEvidenceRows(rows, initialRows = []) {
  const seen = new Set(initialRows.map(semanticEvidenceFingerprint).filter(Boolean));
  return rows.filter((row) => {
    const fingerprint = semanticEvidenceFingerprint(row);
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function semanticEvidenceFingerprint(row) {
  return String(row?.excerpt ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function responsibilitySentenceForDomain(value, normalizedDomain) {
  const sentences = String(value ?? '').match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [];
  return sentences
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .find((sentence) => (
      normalizeSemanticText(sentence).includes(normalizedDomain)
      && /\b(?:owns|is responsible for|governs|handles|covers)\b|(?:소유(?:한다|함)?|책임(?:을)?\s*(?:진다|맡는다)|관할|담당(?:한다|함)?|다룬다|처리(?:한다|함)?|관리(?:한다|함)?|포괄(?:한다|함)?)/i.test(sentence)
    )) ?? '';
}

function normalizeSemanticText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildMeaningGate({
  domains,
  capabilities,
  semanticCapabilityCandidates,
  elements,
  existingOntologyEvidence,
  observedDependencyRelations = [],
  nonProductGoPackageElementSlugs = new Set(),
  semanticEvidence,
}) {
  const existingBySlug = new Map(
    existingOntologyEvidence.map((evidence) => [evidence.slug, evidence]),
  );
  const existingDomainEvidence = existingOntologyEvidence.filter((evidence) => evidence.kind === 'domain');
  // A README heading is evidence that a phrase is important enough to document,
  // not evidence that people share it as a stable business responsibility
  // boundary. Only persisted ontology docs count as already-shared concepts;
  // README/code-derived rows remain explicit proposals.
  const businessDomains = [...new Set(existingDomainEvidence.map((evidence) => evidence.slug))];
  const existingByElement = new Map();
  for (const evidence of existingOntologyEvidence) {
    if (evidence.kind !== 'capability') continue;
    for (const element of evidence.elements ?? []) {
      if (!existingByElement.has(element)) existingByElement.set(element, evidence);
    }
  }
  const existingEvidenceByCandidateSlug = new Map();
  const evidenceByBusinessCapabilitySlug = new Map();
  const businessCapabilities = capabilities.flatMap((capability) => {
    const evidence = existingBySlug.get(capability.slug) ?? existingByElement.get(capability.evidence.source);
    if (evidence) {
      existingEvidenceByCandidateSlug.set(capability.slug, evidence);
      evidenceByBusinessCapabilitySlug.set(evidence.slug, evidence);
      return [evidence.slug];
    }
    return [];
  });
  const businessCapabilitySet = new Set(businessCapabilities);
  const matchedCapabilityCandidateSlugs = new Set(
    [...existingEvidenceByCandidateSlug.keys()].filter(Boolean),
  );
  // Structural candidates remain visible below as implementation evidence,
  // but never become business proposals merely because the semantic packet is
  // empty. This is the fail-closed boundary that prevents a folder such as
  // `logger`, `web`, or `theme-toggle` from becoming a capability by default.
  const hasSharedBusinessContext = existingOntologyEvidence.some(
    (evidence) =>
      (evidence.kind === 'domain' || evidence.kind === 'capability') &&
      !STARTER_ONTOLOGY_SLUGS.has(evidence.slug),
  );
  const businessCandidates = semanticCapabilityCandidates.length > 0
    ? semanticCapabilityCandidates
    : hasSharedBusinessContext
      ? capabilities
      : [];
  const reviewRequiredCapabilities = capabilities
    .filter(
      (capability) =>
        !existingBySlug.has(capability.slug) &&
        !matchedCapabilityCandidateSlugs.has(capability.slug),
    )
    .map((capability) => ({
      slug: capability.slug,
      reason: 'source folder is implementation evidence, not proof of a shared capability meaning',
      evidence: capability.evidence,
    }));
  const proposedBusinessCapabilities = businessCandidates
    .filter(
      (capability) =>
        !existingBySlug.has(capability.slug) &&
        !matchedCapabilityCandidateSlugs.has(capability.slug),
    )
    .map((capability) => ({
      slug: capability.slug,
      reason: capability.reason
        ?? 'bounded semantic evidence is a proposal, not proof of shared business meaning',
      evidence: capability.evidence,
      ...enrichMeaningCandidate(
        capability,
        'capability',
        semanticEvidence,
        capability.implementationEvidence,
      ),
    }));
  const reviewRequiredDomains = domains
    .filter((domain) => !existingBySlug.has(domain.slug))
    .map((domain) => ({
      slug: domain.slug,
      reason: 'README heading is a concept clue, not proof of a shared business boundary',
      evidence: domain.evidence,
      ...enrichMeaningCandidate(domain, 'domain', semanticEvidence),
    }));
  const businessEvidence = uniqueEvidenceRows([
    ...existingDomainEvidence.map(formatOntologyEvidence),
    ...businessCapabilities.flatMap((capability) => {
      const existing = existingBySlug.get(capability) ?? evidenceByBusinessCapabilitySlug.get(capability);
      if (existing) return [formatOntologyEvidence(existing)];
      return [
        {
          slug: capability,
          kind: 'capability',
          source: businessCandidates.find((candidate) => candidate.slug === capability)?.evidence.source ?? capability,
        },
      ];
    }),
  ]);

  const reviewQuestions = [
    'What business/product outcome, user workflow, ownership boundary, or decision does this node explain?',
    'Which source path, README heading, import edge, or file-level element proves the implementation evidence?',
    'Should this code structure stay evidence-only instead of becoming a domain or capability node?',
    '[visible-gap · omitted-behavior] Record runtime, test, package, and unsupported-language behavior this scan did not inspect, plus the next repository-contained witness needed to assess it.',
    '[visible-gap · scope-exclusion] Separate project exclusions explicitly stated by evidence from boundaries that remain unknown; record the source citation for each.',
  ];
  const hasTrustedMissionOrProductEvidence = semanticEvidence.some(
    (row) =>
      ['mission', 'product-contract', 'product-capabilities'].includes(row.role) &&
      row.trust === 'candidate-evidence' &&
      row.excerpt,
  );
  const hasPersistedBusinessDomain = existingDomainEvidence.length > 0;
  const hasREADMEOnlyDomainCandidate = reviewRequiredDomains.length > 0;
  const hasUnconfirmedDomainBoundary = reviewRequiredDomains.some(
    (domain) => domain.evidenceSources.length < 2,
  );
  const hasRepositoryCorroboratedDomainBoundary = reviewRequiredDomains.some(
    (domain) => domain.evidenceSources.length >= 2,
  );
  if (!hasTrustedMissionOrProductEvidence) {
    reviewQuestions.push(
      '[missing · scope] Add trusted mission or product evidence that states the user outcome and the repository responsibility boundary.',
    );
  }
  if (!hasPersistedBusinessDomain && !hasREADMEOnlyDomainCandidate) {
    reviewQuestions.push(
      '[weak · domain-boundary] Confirm the domain boundary with persisted business evidence; a README heading alone is only a candidate.',
    );
  }
  if (hasUnconfirmedDomainBoundary) {
    reviewQuestions.push(
      '[weak · domain-boundary] Add a separate current product-contract or architecture responsibility witness; a README heading alone remains only a candidate.',
    );
  }
  if (hasRepositoryCorroboratedDomainBoundary) {
    reviewQuestions.push(
      '[proposal · domain-boundary] Repository prose corroborates a proposed boundary, but human approval is still required before it becomes shared meaning.',
    );
  }
  if (reviewRequiredCapabilities.length > 0) {
    for (const capability of reviewRequiredCapabilities) {
      capability.reason =
        'implementation-only: source folder is implementation evidence, not proof of a shared capability meaning; add business outcome and stable responsibility evidence before promoting this capability';
    }
  }
  if (proposedBusinessCapabilities.length > 0) {
    reviewQuestions.push(
      '[weak · capability-outcome] Confirm the proposed capability with a concrete business outcome and the responsibility it owns.',
    );
  }
  const implementationEvidenceSlugs = new Set([
    ...capabilities.map((capability) => capability.slug),
    ...elements.map((element) => element.slug),
  ]);
  const hasTypedDependencyRelation = observedDependencyRelations.some(
    (relation) =>
      relation?.type === 'depends_on' &&
      implementationEvidenceSlugs.has(relation.from) &&
      implementationEvidenceSlugs.has(relation.to) &&
      (relation.productValueCount === undefined || relation.productValueCount > 0),
  );
  const impactRelevantElements = elements.filter((element) =>
    !nonProductGoPackageElementSlugs.has(element.slug),
  );
  if (impactRelevantElements.length >= 2 || hasTypedDependencyRelation) {
    if (hasTypedDependencyRelation) {
      const typedDependencyCount = observedDependencyRelations.filter(
        (relation) =>
          relation?.type === 'depends_on' &&
          implementationEvidenceSlugs.has(relation.from) &&
          implementationEvidenceSlugs.has(relation.to) &&
          (relation.productValueCount === undefined || relation.productValueCount > 0),
      ).length;
      reviewQuestions.push(
        `[observed · impact] ${typedDependencyCount} typed production import ${typedDependencyCount === 1 ? 'boundary' : 'boundaries'} link implementation candidates; review bounded infer_imports evidence before promoting a depends_on relation.`,
      );
    } else {
      reviewQuestions.push(
        '[not-measured · impact] Identify the typed depends_on relation between implementation elements, or record why no dependency impact is currently measurable.',
      );
    }
  }
  const hasPolicyEvidenceRisk = semanticEvidence.some((row) =>
    row.riskFlags.some((risk) =>
      ['future-state-claim', 'negated-claim', 'deprecated-state'].includes(risk),
    ),
  );
  if (hasPolicyEvidenceRisk) {
    reviewQuestions.push(
      '[review · policy-evidence] Review future, negated, or deprecated evidence before treating it as current policy; the risk alone is not current policy.',
    );
  }

  return {
    policy: 'business-first',
    sourceStructureRole: 'implementation-evidence',
    businessOntology: {
      domains: businessDomains,
      capabilities: [...businessCapabilitySet],
      evidence: businessEvidence,
    },
    proposedBusinessOntology: {
      domains: reviewRequiredDomains,
      capabilities: proposedBusinessCapabilities,
    },
    implementationEvidence: {
      elements: elements.map((element) => element.slug),
      reviewRequiredCapabilities,
    },
    reviewQuestions,
  };
}

export function buildExtractionContract({
  project,
  domains,
  capabilities,
  semanticCapabilityCandidates,
  elements,
  existingOntologyEvidence,
  suggestedRelations,
  semanticEvidence,
}) {
  const persistedBusinessConcepts = existingOntologyEvidence.filter(
    (evidence) => evidence.kind === 'domain' || evidence.kind === 'capability',
  ).length;
  const proposedBusinessConcepts = domains.length + semanticCapabilityCandidates.length;
  const observedImplementationEvidence = elements.length;
  return {
    standard: 'formal-explicit-shared-conceptualization',
    status:
      persistedBusinessConcepts > 0
        ? 'grounded-in-existing-ontology'
        : observedImplementationEvidence > 0 || proposedBusinessConcepts > 0
          ? 'evidence-gathering'
          : 'scope-discovery-required',
    assertionPolicy: {
      sourceFacts: 'observed',
      readmeAndFolderMeanings: 'proposed',
      persistedOntologyMeanings: 'shared',
      automaticBusinessAssertions: 0,
      humanApprovalRequired: true,
    },
    competencyQuestions: COMPETENCY_QUESTION_CONTRACTS.map((contract) => ({
      ...contract,
      requiredWitnesses: [...contract.requiredWitnesses],
    })),
    qualityGates: {
      scopeCandidateAvailable: Boolean(project),
      sharedBusinessConceptsAvailable: persistedBusinessConcepts > 0,
      proposedBusinessConcepts,
      implementationEvidenceAvailable: observedImplementationEvidence > 0,
      semanticEvidenceAvailable: semanticEvidence.length > 0,
      semanticEvidenceReviewRequired: semanticEvidence.filter(
        (row) => row.riskFlags.length > 0,
      ).length,
      typedRelationsProposed: suggestedRelations.length,
      provenanceAttached:
        domains.every((row) => Boolean(row.evidence?.source)) &&
        capabilities.every((row) => Boolean(row.evidence?.source)) &&
        elements.every((row) => Boolean(row.evidence?.source)),
      uncertaintyExplicit: true,
      approvalRequired: true,
    },
    limitations: [
      'Repository structure can prove implementation shape, but cannot by itself prove business meaning.',
      'README headings and source-folder names remain proposals until a human or persisted ontology establishes shared intent.',
      'Instructions, future-state claims, negations, and deprecated-state prose are review signals, not current business facts.',
      'Completeness is evaluated against competency questions, not against the number of discovered folders.',
      'A resolved witness proves that the cited graph fact or repository path exists; semantic role accuracy still depends on the bounded evidence packet and human approval.',
    ],
    nextStep:
      'Use semanticEvidence to propose defined domains and capabilities; answer each competency question with answer/status/witnesses, keep unsupported claims as partial or visible-gap, and write only after every witness resolves.',
  };
}

function formatOntologyEvidence(evidence) {
  return {
    slug: evidence.slug,
    kind: evidence.kind,
    source: evidence.source,
  };
}

function uniqueEvidenceRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = `${row.slug}\0${row.kind}\0${row.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}
