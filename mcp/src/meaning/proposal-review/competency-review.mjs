import { evaluateQuantifiedCompetencyCoverage } from '../competency-coverage.mjs';
import { MEANING_COMPETENCY_QUESTIONS } from '../meaning-assessment.mjs';
import {
  MEANING_AUTHORITY_MIN_SOURCES,
  PURPOSE_AUTHORITY_ROLES,
  alignedSemanticAuthoritySources,
  domainAuthoritySources,
  matchingReviewRequiredEvidence,
  semanticUnitSupportsClaim,
} from '../meaning-authority.mjs';
import { finding, relationKey } from './findings.mjs';
import { nonEmpty } from './shape.mjs';
import { repositoryPathExists } from './evidence-review.mjs';

const COMPETENCY_STATUSES = new Set(['answered', 'partial', 'visible-gap']);

export const COMPETENCY_WITNESS_KEYS = Object.freeze([
  'concepts',
  'relations',
  'evidence',
  'paths',
]);

export function validateCompetencyAnswers({
  analysis,
  proposal,
  availableSources,
  evidenceBySource,
  sourceEvidenceCitations,
  sharedDomains,
  conceptSlugs,
  proposalPaths,
  relationKeys,
  findings,
}) {
  let answered = 0;
  const findingStart = findings.length;
  for (const contract of MEANING_COMPETENCY_QUESTIONS) {
    const path = `competencyAnswers.${contract.id}`;
    const row = proposal.competencyAnswers?.[contract.id];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      findings.push(finding(
        'unstructured-competency-answer',
        'error',
        path,
        `Competency answer "${contract.id}" must include answer, status, and typed witnesses.`,
      ));
      continue;
    }
    if (!nonEmpty(row.answer)) {
      findings.push(finding(
        'unanswered-competency-question',
        'error',
        `${path}.answer`,
        `Competency answer "${contract.id}" needs a non-empty answer.`,
      ));
    }
    if (!COMPETENCY_STATUSES.has(row.status)) {
      findings.push(finding(
        'invalid-competency-status',
        'error',
        `${path}.status`,
        `Competency status must be answered, partial, or visible-gap.`,
      ));
    }
    const witnesses = row.witnesses;
    if (
      !witnesses ||
      typeof witnesses !== 'object' ||
      COMPETENCY_WITNESS_KEYS.some((key) => !Array.isArray(witnesses[key]))
    ) {
      findings.push(finding(
        'invalid-competency-witnesses',
        'error',
        `${path}.witnesses`,
        `Competency witnesses must contain concepts, relations, evidence, and paths arrays.`,
      ));
      continue;
    }

    for (const [index, slug] of witnesses.concepts.entries()) {
      if (!nonEmpty(slug) || !conceptSlugs.has(slug)) {
        findings.push(finding(
          'unknown-competency-concept',
          'error',
          `${path}.witnesses.concepts[${index}]`,
          `Competency witness concept is absent from the proposal or shared ontology: ${slug ?? ''}`,
          [slug].filter(nonEmpty),
        ));
      }
    }
    for (const [index, relation] of witnesses.relations.entries()) {
      if (
        !relation ||
        typeof relation !== 'object' ||
        !nonEmpty(relation.from) ||
        !nonEmpty(relation.to) ||
        !nonEmpty(relation.type) ||
        !relationKeys.has(relationKey(relation))
      ) {
        findings.push(finding(
          'unknown-competency-relation',
          'error',
          `${path}.witnesses.relations[${index}]`,
          `Competency witness relation is absent from the validated proposal.`,
          [relation?.from, relation?.to].filter(nonEmpty),
        ));
      }
    }
    for (const [index, source] of witnesses.evidence.entries()) {
      if (!nonEmpty(source) || !availableSources.has(source)) {
        findings.push(finding(
          'unknown-competency-evidence',
          'error',
          `${path}.witnesses.evidence[${index}]`,
          `Competency witness evidence is absent from the analysis packet: ${source ?? ''}`,
          [source].filter(nonEmpty),
        ));
        continue;
      }
      const semantic = evidenceBySource.get(source);
      if (row.status === 'answered' && sourceEvidenceCitations.has(source)) {
        findings.push(finding(
          'source-only-competency-authority',
          'error',
          `${path}.witnesses.evidence[${index}]`,
          'Raw implementation source is observed evidence, not semantic authority for an answered competency. Mark the answer partial or provide current semantic authority.',
          [source],
        ));
      }
      if (semantic?.trust === 'untrusted-instruction') {
        findings.push(finding(
          'untrusted-competency-evidence',
          'error',
          `${path}.witnesses.evidence[${index}]`,
          `Untrusted instruction content cannot support a competency answer: ${source}`,
          [source],
        ));
      } else if (semantic?.trust === 'claim-review-required') {
        findings.push(finding(
          'risky-competency-evidence',
          'warning',
          `${path}.witnesses.evidence[${index}]`,
          `This competency witness needs independent current-state corroboration: ${source}`,
          [source],
        ));
      }
    }
    if (row.status === 'answered') {
      const matchedReviewSources = witnesses.evidence.filter((source) =>
        matchingReviewRequiredEvidence(
          evidenceBySource.get(source),
          row.answer,
        ).length > 0,
      );
      if (matchedReviewSources.length > 0) {
        const matchedSet = new Set(matchedReviewSources);
        const independentlyConfirmed = witnesses.evidence.some((source) => {
          if (matchedSet.has(source)) return false;
          const evidence = evidenceBySource.get(source);
          return (
            evidence?.trust === 'candidate-evidence' &&
            semanticUnitSupportsClaim(row.answer, evidence.excerpt)
          );
        });
        findings.push(finding(
          'review-required-unit-competency',
          'warning',
          path,
          'The answered competency overlaps line-scoped review-required evidence; that unit is counterevidence, not answer authority.',
          matchedReviewSources,
        ));
        if (!independentlyConfirmed) {
          findings.push(finding(
            'review-required-unit-competency-unconfirmed',
            'error',
            path,
            'The answered competency relies on line-scoped review-required evidence without an independent claim-aligned current semantic source. Mark it partial or provide current corroboration.',
            matchedReviewSources,
          ));
        }
      }
    }
    for (const [index, sourcePath] of witnesses.paths.entries()) {
      if (!repositoryPathExists(analysis.rootPath, sourcePath)) {
        findings.push(finding(
          'missing-competency-path',
          'error',
          `${path}.witnesses.paths[${index}]`,
          `Competency witness path is absent from the repository or escapes its root: ${sourcePath ?? ''}`,
          [sourcePath].filter(nonEmpty),
        ));
      } else if (!proposalPaths.has(sourcePath)) {
        findings.push(finding(
          'unattached-competency-path',
          'error',
          `${path}.witnesses.paths[${index}]`,
          `Competency witness path is not attached to any proposed concept: ${sourcePath}`,
          [sourcePath],
        ));
      }
    }

    if (row.status === 'answered') {
      let complete = true;
      for (const witnessKey of contract.requiredWitnesses) {
        if (witnesses[witnessKey].length > 0) continue;
        complete = false;
        findings.push(finding(
          'missing-competency-witness',
          'error',
          `${path}.witnesses.${witnessKey}`,
          `Answered competency "${contract.id}" requires at least one ${witnessKey} witness.`,
        ));
      }
      if (
        contract.id === 'impact' &&
        !witnesses.relations.some((relation) => relation?.type === 'depends_on')
      ) {
        complete = false;
        findings.push(finding(
          'missing-impact-dependency-witness',
          'error',
          `${path}.witnesses.relations`,
          `An answered impact competency requires a depends_on relation witness.`,
        ));
      }
      if (contract.id === 'scope') {
        const alignedSources = alignedSemanticAuthoritySources({
          sources: witnesses.evidence,
          claim: `${proposal.project.title}\n${proposal.project.definition}\n${row.answer}`,
          evidenceBySource,
          allowedRoles: PURPOSE_AUTHORITY_ROLES,
        });
        if (alignedSources.length < MEANING_AUTHORITY_MIN_SOURCES) {
          complete = false;
          findings.push(finding(
            'insufficient-competency-authority',
            'error',
            path,
            'An answered scope competency needs two claim-aligned current semantic sources, or it must be partial with an explicit authority gap.',
            witnesses.evidence,
          ));
        }
      }
      if (contract.id === 'domains') {
        const unsupportedDomains = proposal.domains.filter((domain) =>
          !sharedDomains.has(domain.slug) &&
          domainAuthoritySources({
            sources: witnesses.evidence,
            domain,
            claim: `${domain.title}\n${domain.definition}\n${row.answer}`,
            evidenceBySource,
          }).length < MEANING_AUTHORITY_MIN_SOURCES);
        if (unsupportedDomains.length > 0) {
          complete = false;
          findings.push(finding(
            'insufficient-competency-authority',
            'error',
            path,
            'An answered domains competency needs two responsibility-specific current semantic sources for every proposed domain, or it must be partial with an explicit authority gap.',
            unsupportedDomains.map((domain) => domain.slug),
          ));
        }
      }
      const coverage = evaluateQuantifiedCompetencyCoverage({
        id: contract.id,
        domains: proposal.domains,
        capabilities: proposal.capabilities,
        witnesses,
        requireCapabilityPaths: true,
      });
      if (coverage && coverage.uncovered.length > 0) {
        complete = false;
        findings.push(finding(
          'incomplete-competency-coverage',
          'error',
          path,
          `Answered competency "${contract.id}" covers ${coverage.covered.length} of ${coverage.targetSet.length} required targets.`,
          coverage.uncovered,
        ));
      }
      if (complete) answered += 1;
    } else if (COMPETENCY_STATUSES.has(row.status)) {
      if (!nonEmpty(row.gap)) {
        findings.push(finding(
          'missing-competency-gap',
          'error',
          `${path}.gap`,
          `A ${row.status} competency answer must state the remaining evidence gap.`,
        ));
      } else {
        findings.push(finding(
          row.status === 'partial'
            ? 'partial-competency-answer'
            : 'visible-competency-gap',
          'warning',
          path,
          `Competency "${contract.id}" remains ${row.status}: ${row.gap}`,
        ));
      }
    }
  }
  const competencyFindings = findings.slice(findingStart);
  return {
    allAnswered: answered === MEANING_COMPETENCY_QUESTIONS.length,
    witnessesResolved: !competencyFindings.some((row) => row.severity === 'error'),
  };
}
