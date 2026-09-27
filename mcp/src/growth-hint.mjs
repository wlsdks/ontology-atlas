// Ask-to-Grow: a read that resolves to nothing is where the vault should grow.
// These pure helpers turn an empty result into a `growthHint` the caller attaches
// only to empty or unresolved results, never on success. Hints come from data
// the caller already has; with no real candidate they fall back to a generic
// add_concept scaffold rather than a guessed node.

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text) {
  return String(text ?? '').toLowerCase().match(TOKEN_RE) ?? [];
}

function titleCaseFromSlug(slug) {
  const tail = String(slug ?? '').split('/').pop() || String(slug ?? '');
  const words = tail.replace(/[-_]+/g, ' ').trim();
  if (!words) return String(slug ?? '');
  return words.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

/**
 * The slug a growth hint suggests. It keeps the Hangul syllable range
 * (U+AC00–U+D7A3) like the other slugifiers (shared/lib/slugify.ts, analyze.mjs,
 * absorb.mjs), or Korean titles become `untitled`; a `/` stays a separator, so a
 * title like `Payment/Billing` becomes `payment-billing`.
 */
function slugify(text) {
  const slug = String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

/**
 * find_path found nothing within maxHops: a missing endpoint suggests
 * add_concept, two unconnected endpoints suggest add_relation.
 */
export function buildFindPathGrowthHint({ from, to, fromExists, toExists }) {
  const missing = [];
  if (!fromExists) missing.push(from);
  if (!toExists) missing.push(to);

  if (missing.length > 0) {
    const target = missing[0];
    return {
      reason:
        missing.length === 2
          ? `Neither "${from}" nor "${to}" resolves to a vault node.`
          : `"${target}" does not resolve to a vault node.`,
      suggestion:
        'A path cannot exist to an endpoint that is not in the vault yet. Add it first if it describes a real capability/element/domain.',
      exampleCall: {
        tool: 'add_concept',
        args: { slug: target, kind: 'element', title: titleCaseFromSlug(target) },
      },
    };
  }

  return {
    reason: `No relation path connects "${from}" and "${to}" within the given hop budget.`,
    suggestion:
      'If these two concepts are actually related, add the missing edge directly instead of widening maxHops.',
    exampleCall: {
      tool: 'add_relation',
      args: { from, to, type: 'relates' },
    },
  };
}

/** get_concept / node_profile miss; `candidateSlugs` come from the caller's real slug set. */
export function buildSlugNotFoundGrowthHint({ slug, candidateSlugs = [], referencedBy = [] }) {
  // The vault already names this concept; only the document is missing. Say who
  // wrote it under which key and the one move that materialises it.
  if (referencedBy.length > 0) {
    const cited = referencedBy
      .slice(0, 3)
      .map((hit) => `${hit.slug} (via ${hit.via})`)
      .join(', ');
    const more = referencedBy.length > 3 ? ` and ${referencedBy.length - 3} more` : '';
    return {
      reason: `"${slug}" has no document of its own, but ${referencedBy.length} vault doc(s) reference it: ${cited}${more}.`,
      suggestion:
        'This is a referenced-only concept: the map counts it, the compiled graph does not, because nothing defines it yet. Create its document at exactly this slug so the existing references resolve to it.',
      exampleCall: {
        tool: 'add_concept',
        args: { slug, kind: 'element', title: titleCaseFromSlug(slug) },
      },
    };
  }
  if (candidateSlugs.length > 0) {
    return {
      reason: `"${slug}" does not resolve to a vault node.`,
      suggestion: `Closest existing slug(s): ${candidateSlugs.join(', ')}: likely a typo or a missing folder segment rather than a missing node.`,
      exampleCall: {
        tool: 'get_concept',
        args: { slug: candidateSlugs[0] },
      },
    };
  }
  return {
    reason: `"${slug}" does not resolve to a vault node, and no similarly-named node exists.`,
    suggestion:
      'This may be a real gap in the vault: add it if it describes an actual capability/element/domain.',
    exampleCall: {
      tool: 'add_concept',
      args: { slug, kind: 'element', title: titleCaseFromSlug(slug) },
    },
  };
}

/**
 * query_concepts matched 0 rows. `kind=` and `domain=` equalities in the filter
 * are checked against the census, so the hint can say the kind or domain does
 * not exist at all.
 */
export function buildQueryConceptsZeroRowsGrowthHint({ filter, byKind = {}, byDomain = {} }) {
  const filterText = String(filter ?? '');
  const kindRefs = [...filterText.matchAll(/\bkind\s*=\s*"?([a-z][a-z0-9_-]*)"?/gi)].map((m) =>
    m[1].toLowerCase(),
  );
  const domainRefs = [...filterText.matchAll(/\bdomain\s*=\s*"?([a-z0-9][a-z0-9_./-]*)"?/gi)].map(
    (m) => m[1],
  );

  const missingKinds = [...new Set(kindRefs)].filter((kind) => !byKind[kind]);
  const missingDomains = [...new Set(domainRefs)].filter((domain) => !byDomain[domain]);

  if (missingKinds.length > 0 || missingDomains.length > 0) {
    const facts = [
      ...missingKinds.map((kind) => `kind="${kind}" has 0 nodes in this vault`),
      ...missingDomains.map((domain) => `domain="${domain}" has 0 nodes in this vault`),
    ];
    return {
      reason: `query_concepts matched 0 rows: ${facts.join('; ')}.`,
      suggestion:
        'Check list_kinds / list_concepts for the real kind/domain census before retrying, or add the missing nodes.',
      exampleCall: { tool: 'list_kinds', args: {} },
    };
  }

  return {
    reason: `query_concepts matched 0 rows for filter: ${filterText}`,
    suggestion: 'Loosen the filter: drop an AND clause or widen an equality: and retry.',
    exampleCall: { tool: 'list_kinds', args: {} },
  };
}

/** find_evidence matched 0 titles; `nearMatches` come from `findNearTitleMatches`. */
export function buildFindEvidenceZeroHitsGrowthHint({ title, nearMatches = [] }) {
  if (nearMatches.length > 0) {
    const names = nearMatches.map((match) => `${match.title} (${match.slug})`);
    return {
      reason: `No vault doc mentions "${title}".`,
      suggestion: `Closest existing node(s) by title: ${names.join(', ')}: confirm this isn't the same concept under a different name before adding a new one.`,
      exampleCall: { tool: 'get_concept', args: { slug: nearMatches[0].slug } },
    };
  }
  return {
    reason: `No vault doc mentions "${title}", and no similarly-titled node exists.`,
    suggestion: 'This concept may not be captured in the vault yet: add it if it describes a real capability/element/domain.',
    exampleCall: {
      tool: 'add_concept',
      args: { slug: slugify(title), kind: 'element', title: String(title ?? '') },
    },
  };
}

/**
 * Near titles for find_evidence's 0-hit case by token Jaccard (every substring
 * match already failed): local, no embeddings. `minScore` keeps unrelated titles
 * out rather than inventing a closest match.
 */
export function findNearTitleMatches(query, candidates = [], { limit = 3, minScore = 0.3 } = {}) {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];
  const scored = [];
  for (const candidate of candidates) {
    const candidateTokens = new Set(tokenize(candidate?.title));
    if (candidateTokens.size === 0) continue;
    let intersection = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) intersection += 1;
    }
    if (intersection === 0) continue;
    const union = new Set([...queryTokens, ...candidateTokens]).size;
    const score = intersection / union;
    if (score >= minScore) {
      scored.push({
        slug: candidate.slug,
        title: candidate.title,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return scored.slice(0, limit);
}
