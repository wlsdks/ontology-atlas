import { nonEmpty } from './proposal-review/shape.mjs';

export const MEANING_AUTHORITY_CONFIDENCE_THRESHOLD = 0.8;
export const MEANING_AUTHORITY_MIN_SOURCES = 2;
const MEANING_AUTHORITY_MIN_TERM_OVERLAP = 2;
export const PURPOSE_AUTHORITY_ROLES = new Set([
  'mission',
  'product-contract',
  'product-capabilities',
]);
const DOMAIN_AUTHORITY_ROLES = new Set([
  'mission',
  'product-contract',
  'architecture',
]);
const MEANING_AUTHORITY_STOP_WORDS = new Set([
  'about',
  'allow',
  'application',
  'boundary',
  'business',
  'capability',
  'cover',
  'domain',
  'enable',
  'evidence',
  'govern',
  'handle',
  'help',
  'manage',
  'meaning',
  'operator',
  'own',
  'product',
  'project',
  'provide',
  'purpose',
  'repository',
  'responsibility',
  'service',
  'software',
  'system',
  'user',
  'workflow',
]);
const REVIEW_UNIT_AUTHORITY_STOP_WORDS = new Set([
  'and',
  'are',
  'but',
  'candidate',
  'claim',
  'could',
  'current',
  'did',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'into',
  'issue',
  'its',
  'line',
  'local',
  'may',
  'not',
  'only',
  'open',
  'other',
  'our',
  'over',
  'package',
  'please',
  'question',
  'regard',
  'review',
  'should',
  'source',
  'text',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'thi',
  'through',
  'under',
  'unit',
  'use',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'will',
  'with',
  'without',
  'would',
  'you',
  'your',
]);

export function alignedSemanticAuthoritySources({
  sources,
  claim,
  evidenceBySource,
  allowedRoles,
  evidencePredicate = () => true,
}) {
  const claimTokens = meaningAuthorityTokens(claim);
  if (claimTokens.size === 0) return [];
  const requiredOverlap = Math.min(MEANING_AUTHORITY_MIN_TERM_OVERLAP, claimTokens.size);
  const aligned = [];
  const seenEvidence = new Set();
  for (const source of new Set(Array.isArray(sources) ? sources : [])) {
    const evidence = evidenceBySource.get(source);
    if (
      evidence?.trust !== 'candidate-evidence' ||
      !allowedRoles.has(evidence.role) ||
      typeof evidence.excerpt !== 'string' ||
      !evidence.excerpt.trim() ||
      !evidencePredicate(evidence)
    ) {
      continue;
    }
    const evidenceTokens = meaningAuthorityTokens(
      `${evidence.title ?? ''}\n${evidence.excerpt ?? ''}`,
    );
    let overlap = 0;
    for (const token of claimTokens) {
      if (evidenceTokens.has(token)) overlap += 1;
    }
    if (overlap < requiredOverlap) continue;
    const fingerprint = evidence.excerpt
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (seenEvidence.has(fingerprint)) continue;
    seenEvidence.add(fingerprint);
    aligned.push(source);
  }
  return aligned;
}

export function domainAuthoritySources({ sources, domain, claim, evidenceBySource }) {
  return alignedSemanticAuthoritySources({
    sources,
    claim,
    evidenceBySource,
    allowedRoles: DOMAIN_AUTHORITY_ROLES,
    evidencePredicate: (evidence) =>
      hasExplicitDomainResponsibility(evidence.excerpt, domain.title),
  });
}

function hasExplicitDomainResponsibility(value, domainTitle) {
  const normalizedDomain = normalizeMeaningAuthorityText(domainTitle);
  if (!normalizedDomain) return false;
  const sentences = String(value ?? '').match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [];
  return sentences.some((sentence) => (
    normalizeMeaningAuthorityText(sentence).includes(normalizedDomain) &&
    /\b(?:owns|is responsible for|governs|handles|covers)\b|(?:소유(?:한다|함)?|책임(?:을)?\s*(?:진다|맡는다)|관할|담당(?:한다|함)?|다룬다|처리(?:한다|함)?|관리(?:한다|함)?|포괄(?:한다|함)?)/i.test(sentence)
  ));
}

function normalizeMeaningAuthorityText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningAuthorityTokens(value) {
  const rawTokens = String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    rawTokens
      .map(normalizeMeaningAuthorityToken)
      .filter((token) =>
        token.length >= 3 && !MEANING_AUTHORITY_STOP_WORDS.has(token)),
  );
}

function normalizeMeaningAuthorityToken(token) {
  if (!/^[a-z0-9]+$/.test(token)) return token;
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) {
    const stem = token.slice(0, -3);
    return stem.endsWith(stem.at(-1).repeat(2)) ? stem.slice(0, -1) : stem;
  }
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function proposalAuthorityClaim(row) {
  return [
    row?.title,
    row?.definition,
    ...(Array.isArray(row?.includes) ? row.includes : []),
    ...(Array.isArray(row?.excludes) ? row.excludes : []),
    row?.why,
    row?.answer,
  ].filter(nonEmpty).join('\n');
}

export function matchingReviewRequiredEvidence(evidence, claim) {
  if (!evidence || !nonEmpty(claim)) return [];
  return (evidence.reviewRequiredEvidence ?? []).filter(
    (unit) => semanticUnitSupportsClaim(claim, unit?.excerpt),
  );
}

export function semanticUnitSupportsClaim(claim, evidenceText) {
  const claimTokens = reviewUnitAuthorityTokens(claim);
  const evidenceTokens = reviewUnitAuthorityTokens(evidenceText);
  if (claimTokens.size === 0 || evidenceTokens.size === 0) return false;
  const requiredOverlap = Math.min(
    MEANING_AUTHORITY_MIN_TERM_OVERLAP,
    claimTokens.size,
    evidenceTokens.size,
  );
  let overlap = 0;
  for (const token of claimTokens) {
    if (evidenceTokens.has(token)) overlap += 1;
  }
  return overlap >= requiredOverlap;
}

function reviewUnitAuthorityTokens(value) {
  return new Set(
    [...meaningAuthorityTokens(value)].filter(
      (token) => !REVIEW_UNIT_AUTHORITY_STOP_WORDS.has(token),
    ),
  );
}
