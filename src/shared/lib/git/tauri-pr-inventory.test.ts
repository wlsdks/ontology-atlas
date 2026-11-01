import { afterEach, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ available: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => bridge.available, invoke: bridge.invoke }));
import type { ChangeBriefing } from './tauri-change-briefing';
import { isNativePublicPullOriginal, publicPullRepositories, readPublicPulls } from './tauri-pr-inventory';
import { clearPublicPullLedger } from './public-pull-ledger';

const emptyPeriod = { sourceRoot: '/source', head: 'head', snapshot: 'receipt', tip: null } as ChangeBriefing;

afterEach(() => { bridge.available = false; bridge.invoke.mockReset(); });

it('does not access native Git or GitHub from the browser', async () => {
  expect(await publicPullRepositories(emptyPeriod)).toEqual([]);
  expect(await readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, new AbortController().signal)).toBeNull();
  expect(bridge.invoke).not.toHaveBeenCalled();
});

it('reads PRs with a source-bound receipt even when the period has no commits', async () => {
  bridge.available = true;
  bridge.invoke.mockImplementation(async (command: string) => command === 'git_briefing_public_repositories' ? ['owner/repo'] : command === 'llm_chat_prepare' ? 'request' : { status: 'observed', repository: 'owner/repo', versions: [] });
  const signal = new AbortController().signal;
  expect(await publicPullRepositories(emptyPeriod)).toEqual(['owner/repo']);
  expect(bridge.invoke).toHaveBeenCalledWith('git_briefing_public_repositories', { sourcePath: '/source', head: 'head', snapshot: 'receipt' });
  await readPublicPulls(emptyPeriod, 'owner/repo', { action: 'more', cursor: 'next' }, signal);
  expect(bridge.invoke).toHaveBeenCalledWith('git_briefing_public_inventory', {
    sourcePath: '/source', head: 'head', snapshot: 'receipt', repository: 'owner/repo', action: 'more', cursor: 'next', requestId: 'request',
  });
});

it('retains a stopped read and its replacement cursor so the person can continue', async () => {
  bridge.available = true;
  let finish!: (value: unknown) => void;
  bridge.invoke.mockImplementation((command: string) => command === 'llm_chat_prepare' ? Promise.resolve('request') : command === 'llm_chat_cancel' ? Promise.resolve() : new Promise((resolve) => { finish = resolve; }));
  const controller = new AbortController();
  const pending = readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, controller.signal);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  controller.abort();
  expect(bridge.invoke).toHaveBeenCalledWith('llm_chat_cancel', { requestId: 'request' });
  finish({ status: 'cancelled', repository: 'owner/repo', versions: [], cursor: 'continue' });
  await expect(pending).resolves.toMatchObject({ status: 'cancelled', cursor: 'continue' });
});

it('does not start a request when stopped before native preparation finishes', async () => {
  bridge.available = true;
  let prepared!: (value: string) => void;
  bridge.invoke.mockImplementation((command: string) => command === 'llm_chat_prepare' ? new Promise((resolve) => { prepared = resolve; }) : Promise.resolve());
  const controller = new AbortController();
  const pending = readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, controller.signal);
  controller.abort();
  prepared('request');
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(bridge.invoke).toHaveBeenCalledWith('llm_chat_cancel', { requestId: 'request' });
  expect(bridge.invoke).not.toHaveBeenCalledWith('git_briefing_public_inventory', expect.anything());
});

it('removes its cancellation listener after a completed read', async () => {
  bridge.available = true;
  bridge.invoke.mockImplementation(async (command: string) => command === 'llm_chat_prepare' ? 'request' : { status: 'observed', repository: 'owner/repo', versions: [] });
  const controller = new AbortController();
  await readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, controller.signal);
  controller.abort();
  expect(bridge.invoke).not.toHaveBeenCalledWith('llm_chat_cancel', expect.anything());
});

