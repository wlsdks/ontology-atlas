const FRAMEWORKS = new Set(['fsd', 'next', 'generic']);

export function assertAnalyzeRepoStructureResult(payload, context = 'analyze_repo_structure') {
  assertObject(payload, context);
  assertNonEmptyString(payload.rootPath, `${context}.rootPath`);
  if (!FRAMEWORKS.has(payload.framework)) {
    throw new Error(`${context}.framework must be one of ${[...FRAMEWORKS].join(', ')}`);
  }
  if ('project' in payload && payload.project != null) {
    assertBasicCandidate(payload.project, `${context}.project`);
  }
  assertCandidateArray(payload.domains, `${context}.domains`);
  assertCandidateArray(payload.capabilities, `${context}.capabilities`);
  assertCandidateArray(payload.elements, `${context}.elements`);
  if ('meaningGate' in payload && payload.meaningGate !== undefined) {
    assertMeaningGate(payload.meaningGate, `${context}.meaningGate`);
  }
  assertRelationArray(payload.suggestedRelations, `${context}.suggestedRelations`);
  assertSkippedArray(payload.skipped, `${context}.skipped`);
}

function assertCandidateArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  value.forEach((row, index) => assertCandidate(row, `${path}[${index}]`));
}

function assertRelationArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  value.forEach((row, index) => {
    const rowPath = `${path}[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.from, `${rowPath}.from`);
    assertNonEmptyString(row.to, `${rowPath}.to`);
    assertNonEmptyString(row.type, `${rowPath}.type`);
  });
}

function assertCandidate(row, path) {
  assertBasicCandidate(row, path);
  assertEvidence(row.evidence, `${path}.evidence`);
}

function assertBasicCandidate(row, path) {
  assertObject(row, path);
  assertNonEmptyString(row.slug, `${path}.slug`);
  assertNonEmptyString(row.title, `${path}.title`);
  if ('domain' in row && row.domain !== undefined) {
    assertNonEmptyString(row.domain, `${path}.domain`);
  }
}

function assertEvidence(value, path) {
  assertObject(value, path);
  assertNonEmptyString(value.source, `${path}.source`);
  if ('line' in value && value.line !== undefined && (!Number.isSafeInteger(value.line) || value.line < 1)) {
    throw new Error(`${path}.line must be a positive integer when present`);
  }
}

function assertSkippedArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  value.forEach((row, index) => {
    const rowPath = `${path}[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.path, `${rowPath}.path`);
    assertNonEmptyString(row.reason, `${rowPath}.reason`);
  });
}

function assertMeaningGate(value, path) {
  assertObject(value, path);
  assertNonEmptyString(value.policy, `${path}.policy`);
  assertNonEmptyString(value.sourceStructureRole, `${path}.sourceStructureRole`);
  assertSlugListObject(value.businessOntology, `${path}.businessOntology`, [
    'domains',
    'capabilities',
  ]);
  assertObject(value.implementationEvidence, `${path}.implementationEvidence`);
  assertStringArray(value.implementationEvidence.elements, `${path}.implementationEvidence.elements`);
  assertReviewRequiredCapabilityArray(
    value.implementationEvidence.reviewRequiredCapabilities,
    `${path}.implementationEvidence.reviewRequiredCapabilities`,
  );
  assertNonEmptyStringArray(value.reviewQuestions, `${path}.reviewQuestions`);
}

function assertSlugListObject(value, path, keys) {
  assertObject(value, path);
  for (const key of keys) {
    assertStringArray(value[key], `${path}.${key}`);
  }
}

function assertNonEmptyStringArray(value, path) {
  assertStringArray(value, path);
  if (value.length === 0) {
    throw new Error(`${path} must contain at least one item`);
  }
}

function assertStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  value.forEach((item, index) => assertNonEmptyString(item, `${path}[${index}]`));
}

function assertReviewRequiredCapabilityArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  value.forEach((row, index) => {
    const rowPath = `${path}[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.slug, `${rowPath}.slug`);
    assertNonEmptyString(row.reason, `${rowPath}.reason`);
    assertEvidence(row.evidence, `${rowPath}.evidence`);
  });
}

function assertObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}
