import { describe, expect, it } from 'vitest';

import { type ScopeInput, type ScopeRequest, judgeRoundScope, scopeNoteEffect } from './round-scope';

const VAULT = '/Users/probe/Ontology Atlas/launch';

function request(overrides: Partial<ScopeRequest> = {}): ScopeRequest {
  return {
    filePath: null,
    toolName: null,
    toolKind: null,
    rawInput: {},
    reviewKind: 'permission',
    ...overrides,
  };
}

function judge(overrides: Partial<ScopeInput> & { request: ScopeRequest }) {
  return judgeRoundScope({
    round: { kind: 'consistency', onStale: 'redraft' },
    vaultRoot: VAULT,
    vaultServerName: 'atlas-vault',
    atlasToolMode: (toolName, server) => {
      if (!toolName?.startsWith(`mcp__${server}__`)) return null;
      return toolName.endsWith('get_concept') ? 'read' : 'write';
    },
    judgeWrite: (req) => {
      const path = req.filePath?.startsWith(`${VAULT}/wiki/`) ? req.filePath.slice(VAULT.length + 1) : null;
      if (!path) return null;
      return { path, ok: req.rawInput.content !== 'broken' };
    },
    ...overrides,
  });
}

const service = { kind: 'service' as const, connectorName: 'confluence' };

