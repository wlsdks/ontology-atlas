#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { analyzeDeadCode } from './analyze.mjs';
import { KNIP_VERSION, MANIFEST_ISSUES, RATCHET_TYPES, RUNTIME_BLOCKERS, VERIFICATION_BLOCKERS, parseArguments, scopesFor } from './scope-configs.mjs';

const HERE = resolve(new URL('.', import.meta.url).pathname);
const BASELINE_PATH = resolve(HERE, 'baseline.json');
const EXCEPTIONS_PATH = resolve(HERE, 'exceptions.json');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const sorted = values => [...new Set(values)].sort();
const active = (key, scope) => scope === 'all' || key.startsWith(`${scope}:`);

function safeConsumer(root, consumer) {
  if (!consumer || isAbsolute(consumer) || consumer.split('/').includes('..')) return null;
  const path = resolve(root, consumer);
  if (!existsSync(path) || !lstatSync(path).isFile()) return null;
  const realRoot = realpathSync(root);
  const real = realpathSync(path);
  if (relative(realRoot, real).startsWith('..')) return null;
  try {
    execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', consumer], { stdio: 'ignore' });
    return { path, real };
  } catch { return null; }
}

function exceptionError(exception, finding, root) {
  if (!exception.reason?.trim() || !exception.witness?.trim()) return 'requires nonblank reason and witness';
  const consumer = safeConsumer(root, exception.consumer);
  if (!consumer) return 'consumer must be a repository-relative regular file contained by the repository';
  const text = readFileSync(consumer.path, 'utf8');
  if (!text.includes(exception.witness)) return `witness is absent from ${exception.consumer}`;
  if (finding.type === 'files' && exception.witness !== finding.file) return 'manual file exception witness must equal the exact file path';
  if (finding.type === 'binaries' && (exception.consumer !== finding.file || exception.witness !== finding.symbol)) return 'binary exception must self-witness exact source and binary symbol';
  if (MANIFEST_ISSUES.includes(finding.type) && !exception.witness.includes(finding.symbol)) return 'dependency witness must name the exact package';
  return null;
}

export function evaluateDeadCode({ report, baseline, exceptions, scope = 'all', root = process.cwd() }) {
  const errors = [...(report.errors ?? [])];
  if (report.knipVersion !== KNIP_VERSION) errors.push(`Knip version mismatch: expected ${KNIP_VERSION}, found ${report.knipVersion}`);
  const lanes = report.lanes ?? [];
  const expectedLanes = scopesFor(scope).flatMap(scopeName => ['runtime', 'verification'].map(lane => `${scopeName}/${lane}`));
  const actualLanes = lanes.map(lane => `${lane.scope}/${lane.lane}`);
  if (actualLanes.length !== expectedLanes.length || new Set(actualLanes).size !== actualLanes.length || expectedLanes.some(id => !actualLanes.includes(id))) errors.push(`expected exact lanes ${expectedLanes.join(', ')}, received ${actualLanes.join(', ')}`);
  for (const lane of lanes) {
    if (!lane.entries) errors.push(`${lane.scope}/${lane.lane}: entry subject floor reached zero`);
    if (!lane.processed) errors.push(`${lane.scope}/${lane.lane}: Knip processed zero files`);
  }
  const findings = lanes.flatMap(lane => lane.findings ?? []);
  const byKey = new Map(findings.map(finding => [finding.key, finding]));
  if (byKey.size !== findings.length) errors.push('dead-code reporter emitted duplicate stable issue keys');
  if (baseline.version !== 1) errors.push(`baseline version must be 1, found ${baseline.version}`);
  if (exceptions.version !== 1) errors.push(`exceptions version must be 1, found ${exceptions.version}`);
  const rawBaselineKeys = (baseline.findings ?? []).filter(key => active(key, scope));
  if (new Set(rawBaselineKeys).size !== rawBaselineKeys.length) errors.push('baseline contains duplicate keys');
  if (rawBaselineKeys.some(key => !/^(frontend|scripts|cli|mcp):(runtime|verification):(exports|types|nsExports|nsTypes|enumMembers|namespaceMembers|duplicates):/.test(key))) errors.push('baseline contains non-ratchet key');
  const selectedExceptions = (exceptions.exceptions ?? []).filter(item => active(item.key, scope));
  if (new Set(selectedExceptions.map(item => item.key)).size !== selectedExceptions.length) errors.push('exceptions contain duplicate keys');
  const accepted = new Set();
  for (const exception of selectedExceptions) {
    const finding = byKey.get(exception.key);
    if (!finding) { errors.push(`stale exception: ${exception.key}`); continue; }
    const problem = exceptionError(exception, finding, root);
    if (problem) errors.push(`invalid exception ${exception.key}: ${problem}`);
    else accepted.add(exception.key);
  }
  const remaining = findings.filter(finding => !accepted.has(finding.key));
  const baselineKeys = sorted(rawBaselineKeys);
  if (baseline.knipVersion !== KNIP_VERSION) errors.push(`baseline Knip version mismatch: expected ${KNIP_VERSION}, found ${baseline.knipVersion}`);
  const actualRatchet = sorted(remaining.filter(f => RATCHET_TYPES.includes(f.type)).map(f => f.key));
  for (const key of actualRatchet.filter(key => !baselineKeys.includes(key))) errors.push(`ratchet addition: ${key}`);
  for (const key of baselineKeys.filter(key => !actualRatchet.includes(key))) errors.push(`stale baseline removal: ${key}; lower baseline deliberately`);
  for (const finding of remaining) {
    const types = finding.lane === 'runtime' ? RUNTIME_BLOCKERS : VERIFICATION_BLOCKERS;
    if (types.includes(finding.type) || finding.type === 'configurationHints') errors.push(`${finding.type === 'configurationHints' ? 'analyzer failure' : 'blocking finding'}: ${finding.key}`);
  }
  const analyzerFailure = errors.some(error => error.includes('zero') || error.includes('expected ') || error.includes('configurationHints') || error.includes('version mismatch'));
  return { errors, findings, remaining, actualRatchet, baselineKeys, exceptionCount: selectedExceptions.length, entries: lanes.reduce((n, lane) => n + (lane.entries ?? 0), 0), processed: lanes.reduce((n, lane) => n + (lane.processed ?? 0), 0), exitCode: analyzerFailure ? 2 : errors.length ? 1 : 0 };
}

