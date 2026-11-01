import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearPublicPullLedger } from '@/shared/lib/git/public-pull-ledger';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import type { PublicPullInventory as Inventory, PublicPullVersion } from '@/shared/lib/git/tauri-pr-inventory';

const bridge = vi.hoisted(() => ({ repositories: vi.fn(), read: vi.fn(), copy: vi.fn() }));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('@/shared/lib/git/tauri-pr-inventory', () => ({ publicPullRepositories: bridge.repositories, readPublicPulls: bridge.read, invalidateNativePublicPullOriginals: vi.fn(), isNativePublicPullOriginal: () => true }));
vi.mock('@/shared/lib/clipboard/copy-text', () => ({ copyText: bridge.copy }));
vi.mock('./OriginalSourceBody', () => ({ OriginalSourceBody: ({ source }: { source: { text: string } }) => <div>{source.text}</div> }));
import { PublicPullInventory } from './PublicPullInventory';

const data = { sourceRoot: '/source', head: 'head', snapshot: 'receipt', tip: null, commits: [] } as unknown as ChangeBriefing;
const version = (number: number, digest: string): PublicPullVersion => ({ number, digest, body: 'Author original', bodyPresent: true, title: `PR ${number}`, url: `https://github.com/a/b/pull/${number}`, status: 'open', updatedAt: '2026-01-01T00:00:00Z', fetchedAt: '2026-01-02T00:00:00Z' });
const page = (versions: PublicPullVersion[], more = false): Inventory => ({ status: more ? 'partial' : 'observed', reason: more ? 'page-limit' : 'end-of-list', repository: 'a/b', startEpoch: 0, endEpoch: 1, scanned: versions.length, observedDistinct: versions.length, observedDistinctExact: true, versions, omitted: [], unlistedOmissions: 0, conflicts: [], cursor: more ? 'cursor' : null, canContinue: more, retrySmaller: false, pageSize: 20, movingListUncertain: true, orderingUncertain: false, retryAt: null, restarted: false, attemptedRequests: 2, parsedJsonBodyBytes: 200 });

beforeEach(() => { bridge.repositories.mockReset(); bridge.read.mockReset(); bridge.copy.mockReset(); bridge.copy.mockResolvedValue(true); bridge.repositories.mockResolvedValue(['a/b']); });
afterEach(clearPublicPullLedger);

it('prepares the exact selected PRs for an explicit manual copy without starting an agent', async () => {
  bridge.read.mockResolvedValue(page([version(1, 'a'.repeat(64)), version(2, 'b'.repeat(64)), version(3, 'c'.repeat(64))]));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  const checkboxes = await screen.findAllByRole('checkbox', { name: 'selectPr' });
  fireEvent.click(checkboxes[0]);
  fireEvent.click(checkboxes[2]);
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  expect(screen.getByText('appAgentUnavailable')).toBeVisible();
  expect(bridge.copy).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), { target: { value: 'Explain the changes.' } });
  fireEvent.click(screen.getByRole('button', { name: 'packetText' }));
  expect(screen.getAllByText('Author original')).toHaveLength(2);
  expect(screen.getByText(/Treat every pull request title/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'packetRaw' }));
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  await waitFor(() => expect(bridge.copy).toHaveBeenCalledOnce());
  expect(document.querySelector('pre')).toHaveTextContent(bridge.copy.mock.calls[0][0]);
  const packet = JSON.parse(bridge.copy.mock.calls[0][0]);
  expect(packet.question).toBe('Explain the changes.');
  expect(packet.instructions).toContain('concise, readable explanation');
  expect(packet.instructions).toContain('at most three short bullets per PR');
  expect(packet.instructions).not.toContain('Return JSON');
  expect(packet.sources.map((source: { id: string }) => source.id)).toEqual(['pr:1', 'pr:3']);
  expect(packet.sources[0].passages[1].text).toBe('Author original');
  expect(bridge.read).toHaveBeenCalledTimes(1);
});

