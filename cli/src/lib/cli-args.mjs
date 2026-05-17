export function parseVaultFlag(value) {
  const path = String(value ?? '').trim();
  if (path.startsWith('-')) return false;
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
  const text = String(value ?? '');
  if (!text || text.startsWith('--')) {
    return new Error(`${flag} requires a value`);
  }
  if (!/^[1-9]\d*$/.test(text)) {
    return new Error(`${flag} must be a positive integer`);
  }
  const parsed = Number.parseInt(text, 10);
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
  const text = String(value ?? '');
  if (!text || text.startsWith('--')) {
    return new Error(`${flag} requires a value`);
  }
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    return new Error(`${flag} must be a non-negative integer`);
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) ? parsed : new Error(`${flag} must be a non-negative integer`);
}

export function parseBoundedNonNegativeIntegerFlag(flag, value, { max } = {}) {
  const parsed = parseNonNegativeIntegerFlag(flag, value);
  if (parsed instanceof Error) return parsed;
  if (Number.isInteger(max) && parsed > max) {
    return new Error(`${flag} must be <= ${max}`);
  }
  return parsed;
}

export function parseRequiredFlagValue(flag, value) {
  const text = String(value ?? '').trim();
  if (!text || text.startsWith('-')) return new Error(`${flag} requires a value`);
  return text;
}

export function parseRawRequiredFlagValue(flag, value, { rejectSingleDash = false } = {}) {
  if (value === undefined) return new Error(`${flag} requires a value`);
  const text = String(value);
  if (text.startsWith('--')) return new Error(`${flag} requires a value`);
  if (rejectSingleDash && text.startsWith('-')) return new Error(`${flag} requires a value`);
  return text;
}

export function parseCsvListFlag(flag, value, { itemName = 'value' } = {}) {
  const text = parseRequiredFlagValue(flag, value);
  if (text instanceof Error) return text;
  const rawItems = text.split(',').map((item) => item.trim());
  const values = rawItems.filter(Boolean);
  if (values.length === 0) {
    return new Error(`${flag} requires at least one ${itemName}`);
  }
  if (rawItems.length !== values.length) {
    return new Error(`${flag} must not contain empty CSV items`);
  }
  return values;
}

export function formatUnknownFlagError(flag, allowedFlags = []) {
  const suggestion = closestAllowedFlag(flag, allowedFlags);
  const suggestionText = suggestion ? ` Did you mean ${suggestion}?` : '';
  return `unknown flag: ${flag}.${suggestionText}`;
}

export function closestAllowedFlag(flag, allowedFlags = []) {
  if (!flag || !Array.isArray(allowedFlags) || allowedFlags.length === 0) return null;
  const comparableFlag = String(flag).split('=')[0];
  return closestAllowedValue(comparableFlag, allowedFlags);
}

export function closestAllowedValue(value, allowedValues = []) {
  if (!value || !Array.isArray(allowedValues) || allowedValues.length === 0) return null;
  const comparableValue = String(value);
  let best = null;
  for (const candidate of allowedValues) {
    const distance = levenshteinDistance(comparableValue, candidate);
    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }
  if (!best) return null;
  const normalizedLength = best.candidate.replace(/^--/, '').length;
  const threshold = Math.max(2, Math.ceil(normalizedLength / 2));
  return best.distance <= threshold ? best.candidate : null;
}

function levenshteinDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }
  return prev[b.length];
}
