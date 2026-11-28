#!/usr/bin/env node
/**
 * Writes the copy of the MCP tool surface the Rust server embeds, from the one authored source
 * during the port: the JavaScript registry in `mcp/src/server/`.
 *
 * Run: node scripts/mcp/surface/generate-surface.mjs [--check] [--out-dir <dir>]
 *
 * `--check` writes nothing and exits 1 when a committed file differs from what the registry
 * produces now, so a registry change cannot merge while the Rust server still embeds the old
 * surface. The copy becomes the authored source when the JavaScript server is deleted.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SERVER_SOURCE = join(REPOSITORY_ROOT, 'mcp', 'src');
const DEFAULT_OUT_DIR = join(REPOSITORY_ROOT, 'src-tauri', 'crates', 'mcp-server', 'surface');
const REGENERATE_COMMAND = 'pnpm mcp:surface';

const MODE_VARIABLES = ['OATLAS_READ_ONLY', 'OATLAS_TOOL_PROFILE', 'OATLAS_WRITE_CONSENT'];

/**
 * The registry reads its modes from the environment when it is evaluated, so each import carries a
 * distinct query string to get a fresh evaluation under the variables set for it.
 */
async function importRegistry(label, variables) {
  const saved = Object.fromEntries(MODE_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of MODE_VARIABLES) delete process.env[name];
  Object.assign(process.env, variables);
  try {
    const url = `${pathToFileURL(join(SERVER_SOURCE, 'server', 'registry.mjs')).href}?surface=${label}`;
    return await import(url);
  } finally {
    for (const name of MODE_VARIABLES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Mirrors `isTopLevelNonBlank` in `advertised-input-schema.mjs`: the argument is refused when blank. */
function isTopLevelNonBlank(schema, pattern) {
  if (!isObject(schema)) return false;
  if (schema.pattern === pattern && !Array.isArray(schema.enum)) return true;
  return Array.isArray(schema.anyOf) && schema.anyOf.some((branch) => isTopLevelNonBlank(branch, pattern));
}

function nonBlankArgumentsByTool(inputContracts, pattern) {
  const byTool = {};
  for (const [name, contract] of inputContracts) {
    const names = Object.entries(contract?.properties ?? {})
      .filter(([, schema]) => isTopLevelNonBlank(schema, pattern))
      .map(([argument]) => argument);
    if (names.length > 0) byTool[name] = names;
  }
  return byTool;
}

export async function buildSurfaceFiles() {
  const full = await importRegistry('full', {});
  const construction = await importRegistry('construction', { OATLAS_TOOL_PROFILE: 'construction' });
  const { SERVER_VERSION } = await import(pathToFileURL(join(SERVER_SOURCE, 'server-version.mjs')).href);
  const { SERVER_INSTRUCTIONS } = await import(
    pathToFileURL(join(SERVER_SOURCE, 'server', 'instructions.mjs')).href
  );
  const { NON_BLANK_STRING_SCHEMA } = await import(
    pathToFileURL(join(SERVER_SOURCE, 'server', 'tool-schemas', 'field-primitives.mjs')).href
  );

  const guides = await buildGuides();

  // One advertised tool per line keeps a registry change a readable diff.
  const tools = `[\n${[...full.TOOL_BY_NAME.values()].map((tool) => JSON.stringify(tool)).join(',\n')}\n]\n`;

  const registry = `${JSON.stringify(
    {
      serverName: 'ontology-atlas-mcp',
      serverVersion: SERVER_VERSION,
      readTools: [...full.READ_TOOL_NAMES],
      retiredTools: [...full.RETIRED_TOOL_REPLACEMENTS].map(([name, replacement]) => ({ name, replacement })),
      constructionTools: construction.TOOLS_FOR_LIST.map((tool) => tool.name),
      topLevelNonBlankArguments: nonBlankArgumentsByTool(full.TOOL_INPUT_CONTRACT_BY_NAME, NON_BLANK_STRING_SCHEMA.pattern),
    },
    null,
    2,
  )}\n`;

  return {
    'tools.json': tools,
    'registry.json': registry,
    'instructions.txt': SERVER_INSTRUCTIONS,
    'guides.json': guides,
  };
}

/** The construction card and the long-form guides `connection_info` hands out, one text per topic. */
async function buildGuides() {
  const load = (...segments) => import(pathToFileURL(join(SERVER_SOURCE, ...segments)).href);
  const card = await load('construction', 'construction-card.mjs');
  const rules = await load('construction', 'construction-rules.mjs');
  const instructions = await load('server', 'instructions.mjs');
  return `${JSON.stringify(
    {
      card: card.CONSTRUCTION_CARD_EN,
      topics: [...card.CONSTRUCTION_GUIDE_TOPICS],
      texts: {
        meta_model: rules.META_MODEL_RULES_EN,
        construction: card.CONSTRUCTION_GUIDE_EN,
        write_safety: instructions.WRITE_SAFETY_SECTION_EN,
        workflows: instructions.WORKFLOWS_SECTION_EN,
      },
    },
    null,
    2,
  )}\n`;
}

function parseArguments(argv) {
  const options = { check: false, outDir: DEFAULT_OUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') options.check = true;
    else if (argv[index] === '--out-dir') {
      index += 1;
      if (!argv[index]) throw new Error('--out-dir needs a folder.');
      options.outDir = resolve(argv[index]);
    } else throw new Error(`Unknown argument ${argv[index]}. Use --check or --out-dir <folder>.`);
  }
  return options;
}

async function main() {
  const { check, outDir } = parseArguments(process.argv.slice(2));
  const files = await buildSurfaceFiles();
  const shown = (name) => relative(REPOSITORY_ROOT, join(outDir, name));

  if (check) {
    const stale = Object.entries(files)
      .filter(([name, content]) => {
        const path = join(outDir, name);
        return !existsSync(path) || readFileSync(path, 'utf8') !== content;
      })
      .map(([name]) => shown(name));
    if (stale.length > 0) {
      console.error(
        `The Rust server's copy of the tool surface is out of date with mcp/src/server: ${stale.join(', ')}.\n` +
          `Run \`${REGENERATE_COMMAND}\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`The Rust server's tool surface copy matches mcp/src/server (${Object.keys(files).length} files).`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(outDir, name), content);
    console.log(`wrote ${shown(name)}`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
