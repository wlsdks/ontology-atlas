#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { CLI_COMMANDS } from '../cli/src/lib/cli-commands.mjs';
import {
  buildSurface,
  cliCommandsMissingFromDoc,
  diffSurface,
  mcpSurfaceCounts,
  namesMissingFromDoc,
  normalizeMcpTools,
  serializeSurface,
} from './lib/docs-surface.mjs';
import { docCoverageProblems, parseArgs, usage } from './build-docs-surface.mjs';

const SAMPLE_TOOLS = [
  {
    name: 'zebra_tool',
    annotations: { readOnlyHint: false },
    inputSchema: { properties: { slug: {}, apple: {} }, required: ['slug'] },
  },
  {
    name: 'alpha_tool',
    annotations: { readOnlyHint: true },
    inputSchema: { properties: { limit: {} }, required: [] },
  },
];

describe('docs surface derivation', () => {
  it('sorts tools and argument names so registry order never shows up as drift', () => {
    const tools = normalizeMcpTools(SAMPLE_TOOLS);

    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['alpha_tool', 'zebra_tool'],
    );
    assert.deepEqual(tools[1].arguments, ['apple', 'slug']);
  });

  it('splits the public read/write counts from the annotation, not from a hand-written number', () => {
    assert.deepEqual(mcpSurfaceCounts(normalizeMcpTools(SAMPLE_TOOLS)), {
      toolCount: 2,
      readToolCount: 1,
      writeToolCount: 1,
    });
  });

  it('serializes deterministically — same input, same bytes', () => {
    const first = serializeSurface(buildSurface({ tools: SAMPLE_TOOLS, cliCommands: ['b', 'a'] }));
    const second = serializeSurface(buildSurface({ tools: [...SAMPLE_TOOLS].reverse(), cliCommands: ['a', 'b'] }));

    assert.equal(first, second);
    assert.ok(first.endsWith('\n'));
  });

  it('reports the first differing line so a stale artifact says where it drifted', () => {
    assert.equal(diffSurface('a\nb\n', 'a\nb\n'), null);
    assert.deepEqual(diffSurface('a\nb\n', 'a\nc\n'), { line: 2, expected: 'b', actual: 'c' });
  });
});

describe('docs surface coverage', () => {
  it('names every registered tool the docs never mention', () => {
    assert.deepEqual(namesMissingFromDoc(['add_concept', 'ghost_tool'], '| `add_concept` | writes |'), ['ghost_tool']);
  });

  it('matches CLI commands by their documented invocation, not by bare word', () => {
    // `export` is a normal English word — a bare `includes` check passes on prose
    // that never documents the command. The invocation form is what a reader needs.
    const readme = 'You can export things. `ontology-atlas list [vault]` lists nodes.';

    assert.deepEqual(cliCommandsMissingFromDoc(['export', 'list'], readme), ['export']);
  });

  it('reports both surfaces in one pass', () => {
    const surface = buildSurface({ tools: SAMPLE_TOOLS, cliCommands: ['ghost'] });
    const problems = docCoverageProblems({ surface, mcpReadme: '', cliReadme: '' });

    assert.equal(problems.length, 2);
    assert.match(problems[0], /mcp\/README\.md never names 2 registered tool/);
    assert.match(problems[1], /cli\/README\.md never names 1 registered command/);
  });
});

describe('docs surface CLI', () => {
  it('parses the check and timeout flags and rejects unknown ones', () => {
    assert.equal(parseArgs(['--check']).check, true);
    assert.equal(parseArgs(['--timeout-ms=500']).timeoutMs, 500);
    assert.match(parseArgs(['--timeout-ms', 'nope']).error, /invalid --timeout-ms/);
    assert.match(parseArgs(['--nope']).error, /unknown argument/);
    assert.match(usage(), /--check/);
  });
});

describe('committed surface artifact', () => {
  const surface = JSON.parse(readFileSync('docs/.generated/mcp-surface.json', 'utf-8'));

  it('carries the CLI command registry as the single source of the command list', () => {
    assert.deepEqual(surface.cli.commands, [...CLI_COMMANDS].sort());
    assert.equal(surface.cli.commandCount, CLI_COMMANDS.length);
  });

  it('keeps the public tool split internally consistent', () => {
    assert.equal(surface.mcp.tools.length, surface.mcp.toolCount);
    assert.equal(
      surface.mcp.tools.filter((tool) => tool.mode === 'read').length,
      surface.mcp.readToolCount,
    );
    assert.equal(surface.mcp.readToolCount + surface.mcp.writeToolCount, surface.mcp.toolCount);
  });

  it('says how it is regenerated so nobody hand-edits it', () => {
    assert.equal(surface._generatedBy, 'pnpm docs:surface:build');
    assert.match(surface._contract, /Never hand-edit/);
  });
});
