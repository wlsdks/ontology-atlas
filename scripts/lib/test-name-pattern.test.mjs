import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatNoTestMatchMessage,
  formatTestFilterSuffix,
  readNodeTestNamePattern,
  resolveTestNamePattern,
} from './test-name-pattern.mjs';

describe('test name pattern helper', () => {
  it('reads node --test-name-pattern from split and equals forms', () => {
    assert.equal(readNodeTestNamePattern(['--test-name-pattern', 'mcp-verify']), 'mcp-verify');
    assert.equal(readNodeTestNamePattern(['--test-name-pattern=README first exploration']), 'README first exploration');
    assert.equal(readNodeTestNamePattern(['--watch']), null);
  });

  it('does not treat the next option as a split test-name-pattern value', () => {
    assert.equal(readNodeTestNamePattern(['--test-name-pattern', '--test-timeout', '1000']), null);
  });

  it('prefers OATLAS_TEST_NAME_PATTERN over node exec argv', () => {
    const filter = resolveTestNamePattern({
      env: { OATLAS_TEST_NAME_PATTERN: 'tools/list' },
      execArgv: ['--test-name-pattern', 'README'],
    });

    assert.equal(filter.raw, 'tools/list');
    assert.equal(filter.source, 'OATLAS_TEST_NAME_PATTERN');
    assert.match('tools/list — schema contract', filter.pattern);
  });

  it('falls back to node --test-name-pattern and formats diagnostics', () => {
    const filter = resolveTestNamePattern({
      env: {},
      execArgv: ['--test-name-pattern=README'],
    });

    assert.equal(filter.raw, 'README');
    assert.equal(filter.source, 'node --test-name-pattern');
    assert.equal(formatTestFilterSuffix(filter), 'filter=README, source=node --test-name-pattern');
    assert.equal(
      formatNoTestMatchMessage('MCP', filter),
      'no MCP integration tests matched node --test-name-pattern=README',
    );
  });

  it('keeps invalid pattern errors tied to the active source', () => {
    assert.throws(
      () => resolveTestNamePattern({ env: {}, execArgv: ['--test-name-pattern', '['] }),
      /invalid node --test-name-pattern:/,
    );
  });
});
