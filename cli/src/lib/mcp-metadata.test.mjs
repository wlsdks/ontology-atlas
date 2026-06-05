import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseMcpToolMetadataFromDescription } from './mcp-metadata.mjs';

describe('mcp-metadata', () => {
  it('parses tool count and read/write split from package descriptions', () => {
    const metadata = parseMcpToolMetadataFromDescription(
      'MCP server. Current surface: 24 tools (16 read + 8 write).',
    );

    assert.deepEqual(
      {
        toolCount: metadata?.toolCount,
        readCount: metadata?.readCount,
        writeCount: metadata?.writeCount,
        splitText: metadata?.splitText,
      },
      {
        toolCount: '24',
        readCount: '16',
        writeCount: '8',
        splitText: '16 read + 8 write',
      },
    );
    assert.match('init prints (16 read + 8 write)', metadata?.splitPattern);
  });

  it('returns null for descriptions without the tool inventory shape', () => {
    assert.equal(parseMcpToolMetadataFromDescription('MCP server without counts'), null);
    assert.equal(parseMcpToolMetadataFromDescription('24 tools, 16 read, 8 write'), null);
    assert.equal(parseMcpToolMetadataFromDescription(null), null);
  });
});
