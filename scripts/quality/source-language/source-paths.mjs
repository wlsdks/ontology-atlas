const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const C_LIKE_EXTENSIONS = new Set(['.rs', '.c', '.cc', '.cpp', '.h', '.hpp', '.swift']);
const HASH_COMMENT_EXTENSIONS = new Set(['.yml', '.yaml', '.toml', '.sh']);
const HASH_COMMENT_FILES = new Set([
  '.gitignore',
  '.gitattributes',
  '.env.example',
  '.githooks/pre-commit',
  '.githooks/pre-push',
]);

function extensionOf(path) {
  const match = /(?:^|\/)([^/]+)$/.exec(path);
  const name = match?.[1] ?? path;
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at).toLowerCase();
}

export function classifySourcePath(path) {
  if (
    path.startsWith('tests/')
    || /\.(?:test|spec)\.[^.]+$/.test(path)
    || path.includes('/fixtures/')
  ) {
    return 'testFixture';
  }
  if (path.startsWith('docs/prototypes/')) return 'historicalPrototype';
  return 'current';
}

export function isSupportedSourcePath(path) {
  if (path.endsWith('.md')) return false;
  return sourceCommentSyntax(path) !== null;
}

export function sourceCommentSyntax(path) {
  const fixture = /\.(ts|tsx|js|jsx)\.fixture$/.exec(path);
  if (fixture) return { kind: 'typescript', jsx: fixture[1] === 'tsx' || fixture[1] === 'jsx' };
  const extension = extensionOf(path);
  if (TYPESCRIPT_EXTENSIONS.has(extension)) {
    return { kind: 'typescript', jsx: extension === '.tsx' || extension === '.jsx' };
  }
  if (C_LIKE_EXTENSIONS.has(extension)) {
    return { kind: 'cLike', rust: extension === '.rs' };
  }
  if (HASH_COMMENT_EXTENSIONS.has(extension) || HASH_COMMENT_FILES.has(path)) {
    return { kind: 'hash' };
  }
  if (extension === '.css' || extension === '.html') return { kind: extension.slice(1) };
  return null;
}

/**
 * Where a *printed* string is held to English, and under which ratchet.
 *
 * `source:language` reads comment tokens, so a Korean string literal was invisible to it. That is
 * not a hypothetical: measured 2026-08-25 the CLI printed Korean on 140 lines while this gate
 * reported zero, and measured 2026-08-31 the release and MCP surfaces still printed it on ~250
 * more — error text, `--help` output, refusal reasons, and MCP tool responses an agent reads.
 *
 * The scan is deliberately narrower than the comment scan. These three roots are programs whose
 * strings are *output*: scripts an operator runs, the MCP server an agent talks to, and the CLI.
 * `src/**` and `messages/**` are excluded because their Korean is the product's own locale data,
 * which `docs:language` and the locale contracts already own — pointing this ratchet at them would
 * measure translation, not drift.
 */
export const STRING_SCAN_SCOPES = Object.freeze({
  scripts: 'scripts/',
  mcpServer: 'mcp/src/',
  cliCommands: 'cli/src/',
});

const STRING_SCAN_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.ts']);

/**
 * Returns the ratchet scope for a printed-string scan, or `null` when the path is out of scope.
 *
 * Tests and fixtures are excluded on purpose: test *names* in this repository are Korean by
 * convention, and a fixture that feeds Korean text through the parser has to contain Korean.
 */
export function classifyStringScanPath(path) {
  if (/\.(?:test|spec)\.[^.]+$/.test(path) || path.includes('/fixtures/')) return null;
  if (!STRING_SCAN_EXTENSIONS.has(extensionOf(path))) return null;
  for (const [scope, prefix] of Object.entries(STRING_SCAN_SCOPES)) {
    if (path.startsWith(prefix)) return scope;
  }
  return null;
}

export function isStringScannedPath(path) {
  return classifyStringScanPath(path) !== null;
}