describe('round scope', () => {
  it('never lets a round write the ontology', () => {
    expect(judge({ request: request({ reviewKind: 'ontology-write', toolName: 'mcp__atlas-vault__add_concept' }) }))
      .toEqual({ decision: 'reject', reason: 'ontology-write' });
    expect(judge({ request: request({ toolName: 'mcp__atlas-vault__add_concept' }) }))
      .toEqual({ decision: 'reject', reason: 'mcp__atlas-vault__add_concept' });
  });

  it('allows the vault server\'s read tools for either kind', () => {
    const req = request({ toolName: 'mcp__atlas-vault__get_concept', toolKind: 'other' });
    expect(judge({ request: req }).decision).toBe('allow');
    expect(judge({ request: req, round: service }).decision).toBe('allow');
  });

  it('allows the round\'s own connector unless the adapter says the call mutates', () => {
    const search = request({ toolName: 'mcp__confluence__search', toolKind: 'other' });
    expect(judge({ request: search, round: service })).toEqual({ decision: 'allow', note: 'call mcp__confluence__search' });
    const unclassified = request({ toolName: 'mcp__confluence__get_page', toolKind: null });
    expect(judge({ request: unclassified, round: service }).decision).toBe('allow');
    const mutate = request({ toolName: 'mcp__confluence__create_page', toolKind: 'edit' });
    expect(judge({ request: mutate, round: service })).toEqual({ decision: 'reject', reason: 'mcp__confluence__create_page' });
    const execute = request({ toolName: 'mcp__confluence__run', toolKind: 'execute' });
    expect(judge({ request: execute, round: service }).decision).toBe('reject');
  });

  it('matches the connector by its whole name, separators and all', () => {
    // A connector attached as `notion__staging` owns `mcp__notion__staging__…`; reading the
    // server name up to the first `__` called it `notion` and refused its every tool.
    const staging = { kind: 'service' as const, connectorName: 'notion__staging' };
    const search = request({ toolName: 'mcp__notion__staging__search', toolKind: 'other' });
    expect(judge({ request: search, round: staging })).toEqual({ decision: 'allow', note: 'call mcp__notion__staging__search' });
    // And a sibling connector is still somebody else's.
    expect(judge({ request: request({ toolName: 'mcp__notion__search', toolKind: 'other' }), round: staging }).decision).toBe('reject');
  });

  it('refuses any other connector, and a connector for a consistency round', () => {
    const other = request({ toolName: 'mcp__notion__search', toolKind: 'other' });
    expect(judge({ request: other, round: service })).toEqual({ decision: 'reject', reason: 'mcp__notion__search' });
    const own = request({ toolName: 'mcp__confluence__search', toolKind: 'other' });
    expect(judge({ request: own }).decision).toBe('reject');
  });

  it('allows reads inside the folder and refuses anything outside it', () => {
    expect(judge({ request: request({ filePath: `${VAULT}/sources/plan.md`, toolKind: 'read' }) }))
      .toEqual({ decision: 'allow', note: 'read sources/plan.md' });
    expect(judge({ request: request({ filePath: `${VAULT}/wiki`, toolKind: 'search' }) }).decision).toBe('allow');
    expect(judge({ request: request({ filePath: '/Users/probe/other/plan.md', toolKind: 'read' }) }))
      .toEqual({ decision: 'reject', reason: '/Users/probe/other/plan.md' });
    expect(judge({ request: request({ filePath: `${VAULT}/../secrets.md`, toolKind: 'read' }) }).decision).toBe('reject');
    expect(judge({ request: request({ filePath: `${VAULT}x/plan.md`, toolKind: 'read' }) }).decision).toBe('reject');
  });

  it('writes a wiki page only when the page judge accepts it, for either kind', () => {
    const fits = request({ filePath: `${VAULT}/wiki/plan.md`, toolKind: 'edit', rawInput: { content: 'ok' } });
    expect(judge({ request: fits })).toEqual({ decision: 'allow', note: 'write wiki/plan.md' });
    expect(judge({ request: fits, round: service }).decision).toBe('allow');
    const broken = request({ filePath: `${VAULT}/wiki/plan.md`, toolKind: 'edit', rawInput: { content: 'broken' } });
    expect(judge({ request: broken })).toEqual({ decision: 'reject', reason: 'wiki/plan.md' });
  });

  it('never writes retained answers or the wiki\'s furniture', () => {
    const answer = request({ filePath: `${VAULT}/wiki/answers/q-1.md`, toolKind: 'edit', rawInput: { content: 'ok' } });
    expect(judge({ request: answer, round: service }).decision).toBe('reject');
    const log = request({ filePath: `${VAULT}/wiki/_log.md`, toolKind: 'edit', rawInput: { content: 'ok' } });
    expect(judge({ request: log, round: service }).decision).toBe('reject');
  });

  it('lets only a service round touch sources/, and never delete or move there', () => {
    const write = request({ filePath: `${VAULT}/sources/plan.md`, toolKind: 'edit', rawInput: { content: '# Plan' } });
    expect(judge({ request: write, round: service })).toEqual({ decision: 'allow', note: 'write sources/plan.md' });
    expect(judge({ request: write })).toEqual({ decision: 'reject', reason: 'sources/plan.md' });
    const remove = request({ filePath: `${VAULT}/sources/plan.md`, toolKind: 'delete' });
    expect(judge({ request: remove, round: service }).decision).toBe('reject');
    const move = request({ filePath: `${VAULT}/sources/plan.md`, toolKind: 'move' });
    expect(judge({ request: move, round: service }).decision).toBe('reject');
  });

  it('refuses a write anywhere else in the folder, and any execute', () => {
    const node = request({ filePath: `${VAULT}/capabilities/x.md`, toolKind: 'edit', rawInput: { content: 'kind: capability' } });
    expect(judge({ request: node, round: service })).toEqual({ decision: 'reject', reason: 'capabilities/x.md' });
    const run = request({ filePath: `${VAULT}/sources/plan.md`, toolKind: 'execute' });
    expect(judge({ request: run, round: service }).decision).toBe('reject');
    expect(judge({ request: request({ toolName: 'Bash', toolKind: 'execute' }) }).decision).toBe('reject');
  });

  it('allows every connector the round\'s places name, and no other', () => {
    /*
     * Spec §3.2: one round may watch a Slack room and a Confluence space in one pass, so the
     * allow-list is the union of its places. A third connector is still "other connector".
     */
    const both = { kind: 'service' as const, connectorNames: ['slack', 'confluence'] };
    expect(judge({ request: request({ toolName: 'mcp__slack__search' }), round: both }))
      .toEqual({ decision: 'allow', note: 'call mcp__slack__search' });
    expect(judge({ request: request({ toolName: 'mcp__confluence__search' }), round: both }))
      .toEqual({ decision: 'allow', note: 'call mcp__confluence__search' });
    expect(judge({ request: request({ toolName: 'mcp__jira__search' }), round: both }))
      .toEqual({ decision: 'reject', reason: 'mcp__jira__search' });
    // A mutating call is still refused whichever of its places it belongs to.
    expect(judge({ request: request({ toolName: 'mcp__slack__post_message', toolKind: 'edit' }), round: both }).decision)
      .toBe('reject');
  });

  it('a connector whose own name holds the separator owns its tools', () => {
    const staging = { kind: 'service' as const, connectorNames: ['notion__staging'] };
    expect(judge({ request: request({ toolName: 'mcp__notion__staging__search' }), round: staging }))
      .toEqual({ decision: 'allow', note: 'call mcp__notion__staging__search' });
    // And the shorter name is a different server, not this one.
    expect(judge({ request: request({ toolName: 'mcp__notion__search' }), round: staging }).decision).toBe('reject');
  });

  it('a note names its effect first, so the ledger can list writes apart from reads', () => {
    expect(scopeNoteEffect('write wiki/plan.md')).toEqual({ effect: 'write', target: 'wiki/plan.md' });
    expect(scopeNoteEffect('call mcp__confluence__search')).toEqual({ effect: 'call', target: 'mcp__confluence__search' });
    expect(scopeNoteEffect('wiki/plan.md')).toBeNull();
  });
});
