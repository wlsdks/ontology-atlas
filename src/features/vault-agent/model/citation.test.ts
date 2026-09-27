import { describe, expect, it } from 'vitest';

import { extractCitations } from './citation';

describe('citation enforcement', () => {
  it('keeps only slugs that were read as citations', () => {
    const result = extractCitations(
      '[[capabilities/payment]] 는 [[capabilities/refund]] 와 이어져 있어요.',
      ['capabilities/payment', 'capabilities/refund'],
    );
    expect(result.paragraphs[0].citations).toEqual([
      'capabilities/payment',
      'capabilities/refund',
    ]);
    expect(result.grounding).toBe('grounded');
  });

  it('treats a name never read as fabricated, not cited', () => {
    // Drawn as a chip, pressing it takes the user somewhere empty.
    const result = extractCitations('[[capabilities/imaginary]] 를 보세요.', [
      'capabilities/payment',
    ]);
    expect(result.paragraphs[0].citations).toEqual([]);
    expect(result.droppedCitations).toEqual(['capabilities/imaginary']);
    // Something was read, so this is not `unread` — only the notation is invalid.
    expect(result.grounding).toBe('uncited');
  });

  it('recovers the read slug from its last segment alone', () => {
    const result = extractCitations('[[payment]] 를 고쳐요.', ['capabilities/payment']);
    expect(result.paragraphs[0].citations).toEqual(['capabilities/payment']);
  });

  /** The two states have different next actions. */
  it('marks a read but unmarked answer as uncited for correction, not degradation', () => {
    const result = extractCitations('제 생각에는 이렇습니다.', ['capabilities/payment']);
    expect(result.grounding).toBe('uncited');
  });

  it('marks unread only when nothing was read this turn', () => {
    const result = extractCitations('제 생각에는 이렇습니다.', []);
    expect(result.grounding).toBe('unread');
  });

  it('does not leave inline markdown markers from the model as visible text', () => {
    const result = extractCitations(
      '**증거가 없는 기능(`capability`):**\n\n`capabilities/checkout` 을 보세요.',
      ['capabilities/checkout'],
    );
    expect(result.paragraphs[0].text).toBe('증거가 없는 기능(capability):');
    expect(result.paragraphs[1].text).toBe('capabilities/checkout 을 보세요.');
  });

  it('leaves backticks inside a code fence untouched', () => {
    const result = extractCitations('```\nkind: capability\n```', []);
    expect(result.paragraphs[0].text).toBe('```\nkind: capability\n```');
  });

  it('drops empty paragraphs and keeps paragraph boundaries', () => {
    const result = extractCitations('첫 문단.\n\n\n둘째 문단 [[a]].', ['a']);
    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[1].citations).toEqual(['a']);
  });

  it('counts a repeated citation once', () => {
    const result = extractCitations('[[a]] 와 [[a]].', ['a']);
    expect(result.paragraphs[0].citations).toEqual(['a']);
  });
});
