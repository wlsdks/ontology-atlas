export const CONSTRUCTION_QUALIFICATION_CONTRACT = 'constructionQualification:v1';

export const CONSTRUCTION_QUALIFICATION_AUDIENCES = Object.freeze([
  'executive',
  'employee',
  'fde',
  'agent',
]);

export const CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES = Object.freeze([
  'executive',
  'employee',
  'agent',
]);

export const FDE_AUDIENCE_AUTHORITY_WITNESS_KIND = 'audience-authority:fde';
export const FDE_AUDIENCE_AUTHORITY_DECISION = 'audience:fde';
export const CONSTRUCTION_QUALIFICATION_MIN_CASES = 4;

export const CONSTRUCTION_QUALITY_AXES = Object.freeze([
  'semantic',
  'structural',
  'functional',
  'evidence_provenance',
  'pragmatic',
  'maintainability',
  'interoperability',
]);

export const CONSTRUCTION_FAILURE_CATEGORIES = Object.freeze([
  'evidence',
  'prompt',
  'ui',
  'missing_primitive',
]);

export const CQ_STATUSES = new Set(['answered', 'partial', 'unknown', 'refused']);
export const QUANTIFIERS = new Set(['one', 'each', 'all', 'exists', 'none']);
export const AXIS_STATUSES = new Set(['passed', 'failed', 'unknown', 'not_measured']);
export const CLAIM_STATUSES = new Set(['supported', 'partial', 'unsupported', 'conflict']);
export const CITATION_STATUSES = new Set(['verified', 'mismatch', 'missing']);
export const SOURCE_HIDDEN_STATUSES = new Set(['passed', 'failed', 'unknown', 'not_measured']);
export const ACCEPTANCE_DECISIONS = new Set(['accepted', 'rejected', 'pending']);
export const REGRESSION_STATUSES = new Set(['passed', 'failed', 'not_applicable']);
export const FAILURE_CATEGORIES = new Set(CONSTRUCTION_FAILURE_CATEGORIES);
