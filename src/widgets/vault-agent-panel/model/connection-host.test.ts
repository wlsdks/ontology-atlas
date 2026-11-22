import { describe, expect, it } from 'vitest';

import { SECRET_PROVIDER_HOSTS } from '@/shared/lib/llm-connection/tauri-secrets';

import { connectionHost } from './connection-host';

describe('connectionHost', () => {
  it('names the vendor host for a stored key', () => {
    expect(connectionHost('anthropic', null)).toBe(SECRET_PROVIDER_HOSTS.anthropic);
    expect(connectionHost('openai', null)).toBe(SECRET_PROVIDER_HOSTS.openai);
  });

  it('names the typed address, not a vendor, for the address path', () => {
    const endpoint = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama' };
    expect(connectionHost('local', endpoint)).toBe('127.0.0.1:11434');
  });

  it('names nothing when no connection exists', () => {
    expect(connectionHost(null, null)).toBe('');
    expect(connectionHost('local', null)).toBe('');
  });
});
