import { describe, expect, it } from 'vitest';

import { readToolOutcome } from './tool-outcome';
import { TOOL_OUTPUT_PREVIEW_CHARS, keepToolOutput } from './tool-output';

function mcpAnswer(chars: number, total = 42): unknown {
  const filler = 'x'.repeat(Math.max(0, chars - 40));
  return [{ type: 'text', text: JSON.stringify({ total, items: [filler] }) }];
}

describe('keepToolOutput', () => {
  it('keeps an answer within the preview exactly as it came', () => {
    const answer = mcpAnswer(1_000);
    expect(keepToolOutput(answer, { evidence: true })).toEqual({ rawOutput: answer, evidence: null });
    expect(keepToolOutput(undefined, { evidence: true }).rawOutput).toBeUndefined();
  });

  it('keeps a bounded preview of a larger answer, with its length', () => {
    const answer = mcpAnswer(TOOL_OUTPUT_PREVIEW_CHARS * 4);
    const kept = keepToolOutput(answer, { evidence: false }).rawOutput as {
      preview: string;
      chars: number;
      head: string;
    };
    expect(kept.preview).toBe('tool-output');
    expect(kept.head.length).toBe(TOOL_OUTPUT_PREVIEW_CHARS);
    expect(kept.chars).toBe(JSON.stringify(answer).length);
    expect(JSON.stringify(kept).length).toBeLessThan(TOOL_OUTPUT_PREVIEW_CHARS * 1.1);
  });

  it('measures an answer made of many small items, not only one long string', () => {
    const rows = Array.from({ length: TOOL_OUTPUT_PREVIEW_CHARS }, (_, index) => ({ i: index }));
    expect(keepToolOutput({ total: rows.length, rows }, { evidence: false }).rawOutput).toMatchObject({
      preview: 'tool-output',
      total: rows.length,
    });
    const small = { rows: rows.slice(0, 100) };
    expect(keepToolOutput(small, { evidence: false }).rawOutput).toBe(small);
  });

  it('lets the tool row still say how much came back', () => {
    const kept = keepToolOutput(mcpAnswer(TOOL_OUTPUT_PREVIEW_CHARS * 2, 128), { evidence: false }).rawOutput;
    expect(readToolOutcome(kept, 'completed', true, false)).toEqual({ kind: 'count', count: 128 });
  });

  it('keeps no evidence when no turn is waiting to capture it', () => {
    const row = {
      slug: 'capabilities/refund',
      frontmatter: { kind: 'capability' },
      body: 'b'.repeat(TOOL_OUTPUT_PREVIEW_CHARS),
      bodyInfo: { mode: 'full', truncated: false, returnedChars: TOOL_OUTPUT_PREVIEW_CHARS },
    };
    const answer = [{ type: 'text', text: JSON.stringify(row) }];
    expect(keepToolOutput(answer, { evidence: false }).evidence).toBeNull();
    expect(keepToolOutput(answer, { evidence: true }).evidence?.fullBody).toEqual([row]);
  });
});
