// Picks the one capability a task is about, or says why none is defensible.

import { markdownSection } from './recorded-evidence.mjs';
import { readCapabilityClaim } from './reviewed-evidence.mjs';
import { extractSummaryExcerpt } from '../vault/documents/body-delivery.mjs';
import { lexicalTokens } from './task-intent.mjs';
import { compareText } from '../compare-text.mjs';

function scoreLexicalDocument(doc, terms) {
  const titleTokens = new Set(lexicalTokens(doc.frontmatter?.title || doc.frontmatter?.name || ''));
  const aliasTokens = new Set(lexicalTokens([
    doc.frontmatter?.display_en,
    doc.frontmatter?.display_ko,
  ].filter((value) => typeof value === 'string').join(' '))
    .filter((term) => !titleTokens.has(term)));
  const fields = [
    ['title', 8, titleTokens],
    ['alias', 8, aliasTokens],
    ['slug', 6, new Set(lexicalTokens(doc.slug))],
    ['path', 4, new Set(lexicalTokens(doc.frontmatter?.path || ''))],
    ['definition', 3, new Set(lexicalTokens(markdownSection(doc.body, 'Definition')))],
    ['body', 1, new Set(lexicalTokens(doc.body))],
  ];
  let score = 0;
  const matchedTerms = [];
  const matchedFields = new Set();
  for (const term of terms) {
    let termScore = 0;
    for (const [field, weight, tokens] of fields) {
      if (!tokens.has(term)) continue;
      termScore = Math.max(termScore, weight);
      matchedFields.add(field);
    }
    if (termScore === 0) continue;
    score += termScore;
    matchedTerms.push(term);
  }
  return { score, matchedTerms, matchedFields: [...matchedFields].sort() };
}

function matchedTermsIn(terms, tokens) {
  return terms.filter((term) => tokens.has(term));
}

function matchedTermsOnlyIn(terms, included, excluded) {
  return terms.filter((term) => included.has(term) && !excluded.has(term));
}

function claimSections(doc) {
  const { definition, includes, excludes, excerpt } = readCapabilityClaim(doc?.body);
  return {
    definition: new Set(lexicalTokens(definition)),
    includes: new Set(lexicalTokens(includes)),
    excludes: new Set(lexicalTokens(excludes)),
    excerpt: new Set(lexicalTokens(extractSummaryExcerpt(excerpt, 420))),
    definitionText: definition,
  };
}

function scoreCapabilityClaim(doc, intent) {
  const { definition, includes, excludes, excerpt, definitionText } = claimSections(doc);
  // The capability's name is part of its claim. Identity joins the positive set
  // before the Excludes subtraction, so a title never overrides an explicit
  // boundary, and it feeds the non-goal conflict check, so refusal only tightens.
  const identity = new Set(lexicalTokens([
    doc.frontmatter?.title || doc.frontmatter?.name || '',
    doc.frontmatter?.display_en || '',
    doc.frontmatter?.display_ko || '',
    doc.slug,
    doc.frontmatter?.path || '',
  ].join(' ')));
  const positive = new Set([...definition, ...includes, ...excerpt, ...identity]);
  // An Excludes bullet bounds what a capability does with its subject; it does not
  // withdraw the subject. Capabilities name themselves in their boundaries, so
  // identity survives the subtraction, while Definition, Includes and excerpt
  // prose stay cancellable.
  const cancellablePositive = new Set([...definition, ...includes, ...excerpt]);
  const desiredPositive = intent.desiredTerms.filter((term) => (
    identity.has(term) || (cancellablePositive.has(term) && !excludes.has(term))
  ));
  const desiredExcluded = matchedTermsOnlyIn(intent.desiredTerms, excludes, positive);
  const desiredTermSet = new Set(intent.desiredTerms);
  const distinctNonGoalTerms = intent.nonGoalTerms.filter((term) => !desiredTermSet.has(term));
  const nonGoalPositive = matchedTermsOnlyIn(distinctNonGoalTerms, positive, excludes);
  const nonGoalExcluded = matchedTermsOnlyIn(distinctNonGoalTerms, excludes, positive);
  const identitySupport = desiredPositive.filter((term) => identity.has(term));
  const includesSupport = desiredPositive.filter((term) => includes.has(term));
  // Only a name or an Includes bullet (what a person says it owns) can qualify a
  // candidate; Definition prose also names what it merely touches, and still
  // scores. An Excludes hit on a stated non-goal also qualifies: it is a reviewed
  // boundary. One shared word is never ownership (`node`, `panel` are
  // everywhere): a named claim needs a second desired term or a non-goal boundary.
  const namedSupport = new Set([...identitySupport, ...includesSupport]);
  const hasClaimSupport = (namedSupport.size >= 1 && desiredPositive.length >= 2)
    || (desiredPositive.length >= 1 && nonGoalExcluded.length >= 1);
  const namedClaim = new Set([...identity, ...includes]);
  const clauseClaimOverlap = intent.desiredClauseTerms.some((desiredClause) => {
    const desiredClaimTerms = new Set(desiredClause.filter((term) => namedClaim.has(term)));
    return intent.nonGoalClauseTerms.some((nonGoalClause) => (
      nonGoalClause.filter((term) => desiredClaimTerms.has(term) && namedClaim.has(term)).length >= 2
    ));
  });
  // Clause provenance is kept for the narrower refusal: a task that requests and
  // then negates the same named or Includes-backed claim. Two claim terms are
  // required so one broad noun is no contradiction. Lexical evidence, never proof
  // that the requirements conflict.
  const conflict = desiredExcluded.length > 0 || nonGoalPositive.length > 0 || clauseClaimOverlap;
  const termWeight = (term) => (
    includes.has(term) || identity.has(term) ? 6 : definition.has(term) ? 4 : 2
  );
  const score = desiredPositive.reduce((sum, term) => sum + termWeight(term), 0)
    + nonGoalExcluded.length * 4;
  return {
    score,
    definitionText,
    excludes,
    matchedTerms: [...new Set([...desiredPositive, ...nonGoalExcluded])].sort(),
    matchedFields: [
      ...(matchedTermsIn(intent.desiredTerms, definition).length > 0 ? ['definition'] : []),
      ...(matchedTermsIn(intent.desiredTerms, includes).length > 0 ? ['includes'] : []),
      ...(nonGoalExcluded.length > 0 ? ['excludes'] : []),
      ...(identitySupport.length > 0 ? ['identity'] : []),
    ],
    claimSupported: hasClaimSupport && score > 0,
    conflict,
    qualified: hasClaimSupport && !conflict && score > 0,
  };
}

