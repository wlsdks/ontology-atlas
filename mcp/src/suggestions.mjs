export function closestAllowedValue(input, allowed) {
  if (!input || !Array.isArray(allowed) || allowed.length === 0) return null;
  let best = null;
  for (const candidate of allowed) {
    const distance = levenshteinDistance(input, candidate);
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

/**
 * 미해석 slug 에 대한 근접 후보 — 컴파일된 slug 집합(인메모리) 대상.
 * tail 오타(전치 포함)는 levenshtein, 폴더 차이는 tail 일치, 부분 입력은
 * substring 으로 잡는다. 에러 경로에서만 호출되므로 O(n·len²) 허용.
 */
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
    const distance = levenshteinDistance(lowerTail, candTail);
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
