import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSetupCopy } from './use-agent-setup-copy';

let clipboardAccepts = true;
const copyText = vi.fn((_text: string) => Promise.resolve(clipboardAccepts));

vi.mock('@/shared/lib/clipboard/copy-text', () => ({
  copyText: (text: string) => copyText(text),
}));

beforeEach(() => {
  clipboardAccepts = true;
  copyText.mockClear();
});

describe('useAgentSetupCopy', () => {
  it('starts every chip idle', () => {
    const { result } = renderHook(() => useAgentSetupCopy('notes', '/v'));
    expect(Object.values(result.current.states).every((state) => state === 'idle')).toBe(true);
  });

  it('marks only the clicked chip copied, with that chip text on the clipboard', async () => {
    const { result } = renderHook(() => useAgentSetupCopy('notes', '/v'));
    await act(() => result.current.copy('firstContactProof'));
    expect(result.current.states.firstContactProof).toBe('copied');
    expect(result.current.states.setupPacket).toBe('idle');
    expect(copyText.mock.calls[0]?.[0]).toContain('Ontology vault: /v');
  });

  it('marks the chip failed when the clipboard refuses', async () => {
    clipboardAccepts = false;
    const { result } = renderHook(() => useAgentSetupCopy('notes', '/v'));
    await act(() => result.current.copy('postChangeSync'));
    expect(result.current.states.postChangeSync).toBe('failed');
  });
});
