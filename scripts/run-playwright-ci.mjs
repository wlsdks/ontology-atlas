#!/usr/bin/env node
// Whole files stay together: existing serial suites and file hooks keep their semantics.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inventoryFiles(report) {
  if (report.errors?.length) throw new Error('Playwright discovery reported errors');
  const files = new Map();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      if (!/^[\w-]+\.spec\.ts$/.test(spec.file)) throw new Error(`unsupported spec path: ${spec.file}`);
      files.set(spec.file, (files.get(spec.file) ?? 0) + spec.tests.length);
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  visit(report);
  if (files.size === 0) throw new Error('Playwright discovery collected zero files');
  return [...files].map(([file, tests]) => ({ file, tests }));
}

export function balanceFiles(files, history, total) {
  if (!Number.isInteger(total) || total < 1) throw new Error('invalid shard count');
  if (new Set(files.map((row) => row.file)).size !== files.length) throw new Error('duplicate inventory file');
  const weighted = files.map((row) => {
    const measured = history.files?.[row.file];
    const seconds = measured && measured.seconds > 0
      ? measured.seconds : 5 * row.tests;
    return { ...row, seconds };
  }).sort((a, b) => b.seconds - a.seconds || a.file.localeCompare(b.file, 'en'));
  const shards = Array.from({ length: total }, () => ({ files: [], seconds: 0, tests: 0 }));
  for (const row of weighted) {
    const target = shards.reduce((best, shard) => shard.seconds < best.seconds ? shard : best);
    target.files.push(row.file);
    target.seconds += row.seconds;
    target.tests += row.tests;
  }
  return shards;
}

export function runPlaywrightCi(argv, { spawn = spawnSync, cwd = process.cwd(), env = process.env } = {}) {
  const shard = argv.find((arg) => arg.startsWith('--shard='))?.slice(8) ?? '1/3';
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(shard)) throw new Error('invalid shard');
  const [index, total] = shard.split('/').map(Number);
  if (index > total) throw new Error('shard index exceeds total');
  const project = argv.includes('--project=smoke') ? ['--project=smoke'] : [];
  const excluded = argv.filter((arg) => arg.startsWith('--exclude=')).map((arg) => arg.slice(10));
  if (excluded.some((file) => !['web-surface-smoke.spec.ts', 'contextual-meaning-editor.spec.ts'].includes(file))) {
    throw new Error('only separately protected surface specs may be excluded');
  }
  const discovered = spawn('pnpm', ['exec', 'playwright', 'test', ...project, '--list', '--reporter=json'], {
    cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (discovered.status !== 0) throw new Error(`Playwright discovery failed: ${discovered.stderr ?? ''}`);
  const inventory = inventoryFiles(JSON.parse(discovered.stdout));
  const files = inventory.filter((row) => !excluded.includes(row.file));
  if (files.length === 0) throw new Error('no suite files remain after surface allocation');
  const history = JSON.parse(readFileSync(new URL('./data/playwright-file-durations.json', import.meta.url), 'utf8'));
  const assignment = balanceFiles(files, history, total);
  const selected = assignment[index - 1];
  mkdirSync(resolve(cwd, 'output/playwright'), { recursive: true });
  writeFileSync(resolve(cwd, `output/playwright/assignment-${index}.json`), JSON.stringify({ shard, excluded, assignment }, null, 2));
  console.log(`[playwright-ci] shard ${shard}: ${selected.files.length} files, ${selected.tests} tests, estimated ${selected.seconds.toFixed(1)} test-seconds`);
  if (selected.files.length === 0) {
    console.log('[playwright-ci] no files assigned; every collected file belongs to another shard');
    return 0;
  }
  // File arguments are regexes. Anchor and escape them to avoid substring matches.
  const filters = selected.files.map((file) => `/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const reportFile = resolve(cwd, `output/playwright/results-${index}.json`);
  rmSync(reportFile, { force: true });
  const result = spawn('pnpm', ['exec', 'playwright', 'test', ...project, ...filters, '--reporter=list,json'], {
    cwd, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile }, stdio: 'inherit',
  });
  if (result.status === 0) {
    const actual = inventoryFiles(JSON.parse(readFileSync(reportFile, 'utf8'))).sort((a, b) => a.file.localeCompare(b.file));
    const expected = files.filter((row) => selected.files.includes(row.file)).sort((a, b) => a.file.localeCompare(b.file));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('executed test inventory differs from assigned files');
  }
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runPlaywrightCi(process.argv.slice(2)); }
  catch (error) { console.error(`[playwright-ci] ${error.message}`); process.exitCode = 1; }
}
