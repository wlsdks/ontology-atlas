import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, matchesGlob, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { KNIP_VERSION, SCOPE_CONFIGS, scopesFor } from './scope-configs.mjs';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
export function assertKnipVersion(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'node_modules/knip/package.json'), 'utf8'));
  if (manifest.version !== KNIP_VERSION) throw new Error(`Knip version mismatch: expected ${KNIP_VERSION}, found ${manifest.version}`);
  return manifest.version;
}

export async function cliRuntimeEntries(root, modules) {
  const registry = modules ?? (await import(pathToFileURL(resolve(root, 'cli/src/lib/cli-commands.mjs')).href)).CLI_COMMAND_MODULES;
  return ['src/index.mjs', ...new Set(Object.values(registry).map(file => `src/commands/${file}`))].sort();
}

function manifestRuntimeEntries(root, cwd) {
  const manifest = JSON.parse(readFileSync(resolve(root, cwd, 'package.json'), 'utf8'));
  const refs = new Set([manifest.main, ...Object.values(manifest.bin ?? {})].filter(Boolean));
  for (const script of Object.values(manifest.scripts ?? {})) {
    for (const match of String(script).matchAll(/(?:^|\s)((?:src|scripts)\/[\w./-]+\.(?:mjs|js|cjs))/g)) refs.add(match[1]);
  }
  return [...refs].sort();
}

export async function materializeConfig(root, scopeName, lane) {
  const scope = SCOPE_CONFIGS[scopeName];
  const config = structuredClone(scope[lane]);
  let entryPatterns = config.entry;
  if (lane === 'runtime' && scopeName === 'cli') {
    const entries = await cliRuntimeEntries(root);
    config.entry = entries.filter(entry => entry !== 'src/index.mjs'); // bin is already a manifest entry
    entryPatterns = entries;
  } else if (lane === 'runtime' && config.entry.length === 0) entryPatterns = manifestRuntimeEntries(root, scope.cwd);
  return { config: { ...config, treatConfigHintsAsErrors: true }, entryPatterns };
}

export function matchedEntries(root, cwd, patterns, tracked) {
  const prefix = cwd === '.' ? '' : `${cwd.replace(/\/$/, '')}/`;
  const files = tracked ?? execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return files
    .filter(file => !prefix || file.startsWith(prefix))
    .map(file => prefix ? file.slice(prefix.length) : file)
    .filter(file => patterns.some(pattern => !pattern.startsWith('!') && matchesGlob(file, pattern)) && !patterns.some(pattern => pattern.startsWith('!') && matchesGlob(file, pattern)))
    .sort();
}

function defaultRun({ cwd, args, env }) {
  execFileSync('pnpm', args, { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
}

const errorDetail = error => [error.message, error.stderr?.toString().trim(), error.stdout?.toString().trim()].filter(Boolean).join(' :: ');

export async function analyzeDeadCode({ root = process.cwd(), scope = 'all', runKnip = defaultRun, scratchParent = '/tmp' } = {}) {
  let knipVersion;
  let scratch;
  const lanes = [];
  try {
    knipVersion = assertKnipVersion(root);
    scratch = mkdtempSync(join(scratchParent, 'ontology-atlas-deadcode-'));
    for (const scopeName of scopesFor(scope)) {
      const scopeConfig = SCOPE_CONFIGS[scopeName];
      for (const lane of ['runtime', 'verification']) {
        const materialized = await materializeConfig(root, scopeName, lane);
        const { config, entryPatterns } = materialized;
        const entries = matchedEntries(root, scopeConfig.cwd, entryPatterns);
        if (entries.length === 0) return { knipVersion, lanes, errors: [`${scopeName}/${lane}: entry glob matched zero tracked files`], exitCode: 2 };
        const configPath = join(scratch, `${scopeName}-${lane}.knip.mjs`);
        const reportPath = join(scratch, `${scopeName}-${lane}.report.json`);
        const compiler = scopeName === 'frontend' || scopeName === 'scripts' ? ", compilers: { '.css': () => '' }" : '';
        writeFileSync(configPath, `export default { ...${JSON.stringify(config, null, 2)}${compiler} };\n`);
        try {
          runKnip({ cwd: root, args: ['exec', 'knip', '--directory', scopeConfig.cwd, '--config', configPath, '--reporter', resolve(HERE, 'knip-reporter.mjs'), '--no-progress', '--no-exit-code'], env: { OATLAS_DEAD_CODE_REPORT_FILE: reportPath, OATLAS_DEAD_CODE_SCOPE: scopeName, OATLAS_DEAD_CODE_LANE: lane, OATLAS_DEAD_CODE_KNIP_VERSION: knipVersion, OATLAS_DEAD_CODE_ROOT: root } });
        } catch (error) {
          return { knipVersion, lanes, errors: [`${scopeName}/${lane}: Knip failed: ${errorDetail(error)}`], exitCode: 2 };
        }
        if (!existsSync(reportPath)) return { knipVersion, lanes, errors: [`${scopeName}/${lane}: reporter produced no report`], exitCode: 2 };
        let report;
        try { report = JSON.parse(readFileSync(reportPath, 'utf8')); }
        catch (error) { return { knipVersion, lanes, errors: [`${scopeName}/${lane}: malformed reporter JSON: ${error.message}`], exitCode: 2 }; }
        if (!Array.isArray(report.findings)) return { knipVersion, lanes, errors: [`${scopeName}/${lane}: reporter findings must be an array`], exitCode: 2 };
        if (!Number.isFinite(report.processed) || report.processed < 0 || !Number.isFinite(report.total) || report.total < 0) return { knipVersion, lanes, errors: [`${scopeName}/${lane}: reporter counters must be finite non-negative numbers`], exitCode: 2 };
        if (report.processed === 0) return { knipVersion, lanes, errors: [`${scopeName}/${lane}: Knip processed zero files`], exitCode: 2 };
        lanes.push({ scope: scopeName, lane, entries: entries.length, processed: report.processed, total: report.total, findings: report.findings ?? [] });
      }
    }
  } catch (error) {
    return { knipVersion, lanes, errors: [`dead-code analyzer setup failed: ${error instanceof Error ? error.message : String(error)}`], exitCode: 2 };
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
  return { knipVersion, lanes, errors: [], exitCode: 0 };
}
