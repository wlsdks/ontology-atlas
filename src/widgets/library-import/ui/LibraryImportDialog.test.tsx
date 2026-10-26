import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/ko.json';
import { createConnectorSetup } from '@/shared/lib/connectors/connector-setup';
import { createConnectorStore } from '@/shared/lib/connectors/connector-store';
import { LibraryImportDialog } from './LibraryImportDialog';
import type { ConnectorSecretStatus } from '@/shared/lib/connectors/tauri-connector-secrets';

const bridge = vi.hoisted(() => ({ available: true }));
const secretSet = vi.fn<(ref: string, value: string) => Promise<ConnectorSecretStatus | null>>();
const secretStatus = vi.fn<(ref: string) => Promise<ConnectorSecretStatus | null>>();
const resolveRuntimes = vi.fn();
vi.mock('@/shared/lib/connectors/tauri-connector-secrets', async (original) => ({
  ...await original<typeof import('@/shared/lib/connectors/tauri-connector-secrets')>(),
  isConnectorSecretBridgeAvailable: () => bridge.available,
  connectorSecretSet: (ref: string, value: string) => secretSet(ref, value),
  connectorSecretStatus: (ref: string) => secretStatus(ref),
}));
vi.mock('@/shared/lib/connectors/tauri-connector-runtimes', () => ({
  resolveConnectorRuntimes: () => resolveRuntimes(),
  runtimePath: (runtimes: Array<{ name: string; path: string | null }> | null, name: string) =>
    runtimes?.find((runtime) => runtime.name === name)?.path ?? null,
}));

function draw(options: Partial<Parameters<typeof LibraryImportDialog>[0]> = {}, write?: (text: string) => Promise<void>) {
  let text: string | null = null;
  const writes: string[] = [];
  const store = createConnectorStore({ read: async () => text, write: async (next) => {
    writes.push(next); await write?.(next); text = next;
  } });
  const approve = vi.fn(() => true);
  const setup = createConnectorSetup(store, { current: () => true, approved: () => false, approve });
  const callbacks = { onSetupSaved: vi.fn(), onAddFiles: vi.fn(), onClose: vi.fn(), onBrief: vi.fn<(brief: string) => void>(), onOpenAdvanced: vi.fn() };
  const props = { open: true, setup, ...callbacks, canRunAgent: true, agentGap: 'runtime' as const, ...options };
  const tree = (next: Parameters<typeof LibraryImportDialog>[0]) => <NextIntlClientProvider locale="ko" messages={messages}><LibraryImportDialog {...next} /></NextIntlClientProvider>;
  const view = render(tree(props));
  const replace = (next: Partial<Parameters<typeof LibraryImportDialog>[0]>) => view.rerender(tree({ ...props, ...next }));
  return { ...props, ...callbacks, writes, approve, store, view, replace };
}
const pick = (id = 'notion') => fireEvent.click(screen.getAllByTestId('library-import-service').find((tile) => tile.dataset.service === id)!);
const enter = async () => {
  pick();
  fireEvent.change(screen.getByTestId('library-import-token'), { target: { value: 'ntn_test_value' } });
  await waitFor(() => expect(screen.getByTestId('library-import-connect')).toBeEnabled());
};
const save = () => fireEvent.click(screen.getByTestId('library-import-connect'));

beforeEach(() => {
  bridge.available = true;
  secretSet.mockReset(); secretStatus.mockReset(); resolveRuntimes.mockReset();
  secretSet.mockImplementation(async (secretRef) => ({ secretRef, stored: true, last4: 'alue' }));
  secretStatus.mockImplementation(async (secretRef) => ({ secretRef, stored: true, last4: 'alue' }));
  resolveRuntimes.mockResolvedValue([{ name: 'npx', path: '/opt/homebrew/bin/npx' }]);
});

