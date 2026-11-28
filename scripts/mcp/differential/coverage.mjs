// `--coverage`: replays the corpus on the JavaScript server and reports what it reaches, three ways:
//
//   per family   the share of functions and of blocks, in the files `families.json` maps to the family,
//                that some corpus case ran (floors 95% and 85%, `manifest.json`);
//   per tool     the functions that tool's calls execute (`tool-functions.json`), taken between the
//                request and its response, so a call is credited only with what it ran;
//   unrun        the functions no case ran, each with a reason (`unrun-functions.json`).
//
// Every function of every mapped file counts, including files no case loads: a census process loads
// them all (`census-entry.mjs`), and a file it cannot load counts as one unrun function.
//
// What is counted. A function counts as run when V8 gives its own range a count above zero in some
// interval; a block counts as run when V8 counts it, or when V8 leaves it out because it ran exactly
// as often as the function around it. The module's top-level function is left out: start alone runs
// it for every file, so it says nothing about a corpus.
//
// `--enforce` turns the problems into exit 1: a family marked proven under its floor or with an unrun
// function lacking a reason, a function a tool used to execute that no case runs now, an "equal
// except" list above its ceiling.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HarnessContext, runCaseOnServer } from './case-runner.mjs';
import {
  DIFFERENTIAL_DIRECTORY,
  checkManifest,
  formatToolFunctions,
  formatUnrunFunctions,
  loadFamilies,
  loadManifest,
  loadToolFunctions,
  loadUnrunFunctions,
} from './manifest.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

const PROTOCOL = '(protocol)';

/** Folds one interval's ranges for one function into its running state. */
function fold(entry, ranges) {
  for (const range of ranges) {
    const key = `${range.startOffset}-${range.endOffset}`;
    if (!entry.blocks.has(key)) entry.blocks.set(key, false);
  }
  const ran = ranges[0].count > 0;
  if (ran) entry.functionRun = true;
  for (const [key, covered] of entry.blocks) {
    if (covered) continue;
    const [start, end] = key.split('-').map(Number);
    const listed = ranges.find((range) => range.startOffset === start && range.endOffset === end);
    let count = 0;
    if (listed) count = listed.count;
    else if (ran) {
      let best = null;
      for (const range of ranges) {
        if (range.startOffset <= start && end <= range.endOffset && (!best || range.endOffset - range.startOffset <= best.endOffset - best.startOffset)) best = range;
      }
      count = best ? best.count : 0;
    }
    if (count > 0) entry.blocks.set(key, true);
  }
}

class Table {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    /** @type {Map<string, Map<string, { name: string, start: number, end: number, functionRun: boolean, blocks: Map<string, boolean> }>>} */
    this.files = new Map();
  }

  add(scripts) {
    for (const script of scripts) {
      const file = path.relative(this.repoRoot, fileURLToPath(script.url));
      const functions = this.files.get(file) ?? new Map();
      this.files.set(file, functions);
      for (const fn of script.functions) {
        if (fn.functionName === '' && fn.ranges[0].startOffset === 0) continue;
        const key = `${fn.ranges[0].startOffset}-${fn.ranges[0].endOffset}:${fn.functionName}`;
        const entry = functions.get(key) ?? {
          name: fn.functionName || '(anonymous)',
          start: fn.ranges[0].startOffset,
          end: fn.ranges[0].endOffset,
          functionRun: false,
          blocks: new Map(),
        };
        functions.set(key, entry);
        fold(entry, fn.ranges);
      }
    }
  }
}

/** `file#name#k`: the k-th function of that name in the file by position, stable when lines move. */
function functionKeys(table) {
  const keys = new Map();
  for (const [file, functions] of table.files) {
    const seen = new Map();
    for (const entry of [...functions.values()].sort((a, b) => a.start - b.start)) {
      const count = seen.get(entry.name) ?? 0;
      seen.set(entry.name, count + 1);
      keys.set(entry, `${file}#${entry.name}#${count}`);
    }
  }
  return keys;
}

function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function readIntervals(directory) {
  const records = [];
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.json'))) {
    records.push({ name, ...JSON.parse(readFileSync(path.join(directory, name), 'utf8')) });
  }
  return records;
}

