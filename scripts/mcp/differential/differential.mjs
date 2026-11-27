#!/usr/bin/env node
/**
 * The differential harness: starts two MCP servers, sends both the same corpus of requests and
 * compares every answer, the written folder, the server's own messages, stderr and exit.
 *
 *   node scripts/mcp/differential/differential.mjs [--a=node] [--b=<server>] [--family=<name>]
 *   ... --ko-vs-en                  one server under ko_KR against itself under en_US
 *   ... --coverage                  run A under V8 coverage and report reach per family
 *   ... --drift --days=14           replay against the JavaScript tree as it was 14 days ago
 *   ... --goldens[=write|compare]   freeze or check the answers
 *   ... --stats                     corpus size per family
 *
 * Servers: node, node:<checkout>, bun (the twin), bun-shipped, rust, cmd:<command line>.
 * Exit 1 on any difference outside a family's "equal except" list (`tests/differential/manifest.json`).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatDifference } from './compare-runs.mjs';
import { loadCorpus, requestCount } from './corpus.mjs';
import { runCoverage } from './coverage.mjs';
import { runDrift } from './drift.mjs';
import { runGoldens } from './goldens.mjs';
import { checkManifest, exceptRulesByFamily, loadExpectedLocaleDiffs, loadKnownNodeBunDifferences } from './manifest.mjs';
import { runPairs } from './run-pairs.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function parseArguments(argv) {
  const options = { flags: new Set(), values: {} };
  for (const argument of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
    if (!match) throw new Error(`unexpected argument "${argument}"`);
    if (match[2] === undefined) options.flags.add(match[1]);
    else options.values[match[1]] = match[2];
  }
  return options;
}

function summarise(results) {
  const byFamily = new Map();
  for (const result of results) {
    const row = byFamily.get(result.family) ?? { cases: 0, requests: 0, different: 0 };
    row.cases += 1;
    row.requests += result.requests;
    if (result.differences.length > 0) row.different += 1;
    byFamily.set(result.family, row);
  }
  return byFamily;
}

function printSummary(byFamily) {
  console.log('\nfamily                 cases  requests  differing cases');
  for (const [family, row] of [...byFamily].sort()) {
    console.log(`${family.padEnd(22)} ${String(row.cases).padStart(5)} ${String(row.requests).padStart(9)} ${String(row.different).padStart(16)}`);
  }
}

async function main() {
  const { flags, values } = parseArguments(process.argv.slice(2));
  const workRoot = values['work-dir'] ?? mkdtempSync(path.join(os.tmpdir(), 'oatlas-differential-'));
  const cases = loadCorpus(repoRoot, { family: values.family, caseName: values.case });
  if (cases.length === 0) {
    console.error('no corpus cases selected');
    process.exit(2);
  }

  const manifestProblems = checkManifest(repoRoot);
  for (const problem of manifestProblems) console.error(`manifest: ${problem}`);

  if (flags.has('stats')) {
    const stats = new Map();
    for (const c of cases) {
      const row = stats.get(c.family) ?? { cases: 0, requests: 0 };
      row.cases += 1;
      row.requests += requestCount(c);
      stats.set(c.family, row);
    }
    for (const [family, row] of [...stats].sort()) console.log(`${family.padEnd(22)} ${row.cases} cases, ${row.requests} requests`);
    process.exit(manifestProblems.length > 0 ? 1 : 0);
  }

  const concurrency = Number(values.concurrency ?? 4);
  if (flags.has('coverage')) process.exit(await runCoverage({ repoRoot, workRoot, cases, values, flags, concurrency }));
  if (flags.has('drift')) process.exit(await runDrift({ repoRoot, workRoot, cases, values, concurrency }));
  if (flags.has('goldens') || values.goldens !== undefined) {
    process.exit(await runGoldens({ repoRoot, workRoot, cases, values, flags, concurrency }));
  }

  const koVsEn = flags.has('ko-vs-en');
  const serverA = resolveServer(values.a ?? 'node', { repoRoot, workRoot });
  const serverB = resolveServer(values.b ?? values.a ?? 'node', { repoRoot, workRoot });
  const localeA = koVsEn ? LOCALES[0] : (values['locale-a'] ?? LOCALES[1]);
  const localeB = values['locale-b'] ?? LOCALES[1];
  const nodeVsBun = serverA.label.startsWith('node') && serverB.label === 'bun';
  const expectedLocale = koVsEn ? loadExpectedLocaleDiffs(repoRoot) : nodeVsBun ? loadKnownNodeBunDifferences(repoRoot) : new Set();
  const expectedReason = koVsEn ? 'differs by locale until the sort order is pinned' : 'differs between Node and Bun (the Bun binary is the reference)';

  const results = await runPairs({
    repoRoot,
    workRoot,
    cases,
    serverA,
    serverB,
    localeA,
    localeB,
    except: exceptRulesByFamily(repoRoot),
    concurrency,
    onResult: (result) => {
      const name = `${result.family}/${result.name}`;
      if (result.differences.length === 0) console.log(`  same      ${name} (${result.requests} requests, ${result.ms} ms)`);
      else if (expectedLocale.has(name)) console.log(`  expected  ${name} ${expectedReason}`);
      else console.log(`  DIFFERENT ${name}`);
    },
  });

  let failures = 0;
  const staleExpectations = [];
  for (const result of results) {
    const name = `${result.family}/${result.name}`;
    if (result.differences.length === 0) {
      if (expectedLocale.has(name)) staleExpectations.push(name);
      continue;
    }
    if (expectedLocale.has(name)) continue;
    failures += 1;
    console.log(`\n${formatDifference(result.differences[0], { family: result.family, caseName: result.name, labelA: result.labelA, labelB: result.labelB })}`);
    if (result.differences.length > 1) console.log(`  (${result.differences.length - 1} more difference(s) in this case)`);
  }
  for (const name of staleExpectations) {
    console.error(`expected-difference list: "${name}" no longer differs; remove it from the list (the list may only shrink)`);
  }
  printSummary(summarise(results));
  const expectedCount = results.filter((r) => r.differences.length > 0 && expectedLocale.has(`${r.family}/${r.name}`)).length;
  console.log(`\n${results.length} cases, ${failures} differing, ${expectedCount} expected known differences, A=${serverA.label} B=${serverB.label}`);
  if (values['summary-json']) {
    writeFileSync(values['summary-json'], JSON.stringify(results.map((r) => ({ family: r.family, name: r.name, requests: r.requests, differences: r.differences.length })), null, 2));
  }
  process.exit(failures > 0 || manifestProblems.length > 0 || staleExpectations.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}