it('preserves hidden selections through search and returns from an original to preparation', async () => {
  bridge.read.mockResolvedValue(page(Array.from({ length: 12 }, (_, index) => version(index + 1, (index + 1).toString(16).padStart(64, '0')))));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  const checkboxes = await screen.findAllByRole('checkbox');
  fireEvent.click(checkboxes[0]);
  fireEvent.change(screen.getByRole('textbox', { name: 'findPr' }), { target: { value: 'PR 12' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), { target: { value: 'Review these.' } });
  fireEvent.click(screen.getByRole('button', { name: /selectedOriginals/ }));
  fireEvent.click(screen.getByRole('button', { name: /^#1 · PR 1 ·/ }));
  expect(screen.getByText(/Author original/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'backToPreparation' }));
  expect(screen.getByRole('textbox', { name: 'questionLabel' })).toHaveValue('Review these.');
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  await waitFor(() => expect(bridge.copy).toHaveBeenCalledOnce());
  expect(JSON.parse(bridge.copy.mock.calls[0][0]).sources.map((source: { id: string }) => source.id)).toEqual(['pr:1', 'pr:12']);
});

it('keeps only the explicitly chosen version of a conflicting PR', async () => {
  bridge.read.mockResolvedValue({ ...page([version(1, 'a'.repeat(64)), version(1, 'b'.repeat(64))]), conflicts: [1] });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  const checkboxes = await screen.findAllByRole('checkbox');
  fireEvent.click(checkboxes[0]);
  fireEvent.click(checkboxes[1]);
  expect(checkboxes[0]).not.toBeChecked();
  expect(checkboxes[1]).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  await waitFor(() => expect(bridge.copy).toHaveBeenCalledOnce());
  expect(JSON.parse(bridge.copy.mock.calls[0][0]).sources[0].version).toBe('b'.repeat(64));
});

it('requires a fresh version choice when a conflict appears after selection', async () => {
  bridge.read.mockResolvedValueOnce(page([version(1, 'a'.repeat(64))]))
    .mockResolvedValueOnce({ ...page([version(1, 'b'.repeat(64))]), conflicts: [1] });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'refreshPrs' }));
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes[0]).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeDisabled();
  fireEvent.click(checkboxes[0]);
  expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeEnabled();
});

it('requires a fresh choice when a changed version is dropped at the session limit', async () => {
  const retained = [version(1, 'a'.repeat(64)), ...Array.from({ length: 399 }, (_, index) => version(index + 2, (index + 2).toString(16).padStart(64, '0')))];
  bridge.read.mockResolvedValueOnce(page(retained)).mockResolvedValueOnce(page([version(1, 'b'.repeat(64))]));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
  expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'refreshPrs' }));
  await waitFor(() => expect(screen.getByText('sessionLimit')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'omittedList' }));
  expect(screen.getByText(/#1 · bbbbbbbb · sessionOmittedLimit/)).toBeVisible();
  expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeDisabled();
});

it('shows identified omitted PRs and keeps them visible after refresh', async () => {
  const omission = { number: 42, digest: 'd'.repeat(64), updatedAt: '2026-01-01T00:00:00Z', reason: 'record-oversized' };
  bridge.read.mockResolvedValueOnce({ ...page([version(1, 'a'.repeat(64))]), omitted: [omission], unlistedOmissions: 2 })
    .mockResolvedValueOnce(page([]));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('button', { name: 'omittedList' }));
  expect(screen.getByText(/#42 · dddddddd/)).toBeVisible();
  expect(screen.getByText('nativeOmittedUnlisted')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'refreshPrs' }));
  await waitFor(() => expect(bridge.read).toHaveBeenCalledTimes(2));
  expect(screen.getByText(/#42 · dddddddd/)).toBeVisible();
});

it('requires a fresh selection after an omitted conflicting version changes', async () => {
  const omission = (digest: string) => ({ number: 1, digest, updatedAt: '2026-01-01T00:00:00Z', reason: 'too-large' });
  bridge.read.mockResolvedValueOnce({ ...page([version(1, 'a'.repeat(64))]), conflicts: [1], omitted: [omission('b'.repeat(64))] })
    .mockResolvedValueOnce({ ...page([]), conflicts: [1], omitted: [omission('c'.repeat(64))] });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'refreshPrs' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'reviewSelected' })).toBeDisabled());
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it('cancels a clipboard fallback when the question changes during copying', async () => {
  bridge.read.mockResolvedValue(page([version(1, 'a'.repeat(64))]));
  let resolveCopy!: (copied: boolean) => void;
  bridge.copy.mockImplementationOnce(() => new Promise<boolean>(resolve => { resolveCopy = resolve; }));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  await waitFor(() => expect(bridge.copy).toHaveBeenCalledOnce());
  const options = bridge.copy.mock.calls[0][1] as { canFallback: () => boolean };
  expect(options.canFallback()).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), { target: { value: 'New question' } });
  expect(options.canFallback()).toBe(false);
  resolveCopy(false);
});

