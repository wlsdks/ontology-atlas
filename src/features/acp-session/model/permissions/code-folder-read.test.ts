import { describe, expect, it } from 'vitest';

import { isCodeFolderFileRead } from './code-folder-read';
import type { AcpPermissionRequest } from './permission-request';

const FILE = '/code/src/app.ts';

function request(overrides: Partial<AcpPermissionRequest> = {}): AcpPermissionRequest {
  return {
    title: null,
    toolCallId: 'call-1',
    toolName: 'Read',
    toolKind: 'read',
    filePath: FILE,
    rawInput: { file_path: FILE, offset: 1, limit: 200 },
    reviewKind: 'permission',
    pathVerdict: 'allow-inside-code-folder',
    options: [{ optionId: 'allow', kind: 'allow_once', name: 'Allow' }],
    ...overrides,
  };
}

describe('a code-folder read the turn may allow without a card', () => {
  it('passes a plain read of the judged file', () => {
    expect(isCodeFolderFileRead(request())).toBe(true);
  });

  it.each<[string, Partial<AcpPermissionRequest>]>([
    ['a search, whose folder can come from its pattern', { toolKind: 'search', rawInput: { pattern: '/Users/me/.ssh/*', path: FILE } }],
    ['an edit', { toolKind: 'edit' }],
    ['a command', { toolKind: 'execute' }],
    ['an unknown kind', { toolKind: null }],
    ['an Atlas tool', { toolName: 'mcp__atlas__get_concept' }],
    ['a path Rust did not judge inside the code folder', { pathVerdict: 'ask' }],
    ['an unjudged path', { pathVerdict: undefined }],
    ['a second path argument', { rawInput: { file_path: FILE, path: '/code/.env' } }],
    ['a pattern beside the path', { rawInput: { file_path: FILE, pattern: '**/*' } }],
    ['a nested argument', { rawInput: { file_path: FILE, options: { path: '/etc' } } }],
    ['a path with trailing white space', { filePath: `${FILE} `, rawInput: { file_path: `${FILE} ` } }],
    ['a path with a format character', { filePath: `${FILE}\u200b`, rawInput: { file_path: `${FILE}\u200b` } }],
    ['no path argument at all', { rawInput: {} }],
    ['an ontology write review', { reviewKind: 'ontology-write' }],
  ])('asks about %s', (_name, overrides) => {
    expect(isCodeFolderFileRead(request(overrides))).toBe(false);
  });
});
