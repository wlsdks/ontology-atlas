

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function namesWord(text, word) {
  if (!word || word.length < 3) return false;
  return new RegExp(`(^|[^\\w/.-])${escapeRegExp(word)}(?=$|[^\\w-])`, 'i').test(text);
}

function lastSegment(path) {
  return path.split('/').pop().replace(/\.[^.]+$/, '');
}

/** Entry symbols too generic to place anything by name. */
export const GENERIC_SYMBOLS = new Set(['main', '__main__', 'run', 'default', 'index', 'app', 'cli', 'server', 'next', 'version', 'release', 'label', 'message', 'comment']);

export const NAMING_KINDS = new Set(['capability', 'element']);

/** A name in the vault's words: `create-labels` and `createLabels` are both "create labels". */
export function spokenForms(name) {
  const plain = String(name ?? '').replace(/^@[\w-]+\//, '');
  const words = plain.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_/]+/g, ' ').trim();
  return [...new Set([plain, words].filter((form) => form.length >= 3))];
}

const ENTRY_STEMS = new Set(['index', '__init__', 'main', 'mod', 'lib']);
const LAYOUT_FOLDERS = new Set(['src', 'lib', 'bin', 'source', 'dist']);

/** The package folder an entry file opens, or null when the file is not a package entry. */
export function packageFolder(path) {
  const parts = String(path ?? '').split('/');
  if (!ENTRY_STEMS.has(lastSegment(parts.at(-1) ?? ''))) return null;
  const folders = parts.slice(0, -1).filter((part) => !LAYOUT_FOLDERS.has(part));
  return folders.at(-1) ?? null;
}

/** Kinds whose row is a group placed through its members: a folder family, a module's API. */
export const MEMBER_KINDS = new Set(['family', 'api']);
/** Words a reason must keep once the abilities it names are taken out. */
const REASON_WORDS = 3;

/**
 * A one-word flag (`--force`) names an ability only in code form, or as "the
 * force flag"; "--dry-run" also answers to "dry run".
 */
export function flagNamed(text, name) {
  const bare = String(name).replace(/^--?/, '');
  if (new RegExp(`(^|[^\\w-])--${escapeRegExp(bare)}(?=$|[^\\w-])|\`${escapeRegExp(bare)}\`|\\b${escapeRegExp(bare)}\\s+(?:flag|option|switch)\\b`, 'i').test(text)) return true;
  const words = bare.split(/[-_.]+/).filter(Boolean);
  return words.length >= 2 && namesWord(text, words.join(' '));
}

/**
 * Whether an exclusion line gives a reason: once every ability name, code span
 * and path it holds is taken out, at least three words remain. "Not modeled: log,
 * ssl, ping." lists names; "log and ssl only tune the transport" says why.
 */
export function givesReason(line, abilities) {
  let rest = line.replace(/`[^`]*`/g, ' ').replace(/\S+\/\S+/g, ' ');
  for (const row of abilities) {
    for (const word of [row.name, row.symbol].filter(Boolean).map(String).flatMap(spokenForms)) {
      rest = rest.replace(new RegExp(`(^|[^\\w/.-])${escapeRegExp(word)}(?=$|[^\\w-])`, 'gi'), '$1 ');
    }
  }
  return rest.split(/[^\p{L}\p{N}']+/u).filter((word) => word.length >= 2).length >= REASON_WORDS;
}

/** The tokens of every inline code span: "`cli.List` and `--force`" holds cli, List, cli.List and --force. */
export function codeTokens(text) {
  const tokens = new Set();
  for (const span of String(text ?? '').matchAll(/`([^`\n]{1,200})`/g)) {
    const code = span[1].trim();
    tokens.add(code);
    for (const part of code.split(/[^\w.$:/-]+/)) {
      if (!part) continue;
      tokens.add(part);
      for (const piece of part.split(/[.:/]+/)) if (piece) tokens.add(piece);
    }
  }
  return tokens;
}

/** Whether `text` names the row in code form: a code span holding its exact name or symbol, or its evidence cite. */
export function namedInCode(text, row, tokens = codeTokens(text)) {
  if (row.kind === 'flag') return flagNamed(text, row.name);
  if (row.evidence && new RegExp(`${escapeRegExp(row.evidence)}(?!\\d)`).test(text)) return true;
  return [row.name, row.symbol, row.kind === 'family' ? lastSegment(row.path) : packageFolder(row.path)]
    .filter(Boolean)
    .some((name) => tokens.has(String(name)));
}

/**
 * Whether a line holds the row's exact name (case and all) as a whole word: list,
 * not "List" or "listing". A common word ("App", "next") points at a row only in
 * code form or by its cite.
 */
export function exactlyNamed(line, row) {
  const name = String(row.name ?? '');
  if (name.length < 2 || GENERIC_SYMBOLS.has(name.toLowerCase())) return false;
  return new RegExp(`(^|[^\\w/.-])${escapeRegExp(name)}(?=$|[^\\w-])`).test(line);
}
