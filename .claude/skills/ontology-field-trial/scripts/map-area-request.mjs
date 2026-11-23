#!/usr/bin/env node
// What the app sends for one "map the rest" request, read from the app source at run time so a
// chain measures the wording the panel sends today, never a pasted copy.
//
//   map-area-request.mjs session <checkout> <target> <vault> <session-dir>
//     writes mcp.json (the vault MCP bound to one folder), handoff.txt, door.txt, and the same
//     server and handoff as Codex -c overrides (codex-overrides.nul)
//   map-area-request.mjs prompt <checkout> <vault>
//     prints the request for the project note's current figures; exit 3 when the note has none
//   map-area-request.mjs figures <checkout> <vault>
//     prints the note's figures as JSON, or null
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NO_FIGURES = 3;

async function importFrom(checkout, file) {
  return import(pathToFileURL(join(checkout, file)).href);
}

/** The app's own parser of the project's summary line, transpiled from its TypeScript source. */
async function notMappedAreasParser(checkout) {
  const { default: ts } = await import('typescript');
  const file = 'src/shared/lib/vault-document/not-mapped-areas.ts';
  const { outputText } = ts.transpileModule(readFileSync(join(checkout, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('exports', outputText)(exports);
  if (typeof exports.notMappedAreas !== 'function') throw new Error(`${file} no longer exports notMappedAreas`);
  return exports.notMappedAreas;
}

function projectBodies(checkout, vault) {
  return importFrom(checkout, 'mcp/src/parser.mjs').then(({ parseFrontmatter }) => {
    const bodies = [];
    for (const entry of readdirSync(vault, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name.startsWith('.')) continue;
      const { frontmatter, body } = parseFrontmatter(readFileSync(join(vault, entry.name), 'utf8'));
      if (frontmatter?.kind === 'project') bodies.push(body);
    }
    return bodies;
  });
}

/** `{ uncovered, total }` from the first project note that keeps the summary line, or null. */
export async function noteFigures(checkout, vault) {
  const parse = await notMappedAreasParser(checkout);
  for (const body of await projectBodies(checkout, vault)) {
    const figures = parse(body);
    if (figures) return { uncovered: figures.abilitiesUncovered, total: figures.abilitiesTotal };
  }
  return null;
}

/** The panel's share: never 100 while an ability is off the map. */
function mappedPercent({ uncovered, total }) {
  return Math.min(99, Math.round((100 * (total - uncovered)) / total));
}

/**
 * Calls `mapAreaPrompt` by its parameter names, whatever order and set it has today, so a
 * signature change is followed, and an argument this file cannot supply is a hard stop.
 */
function callByParameterNames(mapAreaPrompt, checkout, figures) {
  const named = {
    checkout,
    percent: mappedPercent(figures),
    total: figures.total,
    mapped: figures.total - figures.uncovered,
    uncovered: figures.uncovered,
    remaining: figures.uncovered,
  };
  const head = /^[^(]*\(([^)]*)\)/.exec(mapAreaPrompt.toString())?.[1] ?? '';
  const names = head.split(',').map((name) => name.replace(/=.*$/s, '').trim()).filter(Boolean);
  const unknown = names.filter((name) => !(name in named));
  if (unknown.length > 0) throw new Error(`mapAreaPrompt takes ${unknown.join(', ')}, which this chain cannot supply`);
  return mapAreaPrompt(...names.map((name) => named[name]));
}

/** Codex `-c` overrides for the same server and handoff; TOML reads a JSON string as its own. */
function codexOverrides(server, vault, target, handoff) {
  const toml = (value) => JSON.stringify(value);
  return [
    `mcp_servers.atlas-vault.command=${toml(process.execPath)}`,
    `mcp_servers.atlas-vault.args=[${toml(server)}]`,
    `mcp_servers.atlas-vault.env={ OATLAS_VAULT = ${toml(vault)}, OATLAS_REPO_ROOT = ${toml(target)} }`,
    'mcp_servers.atlas-vault.default_tools_approval_mode="approve"',
    // A survey of a large repository outlasts Codex's default tool timeout.
    'mcp_servers.atlas-vault.tool_timeout_sec=600',
    'approval_policy="never"',
    'history.persistence="none"',
    `developer_instructions=${toml(handoff)}`,
  ];
}

async function writeSession(checkout, target, vault, sessionDir) {
  const server = join(checkout, 'mcp/src/index.js');
  writeFileSync(join(sessionDir, 'mcp.json'), JSON.stringify({
    mcpServers: {
      'atlas-vault': { command: process.execPath, args: [server], env: { OATLAS_VAULT: vault, OATLAS_REPO_ROOT: target } },
    },
  }, null, 1));
  const { constructionPrompts } = await importFrom(checkout, 'scripts/lib/benchmark/construction-prompts.mjs');
  const { handoff, firstTurn } = constructionPrompts(checkout, target);
  writeFileSync(join(sessionDir, 'handoff.txt'), handoff);
  writeFileSync(join(sessionDir, 'door.txt'), firstTurn);
  writeFileSync(join(sessionDir, 'codex-overrides.nul'),
    codexOverrides(server, vault, target, handoff).map((override) => `${override}\0`).join(''));
}

async function main([command, ...args]) {
  if (command === 'session') return writeSession(...args);
  if (command === 'figures') return process.stdout.write(`${JSON.stringify(await noteFigures(args[0], args[1]))}\n`);
  if (command === 'prompt') {
    const [checkout, vault] = args;
    const figures = await noteFigures(checkout, vault);
    if (!figures) process.exit(NO_FIGURES);
    const { mapAreaPrompt } = await importFrom(checkout, 'scripts/lib/benchmark/construction-prompts.mjs');
    return process.stdout.write(callByParameterNames(mapAreaPrompt, checkout, figures));
  }
  process.stderr.write('usage: map-area-request.mjs session|prompt|figures ...\n');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2));
