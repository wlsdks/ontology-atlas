// Reads a task sentence into the terms it wants and the terms it rules out.

const TASK_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'both', 'but', 'by',
  'actual', 'actually', 'behavior', 'can', 'change', 'contain', 'contains', 'cover', 'current', 'currently', 'does', 'during', 'earlier', 'element', 'elements', 'even', 'field', 'fields',
  'fix', 'for', 'from', 'has', 'have', 'if', 'in', 'into', 'is', 'it', 'its',
  'no', 'of', 'on', 'only', 'or', 'preserve', 'relevant', 'return', 'returns', 'run', 'so', 'than', 'that',
  'the', 'their', 'then', 'to', 'value', 'values', 'when', 'which', 'while',
  'whose', 'with', 'without',
]);

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-US');
}

function canonicalToken(token) {
  if (/^[가-힣]{3,}$/u.test(token)) {
    const withoutParticle = token.replace(/(?:에게서|으로|에서|에게|까지|부터|처럼|보다|은|는|이|가|을|를|에|로|와|과|도|만)$/u, '');
    if (withoutParticle.length >= 2 && withoutParticle !== token) return withoutParticle;
  }
  if (/^(?:writer|writes|writing|written|produce|produces|produced|producing|production)$/.test(token)) return 'write';
  if (/^(?:parser|parses|parsing|parsed|interpret|interprets|interpreted|interpreting|interpretation)$/.test(token)) return 'parse';
  if (/^(?:encoder|encodes|encoding|encoded)$/.test(token)) return 'encode';
  if (/^serializ(?:e|es|ed|er|ers|ing|ation)$/.test(token)) return 'serialize';
  if (/^reject(?:s|ed|ing|ion)?$/.test(token)) return 'reject';
  if (/^(?:decide|decides|decided|deciding|decision)$/.test(token)) return 'decide';
  if (/^(?:evaluate|evaluates|evaluated|evaluating|evaluation)$/.test(token)) return 'evaluate';
  if (/^(?:appraise|appraises|appraised|appraising|appraisal)$/.test(token)) return 'appraise';
  if (/^(?:accept|accepts|accepted|accepting|acceptable|acceptance)$/.test(token)) return 'accept';
  if (/^(?:expire|expires|expired|expiring|expiry)$/.test(token)) return 'expire';
  if (/^(?:diagnostic|diagnostics)$/.test(token)) return 'diagnostic';
  if (/^(?:report|reports|reported|reporting)$/.test(token)) return 'report';
  if (/^(?:remain|remains|remained|remaining)$/.test(token)) return 'remain';
  if (token.length > 4 && /[^s]s$/.test(token) && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

export function lexicalTokens(value) {
  const normalized = normalizeText(value).replace(/[-_/]+/g, ' ');
  const tokens = [];
  const seen = new Set();
  for (const match of normalized.matchAll(/[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*/gu)) {
    const token = match[0];
    for (const candidate of [token, ...token.split('.')]) {
      for (const normalizedCandidate of [candidate, canonicalToken(candidate)]) {
        if (!normalizedCandidate || seen.has(normalizedCandidate)) continue;
        seen.add(normalizedCandidate);
        tokens.push(normalizedCandidate);
      }
    }
  }
  return tokens;
}

function taskTerms(task) {
  const seen = new Set();
  const collected = [];
  for (const term of lexicalTokens(task)) {
    if (term.length < 2 || TASK_STOP_WORDS.has(term) || seen.has(term)) continue;
    seen.add(term);
    collected.push(term);
    if (collected.length >= 24) break;
  }
  // `lexicalTokens` emits a word and its canonical form ("lists" and "list"), and
  // documents carry both, so scoring each would pay twice for one task word.
  // Keep only the canonical representative.
  const canonicalForms = new Set(collected.map((term) => canonicalToken(term)));
  const terms = collected.filter((term) => (
    canonicalToken(term) === term || !canonicalForms.has(canonicalToken(term))
  ));
  const expansions = [];
  if (terms.some((term) => (
    ['encode', 'encoding', 'encoder'].includes(term)
    || /^(?:serializ|writ)/.test(term)
  ))) expansions.push('write');
  if (terms.some((term) => /^(?:decod|pars|read)/.test(term))) expansions.push('parse');
  return [...new Set([...expansions, ...terms])];
}

const NON_GOAL_CLAUSE = /(?:\b(?:do\s+not|must\s+not|should\s+not|never|without|out\s+of\s+scope|not\s+in\s+scope|(?:leave|keep)\b.*\bunchanged|(?:must|should)\s+(?:remain|stay)\s+unchanged|(?:are|is)\s+unchanged)\b|범위\s*밖|제외|하지\s*마(?:세요)?|하지\s*말)/iu;

function splitInlineBoundaryClause(clause) {
  for (const pattern of [
    /\s+(?:and|but|while)\s+(?=(?:do\s+not|must\s+not|should\s+not|never)\b|(?:leave|keep)\b.*\bunchanged\b)/iu,
    /\s+(?=without\b)/iu,
  ]) {
    const match = pattern.exec(clause);
    if (match?.index > 0) {
      return [clause.slice(0, match.index), clause.slice(match.index + match[0].length)];
    }
  }
  return [clause];
}

function stripNonGoalMarker(clause) {
  return clause
    .replace(/\b(?:do\s+not|must\s+not|should\s+not|never)\s+(?:add|change|modify|replace|remove|introduce)?\b/giu, ' ')
    .replace(/\b(?:must|should)\s+(?:remain|stay)\s+unchanged\b/giu, ' ')
    .replace(/\b(?:are|is)\s+unchanged\b/giu, ' ')
    .replace(/\b(?:are|is)\s+out\s+of\s+scope\b/giu, ' ')
    .replace(/\b(?:are|is)\s+not\s+in\s+scope\b/giu, ' ')
    .replace(/\bnot\s+in\s+scope\b/giu, ' ')
    .replace(/\b(?:leave|keep)\b/giu, ' ')
    .replace(/\bunchanged\b/giu, ' ')
    .replace(/\bwithout\b/giu, ' ')
    .replace(/(?:은|는|이|가)?\s*범위\s*밖(?:입니다|이다)?/gu, ' ')
    .replace(/(?:에서)?\s*제외(?:합니다|하다)?/gu, ' ')
    .replace(/하지\s*마(?:세요)?|하지\s*말(?:아|아주세요)?/gu, ' ');
}

export function taskIntent(task) {
  const clauses = String(task)
    .split(/[;,.!?\n]+/u)
    .flatMap((clause) => splitInlineBoundaryClause(clause.trim()))
    .map((clause) => clause.trim())
    .filter(Boolean);
  const desiredClauses = [];
  const nonGoalClauses = [];
  for (const clause of clauses) {
    if (NON_GOAL_CLAUSE.test(clause)) nonGoalClauses.push(stripNonGoalMarker(clause));
    else desiredClauses.push(clause);
  }
  return {
    allTerms: taskTerms(task),
    desiredTerms: taskTerms(desiredClauses.join(' ')),
    nonGoalTerms: taskTerms(nonGoalClauses.join(' ')),
    desiredClauseTerms: desiredClauses.map((clause) => taskTerms(clause)),
    nonGoalClauseTerms: nonGoalClauses.map((clause) => taskTerms(clause)),
  };
}
