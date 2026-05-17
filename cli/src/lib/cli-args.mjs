export function parseVaultFlag(value) {
  const path = String(value ?? '').trim();
  if (path.startsWith('--')) return false;
  return path ? path : false;
}

export function resolveExclusiveVaultArg({ vault, positional, defaultVault = '.' }) {
  if (vault === false) return { error: '--vault requires a path' };
  if (vault && positional.length > 0) {
    return { error: 'pass vault as either positional argument or --vault, not both' };
  }
  if (positional.length > 1) {
    return { error: `too many arguments: ${positional.slice(1).join(' ')}` };
  }
  return { vault: vault || positional[0] || defaultVault };
}

export function resolveTrailingVaultArg({
  vault,
  positional,
  vaultIndex,
  defaultVault = '.',
}) {
  if (vault === false) return { error: '--vault requires a path' };
  if (vault && positional.length > vaultIndex) {
    return { error: 'pass vault as either positional argument or --vault, not both' };
  }
  if (positional.length > vaultIndex + 1) {
    return { error: `too many arguments: ${positional.slice(vaultIndex + 1).join(' ')}` };
  }
  return { vault: vault || positional[vaultIndex] || defaultVault };
}

export function resolveSingleRootPathArg({ positional, defaultRootPath = '.' }) {
  if (positional.length > 1) {
    return { error: `too many arguments: ${positional.slice(1).join(' ')}` };
  }
  return { rootPath: positional[0] || defaultRootPath };
}

export function parsePositiveIntegerFlag(flag, value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
    return new Error(`${flag} must be a positive integer`);
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : new Error(`${flag} must be a positive integer`);
}

export function parseBoundedPositiveIntegerFlag(flag, value, { max } = {}) {
  const parsed = parsePositiveIntegerFlag(flag, value);
  if (parsed instanceof Error) return parsed;
  if (Number.isInteger(max) && parsed > max) {
    return new Error(`${flag} must be <= ${max}`);
  }
  return parsed;
}

export function parseNonNegativeIntegerFlag(flag, value) {
  if (!/^(0|[1-9]\d*)$/.test(String(value ?? ''))) {
    return new Error(`${flag} must be a non-negative integer`);
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : new Error(`${flag} must be a non-negative integer`);
}

export function parseRequiredFlagValue(flag, value) {
  const text = String(value ?? '').trim();
  if (!text || text.startsWith('--')) return new Error(`${flag} requires a value`);
  return text;
}
