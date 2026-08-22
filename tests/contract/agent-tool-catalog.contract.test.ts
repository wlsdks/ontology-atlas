// Blocks drift between the app agent's tool catalogue and the MCP server's tool
// definitions.
//
// Principle: **a tool we hand out has exactly the MCP name, arguments, and
// effects.** Screen, CLI, and MCP giving the same answer is this repository's
// recurring contract (3-way parser, 2-way validator); the same grammar applies to
// tool definitions.
//
// `mcp/src/index.js` boots a stdio server the moment it is imported
// (`await server.connect(transport)`), so it cannot be loaded as a module.
// Instead the **source is read** and each tool block inside `const TOOLS = [...]`
// yields its name, argument keys, and required list for comparison. Adding or
// renaming an argument on the MCP side breaks this immediately.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AGENT_READ_TOOLS, AGENT_TOOLS, AGENT_WRITE_TOOLS } from '@/features/vault-agent/model/tool-catalog';

const MCP_SOURCE = readFileSync(
  join(__dirname, '../../mcp/src/index.js'),
  'utf-8',
);

/** Only look after `const TOOLS = [`, to avoid strings that coincidentally share a name. */
const TOOLS_START = MCP_SOURCE.indexOf('const TOOLS = [');

/** Index just past the bracket matching the opening bracket at `open`. */
function matchBrace(source: string, open: number, openChar: '{' | '['): number {
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let index = open;
  let inString: string | null = null;
  let inLineComment = false;
  for (; index < source.length; index += 1) {
    const ch = source[index];
    const prev = source[index - 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '/' && source[index + 1] === '/') {
      inLineComment = true;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error('괄호 짝을 찾지 못했다');
}

interface McpToolShape {
  propertyNames: string[];
  required: string[];
}

/** Extracts one tool's top-level inputSchema argument names and required list from the MCP source. */
function readMcpToolShape(toolName: string): McpToolShape {
  const nameAt = MCP_SOURCE.indexOf(`name: '${toolName}',`, TOOLS_START);
  if (nameAt < 0) throw new Error(`MCP 에 없는 도구: ${toolName}`);
  const schemaAt = MCP_SOURCE.indexOf('inputSchema:', nameAt);
  const schemaOpen = MCP_SOURCE.indexOf('{', schemaAt);
  const schemaEnd = matchBrace(MCP_SOURCE, schemaOpen, '{');
  const schema = MCP_SOURCE.slice(schemaOpen, schemaEnd);

  const propsAt = schema.indexOf('properties:');
  const propsOpen = schema.indexOf('{', propsAt);
  const propsEnd = matchBrace(schema, propsOpen, '{');
  const propsBody = schema.slice(propsOpen + 1, propsEnd - 1);

  const propertyNames = collectDepthOneKeys(propsBody);

  // `required` exists only at the top level of inputSchema. A `required` inside a
  // selector branch such as `oneOf: [{ required: ... }]` must not be mistaken for a
  // top-level requirement.
  const tail = schema.slice(propsEnd);
  const requiredMatch = findDepthZeroRequired(tail);
  const required = requiredMatch
    ? Array.from(requiredMatch.matchAll(/'([^']+)'/g)).map((m) => m[1])
    : [];

  return { propertyNames, required };
}

function findDepthZeroRequired(source: string): string | null {
  let depth = 0;
  let inString: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    const prev = source[index - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0 && source.startsWith('required:', index)) {
      const open = source.indexOf('[', index);
      const close = matchBrace(source, open, '[');
      return source.slice(open + 1, close - 1);
    }
  }
  return null;
}

/** Collects depth-0 key names from an object body in order (ignoring strings and comments). */
function collectDepthOneKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let token = '';
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index];
    const prev = body[index - 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '/' && body[index + 1] === '/') {
      inLineComment = true;
      token = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      token = '';
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      token = '';
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      token = '';
      continue;
    }
    if (depth === 0 && ch === ':') {
      const key = token.trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) keys.push(key);
      token = '';
      continue;
    }
    if (ch === ',' || ch === '\n') {
      token = '';
      continue;
    }
    token += ch;
  }
  return keys;
}

describe('에이전트 도구 카탈로그 ↔ MCP 서버 정의', () => {
  it('추출기 자체가 동작한다 (get_concept 은 slug/uid 중 하나와 body 를 받는다)', () => {
    // If the parser silently returns an empty array, every test below is meaningless.
    const shape = readMcpToolShape('get_concept');
    expect(shape.propertyNames).toEqual(['slug', 'uid', 'body']);
    // The "exactly one" contract is enforced by the MCP JSON Schema's oneOf.
    expect(shape.required).toEqual([]);
  });

  it.each(AGENT_TOOLS.map((tool) => [tool.name, tool] as const))(
    '%s — 인자 이름 집합이 MCP 와 같다',
    (_name, tool) => {
      const mcp = readMcpToolShape(tool.name);
      const ours = Object.keys(tool.parameters.properties ?? {});
      expect([...ours].sort()).toEqual([...mcp.propertyNames].sort());
    },
  );

  it.each(AGENT_TOOLS.map((tool) => [tool.name, tool] as const))(
    '%s — 필수 인자가 MCP 와 같다',
    (_name, tool) => {
      const mcp = readMcpToolShape(tool.name);
      const ours = [...(tool.parameters.required ?? [])];
      expect(ours.sort()).toEqual([...mcp.required].sort());
    },
  );

  it('볼트 밖을 보는 도구는 하나도 주지 않는다', () => {
    // Work that needs code belongs to the terminal — the tool set makes that boundary structural.
    const forbidden = [
      'analyze_repo_structure',
      'infer_imports',
      'index_project',
      'git_snapshot',
      'delete_concept',
      'rename_concept',
      'merge_concepts',
      'absorb_document',
    ];
    for (const name of forbidden) {
      expect(AGENT_TOOLS.map((tool) => tool.name)).not.toContain(name);
    }
  });

  it('최소 출하선: 읽기 6종 이상 + 쓰기 5종', () => {
    expect(AGENT_READ_TOOLS.length).toBeGreaterThanOrEqual(6);
    expect(AGENT_WRITE_TOOLS.map((tool) => tool.name).sort()).toEqual([
      'add_concept',
      'add_concepts',
      'add_relation',
      'add_relations',
      'patch_concept',
    ]);
  });
});
