// `--coverage`: replays the corpus on the JavaScript server under V8 block coverage and reports,
// per family, how many of the functions and blocks in the family's own files the corpus runs.
//
// What is counted. A family owns the files `families.json` maps to it. Its denominator is every
// function (and every block V8 reports inside one) defined in those files, test files left out;
// its numerator is what at least one corpus case ran. A function counts as run when V8 gives its
// own range a count above zero; a block counts as run when V8 counts it, or when V8 leaves it out
// because it ran exactly as often as the function around it. The module's top-level function is
// left out: start alone runs it for every file, so it says nothing about a corpus.
//
// The floor (95% of functions, 85% of blocks, `tests/differential/manifest.json`) is reported now;
// `--enforce` turns a miss on a family marked `proven` into exit 1, as does a function left unrun
// without a reason, or an "equal except" list above its ceiling.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HarnessContext, runCaseOnServer } from './case-runner.mjs';
import { checkManifest, loadFamilies, loadManifest } from './manifest.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

function sourceFilesOf(coverageDir, repoRoot) {
  const prefix = pathToFileURL(path.join(repoRoot, 'mcp', 'src')).href;
  const found = [];
  for (const name of readdirSync(coverageDir)) {
    if (!name.endsWith('.json')) continue;
    const report = JSON.parse(readFileSync(path.join(coverageDir, name), 'utf8'));
    for (const script of report.result ?? []) {
      if (!script.url.startsWith(prefix) || /\.test\.mjs$/.test(script.url)) continue;
      found.push(script);
    }
  }
  return found;
}

/** Folds one process's scripts into `table` (file -> function key -> { name, start, end, runs }). */
function accumulate(table, scripts, repoRoot) {
  for (const script of scripts) {
    const file = path.relative(repoRoot, fileURLToPath(script.url));
    const functions = table.get(file) ?? new Map();
    table.set(file, functions);
    for (const fn of script.functions) {
      if (fn.functionName === '' && fn.ranges[0].startOffset === 0) continue;
      const key = `${fn.ranges[0].startOffset}-${fn.ranges[0].endOffset}:${fn.functionName}`;
      const entry = functions.get(key) ?? {
        name: fn.functionName || '(anonymous)',
        start: fn.ranges[0].startOffset,
        end: fn.ranges[0].endOffset,
        runs: [],
      };
      entry.runs.push(fn.ranges);
      functions.set(key, entry);
    }
  }
}

function innermostCount(ranges, start, end) {
  let best = null;
  for (const range of ranges) {
    if (range.startOffset <= start && end <= range.endOffset) {
      if (!best || range.endOffset - range.startOffset <= best.endOffset - best.startOffset) best = range;
    }
  }
  return best ? best.count : 0;
}

/** { functionRun, blocks: Map<'start-end', covered> } for one function over every process that loaded it. */
function evaluate(entry) {
  const functionRun = entry.runs.some((ranges) => ranges[0].count > 0);
  const blocks = new Map();
  for (const ranges of entry.runs) {
    for (const range of ranges) blocks.set(`${range.startOffset}-${range.endOffset}`, false);
  }
  for (const ranges of entry.runs) {
    const ran = ranges[0].count > 0;
    for (const key of blocks.keys()) {
      if (blocks.get(key)) continue;
      const [start, end] = key.split('-').map(Number);
      const listed = ranges.find((range) => range.startOffset === start && range.endOffset === end);
      const count = listed ? listed.count : ran ? innermostCount(ranges, start, end) : 0;
      if (count > 0) blocks.set(key, true);
    }
  }
  return { functionRun, blocks };
}

function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

export function summarise(table, families, repoRoot) {
  const perFamily = new Map();
  const texts = new Map();
  for (const [file, functions] of table) {
    const family = families.files[file];
    if (!family) continue;
    const row = perFamily.get(family) ?? { files: 0, functions: 0, run: 0, blocks: 0, blocksRun: 0, unrun: [] };
    perFamily.set(family, row);
    row.files += 1;
    for (const entry of functions.values()) {
      const { functionRun, blocks } = evaluate(entry);
      row.functions += 1;
      if (functionRun) row.run += 1;
      row.blocks += blocks.size;
      row.blocksRun += [...blocks.values()].filter(Boolean).length;
      if (!functionRun) {
        if (!texts.has(file)) texts.set(file, readFileSync(path.join(repoRoot, file), 'utf8'));
        row.unrun.push({ file, name: entry.name, line: lineOf(texts.get(file), entry.start) });
      }
    }
  }
  return perFamily;
}

async function replay({ repoRoot, workRoot, cases, concurrency }) {
  const context = new HarnessContext({ repoRoot, workRoot });
  const server = resolveServer('node', { repoRoot, workRoot });
  for (const fixture of new Set(cases.map((c) => c.header.vault))) context.template(fixture);
  const tables = { corpus: new Map(), byFamily: new Map() };
  let next = 0;
  const worker = async (index) => {
    const workerDir = path.join(workRoot, `coverage-worker-${index}`);
    mkdirSync(workerDir, { recursive: true });
    for (;;) {
      const at = next;
      next += 1;
      if (at >= cases.length) return;
      const caseDef = cases[at];
      const coverageDir = path.join(workRoot, 'coverage', String(at));
      mkdirSync(coverageDir, { recursive: true });
      await runCaseOnServer({ context, caseDef, server, locale: LOCALES[1], workerDir, coverageDir });
      const scripts = sourceFilesOf(coverageDir, repoRoot);
      accumulate(tables.corpus, scripts, repoRoot);
      const familyTable = tables.byFamily.get(caseDef.family) ?? new Map();
      tables.byFamily.set(caseDef.family, familyTable);
      accumulate(familyTable, scripts, repoRoot);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, index) => worker(index)));
  return tables;
}

