import { describe, expect, it } from 'vitest';

import { harnessListClass, harnessReadClass, isReadableHarnessPath } from './harness-read-scope';

describe('harnessReadClass', () => {
  it('reads the guide files and projects the configs by their class', () => {
    expect(harnessReadClass('AGENTS.md')).toBe('text');
    expect(harnessReadClass('src/AGENTS.md')).toBe('text');
    expect(harnessReadClass('.mcp.json')).toBe('mcp-servers');
    expect(harnessReadClass('package.json')).toBe('package-scripts');
  });

  it('refuses a secret name before it asks whether the folder is allowed', () => {
    expect(harnessReadClass('.claude/skills/deploy/.env')).toBe('denied');
    expect(harnessReadClass('.claude/skills/secrets/SKILL.md')).toBe('denied');
  });

  it('leaves out a document and a nested package.json', () => {
    expect(harnessReadClass('docs/ARCHITECTURE.md')).toBe('not-allowed');
    expect(harnessReadClass('web/package.json')).toBe('not-allowed');
  });

  it('rejects a path that leaves the folder', () => {
    expect(harnessReadClass('../outside.md')).toBe('invalid');
    expect(harnessReadClass('a\\b.md')).toBe('invalid');
  });
});

describe('harnessListClass', () => {
  it('lists every plain folder and only the named dot folders', () => {
    expect(harnessListClass('')).toBe('listable');
    expect(harnessListClass('src/features/cart')).toBe('listable');
    expect(harnessListClass('.claude/rules')).toBe('listable');
    expect(harnessListClass('.vscode/settings.json')).toBe('not-allowed');
  });

  it('is readable only for the three allowed classes of path', () => {
    expect(isReadableHarnessPath('CLAUDE.md')).toBe(true);
    expect(isReadableHarnessPath('README.md')).toBe(false);
    expect(isReadableHarnessPath('.env')).toBe(false);
  });
});
