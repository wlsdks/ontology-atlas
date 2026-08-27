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
  assertMeasuredStamp(result.measured);
  const conformance = object(result.conformance, 'inspect_architecture.conformance');
  if (!['conforms', 'violated', 'unknown'].includes(conformance.status)) {
    throw new Error('inspect_architecture.conformance.status must be conforms, violated, or unknown.');
  }
  array(conformance.violations, 'inspect_architecture.conformance.violations');
  if (!Number.isInteger(conformance.typeOnlyEdgeCount) || conformance.typeOnlyEdgeCount < 0) {
    throw new Error('inspect_architecture.conformance.typeOnlyEdgeCount must be a non-negative integer.');
  }
  object(result.agentPlanContract, 'inspect_architecture.agentPlanContract');
  array(result.nextActions, 'inspect_architecture.nextActions');
  return result;
}

// The measured stamp is required (2026-08-27 decision): a brief without a
// dated source-state receipt must fail here, not become a stampless record.
function assertMeasuredStamp(measured) {
  const stamp = object(measured, 'inspect_architecture.measured');
  if (typeof stamp.at !== 'string' || Number.isNaN(Date.parse(stamp.at))) {
    throw new Error('inspect_architecture.measured.at must be an ISO-8601 time.');
  }
  const tool = object(stamp.tool, 'inspect_architecture.measured.tool');
  for (const key of ['name', 'version']) {
    if (typeof tool[key] !== 'string' || tool[key].trim() === '') {
      throw new Error(`inspect_architecture.measured.tool.${key} must be a non-empty string.`);
    }
  }
  const source = object(stamp.source, 'inspect_architecture.measured.source');
  if (source.kind === 'git') {
    if (typeof source.revision !== 'string' || !/^[0-9a-f]{7,40}$/.test(source.revision)) {
      throw new Error('inspect_architecture.measured.source.revision must be a git commit short sha.');
    }
    if (typeof source.dirty !== 'boolean') {
      throw new Error('inspect_architecture.measured.source.dirty must be a boolean.');
    }
    if ('fingerprint' in source) {
      throw new Error('inspect_architecture.measured.source must not mix a git revision with a folder fingerprint.');
    }
    return;
  }
  if (source.kind === 'folder') {
    if (typeof source.fingerprint !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(source.fingerprint)) {
      throw new Error('inspect_architecture.measured.source.fingerprint must be sha256:<64 hex>.');
    }
    if ('revision' in source || 'dirty' in source) {
      throw new Error('inspect_architecture.measured.source must not mix a folder fingerprint with a git revision.');
    }
    return;
  }
  throw new Error('inspect_architecture.measured.source.kind must be git or folder.');
}
