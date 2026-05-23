import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { VaultToolsMenu } from './VaultToolsMenu';

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const manifest: VaultManifest = {
  version: 'test',
  generatedAt: '2026-05-23T00:00:00.000Z',
  docs: [
    {
      slug: 'project',
      path: 'project.md',
      title: 'Project',
      tags: [],
      frontmatter: { kind: 'project' },
      headings: [],
      excerpt: '',
      wordCount: 1,
      updatedAt: '2026-05-23T00:00:00.000Z',
      linksOut: [],
    },
  ],
  backlinksDetail: {},
  tags: {},
  tree: { name: '', path: '', type: 'dir', children: [] },
};

function makeLocalVault(
  overrides: Partial<React.ComponentProps<typeof VaultToolsMenu>['localVault']> = {},
): React.ComponentProps<typeof VaultToolsMenu>['localVault'] {
  return {
    status: 'loaded',
    handle: null,
    manifest,
    agentConfigStatus: {
      mcpJson: false,
      codexConfig: true,
      mcpExample: false,
    },
    errorMessage: null,
    lastLoadedAt: 1779498839000,
    scaffoldOntology: vi.fn().mockResolvedValue({ created: 0, skipped: 0 }),
    ensureAgentConfigs: vi.fn().mockResolvedValue({ created: 2, skipped: 1 }),
    open: vi.fn(),
    close: vi.fn(),
    refresh: vi.fn(),
    requestPermission: vi.fn(),
    ...overrides,
  };
}

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof VaultToolsMenu>['localVault']> = {},
) {
  const localVault = makeLocalVault(overrides);
  render(
    <VaultToolsMenu
      view="doc"
      onViewChange={vi.fn()}
      folderTopoStatus="idle"
      canEditCurrent
      localVault={localVault}
      validationSummary={null}
      onCreateNewDoc={vi.fn()}
    />,
  );
  return localVault;
}

describe('VaultToolsMenu', () => {
  it('로컬 vault의 AI agent 설정 누락 상태와 복구 버튼을 보여준다', async () => {
    const localVault = renderMenu();

    expect(
      screen.getByRole('region', { name: 'AI agent 설정 상태' }),
    ).toBeInTheDocument();
    expect(screen.getByText('누락')).toBeInTheDocument();
    expect(screen.getByText('.mcp.json')).toBeInTheDocument();
    expect(screen.getByText('.codex/config.toml')).toBeInTheDocument();
    expect(screen.getByText('.mcp.json.example')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '누락된 agent 설정 만들기' }),
    );

    await waitFor(() => expect(localVault.ensureAgentConfigs).toHaveBeenCalledTimes(1));
    expect(localVault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('AI agent 설정이 모두 있으면 준비됨으로 표시하고 복구 버튼을 숨긴다', () => {
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    expect(screen.getByText('준비됨')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '누락된 agent 설정 만들기' }),
    ).not.toBeInTheDocument();
  });
});