export async function runCoverage({ repoRoot, workRoot, cases, values, flags, concurrency }) {
  const manifest = loadManifest(repoRoot);
  const families = loadFamilies(repoRoot);
  const tables = await replay({ repoRoot, workRoot, cases, concurrency });
  const whole = summarise(tables.corpus, families, repoRoot);
  const floors = manifest.floors;
  const pct = (a, b) => (b === 0 ? 100 : (100 * a) / b);

  console.log('\nreach of the whole corpus in each family\'s own files (functions / blocks, floor 95% / 85%)');
  console.log('family         files  functions run        blocks run           unrun');
  const report = {};
  const problems = [];
  for (const family of Object.keys(manifest.families)) {
    const row = whole.get(family) ?? { files: 0, functions: 0, run: 0, blocks: 0, blocksRun: 0, unrun: [] };
    const own = tables.byFamily.get(family) ? summarise(tables.byFamily.get(family), families, repoRoot).get(family) : null;
    const functionsPct = pct(row.run, row.functions);
    const blocksPct = pct(row.blocksRun, row.blocks);
    report[family] = {
      files: row.files,
      functions: row.functions,
      functionsRun: row.run,
      functionsPercent: Number(functionsPct.toFixed(1)),
      blocks: row.blocks,
      blocksRun: row.blocksRun,
      blocksPercent: Number(blocksPct.toFixed(1)),
      unrunFunctions: row.unrun.length,
      ownCorpusFunctionsPercent: own ? Number(pct(own.run, own.functions).toFixed(1)) : null,
      ownCorpusBlocksPercent: own ? Number(pct(own.blocksRun, own.blocks).toFixed(1)) : null,
    };
    console.log(
      `${family.padEnd(14)} ${String(row.files).padStart(5)}  ${`${row.run}/${row.functions} ${functionsPct.toFixed(1)}%`.padEnd(19)}  ${`${row.blocksRun}/${row.blocks} ${blocksPct.toFixed(1)}%`.padEnd(19)}  ${row.unrun.length}`,
    );
    if (manifest.families[family].proven) {
      if (functionsPct < floors.functions * 100) problems.push(`${family}: functions ${functionsPct.toFixed(1)}% is under the ${floors.functions * 100}% floor`);
      if (blocksPct < floors.blocks * 100) problems.push(`${family}: blocks ${blocksPct.toFixed(1)}% is under the ${floors.blocks * 100}% floor`);
    }
    const reasons = new Map((manifest.families[family].unrunFunctions ?? []).map((u) => [`${u.file}:${u.name}:${u.line}`, u.reason]));
    for (const fn of row.unrun) {
      const reason = reasons.get(`${fn.file}:${fn.name}:${fn.line}`);
      if (!reason || reason === 'unreviewed') {
        if (manifest.families[family].proven) problems.push(`${family}: ${fn.file}:${fn.line} ${fn.name} is never run and has no reason`);
      }
    }
  }
  const total = [...whole.values()].reduce((a, r) => ({ f: a.f + r.functions, r: a.r + r.run, b: a.b + r.blocks, br: a.br + r.blocksRun }), { f: 0, r: 0, b: 0, br: 0 });
  console.log(`${'all'.padEnd(14)} ${' '.repeat(5)}  ${`${total.r}/${total.f} ${pct(total.r, total.f).toFixed(1)}%`.padEnd(19)}  ${`${total.br}/${total.b} ${pct(total.br, total.b).toFixed(1)}%`.padEnd(19)}`);

  if (values.report) {
    writeFileSync(values.report, `${JSON.stringify({ floors, families: report }, null, 2)}\n`);
    console.log(`report written to ${values.report}`);
  }
  if (values['unrun-report']) {
    const listing = Object.fromEntries([...whole].map(([family, row]) => [family, row.unrun]));
    writeFileSync(values['unrun-report'], `${JSON.stringify(listing, null, 2)}\n`);
  }
  if (flags.has('write-manifest')) {
    for (const [family, row] of whole) {
      const reasons = new Map((manifest.families[family].unrunFunctions ?? []).map((u) => [`${u.file}:${u.name}:${u.line}`, u.reason]));
      manifest.families[family].unrunFunctions = row.unrun.map((fn) => ({ ...fn, reason: reasons.get(`${fn.file}:${fn.name}:${fn.line}`) ?? 'unreviewed' }));
    }
    writeFileSync(path.join(repoRoot, 'tests', 'differential', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log('manifest.json unrunFunctions refreshed');
  }

  problems.push(...checkManifest(repoRoot, { baseRef: values['base-ref'] }));
  for (const problem of problems) console.error(`coverage: ${problem}`);
  if (flags.has('enforce') && problems.length > 0) return 1;
  if (!flags.has('enforce') && problems.length > 0) console.log(`(${problems.length} problem(s) reported, not enforced without --enforce)`);
  return 0;
}