it.each(['receipt', 'remote'] as const)('refuses to copy when the %s cannot be verified', async failure => {
  bridge.read.mockResolvedValue(page([version(1, 'a'.repeat(64))]));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  if (failure === 'receipt') bridge.repositories.mockRejectedValueOnce(new Error('stale'));
  else bridge.repositories.mockResolvedValueOnce(['another/repository']);
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  expect(await screen.findByText('previewStale')).toBeVisible();
  expect(bridge.copy).not.toHaveBeenCalled();
});

it('does not copy after leaving the PR view while source verification is pending', async () => {
  bridge.read.mockResolvedValue(page([version(1, 'a'.repeat(64))]));
  let finish!: (repositories: string[]) => void;
  const view = render(<PublicPullInventory data={data} memory="test" active />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  bridge.repositories.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  view.rerender(<PublicPullInventory data={data} memory="test" active={false} />);
  finish(['a/b']);
  await waitFor(() => expect(screen.getByRole('button', { name: 'copyRequest' })).toBeEnabled());
  expect(bridge.copy).not.toHaveBeenCalled();
});

it('does not copy after the preparation scope is removed during source verification', async () => {
  bridge.read.mockResolvedValue(page([version(1, 'a'.repeat(64))]));
  let finish!: (repositories: string[]) => void;
  const view = render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  bridge.repositories.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'copyRequest' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  view.rerender(<PublicPullInventory data={{ ...data, snapshot: 'another-snapshot' }} memory="test" />);
  finish(['a/b']);
  await waitFor(() => expect(screen.getByRole('button', { name: 'readPrs' })).toBeVisible());
  expect(bridge.copy).not.toHaveBeenCalled();
});

it('retires preparation when a pending refresh changes the observed PRs', async () => {
  let finish!: (value: Inventory) => void;
  bridge.read.mockResolvedValueOnce(page([version(1, 'a'.repeat(64))]))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'refreshPrs' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: 'reviewSelected' }));
  expect(screen.getByRole('button', { name: 'copyRequest' })).toBeVisible();
  finish(page([version(2, 'b'.repeat(64))]));
  expect(await screen.findByText('previewStale')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'copyRequest' })).toBeNull();
  expect(bridge.copy).not.toHaveBeenCalled();
});

it('makes no public request until asked and opens only the chosen PR original', async () => {
  bridge.read.mockResolvedValue(page([version(1, 'a'), version(2, 'b')]));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  expect(bridge.read).toHaveBeenCalledTimes(1);
  expect(bridge.read.mock.calls[0][2]).toEqual({ action: 'start', cursor: null });
  expect(screen.getByText(/a\/b · publicChoice/)).toBeVisible();
  fireEvent.click(await screen.findByRole('button', { name: /PR 1/ }));
  expect(screen.getByText(/Author original/)).toBeVisible();
  expect(screen.getByText(/a\/b · publicChoice/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /PR 2/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'backToPrs' }));
  expect(await screen.findByRole('button', { name: /PR 2/ })).toBeVisible();
});

it('retains completed originals and explicitly continues after stopping a read', async () => {
  bridge.read.mockImplementationOnce((_data, _repo, _action, signal: AbortSignal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ ...page([version(1, 'a')], true), status: 'cancelled', reason: 'cancelled' }));
  })).mockResolvedValueOnce(page([version(2, 'b')]));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(screen.getByRole('button', { name: 'stop' }));
  fireEvent.click(await screen.findByRole('button', { name: 'prMore' }));
  await screen.findByRole('button', { name: /PR 2/ });
  expect(screen.getByRole('button', { name: /PR 1/ })).toBeVisible();
  expect(bridge.read.mock.calls[1][2]).toEqual({ action: 'more', cursor: 'cursor' });
});

