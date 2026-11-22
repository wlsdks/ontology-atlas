import { describe, expect, it } from 'vitest';

import {
  canChooseConstructionSource,
  canConstructLocally,
  runnablePreview,
  constructionResourceKey,
  previewMatchesRequest,
  type ConstructionSourceSelection,
} from './construction-source';

const preview = {
  sourcePath: '/src',
  destinationPath: '/vault',
  fingerprint: 'f',
  files: [{ path: 'a.ts', bytes: 1 }],
  limited: false,
  excluded: [],
};

describe('canConstructLocally', () => {
  const local = { baseUrl: 'http://localhost:11434/v1', model: 'llama' };

  it('allows only a model on this computer, reached by a local address', () => {
    expect(canConstructLocally('local', local)).toBe(true);
    expect(canConstructLocally('local', { ...local, baseUrl: 'http://127.0.0.1:8080' })).toBe(true);
  });

  it('refuses a vendor key, a missing model, and any address that leaves the machine', () => {
    expect(canConstructLocally('anthropic', local)).toBe(false);
    expect(canConstructLocally(null, null)).toBe(false);
    expect(canConstructLocally('local', null)).toBe(false);
    expect(canConstructLocally('local', { ...local, model: '' })).toBe(false);
    expect(canConstructLocally('local', { ...local, baseUrl: 'https://api.example.com/v1' })).toBe(false);
    expect(canConstructLocally('local', { ...local, baseUrl: 'http://user:pw@localhost:1/v1' })).toBe(false);
  });
});

describe('previewMatchesRequest', () => {
  it('accepts a preview only for the source and folder that were asked for', () => {
    expect(previewMatchesRequest(preview, '/src', '/vault')).toBe(true);
    expect(previewMatchesRequest(preview, '/other', '/vault')).toBe(false);
    expect(previewMatchesRequest(preview, '/src', '/elsewhere')).toBe(false);
  });
});

describe('canChooseConstructionSource', () => {
  const idle = { bridgeAvailable: true, running: false, applying: false };

  it('needs the app and a quiet agent', () => {
    expect(canChooseConstructionSource(idle)).toBe(true);
    expect(canChooseConstructionSource({ ...idle, bridgeAvailable: false })).toBe(false);
    expect(canChooseConstructionSource({ ...idle, running: true })).toBe(false);
    expect(canChooseConstructionSource({ ...idle, applying: true })).toBe(false);
  });
});

describe('runnablePreview', () => {
  const ready: ConstructionSourceSelection = { nonce: 1, status: 'preview', preview };

  it('returns a shown preview that has files, while the agent is idle', () => {
    expect(runnablePreview(ready, false)).toBe(preview);
  });

  it('returns nothing for any other selection or while the agent runs', () => {
    expect(runnablePreview(ready, true)).toBeNull();
    expect(runnablePreview(null, false)).toBeNull();
    expect(runnablePreview({ nonce: 1, status: 'preparing' }, false)).toBeNull();
    expect(runnablePreview({ ...ready, preview: { ...preview, files: [] } }, false)).toBeNull();
  });
});

describe('constructionResourceKey', () => {
  const base = { vaultPath: '/vault', provider: 'local' as const, localEndpoint: { baseUrl: 'http://localhost:1', model: 'm' }, open: true };

  it('changes whenever anything a pending choice depends on changes', () => {
    const key = constructionResourceKey(base);
    expect(constructionResourceKey({ ...base })).toBe(key);
    expect(constructionResourceKey({ ...base, vaultPath: '/other' })).not.toBe(key);
    expect(constructionResourceKey({ ...base, provider: 'anthropic' })).not.toBe(key);
    expect(constructionResourceKey({ ...base, localEndpoint: { ...base.localEndpoint, model: 'n' } })).not.toBe(key);
    expect(constructionResourceKey({ ...base, localEndpoint: { ...base.localEndpoint, baseUrl: 'http://localhost:2' } })).not.toBe(key);
    expect(constructionResourceKey({ ...base, open: false })).not.toBe(key);
  });
});
