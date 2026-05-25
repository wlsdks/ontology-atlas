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
  props: Partial<Pick<React.ComponentProps<typeof VaultToolsMenu>, 'validationSummary'>> = {},
) {
  const localVault = makeLocalVault(overrides);
  render(
    <VaultToolsMenu
      view="doc"
      onViewChange={vi.fn()}
      folderTopoStatus="idle"
      canEditCurrent
      localVault={localVault}
      validationSummary={props.validationSummary ?? null}
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
      screen.getByText('agent root에서 mcp-verify를 실행해 로컬 23개 tool 연결을 증명합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('첫 ontology write 전에 workspace-brief와 agent-brief를 읽습니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('AI agent setup gate 증거'),
    ).toBeInTheDocument();
    expect(screen.getByText('vault')).toBeInTheDocument();
    expect(screen.getByText('이 로컬 vault에서 문서 1개 로드됨')).toBeInTheDocument();
    expect(screen.getByText('health')).toBeInTheDocument();
    expect(screen.getByText('이 패널에 validation 결과가 아직 없습니다')).toBeInTheDocument();
    expect(screen.getByText('configs')).toBeInTheDocument();
    expect(screen.getByText('agent root')).toBeInTheDocument();
    expect(
      screen.getByText('다른 codebase root에서 Claude Code나 Codex를 열기 전 설정 패킷을 복사'),
    ).toBeInTheDocument();
    expect(screen.getByText('json gate')).toBeInTheDocument();
    expect(screen.getByText('수정 전 agent root에서 JSON gate를 복사해 실행')).toBeInTheDocument();
    expect(screen.getByLabelText('첫 연결 증거 계약')).toBeInTheDocument();
    expect(screen.getByText('config_state')).toBeInTheDocument();
    expect(
      screen.getByText(
        'agent-setup --json 으로 root별 Claude Code / Cursor / Codex 설정 준비 상태를 repair 전에 확인합니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('mcp_verify')).toBeInTheDocument();
    expect(
      screen.getByText('mcp-verify 로 local MCP server boot, 23개 tool 목록, target vault 읽기를 증명합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('json_gate')).toBeInTheDocument();
    expect(
      screen.getByText('agent-brief --verify-fallbacks --json 이 수정 전 ok와 performanceOk를 보고합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('graph_briefs')).toBeInTheDocument();
    expect(
      screen.getByText('workspace-brief 와 agent-brief --graph-db-pack 이 같은 local vault 를 설명합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('AI agent 사용 모드 선택 기준'),
    ).toBeInTheDocument();
    expect(screen.getByText('CLI만 사용')).toBeInTheDocument();
    expect(screen.getByText('MCP 연결')).toBeInTheDocument();
    expect(screen.getByText('Graph DB pack')).toBeInTheDocument();
    expect(screen.getByText('Setup gate')).toBeInTheDocument();
    expect(
      screen.getByText('설정이 애매하거나 codebase root에서 agent를 열었을 때 JSON readiness와 performanceOk를 먼저 확인합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('자동화 JSON gate 결과 해석'),
    ).toBeInTheDocument();
    expect(screen.getByText('ok=false')).toBeInTheDocument();
    expect(screen.getByText('perf=false')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('코드 변경 후')).toBeInTheDocument();
    expect(
      screen.getByText(
        'non-trivial 변경이 domain, capability, element, relation을 도입하거나 이름을 바꾸면 끝내기 전에 docs/ontology를 sync합니다. 오타, 주석, style-only, lint config, fixture-only 변경은 건너뜁니다.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'sync gate 복사' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '설정 상태 확인 명령 복사' }),
    ).toBeInTheDocument();
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

  it('AI agent setup gate proof에 validation 결과를 반영한다', () => {
    renderMenu(
      {
        agentConfigStatus: {
          mcpJson: true,
          codexConfig: true,
          mcpExample: true,
        },
      },
      { validationSummary: { errorCount: 0, warningCount: 2 } },
    );

    expect(screen.getByText('validation 경고 2개 점검 필요')).toBeInTheDocument();
    expect(
      screen.getByText('Claude Code / Cursor / Codex 설정 파일 준비됨'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('vault 폴더에서 재시작하거나, 다른 codebase root에서는 템플릿을 복사해 사용'),
    ).toBeInTheDocument();
  });

  it('AI agent setup gate proof에서 validation 오류를 agent 수정 차단으로 표시한다', () => {
    renderMenu(
      {
        agentConfigStatus: {
          mcpJson: true,
          codexConfig: true,
          mcpExample: true,
        },
      },
      { validationSummary: { errorCount: 1, warningCount: 0 } },
    );

    expect(screen.getByText('validation 오류 1개가 agent 수정을 막음')).toBeInTheDocument();
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
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('After any non-trivial code change, sync docs/ontology before finishing'),
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
      expect.stringContaining('Root check:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Agent root: <absolute path to your codebase root>'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Ontology vault: <absolute path to your team-vault folder>'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Run the setup gate from the agent root'),
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
      expect.stringContaining('First-contact proof contract:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Config state: agent-setup --json reports root-specific'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('MCP verify: mcp-verify can boot the local MCP server, list the 23 tools'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('JSON setup gate: agent-brief --verify-fallbacks --json returns ok/performanceOk'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Graph briefs: workspace-brief and agent-brief --graph-db-pack describe the same local vault'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('MCP-connected proof:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"workspace_brief","limit":5})'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"agent_brief","limit":5})'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"health","limit":5})'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"match_nodes","kind":"capability","minDegree":2,"sort":"degree","limit":10})'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ok=false: setup or fallback command execution is broken'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ok=true and performanceOk=false'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Post-change ontology sync:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('sync docs/ontology before finishing'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Skip sync for typos, comments, one-line style'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Read-first run order from a codebase root:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "1. Check config state: oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "2. Repair only if state reports missing configs: oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('3. Restart Claude Code / Cursor / Codex from the agent root.'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "4. Verify MCP tools: oh-my-ontology mcp-verify '<absolute path to your team-vault folder>' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "5. Gate fallback performance: oh-my-ontology agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "6. Read the graph: oh-my-ontology workspace-brief '<absolute path to your team-vault folder>' && oh-my-ontology agent-brief '<absolute path to your team-vault folder>' --prompt",
      ),
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
        'Machine-readable setup gate for automation from the codebase root:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Machine-readable setup gate when the vault folder is the current directory:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Machine-readable config state check before repair:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
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

  it('AI agent 설정 패널에서 codebase-root setup state 확인 명령을 먼저 복사한다', async () => {
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
      screen.getByRole('button', { name: '설정 상태 확인 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
    );
    expect(
      await screen.findByRole('button', {
        name: '설정 상태 확인 명령 복사됨',
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
      expect.stringContaining(
        'oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
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
    expect(screen.getByText('oh-my-ontology agent-brief . --verify-fallbacks --json')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'CLI 그래프 runbook 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 첫 연결 증거 패킷을 복사한다', async () => {
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
      screen.getByRole('button', { name: '첫 연결 증거 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology first-contact agent proof'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Setup gate:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "If setup state reports missing configs: oh-my-ontology agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Restart Claude Code / Cursor / Codex from the codebase root after repair.',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology mcp-verify '<absolute path to your team-vault folder>' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Read-first graph proof:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('MCP-connected proof:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"workspace_brief","limit":5})'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"agent_brief","limit":5})'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Use these MCP calls only after mcp-verify succeeds'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('CLI fallback proof:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology workspace-brief '<absolute path to your team-vault folder>'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology agent-brief '<absolute path to your team-vault folder>' --prompt",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology agent-brief '<absolute path to your team-vault folder>' --graph-db-pack",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('JSON gate result rules:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('First-contact proof contract:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Config state: agent-setup --json reports root-specific'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('MCP verify: mcp-verify can boot the local MCP server, list the 23 tools'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('JSON setup gate: agent-brief --verify-fallbacks --json returns ok/performanceOk'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Graph briefs: workspace-brief and agent-brief --graph-db-pack describe the same local vault'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Post-change ontology sync:'),
    );
    expect(
      await screen.findByRole('button', { name: '첫 연결 증거 복사됨' }),
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

  it('AI agent 설정 패널에서 post-change ontology sync gate를 독립적으로 복사한다', async () => {
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
      within(agentSetup).getByRole('button', { name: 'sync gate 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('# Post-change ontology sync gate'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('## MCP'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "health"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "maintenance_plan"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"tool": "validate_vault"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('## CLI fallback'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('oh-my-ontology validate [vault]'),
    );
    expect(
      await screen.findByRole('button', { name: 'sync gate 복사됨' }),
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