it('exposes the active stop action when another briefing view hides the PR panel', async () => {
  bridge.read.mockImplementation((_data, _repo, _action, signal: AbortSignal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ ...page([version(1, 'a')], true), status: 'cancelled' }));
  }));
  let active: AbortController | null = null;
  const activity = (controller: AbortController | null) => { active = controller; };
  const view = render(<div><PublicPullInventory data={data} memory="test" onActivity={activity} /></div>);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  await waitFor(() => expect(active).not.toBeNull());
  view.rerender(<div hidden><PublicPullInventory data={data} memory="test" onActivity={activity} /></div>);
  (active as AbortController | null)?.abort();
  await waitFor(() => expect(active).toBeNull());
  view.rerender(<div><PublicPullInventory data={data} memory="test" onActivity={activity} /></div>);
  expect(await screen.findByRole('button', { name: /PR 1/ })).toBeVisible();
});

it('does not render a late response after the source or period scope changes', async () => {
  let finish!: (value: Inventory) => void;
  bridge.read.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<PublicPullInventory data={data} memory="test" />);
  const button = await screen.findByRole('button', { name: 'readPrs' });
  expect(bridge.read).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  view.rerender(<PublicPullInventory data={{ ...data, snapshot: 'next-period' }} memory="test" />);
  finish(page([version(1, 'a')]));
  expect(await screen.findByRole('button', { name: 'readPrs' })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('button', { name: /PR 1/ })).toBeNull());
});

it('does not cancel an active read when the same receipt is rendered again', async () => {
  let finish!: (value: Inventory) => void;
  bridge.read.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  const signal = bridge.read.mock.calls[0][3] as AbortSignal;
  view.rerender(<PublicPullInventory data={{ ...data }} memory="test" />);
  expect(signal.aborted).toBe(false);
  finish(page([version(1, 'a')]));
  expect(await screen.findByRole('button', { name: /PR 1/ })).toBeVisible();
});

it('retires the previous read when the chosen GitHub remote changes', async () => {
  bridge.repositories.mockResolvedValue(['a/b', 'c/d']);
  let finish!: (value: Inventory) => void;
  bridge.read.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<PublicPullInventory data={data} memory="test" />);
  const select = await screen.findByRole('combobox');
  fireEvent.click(select);
  fireEvent.click(await screen.findByRole('option', { name: 'a/b' }));
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  const signal = bridge.read.mock.calls[0][3] as AbortSignal;
  fireEvent.click(select);
  fireEvent.click(await screen.findByRole('option', { name: 'c/d' }));
  expect(signal.aborted).toBe(true);
  finish(page([version(1, 'a')]));
  await waitFor(() => expect(screen.queryByRole('button', { name: /PR 1/ })).toBeNull());
});

it('keeps conflicting versions distinguishable and surfaces omitted originals', async () => {
  bridge.read.mockResolvedValue({ ...page([version(1, 'aaaa1111'), version(1, 'bbbb2222')]), status: 'partial', conflicts: [1], unlistedOmissions: 1 });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  expect(await screen.findByText('originalsOmitted')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /PR 1.*aaaa1111/ }));
  expect(screen.getByText('versionConflict')).toBeVisible();
  expect(screen.getByText(/aaaa1111/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'backToPrs' }));
  expect(screen.getByRole('button', { name: /PR 1.*bbbb2222/ })).toBeVisible();
});

it('restores scoped originals on return without making another GitHub request', async () => {
  bridge.read.mockResolvedValue(page([version(1, 'a')], true));
  const first = render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  await screen.findByRole('button', { name: /PR 1/ });
  first.unmount();
  render(<PublicPullInventory data={data} memory="test" />);
  expect(await screen.findByRole('button', { name: /PR 1/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'prMore' })).toBeVisible();
  expect(bridge.read).toHaveBeenCalledTimes(1);
});

