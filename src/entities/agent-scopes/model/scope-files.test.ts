import { describe, expect, it } from 'vitest';

import table from '../../../../tests/fixtures/harness-scope-files.json';
import { hookFilePattern, SCOPE_FILES, SCOPES_BY_REACH } from './scope-files';

describe('agent settings file catalogue', () => {
  it('names the same files, in the same order and patterns, as the native reader', () => {
    expect(SCOPE_FILES).toEqual(table.files);
  });

  it('gives every scope in the popup stack a hook file, and Codex no Local file', () => {
    for (const tool of ['claude-code', 'codex'] as const) {
      for (const scope of SCOPES_BY_REACH[tool]) {
        expect(hookFilePattern(tool, scope, 'macos'), `${tool} ${scope}`).not.toBeNull();
      }
    }
    expect(hookFilePattern('codex', 'local', 'linux')).toBeNull();
    expect(hookFilePattern('codex', 'user', 'windows')).toBe('%USERPROFILE%\\.codex\\hooks.json');
  });
});