function defensibleMatch(row) {
  if (!row || row.score <= 0) return false;
  const fields = new Set(row.matchedFields);
  if (row.matchedTerms.length >= 2 && row.score >= 6) return true;
  return fields.has('title') && (fields.has('slug') || fields.has('path'));
}

/**
 * Claims are parsed once; AST/token walks are linear and task terms use Sets.
 * Candidate ranking sorts in O(C log C).
 */
export function selectCapability(docs, intent) {
  const capabilities = docs.filter((doc) => doc.frontmatter?.kind === 'capability');
  const elements = docs.filter((doc) => doc.frontmatter?.kind === 'element');
  const elementScores = new Map(elements.map((doc) => [doc.slug, {
    doc,
    ...scoreLexicalDocument(doc, intent.allTerms),
  }]));
  const rows = capabilities.map((doc) => {
    const claim = scoreCapabilityClaim(doc, intent);
    const matchedChildren = (Array.isArray(doc.frontmatter?.elements) ? doc.frontmatter.elements : [])
      .map((slug) => elementScores.get(slug))
      .filter((row) => defensibleMatch(row))
      .sort((left, right) => right.score - left.score || compareText(left.doc.slug, right.doc.slug));
    const matchedTerms = [...new Set([
      ...claim.matchedTerms,
      ...matchedChildren.flatMap((row) => row.matchedTerms),
    ])].sort();
    // An element the capability declares is evidence of what it covers. Only its
    // name, slug and path count, distinct desired terms, capped at four, and only
    // once the parent's own claim qualified: a child never rescues a parent.
    const childIdentityTerms = new Set();
    if (claim.qualified) {
      for (const row of matchedChildren) {
        const identity = new Set(lexicalTokens([
          row.doc.frontmatter?.title || row.doc.frontmatter?.name || '',
          row.doc.frontmatter?.display_en || '',
          row.doc.frontmatter?.display_ko || '',
          row.doc.slug,
          row.doc.frontmatter?.path || '',
        ].join(' ')));
        for (const term of intent.desiredTerms) {
          if (identity.has(term) && !claim.excludes.has(term)) childIdentityTerms.add(term);
        }
      }
    }
    return {
      doc,
      definitionText: claim.definitionText,
      score: claim.score + Math.min(childIdentityTerms.size, 4) * 3,
      matchedTerms,
      matchedChildren,
      claimSupported: claim.claimSupported,
      conflict: claim.conflict,
      qualified: claim.qualified,
    };
  });
  const ordered = (values) => [...values]
    .sort((left, right) => right.score - left.score || compareText(left.doc.slug, right.doc.slug));
  const candidates = (values) => {
    const all = ordered(values);
    return {
      candidates: all.slice(0, 3).map((row) => ({
        slug: row.doc.slug,
        matchedTerms: uniqueBoundedStrings(row.matchedTerms, 6),
      })),
      total: all.length,
      omitted: Math.max(0, all.length - 3),
    };
  };
  const evidenceLimit = {
    no_match: 'Selector evidence only; this does not prove the behavior or product scope is absent.',
    boundary_conflict: 'Clause-level lexical selector evidence only; this does not prove a semantic contradiction or approve a boundary.',
    ambiguous: 'Selector evidence only; a score tie does not prove semantic equivalence or approve a candidate.',
  };
  const qualified = ordered(rows.filter((row) => row.qualified));
  if (qualified.length === 0 || qualified[0].score <= 0) {
    const conflicts = rows.filter((row) => row.claimSupported && row.conflict && row.score > 0);
    return {
      selected: null,
      refusal: conflicts.length > 0
        ? { reason: 'boundary_conflict', ...candidates(conflicts), evidenceLimit: evidenceLimit.boundary_conflict }
        : { reason: 'no_match', candidates: [], total: 0, omitted: 0, evidenceLimit: evidenceLimit.no_match },
    };
  }
  const tied = qualified.filter((row) => row.score === qualified[0].score);
  if (tied.length > 1) {
    return {
      selected: null,
      refusal: { reason: 'ambiguous', ...candidates(tied), evidenceLimit: evidenceLimit.ambiguous },
    };
  }
  return { selected: qualified[0], refusal: null };
}

function uniqueBoundedStrings(values, limit = 3) {
  const seen = new Set();
  const rows = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    rows.push(text.length > 96 ? `${text.slice(0, 95).trimEnd()}…` : text);
    if (rows.length >= limit) break;
  }
  return rows;
}