it('keeps originals but requests a new scan when navigation interrupts a continuation', async () => {
  let finish!: (value: Inventory) => void;
  bridge.read.mockResolvedValueOnce(page([version(1, 'a')], true))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  fireEvent.click(await screen.findByRole('button', { name: 'prMore' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  first.unmount();
  render(<PublicPullInventory data={data} memory="test" />);
  expect(await screen.findByRole('button', { name: /PR 1/ })).toBeVisible();
  expect(screen.getByText('restartRead')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'prMore' })).toBeNull();
  finish(page([version(2, 'b')]));
  await waitFor(() => expect(screen.queryByRole('button', { name: /PR 2/ })).toBeNull());
});

it('lets the person explicitly clear session copies after hitting the shared limit', async () => {
  bridge.read.mockResolvedValue(page(Array.from({ length: 401 }, (_, index) => version(index + 1, String(index)))));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  expect(await screen.findByText('sessionLimit')).toBeVisible();
  expect(screen.getByRole('button', { name: 'refreshPrs' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'clearSessionResults' }));
  expect(screen.queryByRole('button', { name: /PR 1/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'readPrs' })).toBeEnabled();
  expect(bridge.read).toHaveBeenCalledTimes(1);
});

it('distinguishes an unavailable public read from an empty PR result', async () => {
  bridge.read.mockResolvedValue({ ...page([]), status: 'unavailable', reason: 'unavailable' });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  expect(await screen.findByText('prUnavailablePublic')).toBeVisible();
  expect(screen.queryByText('prEmpty')).toBeNull();
  expect(screen.getByRole('button', { name: 'refreshPrs' })).toBeEnabled();
});

it('retains earlier originals and reports an unavailable refresh', async () => {
  bridge.read.mockResolvedValueOnce(page([version(1, 'a')]))
    .mockResolvedValueOnce({ ...page([]), status: 'unavailable', reason: 'unavailable' });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  await screen.findByRole('button', { name: /PR 1/ });
  fireEvent.click(screen.getByRole('button', { name: 'refreshPrs' }));
  expect(await screen.findByText('prUnavailablePublic')).toBeVisible();
  expect(screen.getByRole('button', { name: /PR 1/ })).toBeVisible();
});

it('reports a later-page network failure while preserving pages read in the same request', async () => {
  bridge.read.mockResolvedValue({ ...page([version(1, 'a')], true), status: 'partial', reason: 'unavailable' });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  expect(await screen.findByText('prUnavailablePublic')).toBeVisible();
  expect(screen.getByRole('button', { name: /PR 1/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'prMore' })).toBeVisible();
});

it('recovers local remote detection without sending a PR request', async () => {
  bridge.repositories.mockReset();
  bridge.repositories.mockRejectedValueOnce(new Error('unreadable')).mockResolvedValueOnce(['a/b']);
  render(<PublicPullInventory data={data} memory="test" />);
  expect(await screen.findByText('remoteReadFailed')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'retryRemotes' }));
  expect(await screen.findByRole('button', { name: 'readPrs' })).toBeVisible();
  expect(bridge.read).not.toHaveBeenCalled();
});

it('offers a validated GitHub link when a page cannot be read at its smallest size', async () => {
  bridge.read.mockResolvedValue({ ...page([]), status: 'partial', reason: 'scan-cannot-continue' });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  const link = await screen.findByRole('link', { name: 'openPrsOnGitHub' });
  expect(link).toHaveAttribute('href', 'https://github.com/a/b/pulls');
  link.focus();
  expect(link).toHaveFocus();
});

it('never constructs a GitHub recovery link from an unsafe remote value', async () => {
  bridge.repositories.mockResolvedValue(['a/../attacker']);
  bridge.read.mockResolvedValue({ ...page([]), status: 'partial', reason: 'scan-cannot-continue' });
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  await screen.findByText('scanCannotContinue');
  expect(screen.queryByRole('link', { name: 'openPrsOnGitHub' })).toBeNull();
});

it('finds a PR beyond the first page and returns to the same filtered row', async () => {
  bridge.read.mockResolvedValue(page(Array.from({ length: 60 }, (_, index) => version(index + 1, String(index)))));
  render(<PublicPullInventory data={data} memory="test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'readPrs' }));
  const search = await screen.findByRole('textbox', { name: 'findPr' });
  fireEvent.change(search, { target: { value: '#60' } });
  const row = screen.getByRole('button', { name: /PR 60/ });
  fireEvent.click(row);
  expect(screen.getByText(/Author original/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'backToPrs' }));
  expect(screen.getByRole('textbox', { name: 'findPr' })).toHaveValue('#60');
  await waitFor(() => expect(screen.getByRole('button', { name: /PR 60/ })).toHaveFocus());
  fireEvent.change(screen.getByRole('textbox', { name: 'findPr' }), { target: { value: 'nothing matches' } });
  expect(screen.getByText('noPrMatch')).toBeVisible();
});
