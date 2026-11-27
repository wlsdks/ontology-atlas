#!/usr/bin/env node
/**
 * The differential harness: starts two MCP servers, sends both the same corpus of requests and
 * compares every answer line, the written folders, the server's own messages, stderr and exit.
 *
 *   node scripts/mcp/differential/differential.mjs [--a=node] [--b=<server>] [--family=<name>]
 *   ... --case=<name>               one case
 *   ... --corpus-dir=<folder>       replay another corpus than tests/differential/corpus
 *   ... --ko-vs-en                  one server under ko_KR against itself under en_US
 *   ... --coverage                  run A under V8 coverage and report reach per family and tool
 *   ... --drift --days=14           replay against the JavaScript tree as it was 14 days ago
 *   ... --goldens[=write|compare]   freeze or check the answers
 *   ... --stats                     corpus size per family
 *   ... --record-expected=<file>    write every difference found as known-difference entries
 *   ... --base-ref=<ref>            the branch the lists may only shrink against (default origin/main)
 *
 * Servers: node, node:<checkout>, bun (the twin), bun-shipped, rust, cmd:<command line>.
 * Exit 1 on any difference outside a family's "equal except" list (`tests/differential/manifest.json`)
 * and outside the known-difference list of the mode (`--ko-vs-en`, `--a=node --b=bun`).
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
import {
  DEFAULT_BASE_REF,
  checkManifest,
  differenceKey,
  exceptRulesByFamily,
  loadExpectedDifferences,
} from './manifest.mjs';
import { runPairs } from './run-pairs.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function parseArguments(argv) {
  const options = { flags: new Set(), values: {} };
  for (const argument of argv) {
    // `pnpm mcp:differential -- --family=x` hands the script the `--` as well.
    if (argument === '--') continue;
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
    const row = byFamily.get(result.family) ?? { cases: 0, requests: 0, different: 0, skipped: 0 };
    row.cases += 1;
    row.requests += result.requests;
    if (result.differences.length > 0) row.different += 1;
    if (result.skipped) row.skipped += 1;
    byFamily.set(result.family, row);
  }
  return byFamily;
}

function printSummary(byFamily) {
  console.log('\nfamily                 cases  requests  differing cases  skipped');
  for (const [family, row] of [...byFamily].sort()) {
    console.log(`${family.padEnd(22)} ${String(row.cases).padStart(5)} ${String(row.requests).padStart(9)} ${String(row.different).padStart(16)} ${String(row.skipped).padStart(8)}`);
  }
}

/** Whether a known-difference entry names this difference of this case. */
function entryMatches(entry, caseName, difference) {
  return entry.case === caseName
    && entry.where === difference.where
    && JSON.stringify(entry.id ?? null) === JSON.stringify(difference.where === 'answer' ? difference.id ?? null : null)
    && entry.path === (difference.path ?? '');
}

function entryOf(caseName, difference) {
  return {
    case: caseName,
    where: difference.where,
    ...(difference.where === 'answer' ? { id: difference.id } : {}),
    path: difference.path ?? '',
  };
}

async function main() {
  const { flags, values } = parseArguments(process.argv.slice(2));
  const workRoot = values['work-dir'] ?? mkdtempSync(path.join(os.tmpdir(), 'oatlas-differential-'));
  const cases = loadCorpus(repoRoot, { family: values.family, caseName: values.case, directory: values['corpus-dir'] });
  if (cases.length === 0) {
    console.error('no corpus cases selected');
    process.exit(2);
  }

  const baseRef = 'base-ref' in values ? values['base-ref'] : DEFAULT_BASE_REF;
  const manifestProblems = checkManifest(repoRoot, { baseRef: baseRef || undefined });
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
  const common = { repoRoot, workRoot, cases, values, flags, concurrency, baseRef: baseRef || undefined };
  if (flags.has('coverage')) process.exit(await runCoverage(common));
  if (flags.has('drift')) process.exit(await runDrift(common));
  if (flags.has('goldens') || values.goldens !== undefined) process.exit(await runGoldens(common));

  const koVsEn = flags.has('ko-vs-en');
  const serverA = resolveServer(values.a ?? 'node', { repoRoot, workRoot });
  const serverB = resolveServer(values.b ?? values.a ?? 'node', { repoRoot, workRoot });
  const localeA = koVsEn ? LOCALES[0] : (values['locale-a'] ?? LOCALES[1]);
  const localeB = values['locale-b'] ?? LOCALES[1];
  const nodeVsBun = serverA.label.startsWith('node') && serverB.label === 'bun';
  const listName = koVsEn ? 'locale' : nodeVsBun ? 'node-vs-bun' : null;
  const known = listName ? loadExpectedDifferences(repoRoot, listName) : [];
  const knownReason = koVsEn ? 'differs by locale until the sort order is pinned' : 'differs between Node and Bun (the Bun binary is the reference)';

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
      if (result.skipped) console.log(`  skipped   ${name}: ${result.skipped}`);
      else if (result.differences.length === 0) console.log(`  same      ${name} (${result.requests} requests, ${result.ms} ms)`);
      else if (result.differences.every((d) => known.some((entry) => entryMatches(entry, name, d)))) console.log(`  expected  ${name} ${knownReason}`);
      else console.log(`  DIFFERENT ${name}`);
    },
  });

  let failures = 0;
  let expectedCount = 0;
  const used = new Set();
  const recorded = [];
  for (const result of results) {
    const name = `${result.family}/${result.name}`;
    const unexpected = [];
    for (const difference of result.differences) {
      recorded.push(entryOf(name, difference));
      const index = known.findIndex((entry) => entryMatches(entry, name, difference));
      if (index >= 0) {
        used.add(index);
        expectedCount += 1;
      } else unexpected.push(difference);
    }
    if (unexpected.length === 0) continue;
    failures += 1;
    console.log(`\n${formatDifference(unexpected[0], { family: result.family, caseName: result.name, labelA: result.labelA, labelB: result.labelB })}`);
    if (unexpected.length > 1) console.log(`  (${unexpected.length - 1} more difference(s) in this case)`);
  }
  const stale = known.filter((_, index) => !used.has(index) && cases.some((c) => `${c.family}/${c.name}` === known[index].case));
  for (const entry of stale) {
    console.error(`known-difference list: ${differenceKey(entry)} no longer differs; remove it (the list may only shrink)`);
  }
  printSummary(summarise(results));
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\n${results.length} cases, ${failures} differing, ${expectedCount} known differences, ${skipped} skipped, A=${serverA.label} B=${serverB.label}`);
  if (values['record-expected']) {
    const sorted = recorded.sort((x, y) => differenceKey(x).localeCompare(differenceKey(y), 'en'));
    writeFileSync(values['record-expected'], `${JSON.stringify({ differences: sorted }, null, 2)}\n`);
  }
  if (values['summary-json']) {
    writeFileSync(values['summary-json'], JSON.stringify(results.map((r) => ({ family: r.family, name: r.name, requests: r.requests, differences: r.differences.length })), null, 2));
  }
  process.exit(failures > 0 || manifestProblems.length > 0 || stale.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
