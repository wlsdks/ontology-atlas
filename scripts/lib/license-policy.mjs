const PERMISSIVE_LICENSES = Object.freeze([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Apache-2.0',
  'Python-2.0',
  'Unicode-3.0',
]);

const BOUNDARY_LICENSES = Object.freeze([
  'MPL-2.0',
  'LGPL-2.0-only',
  'LGPL-2.0-or-later',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'OFL-1.1',
]);

const PERMISSION_ONLY_EXCEPTIONS = Object.freeze(['LLVM-exception']);

export const SNIPPET_LICENSES = Object.freeze(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', 'Zlib', 'Unlicense']);

const DEPRECATED_SPELLINGS = new Map([
  ['LGPL-2.0', 'LGPL-2.0-only'],
  ['LGPL-2.0+', 'LGPL-2.0-or-later'],
  ['LGPL-2.1', 'LGPL-2.1-only'],
  ['LGPL-2.1+', 'LGPL-2.1-or-later'],
  ['LGPL-3.0', 'LGPL-3.0-only'],
  ['LGPL-3.0+', 'LGPL-3.0-or-later'],
]);

const CANONICAL = new Map(
  [...PERMISSIVE_LICENSES, ...BOUNDARY_LICENSES, ...PERMISSION_ONLY_EXCEPTIONS].map((id) => [id.toUpperCase(), id]),
);

function canonicalId(id) {
  const upper = id.toUpperCase();
  for (const [deprecated, current] of DEPRECATED_SPELLINGS) {
    if (deprecated.toUpperCase() === upper) return current;
  }
  return CANONICAL.get(upper) ?? id;
}

function tokenize(raw) {
  return String(raw).replace(/\//g, ' OR ').match(/\(|\)|[^\s()]+/g) ?? [];
}

/** Precedence follows SPDX: WITH binds tighter than AND, which binds tighter than OR. */
function parseLicenseExpression(raw) {
  const tokens = tokenize(raw ?? '');
  let at = 0;
  const peek = () => tokens[at];
  const isOperator = (token, name) => typeof token === 'string' && token.toUpperCase() === name;
  const atom = () => {
    const token = tokens[at++];
    if (token === '(') {
      const inner = anyOf();
      if (tokens[at++] !== ')') throw new Error('unbalanced parenthesis');
      return inner;
    }
    if (token === undefined || token === ')' || ['AND', 'OR', 'WITH'].some((name) => isOperator(token, name))) {
      throw new Error(`expected a license identifier, found ${token ?? 'the end'}`);
    }
    if (isOperator(peek(), 'WITH')) {
      at += 1;
      const exception = tokens[at++];
      if (exception === undefined || exception === '(' || exception === ')') throw new Error('WITH needs an exception identifier');
      return { kind: 'license', id: canonicalId(token), exception: canonicalId(exception) };
    }
    return { kind: 'license', id: canonicalId(token) };
  };
  const allOf = () => {
    const args = [atom()];
    while (isOperator(peek(), 'AND')) {
      at += 1;
      args.push(atom());
    }
    return args.length === 1 ? args[0] : { kind: 'and', args };
  };
  const anyOf = () => {
    const args = [allOf()];
    while (isOperator(peek(), 'OR')) {
      at += 1;
      args.push(allOf());
    }
    return args.length === 1 ? args[0] : { kind: 'or', args };
  };
  if (tokens.length === 0) return null;
  const tree = anyOf();
  if (at !== tokens.length) throw new Error(`unexpected ${tokens[at]}`);
  return tree;
}

function leafLabel(leaf) {
  return leaf.exception ? `${leaf.id} WITH ${leaf.exception}` : leaf.id;
}

function leafRank(leaf) {
  if (leaf.exception && !PERMISSION_ONLY_EXCEPTIONS.includes(leaf.exception)) return null;
  const permissive = PERMISSIVE_LICENSES.indexOf(leaf.id);
  if (permissive >= 0) return permissive;
  const boundary = BOUNDARY_LICENSES.indexOf(leaf.id);
  return boundary >= 0 ? PERMISSIVE_LICENSES.length + boundary : null;
}

function choose(node) {
  if (node.kind === 'license') {
    const rank = leafRank(node);
    return rank === null ? null : { rank, licenses: [leafLabel(node)] };
  }
  const choices = node.args.map(choose);
  if (node.kind === 'and') {
    if (choices.includes(null)) return null;
    return { rank: Math.max(...choices.map((choice) => choice.rank)), licenses: choices.flatMap((choice) => choice.licenses) };
  }
  return choices.filter(Boolean).sort((a, b) => a.rank - b.rank)[0] ?? null;
}

function leaves(node) {
  if (!node) return [];
  return node.kind === 'license' ? [node] : node.args.flatMap(leaves);
}

/**
 * The licenses Ontology Atlas uses a package under: for `A OR B` the most permissive
 * permitted choice, for `A AND B` both. `licenses` is null when no choice is permitted.
 */
export function electLicense(raw) {
  let tree;
  try {
    tree = parseLicenseExpression(raw);
  } catch {
    return { licenses: null, ids: [] };
  }
  if (!tree) return { licenses: null, ids: [] };
  return { licenses: choose(tree)?.licenses ?? null, ids: leaves(tree).map((leaf) => leaf.id) };
}

/** Why a declared license is refused, in the words a reviewer searches for. */
export function refusalReason(raw) {
  const text = String(raw ?? '').trim();
  if (text === '' || /^(?:unknown|none|noassertion)$/i.test(text)) return 'no license declared';
  if (/^unlicensed$/i.test(text)) return 'proprietary (UNLICENSED)';
  if (/prosperity/i.test(text)) return 'Prosperity: non-commercial use only';
  if (/(?:^|[-\s(])NC(?:[-\s)]|$)|non-?commercial/i.test(text)) return 'non-commercial';
  if (/(?:^|[-\s(])SA(?:[-\s)]|$)|share-?alike/i.test(text)) return 'share-alike';
  const { ids } = electLicense(text);
  if (ids.some((id) => /^A?GPL-/i.test(id))) return 'GPL/AGPL copyleft';
  return 'not on the allow-list';
}

function exceptionProblems(exception, index) {
  const problems = [];
  for (const field of ['ecosystem', 'package', 'license', 'reason']) {
    if (typeof exception?.[field] !== 'string' || exception[field].trim() === '') {
      problems.push(`exceptions[${index}] needs a nonblank ${field}`);
    }
  }
  if (exception?.ecosystem && !['npm', 'cargo'].includes(exception.ecosystem)) {
    problems.push(`exceptions[${index}].ecosystem must be npm or cargo`);
  }
  return problems;
}

/**
 * Judges every package against the allow-list. An exception excuses one package only
 * while it still declares the license the exception names, and an exception that
 * excuses nothing in a `judged` ecosystem is reported so the list cannot outlive its reasons.
 */
export function evaluateLicensePolicy({ packages, exceptions, judged = ['npm', 'cargo'] }) {
  const problems = [];
  if (exceptions?.version !== 1 || !Array.isArray(exceptions.exceptions)) {
    problems.push('the exception file must be { "version": 1, "exceptions": [...] }');
  }
  const list = Array.isArray(exceptions?.exceptions) ? exceptions.exceptions : [];
  const invalid = new Set();
  list.forEach((exception, index) => {
    const found = exceptionProblems(exception, index);
    if (found.length > 0) invalid.add(index);
    problems.push(...found);
  });
  const used = new Set();
  const violations = [];
  for (const pkg of packages) {
    if (electLicense(pkg.license).licenses) continue;
    const index = list.findIndex(
      (exception, at) =>
        !invalid.has(at) && exception.ecosystem === pkg.ecosystem && exception.package === pkg.name && exception.license === pkg.license,
    );
    if (index >= 0) {
      used.add(index);
      continue;
    }
    violations.push({ ...pkg, reason: refusalReason(pkg.license) });
  }
  list.forEach((exception, index) => {
    if (!used.has(index) && !invalid.has(index) && judged.includes(exception.ecosystem)) {
      problems.push(
        `exception for ${exception.ecosystem} ${exception.package} (${exception.license}) excuses no package that fails the policy; remove it`,
      );
    }
  });
  return { violations, problems };
}
