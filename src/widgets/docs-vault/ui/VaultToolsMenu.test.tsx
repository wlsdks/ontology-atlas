import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { copyText } from '@/shared/lib/copy-text';
import { TooltipProvider } from '@/shared/ui';
import { VaultToolsMenu } from './VaultToolsMenu';

vi.mock('@/shared/lib/copy-text', () => ({
  copyText: vi.fn(),
}));

const copyTextMock = vi.mocked(copyText);

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TooltipProvider>{ui}</TooltipProvider>
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
      onOpenWorkflowGuide={vi.fn()}
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
    expect(screen.getByText('설정 파일 1/3개 준비됨')).toBeInTheDocument();
    expect(screen.getByText('다음: .mcp.json 만들기')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'AI agent 설정 다음 단계' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('이 vault 안의 MCP / Codex 설정 파일을 만들거나 점검합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Claude Code, Cursor, Codex를 vault 폴더 또는 codebase root에서 다시 시작합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('수정 전에 JSON gate를 실행하고 ok와 performanceOk를 따로 확인합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('AI agent 사용 모드 선택 기준'),
    ).toBeInTheDocument();
    expect(screen.getByText('CLI만 사용')).toBeInTheDocument();
    expect(screen.getByText('MCP 연결')).toBeInTheDocument();
    expect(screen.getByText('Graph DB pack')).toBeInTheDocument();
    expect(
      screen.getByLabelText('자동화 JSON gate 결과 해석'),
    ).toBeInTheDocument();
    expect(screen.getByText('ok=false')).toBeInTheDocument();
    expect(screen.getByText('perf=false')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
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
    expect(screen.getByText('설정 파일 3/3개 준비됨')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '누락된 agent 설정 만들기' }),
    ).not.toBeInTheDocument();
  });

  it('AI agent 설정 파일이 있어도 oh-my-ontology MCP 설정이 아니면 점검 대상으로 표시한다', () => {
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
        mcpJsonValid: true,
        codexConfigValid: false,
        mcpExampleValid: true,
      },
    });

    expect(screen.getByText('누락')).toBeInTheDocument();
    expect(screen.getByText('설정 파일 2/3개 준비됨')).toBeInTheDocument();
    expect(
      screen.getByText('점검: .codex/config.toml 가 oh-my-ontology MCP 설정이 아닙니다'),
    ).toBeInTheDocument();
    expect(screen.getByText('점검 필요')).toBeInTheDocument();
    expect(
      screen.getByText(
        '기존 설정 파일은 자동으로 덮어쓰지 않습니다. 설정 패킷이나 codebase-root 템플릿을 복사해 점검 대상 파일을 직접 교체하세요.',
      ),
    ).toBeInTheDocument();
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
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('performanceOk=false'),
    );
    expect(
      await screen.findByRole('button', { name: '검증 프롬프트 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 기능 문서를 열 수 있다', () => {
    const onOpenWorkflowGuide = vi.fn();
    const localVault = makeLocalVault({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });
    render(
      <VaultToolsMenu
        view="doc"
        onViewChange={vi.fn()}
        folderTopoStatus="idle"
        canEditCurrent
        localVault={localVault}
        validationSummary={null}
        onCreateNewDoc={vi.fn()}
        onOpenWorkflowGuide={onOpenWorkflowGuide}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '기능 문서 열기' }));

    expect(onOpenWorkflowGuide).toHaveBeenCalledTimes(1);
  });

  it('AI agent 설정 패널에서 전체 setup packet 을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '설정 패킷 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology agent setup packet'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Mode chooser:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('CLI-only: use validate, workspace-brief'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('MCP-connected: let Claude Code, Codex, or Cursor call 23 tools'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Graph DB pack: use bounded query plans'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('JSON gate result rules:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ok=false: setup or fallback command execution is broken'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ok=true and performanceOk=false'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology agent-setup'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('--root'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('--write'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('docs/AGENT-GRAPH-WORKFLOW.md'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"oh-my-ontology-mcp"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('[mcp_servers.oh-my-ontology]'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('codex mcp add oh-my-ontology'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('validate_vault'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology mcp-verify . --timeout-ms 15000'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('<absolute path to your team-vault folder>'),
    );
    expect(
      await screen.findByRole('button', { name: '설정 패킷 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 codebase-root agent-setup 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'agent-setup 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
    );
    expect(
      await screen.findByRole('button', {
        name: 'agent-setup 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 CLI graph runbook 을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'CLI 그래프 runbook 복사' }),
    );

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
      expect.stringContaining('oh-my-ontology agent-brief . --graph-db-pack'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology agent-brief . --verify-fallbacks'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology hubs . --plan --limit 10 --types depends_on,relates'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology hubs . --limit 10 --types depends_on,relates'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology mcp-verify . --timeout-ms 15000'),
    );
    expect(
      screen.getByRole('list', { name: '복사되는 CLI 그래프 runbook 미리보기' }),
    ).toBeInTheDocument();
    expect(screen.getByText('oh-my-ontology agent-brief . --graph-db-pack')).toBeInTheDocument();
    expect(screen.getByText('oh-my-ontology agent-brief . --verify-fallbacks')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'CLI 그래프 runbook 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 자동화 JSON gate 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    const agentSetup = screen.getByRole('region', { name: 'AI agent 설정 상태' });
    fireEvent.click(
      within(agentSetup).getByRole('button', { name: '자동화 JSON gate 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      'oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
    );
    expect(screen.getByText('자동화 gate')).toBeInTheDocument();
    expect(
      screen.getByText(
        'oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'JSON gate 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 codebase-root MCP JSON 템플릿을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'codebase-root MCP JSON 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"oh-my-ontology"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('<absolute path to your team-vault folder>'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"oh-my-ontology-mcp"'),
    );
    expect(
      await screen.findByRole('button', {
        name: 'MCP JSON 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 codebase-root Codex TOML 템플릿을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'codebase-root Codex TOML 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('[mcp_servers.oh-my-ontology]'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'OMOT_VAULT = "<absolute path to your team-vault folder>"',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('args = ["-y", "oh-my-ontology-mcp"]'),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Codex TOML 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 Codex mcp add 한 줄 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Codex mcp add 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('codex mcp add oh-my-ontology'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "OMOT_VAULT='<absolute path to your team-vault folder>'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('npx -y oh-my-ontology-mcp'),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Codex 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });
});
