export const KNIP_VERSION = '6.29.0';

export const MANIFEST_ISSUES = ['dependencies', 'devDependencies', 'optionalPeerDependencies'];
export const RATCHET_TYPES = ['exports', 'types', 'nsExports', 'nsTypes', 'enumMembers', 'namespaceMembers', 'duplicates'];
export const RUNTIME_BLOCKERS = ['files', ...MANIFEST_ISSUES, 'unlisted', 'unresolved', 'binaries', 'catalog', 'cycles'];
export const VERIFICATION_BLOCKERS = ['files', 'unlisted', 'unresolved', 'binaries', 'catalog', 'cycles'];
const ALL_ISSUES = [...new Set([...RUNTIME_BLOCKERS, ...RATCHET_TYPES])];
const WITHOUT_MANIFEST = ALL_ISSUES.filter(type => !MANIFEST_ISSUES.includes(type));
const source = (entry, project, include = ALL_ISSUES, extras = {}) => ({ entry, project, include, ...extras });

// The root manifest has one dependency owner: frontend/runtime. Scripts share
// that manifest but cannot truthfully claim its UI dependencies as script deps.
export const SCOPE_CONFIGS = Object.freeze({
  frontend: Object.freeze({
    cwd: '.',
    runtime: source(
      ['app/**/{page,layout,template,error,loading,not-found,global-error,default,route}.{ts,tsx}', 'app/**/{icon,apple-icon,opengraph-image,twitter-image,sitemap,robots}.{ts,tsx}'],
      ['app/**/*.{ts,tsx,css}', 'src/**/*.{ts,tsx}', '!**/*.{test,spec}.{ts,tsx}', '!src/entities/docs-vault/data/**'],
      ALL_ISSUES,
      {},
    ),
    verification: source(['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}', 'app/globals.css'], ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}', 'app/**/*.css'], WITHOUT_MANIFEST, { next: false }),
  }),
  scripts: Object.freeze({
    cwd: '.',
    runtime: source(['app/globals.css'], ['scripts/**/*.mjs', '!scripts/**/*.test.mjs', '!scripts/quality/dead-code/**', 'app/**/*.css'], WITHOUT_MANIFEST, { next: false }),
    verification: source(['scripts/**/*.test.mjs', 'app/globals.css'], ['scripts/**/*.test.mjs', 'app/**/*.css'], WITHOUT_MANIFEST, { next: false }),
  }),
  cli: Object.freeze({
    cwd: 'cli',
    runtime: source([], ['src/**/*.mjs', '!src/**/*.test.mjs', '!src/integration.test.mjs']),
    verification: source(['src/**/*.test.mjs'], ['src/**/*.test.mjs'], WITHOUT_MANIFEST),
  }),
  mcp: Object.freeze({
    cwd: 'mcp',
    runtime: source([], ['src/**/*.{js,mjs}', 'scripts/**/*.mjs', '!src/**/*.test.mjs']),
    verification: source(['src/**/*.test.mjs'], ['src/**/*.test.mjs'], WITHOUT_MANIFEST),
  }),
});

export function scopesFor(scope) {
  if (scope === 'all') return Object.keys(SCOPE_CONFIGS);
  if (scope in SCOPE_CONFIGS) return [scope];
  throw new Error(`unknown --scope ${scope}; expected frontend, scripts, cli, mcp, or all`);
}

export function parseArguments(argv) {
  const parsed = { scope: 'all', json: false, updateBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--update-baseline') parsed.updateBaseline = true;
    else if (arg === '--scope') parsed.scope = argv[++index] ?? '';
    else if (arg.startsWith('--scope=')) parsed.scope = arg.slice(8);
    else throw new Error(`unknown argument: ${arg}`);
  }
  scopesFor(parsed.scope);
  if (parsed.updateBaseline && parsed.scope !== 'all') throw new Error('--update-baseline requires --scope all');
  return parsed;
}