/** Loads every mapped file in one process; returns the scripts it saw and the files it could not load. */
function runCensus({ repoRoot, workRoot }) {
  const directory = path.join(workRoot, 'coverage', 'census');
  mkdirSync(directory, { recursive: true });
  const support = path.join(repoRoot, 'tests', 'differential', 'support');
  const result = spawnSync(
    process.execPath,
    ['--import', path.join(support, 'coverage-preload.mjs'), path.join(support, 'census-entry.mjs')],
    { env: { PATH: process.env.PATH, ATLAS_DIFF_COVERAGE_DIR: directory, OATLAS_VAULT: path.join(repoRoot, 'samples', 'storefront') }, encoding: 'utf8' },
  );
  const last = result.stderr.trim().split('\n').at(-1);
  let unloadable = [];
  try {
    unloadable = JSON.parse(last).unloadable;
  } catch {
    unloadable = [{ file: '(census)', error: `did not finish: ${result.stderr.slice(0, 300)}` }];
  }
  const finals = readIntervals(directory).filter((record) => record.name === 'final.json');
  return { scripts: finals.flatMap((record) => record.scripts), unloadable };
}

async function replay({ repoRoot, workRoot, cases, concurrency, knownTools }) {
  const context = new HarnessContext({ repoRoot, workRoot });
  const server = resolveServer('node', { repoRoot, workRoot, coverage: true });
  for (const fixture of new Set(cases.map((c) => c.header.vault))) context.template(fixture);
  const whole = new Table(repoRoot);
  const byFamily = new Map();
  /** @type {Map<string, Set<string>>} tool -> `file#name#k` keys, filled after ordinals are known */
  const toolRuns = new Map();
  const pendingTool = new Set();
  let next = 0;
  const worker = async (index) => {
    const workerDir = path.join(workRoot, `coverage-worker-${index}`);
    for (;;) {
      const at = next;
      next += 1;
      if (at >= cases.length) return;
      const caseDef = cases[at];
      const coverageDir = path.join(workRoot, 'coverage', String(at));
      mkdirSync(coverageDir, { recursive: true });
      const run = await runCaseOnServer({ context, caseDef, server, locale: LOCALES[1], workerDir, coverageDir });
      const toolOf = new Map(run.answers.filter((a) => a.request).map((a) => [JSON.stringify(a.id), a.request.method === 'tools/call' && knownTools.has(a.request.params?.name) ? a.request.params.name : PROTOCOL]));
      const familyTable = byFamily.get(caseDef.family) ?? new Table(repoRoot);
      byFamily.set(caseDef.family, familyTable);
      for (const record of readIntervals(coverageDir)) {
        whole.add(record.scripts);
        familyTable.add(record.scripts);
        if (record.name.startsWith('delta-')) {
          const tool = record.id === null ? PROTOCOL : toolOf.get(JSON.stringify(record.id)) ?? PROTOCOL;
          for (const script of record.scripts) {
            const file = path.relative(repoRoot, fileURLToPath(script.url));
            for (const fn of script.functions) {
              pendingTool.add([tool, file, fn.functionName || '(anonymous)', fn.ranges[0].startOffset, fn.ranges[0].endOffset].join('\0'));
            }
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, index) => worker(index)));
  return { whole, byFamily, pendingTool, toolRuns };
}

function percent(a, b) {
  return b === 0 ? 100 : (100 * a) / b;
}

export async function runCoverage({ repoRoot, workRoot, cases, values, flags, concurrency, baseRef }) {
  const manifest = loadManifest(repoRoot);
  const families = loadFamilies(repoRoot);
  const { whole, byFamily, pendingTool, toolRuns } = await replay({
    repoRoot,
    workRoot,
    cases,
    concurrency,
    knownTools: new Set(Object.values(manifest.families).flatMap((family) => family.tools)),
  });
  const census = runCensus({ repoRoot, workRoot });
  whole.add(census.scripts);
  const keys = functionKeys(whole);
  const keyByPosition = new Map();
  for (const [entry, key] of keys) {
    const file = key.slice(0, key.indexOf('#'));
    keyByPosition.set(`${file}:${entry.start}-${entry.end}:${entry.name}`, key);
  }
  for (const use of pendingTool) {
    const [tool, file, name, start, end] = use.split('\0');
    const key = keyByPosition.get(`${file}:${start}-${end}:${name}`);
    if (!key) continue;
    const set = toolRuns.get(tool) ?? new Set();
    toolRuns.set(tool, set);
    set.add(key);
  }

  const floors = manifest.floors;
  const rows = new Map();
  const texts = new Map();
  const textOf = (file) => {
    if (!texts.has(file)) texts.set(file, readFileSync(path.join(repoRoot, file), 'utf8'));
    return texts.get(file);
  };
  const row = (family) => {
    if (!rows.has(family)) rows.set(family, { files: 0, functions: 0, run: 0, blocks: 0, blocksRun: 0, unrun: [] });
    return rows.get(family);
  };
  for (const [file, functions] of whole.files) {
    const family = families.files[file];
    if (!family) continue;
    const r = row(family);
    r.files += 1;
    for (const entry of functions.values()) {
      r.functions += 1;
      r.blocks += entry.blocks.size;
      if (entry.functionRun) r.run += 1;
      r.blocksRun += [...entry.blocks.values()].filter(Boolean).length;
      if (!entry.functionRun) r.unrun.push({ key: keys.get(entry), line: lineOf(textOf(file), entry.start) });
    }
  }
  const problems = [];
  const loaded = new Set(whole.files.keys());
  for (const [file, family] of Object.entries(families.files)) {
    if (loaded.has(file) || /\.test\.mjs$/.test(file) || file === 'mcp/src/index.js' || file === 'mcp/src/javascript-server.mjs') continue;
    const r = row(family);
    r.files += 1;
    r.functions += 1;
    r.blocks += 1;
    r.unrun.push({ key: `${file}#(whole file, never loaded)#0`, line: 1 });
  }
  for (const failure of census.unloadable) problems.push(`census could not load ${failure.file}: ${failure.error}`);

  console.log("\nreach of the whole corpus in each family's own files (functions / blocks, floor 95% / 85%)");
  console.log('family         files  functions run        blocks run           unrun');
  const report = {};
  const unrunByFamily = loadUnrunFunctions(repoRoot).families;
  for (const family of Object.keys(manifest.families)) {
    const r = row(family);
    const own = byFamily.get(family);
    const ownRow = { functions: 0, run: 0, blocks: 0, blocksRun: 0 };
    if (own) {
      for (const [file, functions] of own.files) {
        if (families.files[file] !== family) continue;
        for (const entry of functions.values()) {
          ownRow.functions += 1;
          ownRow.blocks += entry.blocks.size;
          if (entry.functionRun) ownRow.run += 1;
          ownRow.blocksRun += [...entry.blocks.values()].filter(Boolean).length;
        }
      }
    }
    const functionsPct = percent(r.run, r.functions);
    const blocksPct = percent(r.blocksRun, r.blocks);
    report[family] = {
      files: r.files,
      functions: r.functions,
      functionsRun: r.run,
      functionsPercent: Number(functionsPct.toFixed(1)),
      blocks: r.blocks,
      blocksRun: r.blocksRun,
      blocksPercent: Number(blocksPct.toFixed(1)),
      unrunFunctions: r.unrun.length,
      ownCorpusFunctionsPercent: Number(percent(ownRow.run, ownRow.functions).toFixed(1)),
      ownCorpusBlocksPercent: Number(percent(ownRow.blocksRun, ownRow.blocks).toFixed(1)),
    };
    console.log(
      `${family.padEnd(14)} ${String(r.files).padStart(5)}  ${`${r.run}/${r.functions} ${functionsPct.toFixed(1)}%`.padEnd(19)}  ${`${r.blocksRun}/${r.blocks} ${blocksPct.toFixed(1)}%`.padEnd(19)}  ${r.unrun.length}`,
    );
    if (manifest.families[family].proven) {
      if (functionsPct < floors.functions * 100) problems.push(`${family}: functions ${functionsPct.toFixed(1)}% is under the ${floors.functions * 100}% floor`);
      if (blocksPct < floors.blocks * 100) problems.push(`${family}: blocks ${blocksPct.toFixed(1)}% is under the ${floors.blocks * 100}% floor`);
      const reasons = new Map((unrunByFamily[family] ?? []).map((entry) => [entry.key, entry.reason]));
      for (const fn of r.unrun) {
        const reason = reasons.get(fn.key);
        if (!reason || reason === 'unreviewed') problems.push(`${family}: ${fn.key} (line ${fn.line}) is never run and has no reason`);
      }
    }
  }
  const total = [...rows.values()].reduce((a, r) => ({ f: a.f + r.functions, r: a.r + r.run, b: a.b + r.blocks, br: a.br + r.blocksRun }), { f: 0, r: 0, b: 0, br: 0 });
  console.log(`${'all'.padEnd(14)} ${' '.repeat(5)}  ${`${total.r}/${total.f} ${percent(total.r, total.f).toFixed(1)}%`.padEnd(19)}  ${`${total.br}/${total.b} ${percent(total.br, total.b).toFixed(1)}%`.padEnd(19)}`);

  const committedTools = loadToolFunctions(repoRoot).tools;
  console.log('\nfunctions each tool\'s calls execute');
  const toolReport = {};
  for (const tool of [...toolRuns.keys()].sort()) {
    const now = toolRuns.get(tool);
    toolReport[tool] = now.size;
    const before = new Set(Object.hasOwn(committedTools, tool) ? committedTools[tool] : []);
    const lost = [...before].filter((key) => !now.has(key));
    console.log(`  ${tool.padEnd(28)} ${String(now.size).padStart(5)}${before.size > 0 ? `  (committed ${before.size}, no longer run ${lost.length})` : ''}`);
    for (const key of lost) problems.push(`${tool}: ${key} was executed by this tool's calls and no case runs it now`);
  }
  for (const tool of Object.keys(committedTools)) {
    if (!toolRuns.has(tool)) problems.push(`${tool}: committed with ${committedTools[tool].length} functions and no case calls it now`);
  }

  if (values.report) {
    writeFileSync(values.report, `${JSON.stringify({ floors, families: report, tools: toolReport }, null, 2)}\n`);
    console.log(`report written to ${values.report}`);
  }
  if (flags.has('write-manifest')) {
    const directory = path.join(repoRoot, ...DIFFERENTIAL_DIRECTORY);
    const tools = Object.fromEntries([...toolRuns].filter(([tool]) => tool !== PROTOCOL).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([tool, set]) => [tool, [...set].sort()]));
    writeFileSync(
      path.join(directory, 'tool-functions.json'),
      formatToolFunctions(tools, 'Per tool, the functions in mcp/src that its calls execute between the request and its response. `functions` lists each as `file#name#k` (k counts same-named functions in the file by position); `tools` gives, per tool, the positions in that list. `node scripts/mcp/differential/differential.mjs --coverage --write-manifest` rewrites it; `--coverage --enforce` fails when a function a tool ran is no longer run.'),
    );
    const unrun = {};
    for (const family of Object.keys(manifest.families)) {
      const reasons = new Map((unrunByFamily[family] ?? []).map((entry) => [entry.key, entry.reason]));
      unrun[family] = row(family).unrun
        .map((fn) => ({ key: fn.key, reason: reasons.get(fn.key) ?? 'unreviewed' }))
        .sort((a, b) => a.key.localeCompare(b.key, 'en'));
    }
    writeFileSync(
      path.join(directory, 'unrun-functions.json'),
      formatUnrunFunctions(unrun, 'Per family, the functions its corpus never runs, each with a reason. "unreviewed" is the placeholder `--coverage --write-manifest` writes; a family cannot be marked proven while one of its entries still says so. Existing reasons are kept when the file is rewritten. A file no test loaded at all appears as one entry named "(whole file, never loaded)".'),
    );
    console.log('tool-functions.json and unrun-functions.json rewritten');
  }

  problems.push(...checkManifest(repoRoot, { baseRef }));
  for (const problem of problems) console.error(`coverage: ${problem}`);
  if (flags.has('enforce') && problems.length > 0) return 1;
  if (problems.length > 0) console.log(`(${problems.length} problem(s) reported, not enforced without --enforce)`);
  return 0;
}
