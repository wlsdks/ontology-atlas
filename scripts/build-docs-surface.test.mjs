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

  it('preserves oneOf required alternatives so exact selectors are not generated as optional', () => {
    const [tool] = normalizeMcpTools([
      {
        name: 'exact_reader',
        annotations: { readOnlyHint: true },
        inputSchema: {
          properties: { slug: {}, uid: {}, body: {} },
          oneOf: [{ required: ['uid'] }, { required: ['slug'] }],
        },
      },
    ]);

    assert.deepEqual(tool.required, []);
    assert.deepEqual(tool.oneOfRequired, [['slug'], ['uid']]);
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

  /**
   * **계약이 스키마에서 런타임으로 옮겨갔는데 이 검사만 옛 모양을 붙들고
   * 있었다** (2026-08-17에 발견 — 이 검사는 그 전부터 빨간 채였다).
   *
   * 종전에는 `get_concept` 의 입력 스키마가 top-level `oneOf` 로 「slug 냐 uid 냐」
   * 를 못박았고, 이 검사가 그 `oneOfRequired` 를 확인했다. 그런데 Claude Code 의
   * 도구 스키마는 top-level `oneOf` 를 만나면 **그 도구를 통째로 버린다** —
   * 그래서 `mcp/src/index.js` 가 일부러 뺐고, 「정확히 하나」는 런타임이 던진다
   * (`get_concept requires exactly one of slug or uid.`).
   *
   * 즉 동작은 맞고 검사가 낡았다. 그래서 **지금 지켜야 할 것**으로 바꾼다:
   * 두 도구가 살아 있는가 · 두 선택자가 여전히 공개되는가 · 어느 쪽도
   * 필수가 아닌가(그게 `oneOf` 를 뺀 이유다).
   *
   * 「정확히 하나」 자체는 여기서 못 잰다 — 생성물은 스키마이지 동작이 아니다.
   * 그 몫은 이미 서 있다: `mcp/src/integration.test.mjs` 의
   * *"get_concept/get_concepts — selector one-of is enforced at runtime"* 이
   * 네 경우(둘 다 준 경우 · 아무것도 안 준 경우 × 두 도구)를 전부 잰다.
   */
  it('두 선택자 도구가 살아 있고, 선택자가 여전히 공개된다', () => {
    const exactReaders = surface.mcp.tools.filter((tool) =>
      ['get_concept', 'get_concepts'].includes(tool.name),
    );
    assert.equal(exactReaders.length, 2, 'exact selector tools disappeared from the generated surface');
    const byName = new Map(exactReaders.map((tool) => [tool.name, tool]));
    for (const [name, selectors] of [
      ['get_concept', ['slug', 'uid']],
      ['get_concepts', ['slugs', 'uids']],
    ]) {
      const tool = byName.get(name);
      for (const selector of selectors) {
        assert.ok(
          tool.arguments.includes(selector),
          `${name} 이 ${selector} 선택자를 더 이상 공개하지 않는다`,
        );
      }
      assert.deepEqual(
        tool.required,
        [],
        `${name} 의 선택자는 스키마에서 선택이어야 한다 — 필수로 만들면 Claude Code 가 도구를 버린다`,
      );
    }
  });

  it('says how it is regenerated so nobody hand-edits it', () => {
    assert.equal(surface._generatedBy, 'pnpm docs:surface:build');
    assert.match(surface._contract, /Never hand-edit/);
  });
});
