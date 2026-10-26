import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({ secretStatus: vi.fn(), jevSecretStatus: vi.fn(), providers: ['openai'] }));
vi.mock('@/shared/lib/llm-connection/tauri-secrets', () => ({ isSecretBridgeAvailable: () => true, SECRET_PROVIDERS: bridge.providers, secretStatus: bridge.secretStatus }));
vi.mock('@/shared/lib/llm-connection/tauri-jev', () => ({ jevSecretStatus: bridge.jevSecretStatus }));
import { useAiConnection } from './use-ai-connection';
it('preserves newer save and clear results after a delayed initial keychain snapshot', async () => {
  let resolveSecret!: (status: unknown) => void;
  let resolveJev!: (status: unknown) => void;
  bridge.secretStatus.mockImplementation(() => new Promise(resolve => { resolveSecret = resolve; }));
  bridge.jevSecretStatus.mockImplementation(() => new Promise(resolve => { resolveJev = resolve; }));
  const { result } = renderHook(() => useAiConnection({ enabled: true, vaultHandle: null }));
  await waitFor(() => expect(resolveSecret).toBeTypeOf('function'));
  act(() => result.current.applyStatus('openai', { provider: 'openai', stored: false, last4: null }));
  await act(async () => resolveSecret({ provider: 'openai', stored: true, last4: 'old1' }));
  await waitFor(() => expect(resolveJev).toBeTypeOf('function'));
  act(() => result.current.applyJevStatus({ stored: true, last4: 'new2' }));
  await act(async () => resolveJev({ stored: false, last4: null }));
  await waitFor(() => expect(result.current.keysRead).toBe(true));
  expect(result.current.statuses.openai).toEqual({ provider: 'openai', stored: false, last4: null });
  expect(result.current.jevStatus).toEqual({ stored: true, last4: 'new2' });
});

it('publishes the model key before a delayed external-check lookup finishes', async () => {
  bridge.secretStatus.mockResolvedValue({ provider: 'openai', stored: false, last4: null });
  bridge.jevSecretStatus.mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useAiConnection({ enabled: true, vaultHandle: null }));
  await waitFor(() => expect(result.current.statuses.openai).toEqual({ provider: 'openai', stored: false, last4: null }));
  expect(result.current.keysRead).toBe(true);
  expect(result.current.jevRead).toBe(false);
});

it('publishes the external-check key before a delayed model lookup finishes', async () => {
  bridge.secretStatus.mockImplementation(() => new Promise(() => {}));
  bridge.jevSecretStatus.mockResolvedValue({ stored: false, last4: null });
  const { result } = renderHook(() => useAiConnection({ enabled: true, vaultHandle: null }));
  await waitFor(() => expect(result.current.jevStatus).toEqual({ stored: false, last4: null }));
  expect(result.current.keysRead).toBe(false);
  expect(result.current.jevRead).toBe(true);
});

it('makes an answered model key available without waiting for another provider', async () => {
  bridge.providers.push('anthropic');
  try {
    bridge.secretStatus.mockImplementation((provider) => provider === 'openai'
      ? new Promise(() => {})
      : Promise.resolve({ provider, stored: false, last4: null }));
    bridge.jevSecretStatus.mockResolvedValue({ stored: false, last4: null });
    const { result } = renderHook(() => useAiConnection({ enabled: true, vaultHandle: null }));
    await waitFor(() => expect(result.current.keyReads.anthropic).toBe(true));
    expect(result.current.statuses.anthropic).toEqual({ provider: 'anthropic', stored: false, last4: null });
    expect(result.current.keyReads.openai).toBe(false);
    expect(result.current.keysRead).toBe(false);
  } finally {
    bridge.providers.pop();
  }
});
