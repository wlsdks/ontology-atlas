import type { Mock } from 'vitest';

export interface InvokeCall {
  command: string;
  args?: Record<string, unknown>;
}

export interface TauriApiMock {
  runtimeAvailable: boolean;
  invoke: Mock;
}

/** Turns the mocked Tauri runtime on and records every command the code under test sends. */
export function installInvoke(api: TauriApiMock, handler: (call: InvokeCall) => unknown): InvokeCall[] {
  const calls: InvokeCall[] = [];
  api.runtimeAvailable = true;
  api.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    const call = { command, args };
    calls.push(call);
    return handler(call);
  });
  return calls;
}

export function resetTauriApiMock(api: TauriApiMock): void {
  api.runtimeAvailable = false;
  api.invoke.mockReset();
}
