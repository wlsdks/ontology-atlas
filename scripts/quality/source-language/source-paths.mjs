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
