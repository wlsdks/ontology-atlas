export function formatUnknownFlagError(flag, allowedFlags = []) {
  const suggestion = closestAllowedFlag(flag, allowedFlags);
  const suggestionText = suggestion ? ` Did you mean ${suggestion}?` : '';
  return `unknown flag: ${flag}.${suggestionText}`;
}

function closestAllowedFlag(flag, allowedFlags = []) {
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
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }
  return previous[b.length];
}
