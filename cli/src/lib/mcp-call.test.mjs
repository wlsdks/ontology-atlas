import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { formatMcpSpawnError, parseMcpToolResponse } from './mcp-call.mjs';

describe('mcp-call response parsing', () => {
  it('spawns the MCP server with the current Node executable', () => {
    const source = readFileSync('cli/src/lib/mcp-call.mjs', 'utf-8');

    assert.match(source, /spawn\(process\.execPath, \[entry\]/);
    assert.doesNotMatch(source, /spawn\('node', \[entry\]/);
  });

  it('formats MCP spawn errors with tool, vault, and entry context', () => {
    assert.equal(
      formatMcpSpawnError(new Error('spawn node ENOENT'), {
        entry: '/tmp/mcp/src/index.js',
        toolName: 'query_ontology',
        vaultRoot: '/tmp/vault',
      }).message,
      'failed to spawn MCP server while calling query_ontology (vault /tmp/vault, entry /tmp/mcp/src/index.js): spawn node ENOENT',
    );
  });

  it('returns structuredContent when text JSON matches with different key order', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ source: 'structured', ok: true }) }],
          structuredContent: { ok: true, source: 'structured' },
        },
      }),
      { ok: true, source: 'structured' },
    );
  });

  it('rejects successful responses when structuredContent drifts from text JSON', () => {
    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
            structuredContent: { ok: true, source: 'structured' },
          },
        }),
      /mcp tool structuredContent mismatch — \$\.source: parsed "text", structuredContent "structured"/,
    );
  });

  it('reports nested structuredContent mismatch paths and previews missing values', () => {
    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: JSON.stringify({ rows: [{ slug: 'a', count: 1 }] }) }],
            structuredContent: { rows: [{ slug: 'a', count: 2 }] },
          },
        }),
      /mcp tool structuredContent mismatch — \$\.rows\[0\]\.count: parsed 1, structuredContent 2/,
    );

    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: JSON.stringify({ total: 1 }) }],
            structuredContent: { total: 1, extra: true },
          },
        }),
      /mcp tool structuredContent mismatch — \$\.extra: parsed undefined, structuredContent true/,
    );
  });

  it('includes the MCP tool name in wrapper-level parse failures', () => {
    assert.throws(
      () =>
        parseMcpToolResponse(
          {
            result: {
              content: [{ text: JSON.stringify({ ok: true }) }],
              structuredContent: { ok: false },
            },
          },
          { toolName: 'query_ontology' },
        ),
      /mcp tool structuredContent mismatch \(query_ontology\) — \$\.ok: parsed true, structuredContent false/,
    );

    assert.throws(
      () =>
        parseMcpToolResponse(
          {
            result: {
              content: [{ text: 'plain response' }],
              structuredContent: { ok: true },
            },
          },
          { toolName: 'query_ontology' },
        ),
      /mcp tool structuredContent text is not JSON \(query_ontology\): "plain response"/,
    );

    assert.throws(
      () => parseMcpToolResponse({ error: { message: 'tool exploded' } }, { toolName: 'query_ontology' }),
      /mcp tool error \(query_ontology\): tool exploded/,
    );
  });

  it('rejects successful structuredContent responses with non-JSON text content', () => {
    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: 'plain response' }],
            structuredContent: { ok: true, source: 'structured' },
          },
        }),
      /mcp tool structuredContent text is not JSON/,
    );
  });

  it('accepts successful structuredContent responses without text content', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          structuredContent: { ok: true, source: 'structured-only' },
        },
      }),
      { ok: true, source: 'structured-only' },
    );
  });

  it('falls back to text JSON when structuredContent is absent', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
        },
      }),
      { ok: true, source: 'text' },
    );
  });

  it('falls back to text JSON when structuredContent is null', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
          structuredContent: null,
        },
      }),
      { ok: true, source: 'text' },
    );
  });

  it('keeps plain text fallback and error handling stable', () => {
    assert.deepEqual(
      parseMcpToolResponse({ result: { content: [{ text: 'plain response' }] } }),
      { text: 'plain response' },
    );

    assert.throws(
      () => parseMcpToolResponse({ result: { isError: true, content: [{ text: 'bad input' }] } }),
      /bad input/,
    );
    assert.throws(
      () => parseMcpToolResponse({ error: { message: 'tool exploded' } }),
      /mcp tool error: tool exploded/,
    );
  });
});
