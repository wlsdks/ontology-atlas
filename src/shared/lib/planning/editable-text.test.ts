import { describe, expect, it } from 'vitest';
import { editablePlanningText, planningTextForDisk } from './editable-text';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('editablePlanningText', () => {
  it('refuses bytes that are not UTF-8, since saving them back would rewrite the file', () => {
    expect(editablePlanningText(new Uint8Array([0xb0, 0xe1, 0xc1, 0xa6, 0x0a]))).toBeNull();
  });

  it('edits CRLF text with LF and writes CRLF back byte for byte', () => {
    const original = bytes('# Plan\r\n\r\nOne line.\r\n');
    const editable = editablePlanningText(original)!;
    expect(editable.text).toBe('# Plan\n\nOne line.\n');
    expect(bytes(planningTextForDisk(editable.text, editable.lineEnding))).toEqual(original);
  });

  it('keeps a byte order mark through an unchanged save', () => {
    const original = bytes('﻿# Plan\n');
    const editable = editablePlanningText(original)!;
    expect(bytes(planningTextForDisk(editable.text, editable.lineEnding))).toEqual(original);
  });
});
