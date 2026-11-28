import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type { VaultDoc } from '@/entities/docs-vault';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { ProjectSourceRuntime } from '@/features/project-source-binding';
import type { ProjectSourceInspection } from '@/shared/lib/vault-folder/native-vault/tauri-project-source';

import { HarnessConnectSource } from './HarnessConnectSource';

const nodes: KnowledgeGraphNode[] = [
  { id: 'project:music', kind: 'project', title: 'Music', agentSlug: 'music', projectIds: [], evidenceIds: ['music'], lastApprovedAt: new Date(0), lastApprovedBy: 'test' },
];
const docs: VaultDoc[] = [
  { slug: 'music', path: 'music.md', title: 'Music', tags: [], frontmatter: { kind: 'project', title: 'Music' }, updatedAt: '2026-08-02', linksOut: [] },
];
const inspection: ProjectSourceInspection = {
  rootPath: '/private/work/music',
  sourceId: 'source-music',
  kind: 'git',
  revision: 'abc123',
  fingerprint: 'git:abc123:clean',
  dirty: false,
  truncated: false,
  files: ['src/play.ts'],
};

vi.mock('@/features/vault-ontology', () => ({
  useOntologyInsight: () => ({ insight: { nodes }, error: null }),
}));

/** A folder handle that keeps only the `.ontology-atlas` sidecar files a binding writes. */
function sidecarOnlyHandle(): FileSystemDirectoryHandle {
  const files = new Map<string, string>();
  let sidecarDirectoryExists = false;
  const missing = () => new DOMException('not found', 'NotFoundError');
  return {
    getDirectoryHandle: async (_name: string, options?: { create?: boolean }) => {
      if (!sidecarDirectoryExists && !options?.create) throw missing();
      sidecarDirectoryExists = true;
      return {
        getFileHandle: async (name: string, fileOptions?: { create?: boolean }) => {
          if (!files.has(name) && !fileOptions?.create) throw missing();
          return {
            getFile: async () => {
              if (!files.has(name)) throw missing();
              return { text: async () => files.get(name)! };
            },
            createWritable: async () => {
              let text = '';
              return { write: async (chunk: string) => { text += chunk; }, close: async () => { files.set(name, text); } };
            },
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

function runtime(overrides: Partial<ProjectSourceRuntime>): ProjectSourceRuntime {
  return {
    pickRoot: async () => inspection.rootPath,
    inspect: async () => inspection,
    rootPathOf: () => null,
    now: () => '2026-08-02T12:00:00.000Z',
    restoreFocus: () => {},
    ...overrides,
  };
}

function renderStage(input: { projectSlug: string | null; runtime: ProjectSourceRuntime; onConnected?: () => void }) {
  return render(
    <IntlProvider locale="ko" messages={koMessages}>
      <HarnessConnectSource vaultHandle={sidecarOnlyHandle()} projectSlug={input.projectSlug} docs={docs} onConnected={input.onConnected ?? (() => {})} runtime={input.runtime} />
    </IntlProvider>,
  );
}

describe('the Harness tab with no connected repository', () => {
  it('names the repository that holds the opened folder and connects it in one press', async () => {
    const pickRoot = vi.fn(async () => inspection.rootPath);
    const onConnected = vi.fn();
    renderStage({ projectSlug: 'music', onConnected, runtime: runtime({ pickRoot, rootPathOf: () => '/private/work/music/docs/ontology' }) });

    const connect = await screen.findByTestId('harness-connect-found');
    expect(connect).toHaveTextContent('music');
    fireEvent.click(connect);

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(pickRoot).not.toHaveBeenCalled();
  });

  it('opens the folder picker in place when no repository holds the opened folder', async () => {
    const pickRoot = vi.fn(async () => inspection.rootPath);
    const onConnected = vi.fn();
    renderStage({ projectSlug: 'music', onConnected, runtime: runtime({ pickRoot }) });

    const pick = await screen.findByTestId('harness-connect-pick');
    await waitFor(() => expect(pick).toBeEnabled());
    expect(screen.queryByTestId('harness-connect-found')).toBeNull();
    fireEvent.click(pick);

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(pickRoot).toHaveBeenCalledTimes(1);
  });

  it('says so and keeps both ways open when the folder cannot be measured', async () => {
    const inspect = vi.fn(async (rootPath: string) => (rootPath === inspection.rootPath ? null : inspection));
    const onConnected = vi.fn();
    renderStage({ projectSlug: 'music', onConnected, runtime: runtime({ inspect, rootPathOf: () => '/private/work/music/docs/ontology' }) });

    fireEvent.click(await screen.findByTestId('harness-connect-found'));

    expect(await screen.findByTestId('harness-connect-error')).toHaveAttribute('data-failure-code', 'measurement_failed');
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.getByTestId('harness-connect-found')).toBeEnabled();
    expect(screen.getByTestId('harness-connect-pick')).toBeEnabled();
  });

  it('sends a folder with no recorded project to Projects, where a binding can be made', () => {
    renderStage({ projectSlug: null, runtime: runtime({}) });

    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('/projects'));
    expect(screen.queryByTestId('harness-connect-pick')).toBeNull();
    expect(screen.queryByText(koMessages.harness.noSourceNote), 'the two-folder note does not apply with none bound').toBeNull();
  });
});