describe('service setup', () => {
  it('admits one save while a folder write is pending and keeps Close available', async () => {
    const { writes } = draw({}, () => new Promise(() => {}));
    await enter(); save(); save();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.getByTestId('library-import-connect')).toBeDisabled();
    expect(screen.getByTestId('library-import-connect')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('library-import-token')).toBeDisabled();
    expect(screen.getByTestId('library-import-close')).toBeEnabled();
    expect(screen.getByTestId('library-import-pending')).toHaveFocus();
  });
  it.each(['rejected', 'unavailable', 'not-stored', 'wrong-ref'] as const)('preserves input and refuses completion when the credential receipt is %s', async (failure) => {
    if (failure === 'rejected') secretSet.mockRejectedValueOnce(new Error('redacted'));
    else secretSet.mockImplementationOnce(async (ref) => failure === 'unavailable' ? null : { secretRef: failure === 'wrong-ref' ? 'other' : ref, stored: failure !== 'not-stored', last4: null });
    const { approve, writes } = draw(); await enter(); save();
    expect(await screen.findByTestId('library-import-failed')).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('library-import-connected')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-import-token')).toHaveValue('ntn_test_value');
    expect(JSON.parse(writes[0]!).connectors[0].enabled).toBe(false);
    expect(approve).not.toHaveBeenCalled();
  });
  it('does not continue a delayed save after Close', async () => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const { writes, approve } = draw({}, () => held); await enter(); save();
    await waitFor(() => expect(writes).toHaveLength(1));
    fireEvent.click(screen.getByTestId('library-import-close'));
    await act(async () => { finish(); });
    expect(secretSet).not.toHaveBeenCalled(); expect(approve).not.toHaveBeenCalled();
    expect(screen.queryByTestId('library-import-connected')).not.toBeInTheDocument();
  });
  it('stages disabled metadata, confirms the token, then enables and approves the exact saved row', async () => {
    const { writes, approve } = draw(); await enter(); save();
    await screen.findByTestId('library-import-connected');
    const [staged, active] = writes.map((text) => JSON.parse(text).connectors[0]);
    expect(staged.enabled).toBe(false); expect(active.enabled).toBe(true);
    expect(staged.id).toBe(active.id); expect(active.command).toBe('/opt/homebrew/bin/npx');
    expect(active.origin).toBe('library-import:notion');
    expect(writes.join('')).not.toContain('ntn_test_value');
    expect(approve).toHaveBeenCalledExactlyOnceWith(active);
    expect(screen.getByTestId('library-import-what')).toHaveFocus();
  });
  it('retries activation on the same row without asking for or writing the confirmed token again', async () => {
    let fail = true;
    const { writes, approve } = draw({}, async (text) => {
      if (JSON.parse(text).connectors[0].enabled && fail) throw new Error('read only');
    });
    await enter(); save(); await screen.findByTestId('library-import-failed');
    expect(screen.queryByTestId('library-import-token')).not.toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled(); fail = false; save();
    await screen.findByTestId('library-import-connected');
    expect(secretSet).toHaveBeenCalledTimes(1);
    expect(new Set(writes.map((text) => JSON.parse(text).connectors[0].id)).size).toBe(1);
  });
  it('keeps input when the folder write throws', async () => {
    draw({}, async () => { throw new Error('unavailable'); }); await enter(); save();
    await screen.findByTestId('library-import-failed');
    expect(screen.getByTestId('library-import-token')).toHaveValue('ntn_test_value');
    expect(secretSet).not.toHaveBeenCalled();
  });
  it('restores the selected tile on Back and clears sensitive input', async () => {
    draw(); await enter(); expect(screen.getByTestId('library-import-token')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /^뒤로$/ }));
    expect(screen.getAllByTestId('library-import-service').find((tile) => tile.dataset.service === 'notion')).toHaveFocus();
    pick('github'); expect(screen.getByTestId('library-import-token')).toHaveValue('');
  });
  it('waits for runtime readiness and offers recovery when the runtime is missing', async () => {
    let finish!: (value: unknown) => void;
    resolveRuntimes.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { writes } = draw(); pick();
    fireEvent.change(screen.getByTestId('library-import-token'), { target: { value: 'test' } });
    expect(screen.getByTestId('library-import-connect')).toBeDisabled();
    await act(async () => { finish([{ name: 'npx', path: null }]); });
    await screen.findByTestId('library-import-failed'); expect(writes).toHaveLength(0);
    expect(screen.getByTestId('library-import-connect')).toBeDisabled();
  });
  it('offers browser remedies without token collection, writes or secret lookups', async () => {
    bridge.available = false;
    const { onAddFiles, onClose, writes } = draw(); pick();
    expect(screen.getByTestId('library-import-web-setup')).toBeInTheDocument();
    expect(screen.queryByTestId('library-import-token')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-import-connect')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-import-no-agent-app')).toHaveAttribute('href', expect.stringContaining('/download'));
    fireEvent.click(screen.getByTestId('library-import-add-files'));
    expect(onClose).toHaveBeenCalledBefore(onAddFiles); expect(writes).toHaveLength(0);
    expect(secretStatus).not.toHaveBeenCalled(); expect(secretSet).not.toHaveBeenCalled();
  });
  it('hands a bounded document request to the agent only after an explicit Bring press', async () => {
    const { onBrief, onClose } = draw(); await enter(); save(); await screen.findByTestId('library-import-connected');
    expect(onBrief).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('library-import-what'), { target: { value: 'API 설계 문서' } });
    fireEvent.click(screen.getByTestId('library-import-bring'));
    expect(onBrief).toHaveBeenCalledOnce();
    const brief = onBrief.mock.calls[0]![0];
    for (const part of ['sources/notion/', 'at most 20', 'API 설계 문서', 'Do not write anything before I answer']) expect(brief).toContain(part);
    expect(onClose).toHaveBeenCalled();
  });
  it('provides the runtime remedy when the setup is saved without a ready coding tool', async () => {
    draw({ canRunAgent: false }); await enter(); save(); await screen.findByTestId('library-import-connected');
    expect(screen.queryByTestId('library-import-bring')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-import-runtime')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-import-no-agent-app')).toHaveAttribute('href', expect.stringContaining('/agents'));
  });
  it('closes before opening the advanced service settings', () => {
    const { onClose, onOpenAdvanced } = draw(); pick('other'); expect(onClose).toHaveBeenCalledBefore(onOpenAdvanced);
  });
});


