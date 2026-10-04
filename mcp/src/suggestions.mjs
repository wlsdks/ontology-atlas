export function closestAllowedValue(input, allowed) {
  if (!input || !Array.isArray(allowed) || allowed.length === 0) return null;
  let best = null;
  let thresholdLimit = Infinity;
  if (typeof input === 'string' && allowed.every(value => typeof value === 'string')) {
    thresholdLimit = allowed.reduce((limit, value) => Math.max(limit, Math.floor(value.length / 3)), 2);
  }
  for (const candidate of allowed) {
    const cutoff = best ? Math.min(thresholdLimit, best.distance - 1) : thresholdLimit;
    const distance = distanceWithin(input, candidate, cutoff);
    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }
  if (!best) return null;
  const threshold = Math.max(2, Math.floor(best.candidate.length / 3));
  return best.distance <= threshold ? best.candidate : null;
}

export function formatAllowedValueError(name, value, allowed) {
  const suggestion = typeof value === 'string'
    ? closestAllowedValue(value, allowed)
    : null;
  const receivedText = ` Received: ${formatErrorValue(value)}.`;
  const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
  return `${name} must be one of: ${allowed.join(', ')}.${receivedText}${suggestionText}`;
}

/** Unresolved-name hints preserve exact-tail, edit-distance and substring tiers. */
export function suggestCompiledSlugs(input, slugs, limit = 3) {
  if (typeof input !== 'string' || !input.trim() || !Array.isArray(slugs) || slugs.length === 0) {
    return [];
  }
  const candidate = input.trim();
  const tail = candidate.split('/').pop() || candidate;
  const lowerTail = tail.toLowerCase();
  const lowerInput = candidate.toLowerCase();
  const exactTail = [];
  const typoTail = [];
  const substring = [];
  for (const slug of slugs) {
    if (slug === candidate) continue;
    const candTail = (slug.split('/').pop() || slug).toLowerCase();
    if (candTail === lowerTail) {
      exactTail.push(slug);
      continue;
    }
    const cutoff = Math.max(2, Math.floor(candTail.length / 3));
    const distance = distanceWithin(lowerTail, candTail, cutoff);
    if (distance <= Math.max(2, Math.floor(candTail.length / 3))) {
      typoTail.push({ slug, distance });
      continue;
    }
    if (candTail.includes(lowerTail) || lowerTail.includes(candTail) || slug.toLowerCase().includes(lowerInput)) {
      substring.push(slug);
    }
  }
  typoTail.sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
  return [...exactTail, ...typoTail.map((t) => t.slug), ...substring].slice(0, limit);
}

export function formatErrorValue(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
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

// Exact within the cutoff; larger distances cannot change the selected result.
function distanceWithin(a, b, cutoff) {
  if (!Number.isFinite(cutoff) || typeof a !== 'string' || typeof b !== 'string') return levenshteinDistance(a, b);
  if (Math.abs(a.length - b.length) > cutoff) return cutoff + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j <= cutoff ? j : cutoff + 1);
  let current = Array(b.length + 1).fill(cutoff + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i <= cutoff ? i : cutoff + 1;
    const left = Math.max(1, i - cutoff);
    const right = Math.min(b.length, i + cutoff);
    if (left > 1) current[left - 1] = cutoff + 1;
    let minimum = current[0];
    for (let j = left; j <= right; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minimum = Math.min(minimum, current[j]);
    }
    if (right < b.length) current[right + 1] = cutoff + 1;
    if (minimum > cutoff) return cutoff + 1;
    const held = previous;
    previous = current;
    current = held;
  }
  return previous[b.length];
}
