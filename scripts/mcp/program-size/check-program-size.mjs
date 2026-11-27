#!/usr/bin/env node
/**
 * The program-size gate for the Rust MCP server. It builds the Bun program with the shipped flags
 * into a scratch folder, measures it beside the Rust release program in the same run, and fails
 * when the Rust program is larger. The goals (20 MiB with grammars, 10 MiB without) are printed,
 * never gated.
 *
 *   (in src-tauri) the release build of the `mcp-server` package comes first
 *   node scripts/mcp/program-size/check-program-size.mjs [--rust=<program>]
 *
 * "Without grammars" is the Rust program's size minus what the tree-sitter grammars' compiled
 * objects add, read with `size` from the archives the build left in `src-tauri/target`; it is
 * reported as not measured where `size` is missing (Windows).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bunCompileArgs, hostTargetTriple } from '../../lib/packaging/mcp-binary.mjs';
import { GOAL_MIB, programSizeVerdict, sumSizeOutput } from './program-size-verdict.mjs';

const root = process.cwd();
const argument = process.argv.slice(2).find((value) => value.startsWith('--rust='));
const extension = process.platform === 'win32' ? '.exe' : '';
const rustProgram = path.resolve(
  root,
  argument?.slice('--rust='.length) ??
    path.join('src-tauri', 'target', 'release', `ontology-atlas-mcp-rust${extension}`),
);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!existsSync(rustProgram)) {
  fail(`${rustProgram} is missing; build the \`mcp-server\` package in release mode first.`);
}
const triple = hostTargetTriple();
if (!triple) fail(`Unsupported host: ${process.platform}/${process.arch}`);

/** What the grammars' compiled C objects add: the archives each `tree-sitter-<language>` build leaves. */
function grammarObjectBytes(buildFolder) {
  if (!existsSync(buildFolder)) return null;
  const archives = [];
  for (const entry of readdirSync(buildFolder)) {
    if (!/^tree-sitter-[a-z-]+-[0-9a-f]{16}$/.test(entry)) continue;
    const out = path.join(buildFolder, entry, 'out');
    if (!existsSync(out)) continue;
    for (const file of readdirSync(out)) {
      if (/^libtree-sitter-[a-z]+\.a$/.test(file)) archives.push(path.join(out, file));
    }
  }
  if (archives.length === 0) return null;
  let total = 0;
  for (const archive of archives) {
    const result = spawnSync('size', [archive], { encoding: 'utf-8' });
    if (result.status !== 0) return null;
    total += sumSizeOutput(result.stdout);
  }
  return total;
}

const scratch = mkdtempSync(path.join(tmpdir(), 'atlas-program-size-'));
try {
  const bunProgram = path.join(scratch, `ontology-atlas-mcp-bun${extension}`);
  const compiled = spawnSync('bun', bunCompileArgs({ triple, outfile: bunProgram }), {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (compiled.status !== 0 || !existsSync(bunProgram)) {
    fail(`bun could not compile the comparison program (exit ${compiled.status}).`);
  }

  const verdict = programSizeVerdict({
    rustBytes: statSync(rustProgram).size,
    bunBytes: statSync(bunProgram).size,
    grammarBytes: grammarObjectBytes(path.join(root, 'src-tauri', 'target', 'release', 'build')),
  });

  const mib = (value) => (value === null ? 'not measured' : `${value.toFixed(1)} MiB`);
  const goal = (met) => (met === null ? '' : met ? ' (goal met)' : ' (goal missed)');
  console.log(`Bun program          ${mib(verdict.bunMib)}`);
  console.log(
    `Rust program         ${mib(verdict.rustMib)}${goal(verdict.withGrammarsGoalMet)}, goal ${GOAL_MIB.withGrammars} MiB`,
  );
  console.log(
    `Rust, no grammars    ${mib(verdict.withoutGrammarsMib)}${goal(verdict.withoutGrammarsGoalMet)}, goal ${GOAL_MIB.withoutGrammars} MiB`,
  );
  if (!verdict.passes) fail('The Rust program is larger than the Bun program built in this run.');
  console.log('✔ the Rust program is not larger than the Bun program');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
