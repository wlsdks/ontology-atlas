function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value;
}

function array(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

export function assertArchitectureBriefResult(value) {
  const result = object(value, 'inspect_architecture');
  if (result.contract !== 'architectureBrief:v1') {
    throw new Error('inspect_architecture.contract must be architectureBrief:v1.');
  }
  if (result.sideEffect !== 0) {
    throw new Error('inspect_architecture.sideEffect must be 0.');
  }
  const profile = object(result.profile, 'inspect_architecture.profile');
  if (typeof profile.slug !== 'string' || profile.slug.trim() === '') {
    throw new Error('inspect_architecture.profile.slug must be a non-empty string.');
  }
  array(profile.roles, 'inspect_architecture.profile.roles');
  const dependencyUsages = array(
    profile.dependencyUsages,
    'inspect_architecture.profile.dependencyUsages',
  );
  if (
    dependencyUsages.length === 0 ||
    dependencyUsages.some((usage) => !['value', 'type_only'].includes(usage)) ||
    new Set(dependencyUsages).size !== dependencyUsages.length
  ) {
    throw new Error(
      'inspect_architecture.profile.dependencyUsages must contain value and/or type_only.',
    );
  }
  const conformance = object(result.conformance, 'inspect_architecture.conformance');
  if (!['conforms', 'violated', 'unknown'].includes(conformance.status)) {
    throw new Error('inspect_architecture.conformance.status must be conforms, violated, or unknown.');
  }
  const observedRoleEdges = array(
    conformance.observedRoleEdges,
    'inspect_architecture.conformance.observedRoleEdges',
  );
  for (const [index, row] of observedRoleEdges.entries()) {
    const edge = object(row, `inspect_architecture.conformance.observedRoleEdges[${index}]`);
    const edgeCount = nonNegativeInteger(
      edge.count,
      `inspect_architecture.conformance.observedRoleEdges[${index}].count`,
    );
    const counts = object(
      edge.importUsageCounts,
      `inspect_architecture.conformance.observedRoleEdges[${index}].importUsageCounts`,
    );
    for (const usage of ['value', 'type_only', 'unknown']) {
      nonNegativeInteger(
        counts[usage],
        `inspect_architecture.conformance.observedRoleEdges[${index}].importUsageCounts.${usage}`,
      );
    }
    const countedUsages = ['value', 'type_only', 'unknown'].reduce(
      (total, usage) => total + counts[usage],
      0,
    );
    if (countedUsages !== edgeCount) {
      throw new Error(
        `inspect_architecture.conformance.observedRoleEdges[${index}].importUsageCounts ` +
          `must total count ${edgeCount}; found ${countedUsages}.`,
      );
    }
    const evidence = array(
      edge.evidence,
      `inspect_architecture.conformance.observedRoleEdges[${index}].evidence`,
    );
    for (const [evidenceIndex, receiptValue] of evidence.entries()) {
      const receipt = object(
        receiptValue,
        `inspect_architecture.conformance.observedRoleEdges[${index}].evidence[${evidenceIndex}]`,
      );
      if (!['value', 'type_only', 'unknown'].includes(receipt.importUsage)) {
        throw new Error(
          `inspect_architecture.conformance.observedRoleEdges[${index}].evidence[${evidenceIndex}].importUsage ` +
            'must be value, type_only, or unknown.',
        );
      }
    }
  }
  nonNegativeInteger(
    conformance.excludedByUsage,
    'inspect_architecture.conformance.excludedByUsage',
  );
  const violations = array(
    conformance.violations,
    'inspect_architecture.conformance.violations',
  );
  for (const [index, violationValue] of violations.entries()) {
    const violation = object(
      violationValue,
      `inspect_architecture.conformance.violations[${index}]`,
    );
    if (!['value', 'type_only'].includes(violation.importUsage)) {
      throw new Error(
        `inspect_architecture.conformance.violations[${index}].importUsage ` +
          'must be value or type_only.',
      );
    }
  }
  const unknown = object(
    conformance.unknown,
    'inspect_architecture.conformance.unknown',
  );
  nonNegativeInteger(
    unknown.unknownImportUsages,
    'inspect_architecture.conformance.unknown.unknownImportUsages',
  );
  object(result.agentPlanContract, 'inspect_architecture.agentPlanContract');
  array(result.nextActions, 'inspect_architecture.nextActions');
  return result;
}
