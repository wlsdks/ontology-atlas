import { describe, expect, it } from 'vitest';

import { deriveAcpMapIntent } from './map-intent';

const known = new Set([
  'domains/checkout',
  'capabilities/cart',
  'capabilities/order',
]);

describe('ACP tool call -> map intent', () => {
  it('focuses the exact concept named by get_concept in the current turn', () => {
    expect(
      deriveAcpMapIntent(
        [
          { kind: 'user', id: 'u1', text: '주문 찾아줘' },
          {
            kind: 'tool',
            id: 't1',
            title: 'mcp__atlas-vault__get_concept',
            toolKind: 'read',
            status: 'pending',
            rawInput: { slug: 'capabilities/order' },
          },
        ],
        known,
      ),
    ).toEqual({ kind: 'focus', slug: 'capabilities/order', toolCallId: 't1' });
  });

  it('keeps the exact find_path intent even if the agent reads another concept afterwards', () => {
    expect(
      deriveAcpMapIntent(
        [
          { kind: 'user', id: 'u1', text: '장바구니와 주문 연결 보여줘' },
          {
            kind: 'tool',
            id: 't1',
            title: 'mcp__atlas-vault__find_path',
            toolKind: 'read',
            status: 'completed',
            rawInput: { from: 'capabilities/cart', to: 'capabilities/order' },
          },
          {
            kind: 'tool',
            id: 't2',
            title: 'mcp__atlas-vault__get_concept',
            toolKind: 'read',
            status: 'pending',
            rawInput: { slug: 'capabilities/cart' },
          },
        ],
        known,
      ),
    ).toEqual({
      kind: 'path',
      from: 'capabilities/cart',
      to: 'capabilities/order',
      toolCallId: 't1',
    });
  });

  it('accepts the existing self-read ontology-atlas server name', () => {
    expect(
      deriveAcpMapIntent(
        [
          { kind: 'user', id: 'u1', text: '찾아줘' },
          {
            kind: 'tool',
            id: 't1',
            title: 'mcp__ontology-atlas__get_concept',
            toolKind: 'read',
            status: 'completed',
            rawInput: { slug: 'domains/checkout' },
          },
        ],
        known,
      ),
    ).toEqual({ kind: 'focus', slug: 'domains/checkout', toolCallId: 't1' });
  });

  it('reads Codex ACP dotted MCP titles only through their matching envelope', () => {
    expect(
      deriveAcpMapIntent(
        [
          { kind: 'user', id: 'u1', text: '찾아줘' },
          {
            kind: 'tool',
            id: 't1',
            title: 'mcp.ontology-atlas.get_concept',
            toolKind: 'execute',
            status: 'completed',
            rawInput: {
              server: 'ontology-atlas',
              tool: 'get_concept',
              arguments: { slug: 'domains/checkout' },
            },
          },
        ],
        known,
      ),
    ).toEqual({ kind: 'focus', slug: 'domains/checkout', toolCallId: 't1' });
  });

  it('fails closed for unknown slugs and foreign same-named tools', () => {
    expect(
      deriveAcpMapIntent(
        [
          { kind: 'user', id: 'u1', text: '찾아줘' },
          {
            kind: 'tool',
            id: 't1',
            title: 'mcp__other__get_concept',
            toolKind: 'read',
            status: 'completed',
            rawInput: { slug: 'capabilities/order' },
          },
          {
            kind: 'tool',
            id: 't2',
            title: 'mcp__atlas-vault__get_concept',
            toolKind: 'read',
            status: 'completed',
            rawInput: { slug: 'capabilities/not-here' },
          },
        ],
        known,
      ),
    ).toBeNull();
  });

  it('does not reuse a previous turn or infer intent from prose', () => {
    expect(
      deriveAcpMapIntent(
        [
          { kind: 'user', id: 'u1', text: '주문 찾아줘' },
          {
            kind: 'tool',
            id: 't1',
            title: 'mcp__atlas-vault__get_concept',
            toolKind: 'read',
            status: 'completed',
            rawInput: { slug: 'capabilities/order' },
          },
          { kind: 'user', id: 'u2', text: '이번에는 설명만 해줘' },
          { kind: 'agent', id: 'a2', text: 'capabilities/cart 를 지도에서 보세요.' },
        ],
        known,
      ),
    ).toBeNull();
  });
});
