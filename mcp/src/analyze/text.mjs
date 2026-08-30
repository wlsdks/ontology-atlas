// Naming and text normalisation shared across the analyzer: repo folder names to
// titles, titles to slugs, domain matching, and the heading-underline forms that
// both README detection and semantic-document extraction have to recognise.

export function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

export function cleanHeadingLabel(value) {
  return String(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|middot|amp|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHeadingAdornment(line) {
  return /^([^\p{L}\p{N}\s])\1{2,}$/u.test(line);
}

export function headingLevelForAdornment(line, hasTitle) {
  if (line.startsWith('=')) return 1;
  if (line.startsWith('-')) return 2;
  return hasTitle ? 2 : 1;
}

export function humanize(s) {
  return s
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function tailSlug(slug) {
  return String(slug).split('/').filter(Boolean).at(-1) ?? '';
}

export function matchDomainSlug(name, domains) {
  const candidateTokens = semanticTokens(name);
  if (candidateTokens.size === 0) return domains.length === 1 ? domains[0].slug : null;
  let best = null;
  let bestScore = 0;
  let tied = false;
  for (const domain of domains) {
    const domainTokens = semanticTokens(tailSlug(domain.slug));
    let overlap = 0;
    for (const token of candidateTokens) {
      if (domainTokens.has(token)) overlap += 1;
    }
    if (overlap > bestScore) {
      best = domain.slug;
      bestScore = overlap;
      tied = false;
    } else if (overlap > 0 && overlap === bestScore) {
      tied = true;
    }
  }
  if (bestScore > 0 && !tied) return best;
  // A sole README heading is still not role evidence. Unmatched implementation
  // candidates remain under the project instead of being absorbed into the
  // only available domain by elimination.
  return null;
}

export function semanticTokens(value) {
  return new Set(
    slugify(String(value))
      .split('-')
      .filter(Boolean)
      .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)),
  );
}

export function pathSemanticTokens(value) {
  return semanticTokens(String(value).replace(/[\\/._]+/g, '-'));
}
