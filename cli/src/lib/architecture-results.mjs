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
  const conformance = object(result.conformance, 'inspect_architecture.conformance');
  if (!['conforms', 'violated', 'unknown'].includes(conformance.status)) {
    throw new Error('inspect_architecture.conformance.status must be conforms, violated, or unknown.');
  }
  array(conformance.violations, 'inspect_architecture.conformance.violations');
  object(result.agentPlanContract, 'inspect_architecture.agentPlanContract');
  array(result.nextActions, 'inspect_architecture.nextActions');
  return result;
}
