import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const posix = value => value.replaceAll('\\', '/');

function relativeFile(filePath, cwd) {
  if (!filePath) return 'knip-config';
  const absolute = resolve(filePath);
  const base = cwd;
  const path = posix(relative(base, absolute));
  return path.startsWith('../') ? 'knip-config' : path;
}

export function stableIssueKey({ scope, lane, type, file, symbol, parentSymbol = '' }) {
  return [scope, lane, type, file, parentSymbol, symbol || '.'].filter(Boolean).join(':');
}

export function collectReport(options, { scope, lane }) {
  const { report, issues, configurationHints = [], counters = {}, cwd } = options;
  const findings = [];
  for (const [type, enabled] of Object.entries(report)) {
    if (!enabled) continue;
    for (const entries of Object.values(issues[type] ?? {})) for (const issue of Object.values(entries)) {
      const file = relativeFile(issue.filePath, cwd);
      const symbol = issue.symbol ?? '';
      const parentSymbol = issue.parentSymbol ?? '';
      findings.push({ scope, lane, type, file, symbol, parentSymbol, key: stableIssueKey({ scope, lane, type, file, symbol, parentSymbol }) });
    }
  }
  for (const hint of configurationHints) {
    const file = relativeFile(hint.filePath, cwd);
    const symbol = `${hint.type}:${String(hint.identifier)}`;
    findings.push({ scope, lane, type: 'configurationHints', file, symbol, key: stableIssueKey({ scope, lane, type: 'configurationHints', file, symbol }) });
  }
  return { findings: findings.sort((a, b) => a.key.localeCompare(b.key)), processed: Number(counters.processed ?? 0), total: Number(counters.total ?? 0) };
}

export default function reporter(options) {
  const target = process.env.OATLAS_DEAD_CODE_REPORT_FILE;
  const scope = process.env.OATLAS_DEAD_CODE_SCOPE;
  const lane = process.env.OATLAS_DEAD_CODE_LANE;
  const root = process.env.OATLAS_DEAD_CODE_ROOT;
  if (!target || !scope || !lane || !root) throw new Error('dead-code reporter requires report file, scope, lane, and root environment');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ knipVersion: process.env.OATLAS_DEAD_CODE_KNIP_VERSION, ...collectReport(options, { scope, lane, root }) }, null, 2)}\n`);
}
