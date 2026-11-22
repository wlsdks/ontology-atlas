import { describe, expect, it } from 'vitest';

import { toPermissionRequest } from './permission-request';

describe('toPermissionRequest: reads the path, not the title', () => {
  it('extracts the structured file_path and drops options that do not pair up', () => {
    const parsed = toPermissionRequest({
      options: [
        { kind: 'allow_once', optionId: 'a', name: 'Allow' },
        { kind: 'reject_once' }, // no optionId — unusable
        { optionId: 'x' }, // no kind — unusable
      ],
      toolCall: {
        toolCallId: 'tool-write-notes',
        title: 'Write notes.md',
        kind: 'edit',
        rawInput: { file_path: '/vault/notes.md' },
      },
    });
    expect(parsed.toolCallId).toBe('tool-write-notes');
    expect(parsed.filePath).toBe('/vault/notes.md');
    expect(parsed.toolKind).toBe('edit');
    expect(parsed.rawInput).toEqual({ file_path: '/vault/notes.md' });
    expect(parsed.reviewKind).toBe('permission');
    expect(parsed.options).toEqual([{ optionId: 'a', kind: 'allow_once', name: 'Allow' }]);
  });

  it('treats a preserved JSON-RPC request id of 0 as valid and does not replace it with a new id', () => {
    const parsed = toPermissionRequest({ sessionId: 's-1' }, null, 0);
    expect(parsed.requestId).toBe(0);
    expect(parsed.sessionId).toBe('s-1');
  });

  it('does not blow up on a different shape; the conversation must survive an adapter change', () => {
    expect(toPermissionRequest({})).toEqual({
      requestId: null,
      sessionId: null,
      title: null,
      toolCallId: null,
      toolName: null,
      toolKind: null,
      filePath: null,
      rawInput: {},
      reviewKind: 'permission',
      options: [],
    });
  });

  it('reads the sentence the tool left when there is no title, the spot where the server asks itself', () => {
    /*
     * The vault server pauses a write with `elicitation/create`; `codex-acp` forwards it with no
     * `toolCall.title`, so the question is read from `toolCall.content[]`.
     */
    const parsed = toPermissionRequest({
      options: [{ kind: 'allow_once', optionId: 'accept', name: 'Accept' }],
      toolCall: {
        toolCallId: 'elicitation-ontology-atlas',
        kind: 'other',
        content: [
          {
            type: 'content',
            content: { type: 'text', text: 'Create concept wire-probe. Apply this change to the vault?' },
          },
        ],
        rawInput: { serverName: 'ontology-atlas' },
      },
    });
    expect(parsed.title).toBe('Create concept wire-probe. Apply this change to the vault?');
  });

  it('lets the title win when there is one, the spot the convention names', () => {
    const parsed = toPermissionRequest({
      toolCall: {
        title: 'Write notes.md',
        content: [{ type: 'content', content: { type: 'text', text: 'ignore me' } }],
      },
    });
    expect(parsed.title).toBe('Write notes.md');
  });
});
