import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rememberTool, rememberedTool } from '@/features/acp-session';

import { useRememberedTool } from './use-remembered-tool';

const kept = vi.hoisted(() => ({ runtimeId: null as string | null }));
vi.mock('./kept-panels', () => ({ keptAwayRuntimeId: () => kept.runtimeId }));

const CLAUDE = { id: 'claude-acp' };
const CODEX = { id: 'codex-acp' };

interface Props {
  vaultRoot: string | null;
  runtimes: Array<{ id: string }>;
  held?: boolean;
}

function mount(initial: Props) {
  return renderHook(
    ({ vaultRoot, runtimes, held }: Props) => {
      const [runtimeId, setRuntimeId] = useState<string | null>(runtimes[0]?.id ?? null);
      const first = runtimes[0]?.id ?? null;
      const seated = runtimeId ?? first;
      const choose = useRememberedTool({ vaultRoot, runtimes, runtimeId: seated, setRuntimeId, held });
      return { runtimeId: seated, choose };
    },
    { initialProps: initial },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  kept.runtimeId = null;
});

describe('the tool last chosen in a folder', () => {
  it('is seated when the folder arrives after the tools, and again for another folder', () => {
    rememberTool('/notes', 'codex-acp');
    rememberTool('/other', 'claude-acp');
    const hook = mount({ vaultRoot: null, runtimes: [CLAUDE, CODEX] });
    expect(hook.result.current.runtimeId).toBe('claude-acp');

    hook.rerender({ vaultRoot: '/notes', runtimes: [CLAUDE, CODEX] });
    expect(hook.result.current.runtimeId).toBe('codex-acp');

    hook.rerender({ vaultRoot: '/other', runtimes: [CLAUDE, CODEX] });
    expect(hook.result.current.runtimeId).toBe('claude-acp');
  });

  it("keeps the person's own pick and seats it the next time", () => {
    const hook = mount({ vaultRoot: '/notes', runtimes: [CLAUDE, CODEX] });
    act(() => hook.result.current.choose('codex-acp'));
    expect(hook.result.current.runtimeId).toBe('codex-acp');
    expect(rememberedTool('/notes')).toBe('codex-acp');
    hook.unmount();

    expect(mount({ vaultRoot: '/notes', runtimes: [CLAUDE, CODEX] }).result.current.runtimeId).toBe('codex-acp');
  });

  it('stays on the seated tool when the kept one is not usable, was asked for by name, or a conversation runs out of sight', () => {
    rememberTool('/notes', 'codex-acp');
    expect(mount({ vaultRoot: '/notes', runtimes: [CLAUDE] }).result.current.runtimeId).toBe('claude-acp');

    const asked = mount({ vaultRoot: '/notes', runtimes: [CLAUDE, CODEX], held: true });
    expect(asked.result.current.runtimeId).toBe('claude-acp');
    asked.rerender({ vaultRoot: '/notes', runtimes: [CLAUDE, CODEX], held: false });
    expect(asked.result.current.runtimeId).toBe('claude-acp');

    kept.runtimeId = 'claude-acp';
    expect(mount({ vaultRoot: '/notes', runtimes: [CLAUDE, CODEX] }).result.current.runtimeId).toBe('claude-acp');
  });
});