export const canShrinkBaseline = (current, next) => next.length < current.length && next.every(key => current.includes(key));

export function writeBaselineAtomically(path, value, { write = writeFileSync } = {}) {
  const temp = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temp, 'wx');
    write(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temp, path);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temp); } catch {}
    throw error;
  }
}

export async function runDeadCodeCheck({ root = process.cwd(), argv = process.argv.slice(2), analyze = analyzeDeadCode, baselineData, exceptionsData, writeBaseline = writeBaselineAtomically } = {}) {
  let parsed;
  try { parsed = parseArguments(argv); } catch (error) { return { exitCode: 2, errors: [error.message] }; }
  const baseline = baselineData ?? readJson(BASELINE_PATH);
  const exceptions = exceptionsData ?? readJson(EXCEPTIONS_PATH);
  let report;
  try { report = await analyze({ root, scope: parsed.scope }); }
  catch (error) { return { exitCode: 2, errors: [`dead-code analyzer rejected: ${error instanceof Error ? error.message : String(error)}`] }; }
  if (report.exitCode === 2) return { ...report, exitCode: 2 };
  const result = evaluateDeadCode({ report, baseline, exceptions, scope: parsed.scope, root });
  if (parsed.updateBaseline && result.exitCode !== 0 && result.errors.every(error => error.startsWith('stale baseline removal:'))) {
    const full = baseline.findings ?? [];
    if (!canShrinkBaseline(full, result.actualRatchet)) return { ...result, lanes: report.lanes, errors: [...result.errors, 'baseline update refused: updates must strictly shrink'], exitCode: 1 };
    const removedBaselineKeys = (baseline.findings ?? []).filter(key => !result.actualRatchet.includes(key));
    writeBaseline(BASELINE_PATH, { version: 1, knipVersion: KNIP_VERSION, findings: result.actualRatchet });
    return {
      ...result,
      errors: [],
      baselineKeys: result.actualRatchet,
      removedBaselineKeys,
      lanes: report.lanes,
      updated: true,
      exitCode: 0,
    };
  }
  return { ...result, lanes: report.lanes };
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  const result = await runDeadCodeCheck();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (result.exitCode === 0) console.log(`[dead-code] clean: ${result.lanes.length} lanes, ${result.entries} entries, ${result.processed} processed, ${result.findings.length} findings, ${result.baselineKeys.length} baseline, ${result.exceptionCount} exceptions`);
  else for (const error of result.errors ?? []) console.error(`[dead-code] ${error}`);
  process.exitCode = result.exitCode;
}
