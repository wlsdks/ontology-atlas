import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseMcpToolResponse } from './mcp-call.mjs';

describe('mcp-call response parsing', () => {
  it('prefers structuredContent over text JSON for successful tool calls', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
          structuredContent: { ok: true, source: 'structured' },
        },
      }),
      { ok: true, source: 'structured' },
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
