import { describe, expect, it } from 'vitest';

import { readToolFallbackTarget, readToolTargets } from './tool-targets';

/**
 * Makes the tool row state **which node it touched.**
 *
 * Until now the screen said only "read a concept" with no mention of which. The value was arriving
 * (`rawInput`) and being discarded.
 */

const known = new Set(['capabilities/invoice', 'domains/payment', 'capabilities/refund']);

describe('도구가 만진 노드를 집는다', () => {
  it('`slug` 를 집는다 — 우리 도구에서 가장 흔한 이름', () => {
    expect(readToolTargets({ slug: 'capabilities/invoice' }, known)).toEqual([
      'capabilities/invoice',
    ]);
  });

  it('관계를 만들 때는 양끝을 다 집는다', () => {
    expect(
      readToolTargets({ from: 'capabilities/invoice', to: 'domains/payment' }, known),
    ).toEqual(['capabilities/invoice', 'domains/payment']);
  });

  it('이름을 바꿀 때는 옛 이름과 새 이름을 다 본다 — 다만 **아는 것만** 남는다', () => {
    // The new name is not in the vault yet (so failing to pick it is correct). The old name is.
    expect(
      readToolTargets({ oldSlug: 'capabilities/invoice', newSlug: 'capabilities/bill' }, known),
    ).toEqual(['capabilities/invoice']);
  });

  it('모르는 이름은 안 집는다 — 눌러도 아무 데도 안 가는 것을 만들지 않는다', () => {
    expect(readToolTargets({ slug: 'capabilities/nope' }, known)).toEqual([]);
  });

  it('슬러그가 아닌 인자는 무시한다', () => {
    expect(
      readToolTargets({ query: 'capabilities/invoice', limit: 10 }, known),
    ).toEqual([]);
  });

  it('같은 노드를 두 번 집지 않는다', () => {
    expect(
      readToolTargets({ slug: 'capabilities/invoice', from: 'capabilities/invoice' }, known),
    ).toEqual(['capabilities/invoice']);
  });

  it('인자가 없거나 모양이 다르면 빈손이다 — 지어내지 않는다', () => {
    expect(readToolTargets(undefined, known)).toEqual([]);
    expect(readToolTargets(null, known)).toEqual([]);
    expect(readToolTargets('문자열', known)).toEqual([]);
    expect(readToolTargets({ slug: 42 }, known)).toEqual([]);
  });

  it('아는 이름 집합이 비면 아무것도 안 집는다', () => {
    expect(readToolTargets({ slug: 'capabilities/invoice' }, new Set())).toEqual([]);
  });

  it('너무 많으면 앞의 몇 개만 — 도구 줄이 대화보다 시끄러워지면 안 된다', () => {
    const many = new Set(['a/1', 'a/2', 'a/3', 'a/4']);
    const out = readToolTargets(
      { slug: 'a/1', from: 'a/2', to: 'a/3', targetSlug: 'a/4' },
      many,
    );
    expect(out.length).toBeLessThanOrEqual(3);
  });
});

describe('readToolFallbackTarget — a tool with no vault node still names what it aimed at', () => {
  it('reads a file path and shows the tail, not the whole absolute path', () => {
    expect(
      readToolFallbackTarget({ file_path: '/Users/me/work/atlas/src/shared/lib/cn.ts' }),
    ).toEqual({ kind: 'path', value: 'lib/cn.ts' });
  });

  it('accepts every path argument name our own tools use', () => {
    // Measured in acp-client.ts: our MCP server writes `filePath`, the sweep tools `rootPath`.
    expect(readToolFallbackTarget({ filePath: '/a/b/notes.md' })).toEqual({
      kind: 'path',
      value: 'b/notes.md',
    });
    expect(readToolFallbackTarget({ rootPath: '/a/b/project' })).toEqual({
      kind: 'path',
      value: 'b/project',
    });
  });

  it('keeps a short relative path whole', () => {
    expect(readToolFallbackTarget({ path: 'notes.md' })).toEqual({
      kind: 'path',
      value: 'notes.md',
    });
  });

  it('names the concept an agent is creating — the slug is not in the vault yet, and that is the row that most needs a name', () => {
    expect(readToolFallbackTarget({ slug: 'capabilities/not-yet-written' })).toEqual({
      kind: 'name',
      value: 'capabilities/not-yet-written',
    });
    expect(
      readToolFallbackTarget({ from: 'capabilities/a', to: 'domains/b' }),
    ).toEqual({ kind: 'name', value: 'capabilities/a' });
  });

  it('falls through to the search pattern when there is no path', () => {
    expect(readToolFallbackTarget({ pattern: 'readToolOutcome' })).toEqual({
      kind: 'query',
      value: 'readToolOutcome',
    });
  });

  it('names the graph operation our query tool was asked for', () => {
    expect(readToolFallbackTarget({ operation: 'maintenance_plan' })).toEqual({
      kind: 'query',
      value: 'maintenance_plan',
    });
  });

  it('names the filter a listing was narrowed by — measured: list_concepts takes kind and domain', () => {
    expect(readToolFallbackTarget({ kind: 'capability' })).toEqual({
      kind: 'query',
      value: 'capability',
    });
    expect(readToolFallbackTarget({ domain: 'domains/payment' })).toEqual({
      kind: 'query',
      value: 'domains/payment',
    });
  });

  it('prefers a path over a query when a tool carries both', () => {
    expect(readToolFallbackTarget({ pattern: 'todo', path: 'src' })).toEqual({
      kind: 'path',
      value: 'src',
    });
  });

  it('shortens a long query rather than letting one line run away', () => {
    const long = 'x'.repeat(200);
    const out = readToolFallbackTarget({ query: long });
    expect(out?.kind).toBe('query');
    expect(out!.value.length).toBeLessThanOrEqual(60);
    expect(out!.value.endsWith('…')).toBe(true);
  });

  it('returns nothing when the tool said nothing usable', () => {
    expect(readToolFallbackTarget(undefined)).toBeNull();
    expect(readToolFallbackTarget({ limit: 10 })).toBeNull();
    expect(readToolFallbackTarget({ path: '   ' })).toBeNull();
  });
});
