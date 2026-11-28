#!/usr/bin/env node
// Criterion 1 of docs/specs/2026-11-27-ui-on-vite.md for one build tool: N cold and N warm builds
// (type check skipped, peak memory over the whole process tree), then N cold and N warm dev
// starts timed to a settled map on /en/topology/ under the faked app runtime.
// Usage: pnpm perf:ui-move -- --out=<result.json> [--label=vite] [--runs=3]
//          [--build-command="pnpm build"] [--dev-command="pnpm dev --port {port}"] [--port=3261]
//          [--cache-dir=node_modules/.vite ...] [--only=builds|dev-starts] [--work-dir=<folder>]
// `{port}` in the dev command is replaced by the port; the port otherwise comes from
// PLAYWRIGHT_BASE_URL. `--cache-dir` (repeatable) names what a cold run deletes; it defaults to
// Vite's. Run alone: another build or a busy machine shows in the load average of each sample.
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { measureBuild } from './measure-build.mjs';
import { measureDevStart } from './measure-dev-start.mjs';
import { summarizeSamples } from './summarize-samples.mjs';

// pnpm hands a literal `--` on to the script (`pnpm perf:ui-move -- --out=…`).
const args = process.argv.slice(2).filter((argument, index) => !(index === 0 && argument === '--'));
const { values: options } = parseArgs({
  args,
  options: {
    out: { type: 'string' },
    label: { type: 'string', default: 'vite' },
    runs: { type: 'string', default: '3' },
    'build-command': { type: 'string', default: 'pnpm build' },
    'dev-command': { type: 'string', default: 'pnpm dev --port {port}' },
    port: { type: 'string' },
    'cache-dir': { type: 'string', multiple: true, default: ['node_modules/.vite'] },
    only: { type: 'string' },
    'work-dir': { type: 'string', default: tmpdir() },
  },
});

function fail(message) {
  console.error(`perf:ui-move: ${message}`);
  process.exit(2);
}

const runs = Number(options.runs);
if (!Number.isInteger(runs) || runs < 1) fail('--runs must be a positive whole number');
if (!options.out) fail('--out=<result.json> is required');
if (options.only && !['builds', 'dev-starts'].includes(options.only)) fail('--only is builds or dev-starts');
const port = Number(options.port ?? new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost').port);
const measuresDevStarts = options.only !== 'builds';
if (measuresDevStarts && !Number.isInteger(port)) fail('give --port or set PLAYWRIGHT_BASE_URL=http://localhost:<port>');

const cwd = process.cwd();
const outFile = resolve(options.out);
mkdirSync(dirname(outFile), { recursive: true });

const report = {
  label: options.label,
  startedAt: new Date().toISOString(),
  platform: process.platform,
  cpuCount: cpus().length,
  nodeVersion: process.version,
  runs,
  buildCommand: options['build-command'],
  devCommand: options['dev-command'],
  cacheDirs: options['cache-dir'],
  loadAverageAtStart: loadavg(),
};

const save = () => writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
const describe = (sample) =>
  [
    sample.cold ? 'cold' : 'warm',
    sample.kind,
    sample.ok ? (sample.kind === 'build' ? `${sample.wallMs} ms, peak ${(sample.peakResidentKb / 1024).toFixed(0)} MiB` : `${sample.mapSettledMs} ms to the map, ${sample.consoleErrorCount} console errors`) : `FAILED ${sample.failure}`,
    `load ${sample.loadAverageStart.map((n) => n.toFixed(1)).join(' ')} -> ${sample.loadAverageEnd.map((n) => n.toFixed(1)).join(' ')}`,
  ].join(' · ');

// The report is saved after every sample, so a crash in a later one loses nothing.
async function measureGroup(name, measure, measures) {
  report[name] = {};
  for (const [temperature, cold] of [['cold', true], ['warm', false]]) {
    const samples = [];
    for (let run = 0; run < runs; run += 1) {
      const sample = await measure(cold);
      samples.push(sample);
      report[name][temperature] = summarizeSamples(samples, measures);
      save();
      console.log(describe(sample));
      if (!sample.ok) console.log(sample.outputTail ?? '');
    }
  }
}

if (options.only !== 'dev-starts') {
  await measureGroup(
    'builds',
    (cold) => measureBuild({ command: options['build-command'], cwd, cacheDirs: options['cache-dir'], cold }),
    ['wallMs', 'peakResidentKb'],
  );
}
if (measuresDevStarts) {
  await measureGroup(
    'devStarts',
    (cold) => measureDevStart({ command: options['dev-command'], port, cwd, cacheDirs: options['cache-dir'], cold, workDir: options['work-dir'] }),
    ['mapSettledMs', 'listeningMs', 'consoleErrorCount'],
  );
}

report.finishedAt = new Date().toISOString();
save();
const groups = ['builds', 'devStarts'].flatMap((name) => (report[name] ? Object.values(report[name]) : []));
const failed = groups.reduce((sum, group) => sum + group.failedCount, 0);
console.log(`\nmedians (${options.label}, ${runs} runs each) written to ${outFile}`);
for (const name of ['builds', 'devStarts']) {
  for (const [temperature, group] of Object.entries(report[name] ?? {})) console.log(`${name} ${temperature}: ${JSON.stringify(group.median)}`);
}
if (failed > 0) {
  console.error(`${failed} sample(s) failed`);
  process.exitCode = 1;
}
