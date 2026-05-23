import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { copyText } from '@/shared/lib/copy-text';
import { VaultToolsMenu } from './VaultToolsMenu';

vi.mock('@/shared/lib/copy-text', () => ({
  copyText: vi.fn(),
}));

const copyTextMock = vi.mocked(copyText);

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
  beforeEach(() => {
    copyTextMock.mockReset();
  });

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

  it('AI agent 설정 패널에서 첫 연결 검증 프롬프트를 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '검증 프롬프트 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('validate_vault'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('workspace_brief'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('agent_brief'),
    );
    expect(
      await screen.findByRole('button', { name: '검증 프롬프트 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 CLI fallback 검증 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'CLI 검증 명령 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology validate .'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology workspace-brief .'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology agent-brief . --prompt'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology mcp-verify . --timeout-ms 15000'),
    );
    expect(
      await screen.findByRole('button', { name: 'CLI 검증 명령 복사됨' }),
    ).toBeInTheDocument();
  });
});
