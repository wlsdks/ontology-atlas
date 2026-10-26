import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ available: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => native.available,
  invoke: native.invoke,
}));
import { gitChangeBriefing, gitChangeBriefingPatch, gitBriefingSavedPullDescriptions, gitBriefingClearSavedPulls, type ChangeBriefing } from './tauri-change-briefing';

afterEach(() => {
  native.available = false;
  native.invoke.mockReset();
});

it('does not invoke local Git for either read in a browser', async () => {
  expect(await gitChangeBriefing('/vault', 'project', 1, 2)).toBeNull();
  expect(await gitChangeBriefingPatch('/vault', 'project', 'head', null, 'tip', 'file.ts')).toBeNull();
  expect(native.invoke).not.toHaveBeenCalled();
});

it('keeps the source binding, exclusive end and issued patch basis in native arguments', async () => {
  native.available = true;
  const response = { status: 'partial' };
  native.invoke.mockResolvedValue(response);
  expect(await gitChangeBriefing('/vault', 'project', 10, 20)).toBe(response);
  expect(native.invoke).toHaveBeenLastCalledWith('git_change_briefing', {
    vaultPath: '/vault', projectSlug: 'project', startEpoch: 10, endEpoch: 20,
  });
  expect(await gitChangeBriefingPatch('/vault', 'project', 'head', null, 'tip', '한글.ts')).toBe(response);
  expect(native.invoke).toHaveBeenLastCalledWith('git_change_briefing_patch', {
    vaultPath: '/vault', projectSlug: 'project', head: 'head', base: null, tip: 'tip', path: '한글.ts',
  });
});

it('keeps saved-copy access native and clearing independent of repository paths', async () => {
  const data = { sourceRoot: '/source', head: 'head', tip: 'tip', base: null, snapshot: 'receipt' } as ChangeBriefing;
  expect(await gitBriefingSavedPullDescriptions(data, 'owner/repo')).toBeNull();
  await expect(gitBriefingClearSavedPulls()).rejects.toThrow('unavailable');
  expect(native.invoke).not.toHaveBeenCalled();
  native.available = true;
  native.invoke.mockResolvedValue({ status: 'ready', pulls: null });
  await gitBriefingSavedPullDescriptions(data, 'owner/repo');
  expect(native.invoke).toHaveBeenLastCalledWith('git_briefing_saved_pull_descriptions', { sourcePath: '/source', head: 'head', tip: 'tip', base: null, snapshot: 'receipt', repository: 'owner/repo' });
  await gitBriefingClearSavedPulls();
  expect(native.invoke).toHaveBeenLastCalledWith('git_briefing_clear_saved_pulls');
});
