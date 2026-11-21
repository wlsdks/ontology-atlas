export function finding(code, severity, path, message, sources = []) {
  return { code, severity, path, message, sources };
}

export function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function relationKey(relation) {
  return `${relation.from}\u0000${relation.type}\u0000${relation.to}`;
}

const CITATION_RESOLVED_BLOCKERS = ['missing-citation', 'unknown-citation', 'untrusted-citation'];
const RISKY_EVIDENCE_BLOCKERS = ['untrusted-citation', 'risky-citation-unconfirmed'];
const ELEMENT_PATH_BLOCKERS = ['missing-element-path', 'python-selected-import-element-limit'];
const RELATION_BLOCKERS = [
  'duplicate-relation',
  'missing-relation-endpoint',
  'missing-relation-rationale',
  'relation-source-not-in-write-plan',
  'unsupported-relation-type',
  'unobserved-python-import-dependency',
  'relation-path-citation-mismatch',
  'insufficient-domain-relation-authority',
];
const CONFIDENCE_BLOCKERS = [
  'invalid-confidence',
  'insufficient-purpose-authority',
  'insufficient-domain-authority',
  'insufficient-domain-relation-authority',
];

/** Which review gates a proposal passes, read from the findings it produced. */
export function proposalGates(proposal, findings, competencyAudit) {
  const hasFinding = (codes) => findings.some((row) => codes.includes(row.code));
  return {
    projectDefined: nonEmpty(proposal.project.definition),
    conceptsDefined: [...proposal.domains, ...proposal.capabilities, ...proposal.elements]
      .every((row) => nonEmpty(row.definition)),
    citationsResolved: !hasFinding(CITATION_RESOLVED_BLOCKERS),
    riskyEvidenceControlled: !hasFinding(RISKY_EVIDENCE_BLOCKERS),
    capabilityDomainsResolved: !hasFinding(['unresolved-capability-domain']),
    elementDomainsResolved: !hasFinding(['unresolved-element-domain']),
    elementPathsResolved: !hasFinding(ELEMENT_PATH_BLOCKERS),
    relationsResolved: !hasFinding(RELATION_BLOCKERS),
    confidenceValid: !hasFinding(CONFIDENCE_BLOCKERS),
    competencyQuestionsAnswered: competencyAudit.allAnswered,
    competencyWitnessesResolved: competencyAudit.witnessesResolved,
  };
}