it('binds an immutable original to the exact native source, snapshot and repository', async () => {
  bridge.available = true;
  const version = { number: 1, title: 'Title', body: 'Original', bodyPresent: true, url: 'https://github.com/owner/repo/pull/1', status: 'open', updatedAt: '', fetchedAt: '', digest: 'a'.repeat(64) };
  bridge.invoke.mockImplementation(async (command: string) => command === 'llm_chat_prepare' ? 'request' : { repository: 'owner/repo', versions: [version] });
  const result = await readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, new AbortController().signal);
  const original = result!.versions[0];
  expect(Object.isFrozen(original)).toBe(true);
  expect(isNativePublicPullOriginal(original, emptyPeriod, 'owner/repo')).toBe(true);
  expect(isNativePublicPullOriginal({ ...original, body: 'Forged' }, emptyPeriod, 'owner/repo')).toBe(false);
  expect(isNativePublicPullOriginal(original, { ...emptyPeriod, snapshot: 'other' }, 'owner/repo')).toBe(false);
  expect(isNativePublicPullOriginal(original, emptyPeriod, 'owner/other')).toBe(false);
  version.body = 'Changed after native response';
  expect(original.body).toBe('Original');
});

it('rejects mismatched native repository and malformed native original before creating evidence', async () => {
  bridge.available = true;
  bridge.invoke.mockImplementation(async (command: string) => command === 'llm_chat_prepare' ? 'request' : { repository: 'owner/other', versions: [] });
  await expect(readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, new AbortController().signal)).rejects.toThrow('invalid-public-pull-scope');
  bridge.invoke.mockImplementation(async (command: string) => command === 'llm_chat_prepare' ? 'request' : { repository: 'owner/repo', versions: [{ number: 1, digest: 'fake' }] });
  await expect(readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, new AbortController().signal)).rejects.toThrow('invalid-public-pull-original');
});

it('pins the receipt before asynchronous preparation, even if the caller changes its object', async () => {
  bridge.available = true;
  let prepared!: (value: string) => void;
  const version = { number: 1, title: 'Title', body: 'Original', bodyPresent: true, url: 'https://github.com/owner/repo/pull/1', status: 'open', updatedAt: '', fetchedAt: '', digest: 'a'.repeat(64) };
  bridge.invoke.mockImplementation((command: string) => command === 'llm_chat_prepare' ? new Promise(resolve => { prepared = resolve; }) : Promise.resolve({ repository: 'owner/repo', versions: [version] }));
  const changing = { ...emptyPeriod };
  const pending = readPublicPulls(changing, 'owner/repo', { action: 'start', cursor: null }, new AbortController().signal);
  changing.snapshot = 'other';
  prepared('request');
  const result = await pending;
  expect(bridge.invoke).toHaveBeenCalledWith('git_briefing_public_inventory', expect.objectContaining({ snapshot: 'receipt' }));
  expect(isNativePublicPullOriginal(result!.versions[0], emptyPeriod, 'owner/repo')).toBe(true);
  expect(isNativePublicPullOriginal(result!.versions[0], changing, 'owner/repo')).toBe(false);
});

it('does not reauthorize a response that arrives after retained PR copies are cleared', async () => {
  bridge.available = true;
  let finish!: (value: unknown) => void;
  const version = { number: 1, title: 'Title', body: 'Original', bodyPresent: true, url: 'https://github.com/owner/repo/pull/1', status: 'open', updatedAt: '', fetchedAt: '', digest: 'a'.repeat(64) };
  bridge.invoke.mockImplementation((command: string) => command === 'llm_chat_prepare' ? Promise.resolve('request') : new Promise(resolve => { finish = resolve; }));
  const pending = readPublicPulls(emptyPeriod, 'owner/repo', { action: 'start', cursor: null }, new AbortController().signal);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  clearPublicPullLedger();
  finish({ repository: 'owner/repo', versions: [version] });
  const result = await pending;
  expect(isNativePublicPullOriginal(result!.versions[0], emptyPeriod, 'owner/repo')).toBe(false);
});