describe('folder replacement', () => {
  const nextSetup = () => createConnectorSetup(createConnectorStore({ read: async () => null, write: async () => {} }), {
    current: () => true, approved: () => false, approve: () => true,
  });
  it('clears the old token and starts service selection when the captured folder changes', async () => {
    const f = draw(); await enter();
    f.replace({ setup: nextSetup() });
    expect(screen.queryByTestId('library-import-token')).not.toBeInTheDocument();
    pick();
    expect(screen.getByTestId('library-import-token')).toHaveValue('');
  });
  it('cannot hand a completed setup from the previous folder to the next folder agent', async () => {
    const f = draw(); await enter(); save(); await screen.findByTestId('library-import-connected');
    const nextBrief = vi.fn(); f.replace({ setup: nextSetup(), onBrief: nextBrief });
    expect(screen.queryByTestId('library-import-connected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-import-bring')).not.toBeInTheDocument();
    expect(nextBrief).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('library-import-service')).toHaveLength(3);
  });
});


it('focuses Resume when a confirmed token removes the credential field', async () => {
  let fail = true;
  draw({}, async (text) => { if (JSON.parse(text).connectors[0].enabled && fail) throw new Error('read only'); });
  await enter(); save(); await screen.findByTestId('library-import-failed');
  fireEvent.click(screen.getByRole('button', { name: /^뒤로$/ })); pick();
  await waitFor(() => expect(screen.getByTestId('library-import-connect')).toBeEnabled());
  await waitFor(() => expect(screen.getByTestId('library-import-connect')).toHaveFocus());
  expect(screen.queryByTestId('library-import-token')).not.toBeInTheDocument();
  fail = false;
  save(); await screen.findByTestId('library-import-connected');
});
