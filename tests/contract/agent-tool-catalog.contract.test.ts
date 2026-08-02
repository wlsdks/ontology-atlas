// 앱 에이전트의 도구 카탈로그 ↔ MCP 서버 도구 정의 drift 차단.
//
// 원칙: **주는 도구는 이름·인자·효과가 MCP 와 완전히 같다.** 화면·CLI·MCP 세
// 입구가 같은 답을 내는 것이 이 저장소의 반복 계약(parser 3-way, validator
// 2-way)이고, 그 문법을 도구 정의에도 적용한다.
//
// `mcp/src/index.js` 는 import 하는 순간 stdio 서버로 부팅해 버리므로
// (`await server.connect(transport)`) 모듈로 불러올 수 없다. 대신 **원문을
// 읽어** `const TOOLS = [...]` 안의 각 도구 블록에서 이름·인자 키·required 를
// 뽑아 대조한다. MCP 쪽이 인자를 추가/이름 변경하면 여기서 즉시 깨진다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AGENT_READ_TOOLS, AGENT_TOOLS, AGENT_WRITE_TOOLS } from '@/features/vault-agent/model/tool-catalog';

const MCP_SOURCE = readFileSync(
  join(__dirname, '../../mcp/src/index.js'),
  'utf-8',
);

/** `const TOOLS = [` 이후만 본다 — 이름이 우연히 겹치는 문자열을 피한다. */
const TOOLS_START = MCP_SOURCE.indexOf('const TOOLS = [');

/** `open` 위치의 여는 괄호와 짝이 맞는 닫는 괄호 바로 뒤 인덱스. */
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

/** MCP 원문에서 한 도구의 inputSchema 최상위 인자 이름과 required 를 뽑는다. */
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

  // required 는 inputSchema 최상위에만 있다. `oneOf: [{ required: ... }]` 같은
  // selector 분기 안의 required 를 최상위 필수 인자로 오인하지 않는다.
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

/** 객체 본문에서 depth 0 인 키 이름만 순서대로 모은다 (문자열·주석 무시). */
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
    // 파서가 조용히 빈 배열을 돌려주면 아래 테스트가 전부 무의미해진다.
    const shape = readMcpToolShape('get_concept');
    expect(shape.propertyNames).toEqual(['slug', 'uid', 'body']);
    // 정확히 하나를 고르는 계약은 MCP JSON Schema 의 oneOf 가 강제한다.
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
    // 코드가 필요한 일은 터미널의 몫이다 — 도구 세트가 그 경계를 구조로 만든다.
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
