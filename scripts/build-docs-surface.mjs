#!/usr/bin/env node
// Docs surface generator — `docs/.generated/mcp-surface.json`.
//
// For a long time this repository's doc checks were prose pins counting whether a
// sentence appeared in a README. Such pins **failed to catch the accident where a
// tool's behaviour changed and the docs did not** (the sentence was unchanged) and
// went red when a document was rewritten in better words. So the criterion became one
// line:
//
//   Check only what a machine can generate. Never check a sentence a human wrote.
//
// This script writes the public surface by **asking the real MCP server for
// `tools/list`**, and `--check` regenerates and diffs it (the same shape as
// Kubernetes' `verify-generated-docs.sh` and GitLab's `graphql-verify`). It also
// checks that the registered names actually appear in the docs — registering a new
// tool without documenting it is caught here.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CLI_COMMANDS } from '../cli/src/lib/cli-commands.mjs';
import {
  buildSurface,
  cliCommandsMissingFromDoc,
  diffSurface,
  namesMissingFromDoc,
  serializeSurface,
} from './lib/docs-surface.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', '.generated', 'mcp-surface.json');
const MCP_ENTRY = path.join(ROOT, 'mcp', 'src', 'index.js');
const MCP_README = path.join(ROOT, 'mcp', 'README.md');
const CLI_README = path.join(ROOT, 'cli', 'README.md');
const DEFAULT_TIMEOUT_MS = 20_000;

export function usage() {
  return [
    'Usage: node scripts/build-docs-surface.mjs [--check] [--timeout-ms N]',
    '',
    '  (default)        Regenerate docs/.generated/mcp-surface.json from the live registries.',
    '  --check          Regenerate in memory and fail on drift; also verify mcp/README.md and',
    '                   cli/README.md name every registered tool / command.',
    '  --timeout-ms N   MCP server tools/list timeout (default 20000).',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = { check: false, help: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--timeout-ms') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) return { ...args, error: `invalid --timeout-ms: ${argv[i]}` };
      args.timeoutMs = value;
    } else if (arg.startsWith('--timeout-ms=')) {
      const value = Number(arg.slice('--timeout-ms='.length));
      if (!Number.isFinite(value) || value <= 0) return { ...args, error: `invalid --timeout-ms: ${arg}` };
      args.timeoutMs = value;
    } else return { ...args, error: `unknown argument: ${arg}` };
  }
  return args;
}

/**
 * Actually starts the server and receives `tools/list`. Asked at runtime rather than
 * parsed statically because the registry is assembled inside a 5,000-line file, and
 * static parsing gives a quietly wrong answer the moment the assembly rules change.
 */
export function listMcpTools({ entry = MCP_ENTRY, cwd = ROOT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, OATLAS_VAULT: './docs/ontology' };
    delete env.OATLAS_READ_ONLY; // Read-only mode hides the write tools; the whole surface must be recorded.
    const child = spawn(process.execPath, [entry], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error(`MCP tools/list timed out after ${timeoutMs}ms. stderr: ${stderr.trim()}`)),
      timeoutMs,
    );

    child.on('error', (err) => finish(err));
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      let index;
      while ((index = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, index).trim();
        stdout = stdout.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 1) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
        } else if (message.id === 2) {
          const tools = message.result?.tools;
          if (!Array.isArray(tools) || tools.length === 0) {
            finish(new Error(`tools/list returned no tools. stderr: ${stderr.trim()}`));
          } else finish(null, tools);
        }
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'ontology-atlas-docs-surface', version: '1' },
        },
      })}\n`,
    );
  });
}

export async function deriveSurfaceText(options = {}) {
  const tools = await listMcpTools(options);
  return serializeSurface(buildSurface({ tools, cliCommands: [...CLI_COMMANDS] }));
}

/**
 * Does the documentation cover the surface — does each registered tool/command name
 * appear in its README? The prose *content* is not examined. The names come from code,
 * so this is a comparison against code.
 */
export function docCoverageProblems({ surface, mcpReadme, cliReadme }) {
  const problems = [];
  const missingTools = namesMissingFromDoc(
    surface.mcp.tools.map((tool) => tool.name),
    mcpReadme,
  );
  if (missingTools.length > 0) {
    problems.push(`mcp/README.md never names ${missingTools.length} registered tool(s): ${missingTools.join(', ')}`);
  }
  const missingCommands = cliCommandsMissingFromDoc(surface.cli.commands, cliReadme);
  if (missingCommands.length > 0) {
    problems.push(
      `cli/README.md never names ${missingCommands.length} registered command(s): ${missingCommands.join(', ')}`,
    );
  }
  return problems;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    return 2;
  }

  const generated = await deriveSurfaceText({ timeoutMs: args.timeoutMs });
  const surface = JSON.parse(generated);

  if (!args.check) {
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, generated, 'utf-8');
    console.log(
      `[docs-surface] ${surface.mcp.toolCount} MCP tools (${surface.mcp.readToolCount} read + ${surface.mcp.writeToolCount} write) · ` +
        `${surface.cli.commandCount} CLI commands → ${path.relative(ROOT, OUT)}`,
    );
    return 0;
  }

  let failed = false;
  if (!existsSync(OUT)) {
    console.error(`[docs-surface] missing ${path.relative(ROOT, OUT)} — run \`pnpm docs:surface:build\`.`);
    failed = true;
  } else {
    const committed = readFileSync(OUT, 'utf-8');
    const drift = diffSurface(generated, committed);
    if (drift) {
      console.error(`[docs-surface] ${path.relative(ROOT, OUT)} is stale — run \`pnpm docs:surface:build\`.`);
      console.error(`  first difference at line ${drift.line}`);
      console.error(`    expected: ${drift.expected}`);
      console.error(`    actual:   ${drift.actual}`);
      failed = true;
    }
  }

  const problems = docCoverageProblems({
    surface,
    mcpReadme: readFileSync(MCP_README, 'utf-8'),
    cliReadme: readFileSync(CLI_README, 'utf-8'),
  });
  for (const problem of problems) console.error(`[docs-surface] ${problem}`);
  if (problems.length > 0) failed = true;

  if (failed) return 1;
  console.log(
    `[docs-surface] current · ${surface.mcp.toolCount} MCP tools (${surface.mcp.readToolCount} read + ${surface.mcp.writeToolCount} write) · ` +
      `${surface.cli.commandCount} CLI commands documented`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error('[docs-surface] failed:', err.message ?? err);
      process.exitCode = 1;
    });
}
