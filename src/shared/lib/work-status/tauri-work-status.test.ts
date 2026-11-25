import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pauseFilePulse,
  readAgentSessions,
  readFilePulse,
  readLoad,
  setFilePulseRead,
  setLoadRead,
  setSessionNamesRead,
} from './tauri-work-status';

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauri);

describe('Work status bridge', () => {
  afterEach(() => {
    tauri.invoke.mockReset();
    tauri.isTauri.mockReset();
  });

  it('asks nothing in the web build and answers that there is nothing to read', async () => {
    tauri.isTauri.mockReturnValue(false);
    expect(await readAgentSessions('/repo')).toBeNull();
    expect(await readFilePulse('/repo', ['a'])).toBeNull();
    expect(await readLoad('/repo')).toBeNull();
    await setSessionNamesRead(true);
    await setFilePulseRead(true);
    await pauseFilePulse();
    await setLoadRead(true);
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('sends each new command only its switch, the repository and worktree ids', async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue(null);
    await readFilePulse('/repo', ['a', 'b']);
    await pauseFilePulse();
    await setFilePulseRead(false);
    await readLoad('/repo');
    await setLoadRead(false);
    await setSessionNamesRead(false);
    expect(tauri.invoke.mock.calls).toEqual([
      ['work_status_file_pulse', { repositoryPath: '/repo', worktreeIds: ['a', 'b'] }],
      ['work_status_pause_file_pulse'],
      ['work_status_set_file_pulse', { on: false }],
      ['work_status_load', { repositoryPath: '/repo' }],
      ['work_status_set_load', { on: false }],
      ['work_status_set_session_names', { on: false }],
    ]);
  });

  it('applies switch commands one after another, in the order the page sent them', async () => {
    tauri.isTauri.mockReturnValue(true);
    const finishes: Array<() => void> = [];
    tauri.invoke.mockImplementation(() => new Promise<void>((resolve) => finishes.push(resolve)));
    const on = setSessionNamesRead(true);
    const off = setSessionNamesRead(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(tauri.invoke).toHaveBeenCalledTimes(1);
    finishes[0]!();
    await on;
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalledTimes(2));
    finishes[1]!();
    await off;
    expect(tauri.invoke.mock.calls.map(([, args]) => args)).toEqual([{ on: true }, { on: false }]);
  });
});
