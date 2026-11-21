import { afterEach, describe, expect, it, vi } from 'vitest';

import { installInvoke as installInvokeCalls, resetTauriApiMock } from '../../../../../tests/helpers/tauri-invoke-calls';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import { inspectTauriProjectSource, inspectTauriProjectSourceContinuity } from './tauri-project-source';

const installInvoke = (handler: Parameters<typeof installInvokeCalls>[1]) =>
  installInvokeCalls(tauriApiMock, handler);

afterEach(() => resetTauriApiMock(tauriApiMock));

describe('tauri project source', () => {
  it('inspects a project source through the native command', async () => {
    const inspection = {
      rootPath: '/Users/me/repo',
      sourceId: 'sha256:source',
      kind: 'git' as const,
      revision: 'abc123',
      fingerprint: 'sha256:fingerprint',
      dirty: false,
      truncated: false,
      files: ['README.md', 'src/index.ts'],
    };
    const calls = installInvoke(({ command }) => {
      if (command === 'inspect_project_source') return inspection;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(inspectTauriProjectSource('/Users/me/repo/packages/app')).resolves.toEqual(
      inspection,
    );
    await inspectTauriProjectSource('/Users/me/repo', '/Users/me/repo/atlas');
    expect(calls).toEqual([
      {
        command: 'inspect_project_source',
        args: { rootPath: '/Users/me/repo/packages/app', vaultRoot: null },
      },
      {
        command: 'inspect_project_source',
        args: { rootPath: '/Users/me/repo', vaultRoot: '/Users/me/repo/atlas' },
      },
    ]);
  });

  it('requests only the fixed continuity scope from a vault slug', async () => {
    const inspection = {
      rootPath: '/Users/me/repo', sourceId: 'sha256:source', kind: 'git' as const,
      revision: 'abc123', fingerprint: 'sha256:continuity', dirty: false, truncated: false,
      files: ['src/index.ts'], scope: 'meaning-transition-continuity-v1' as const,
      exclusions: { target: 'docs/ontology/capabilities/refund.md', archivePrefix: 'docs/ontology/.ontology-atlas/meaning-transitions/' },
    };
    const calls = installInvoke(({ command }) => {
      if (command === 'inspect_project_source_continuity') return inspection;
      throw new Error(`unexpected command: ${command}`);
    });
    await expect(inspectTauriProjectSourceContinuity({
      sourceRoot: '/Users/me/repo', vaultRoot: '/Users/me/repo/docs/ontology', targetSlug: 'capabilities/refund',
    })).resolves.toEqual(inspection);
    expect(calls).toEqual([{ command: 'inspect_project_source_continuity', args: {
      sourceRoot: '/Users/me/repo', vaultRoot: '/Users/me/repo/docs/ontology', targetSlug: 'capabilities/refund',
    } }]);
  });
});
