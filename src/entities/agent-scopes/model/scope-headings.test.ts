import { describe, expect, it } from 'vitest';

import { scopeHeadings } from './scope-headings';
import { testFile, testHook, testScopes } from './test-scopes';

describe('pane 2 headings', () => {
  it('lists the repository files first, then User with picked files after it, then Managed', () => {
    const scopes = testScopes({
      files: [
        testFile('claude-user', { hooks: [testHook('Stop', 'u.sh')] }),
        testFile('claude-managed', { hooks: [testHook('Stop', 'm.sh')] }),
        testFile('picked-1', { hooks: [testHook('Stop', 'p.sh')] }),
        testFile('claude-local', { hooks: [testHook('Stop', 'l.sh')] }),
        testFile('claude-project', { hooks: [testHook('Stop', 'r.sh')] }),
      ],
    });
    expect(scopeHeadings(scopes, () => true).map(({ file }) => file.id)).toEqual([
      'claude-project',
      'claude-local',
      'claude-user',
      'picked-1',
      'claude-managed',
    ]);
  });

  it('keeps a file it could not read, and drops a file with no hook in the category', () => {
    const scopes = testScopes({
      files: [
        testFile('claude-project', { hooks: [testHook('Stop', 'r.sh')] }),
        testFile('claude-user', { status: 'invalid' }),
        testFile('codex-user', { status: 'unreadable', failure: 'link' }),
        testFile('claude-local', { status: 'missing' }),
      ],
    });
    const headings = scopeHeadings(scopes, (hook) => hook.event === 'PreToolUse');
    expect(headings.map(({ file, hooks }) => [file.id, hooks.length])).toEqual([
      ['claude-user', 0],
      ['codex-user', 0],
    ]);
  });
});
