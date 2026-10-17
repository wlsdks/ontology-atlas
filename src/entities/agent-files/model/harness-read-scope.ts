export type HarnessReadClass =
  | 'text'
  | 'mcp-servers'
  | 'claude-settings'
  | 'codex-hooks'
  | 'toml-mcp-headers'
  | 'package-scripts'
  | 'not-allowed'
  | 'denied'
  | 'invalid';

export type HarnessListClass = 'listable' | 'not-allowed' | 'denied' | 'invalid';

const MAX_COMPONENTS = 12;

const TEXT_FILES = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
  '.cursorignore',
  '.cursorindexingignore',
  '.codeiumignore',
  '.aiexclude',
  '.aiignore',
  '.geminiignore',
  '.gitignore',
]);

const READ_TREES = [
  '.claude/rules',
  '.claude/hooks',
  '.claude/skills',
  '.claude/agents',
  '.agents/skills',
  '.agents/agents',
  '.cursor/rules',
  '.codex/hooks',
];

const PROJECTED_FILES: Readonly<Record<string, HarnessReadClass>> = {
  '.mcp.json': 'mcp-servers',
  '.claude/settings.json': 'claude-settings',
  '.codex/hooks.json': 'codex-hooks',
  '.codex/config.toml': 'toml-mcp-headers',
  'package.json': 'package-scripts',
};

const LIST_TREES = [
  '.claude/rules',
  '.claude/hooks',
  '.claude/skills',
  '.claude/agents',
  '.agents/skills',
  '.agents/agents',
  '.cursor/rules',
  '.codex',
  '.githooks',
  '.github',
];

const DENIED_NAMES = new Set([
  '.git', '.ssh', '.aws', '.gnupg', '.env', '.npmrc', '.netrc', '.pypirc', '.git-credentials',
  '.htpasswd', '.dockercfg', 'auth.json', 'settings.local.json', '.pgpass', '.boto', '.s3cfg',
  'kubeconfig',
]);

const DENIED_STEMS = new Set([
  'credential', 'credentials', '.credentials', 'secret', 'secrets', 'private-key', 'private_key',
  'privatekey', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'apikey', 'api-key', 'api_key',
  'service-account', 'service_account', 'serviceaccount',
]);

const DENIED_EXTENSIONS = new Set(['pem', 'key', 'p8', 'p12', 'pfx', 'jks', 'keystore', 'gpg', 'kdbx', 'ppk', 'asc']);

/** Normalized components, or null when the path is not a safe relative path. */
function components(path: string): string[] | null {
  if (path.includes('\0') || path.includes('\\') || path.startsWith('/')) return null;
  const parts = path.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.includes('..') || parts.length > MAX_COMPONENTS) return null;
  return parts;
}

function isDeniedName(name: string): boolean {
  const lower = name.toLowerCase();
  if (DENIED_NAMES.has(lower) || lower.startsWith('.env.')) return true;
  const dot = lower.lastIndexOf('.');
  const hasExtension = dot > 0 && dot < lower.length - 1;
  const stem = hasExtension ? lower.slice(0, dot) : lower;
  return DENIED_STEMS.has(stem) || (hasExtension && DENIED_EXTENSIONS.has(lower.slice(dot + 1)));
}

function under(path: string, tree: string): boolean {
  return path.startsWith(`${tree}/`);
}

export function harnessReadClass(path: string): HarnessReadClass {
  const parts = components(path);
  if (!parts) return 'invalid';
  if (parts.some(isDeniedName)) return 'denied';
  const clean = parts.join('/');
  if (TEXT_FILES.has(clean)) return 'text';
  const projected = PROJECTED_FILES[clean];
  if (projected) return projected;
  if (parts.length === 2 && parts[1] === 'AGENTS.md' && !parts[0].startsWith('.')) return 'text';
  if (READ_TREES.some((tree) => under(clean, tree))) return 'text';
  if (parts.length === 2 && parts[0] === '.githooks') return 'text';
  if (parts.length === 3 && clean.startsWith('.github/workflows/') && /\.ya?ml$/.test(clean)) return 'text';
  return 'not-allowed';
}

export function harnessListClass(path: string): HarnessListClass {
  const parts = components(path);
  if (!parts) return 'invalid';
  if (parts.some(isDeniedName)) return 'denied';
  const clean = parts.join('/');
  if (!parts.some((part) => part.startsWith('.'))) return 'listable';
  return LIST_TREES.some((tree) => clean === tree || under(clean, tree)) ? 'listable' : 'not-allowed';
}

export function isReadableHarnessPath(path: string): boolean {
  const readClass = harnessReadClass(path);
  return readClass !== 'not-allowed' && readClass !== 'denied' && readClass !== 'invalid';
}
