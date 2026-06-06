import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { copyText } from '@/shared/lib/copy-text';
import { openTauriVaultInFinder } from '@/shared/lib/tauri-vault-fs';
import { TooltipProvider } from '@/shared/ui';
import { VaultToolsMenu } from './VaultToolsMenu';

vi.mock('@/shared/lib/copy-text', () => ({
  copyText: vi.fn(),
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: (handle: FileSystemDirectoryHandle) =>
    (handle as unknown as { rootPath?: string }).rootPath,
  openTauriVaultInFinder: vi.fn(),
}));

const copyTextMock = vi.mocked(copyText);
const openTauriVaultInFinderMock = vi.mocked(openTauriVaultInFinder);

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
    recentVaults: [],
    open: vi.fn(),
    openRecent: vi.fn(),
    forgetRecent: vi.fn(),
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
    openTauriVaultInFinderMock.mockReset();
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
      screen.getByText('vault 폴더 기준 설정 · 다른 codebase root는 절대경로 연결 필요'),
    ).toBeInTheDocument();
    expect(screen.getByText('외부 agent 연결')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ontology Atlas 안에서 Claude Code, Codex, Cursor 채팅을 직접 여는 흐름이 아닙니다. 로컬 MCP 설정, 재시작 안내, 검증 gate를 준비해 각 agent가 자기 앱이나 터미널에서 같은 vault를 읽고 쓰게 합니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('설정 흐름 보기')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'AI agent 설정 다음 단계' }),
    ).not.toBeVisible();

    fireEvent.click(screen.getByText('설정 흐름 보기'));

    expect(
      screen.getByRole('list', { name: 'AI agent 설정 다음 단계' }),
    ).toBeVisible();
    expect(
      screen.getByText('이 vault 안의 MCP / Codex 설정 파일을 만들거나 점검합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Claude Code, Cursor, Codex를 vault 폴더 또는 codebase root에서 다시 시작합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Claude Code는 /mcp, Codex는 codex mcp list로 연결 상태를 확인합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('수정 전에 JSON gate를 실행하고 ok와 performanceOk를 따로 확인합니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('agent root에서 mcp-verify를 실행해 index_project 포함 로컬 24개 tool 연결을 증명합니다.'),
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
      screen.getByText('mcp-verify 로 local MCP server boot, index_project 포함 24개 tool 목록, target vault 읽기를 증명합니다.'),
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
      screen.getByText('Claude Code, Codex, Cursor가 index_project 포함 24개 tool을 직접 호출하고 구조화된 오류 복구와 write guardrail을 받습니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('MCP verify 명령 미리보기'),
    ).toHaveTextContent('ontology-atlas mcp-verify . --timeout-ms 15000');
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
    expect(screen.getByLabelText('AI agent root 실행 계약')).toBeInTheDocument();
    expect(screen.getByText('vault folder')).toBeInTheDocument();
    expect(
      screen.getByText('이 vault 폴더 자체를 agent root로 열면 verify와 graph brief 명령은 `.`을 vault로 사용합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('codebase root')).toBeInTheDocument();
    expect(
      screen.getByText('별도 제품 코드베이스에서 agent를 열면 설정 상태 확인, repair, mcp-verify, JSON gate 모두 이 vault의 절대경로를 명시합니다.'),
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

  it('Tauri 데스크톱 vault 경로를 표시하고 복사할 수 있다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'ontology',
        rootPath: '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
    });

    const copyPathButton = screen.getByRole('button', {
      name: '로컬 vault 경로 복사: /Users/jinan/side-project/ontology-atlas/docs/ontology',
    });

    expect(
      screen.getByText('/Users/jinan/side-project/ontology-atlas/docs/ontology'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('MCP verify 명령 미리보기'),
    ).toHaveTextContent(
      "ontology-atlas mcp-verify '/Users/jinan/side-project/ontology-atlas/docs/ontology' --timeout-ms 15000",
    );

    fireEvent.click(copyPathButton);

    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      );
    });
  });

  it('Tauri 데스크톱 vault를 Finder에서 열 수 있다', async () => {
    openTauriVaultInFinderMock.mockResolvedValue();
    renderMenu({
      handle: {
        name: 'ontology',
        rootPath: '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Finder에서 로컬 vault 열기: /Users/jinan/side-project/ontology-atlas/docs/ontology',
      }),
    );

    await waitFor(() => {
      expect(openTauriVaultInFinderMock).toHaveBeenCalledWith(
        '/Users/jinan/side-project/ontology-atlas/docs/ontology',
      );
    });
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

  it('AI agent별 MCP 연결 상태와 확인 명령을 분리해 보여준다', () => {
    renderMenu({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    const connections = screen.getByRole('list', {
      name: 'AI agent별 연결 상태',
    });

    expect(within(connections).getByText('Claude Code / Cursor')).toBeInTheDocument();
    expect(within(connections).getByText('/mcp로 확인')).toBeInTheDocument();
    expect(within(connections).getByText('Codex')).toBeInTheDocument();
    expect(within(connections).getByText('codex mcp list로 확인')).toBeInTheDocument();
    expect(within(connections).getByText('다른 codebase root')).toBeInTheDocument();
    expect(within(connections).getAllByText('설정 준비 · 연결 확인 필요')).toHaveLength(3);
    expect(
      screen.getByText('준비는 설정 파일 상태입니다. Ontology Atlas는 agent에 직접 접속하지 않으므로, 재시작 후 각 agent에서 실제 MCP 연결을 확인합니다.'),
    ).toBeInTheDocument();
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
      screen.getByText('이 vault의 .mcp.json / .codex는 OATLAS_VAULT=. 로 준비됨'),
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

  it('AI agent 설정 파일이 있어도 ontology-atlas MCP 설정이 아니면 점검 대상으로 표시한다', () => {
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
      screen.getByText('점검: .codex/config.toml 가 ontology-atlas MCP 설정이 아닙니다'),
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
      expect.stringContaining('ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4'),
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
      expect.stringContaining('ontology-atlas agent setup packet'),
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
      expect.stringContaining('MCP-connected: let Claude Code, Codex, or Cursor call 24 tools'),
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
      expect.stringContaining('MCP verify: mcp-verify can boot the local MCP server, list the 24 tools including index_project'),
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
        "1. Check config state: ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "2. Repair only if state reports missing configs: ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('3. Restart Claude Code / Cursor / Codex from the agent root.'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "4. Verify MCP tools: ontology-atlas mcp-verify '<absolute path to your team-vault folder>' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "5. Gate fallback performance: ontology-atlas agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "6. Read the graph: ontology-atlas workspace-brief '<absolute path to your team-vault folder>' && ontology-atlas agent-brief '<absolute path to your team-vault folder>' --prompt",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas agent-setup'),
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
      expect.stringContaining('"ontology-atlas-mcp"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('[mcp_servers.ontology-atlas]'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('codex mcp add ontology-atlas'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('validate_vault'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas mcp-verify . --timeout-ms 15000'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Machine-readable setup gate for automation from the codebase root:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Machine-readable setup gate when the vault folder is the current directory:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Machine-readable config state check before repair:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('<absolute path to your team-vault folder>'),
    );
    expect(
      await screen.findByRole('button', { name: '설정 패킷 복사됨' }),
    ).toBeInTheDocument();
  });

  it('Tauri vault 경로가 있으면 setup packet 이 selected path 를 사용한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/jinan/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '설정 패킷 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'The ontology vault path below came from the installed desktop app',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Ontology vault: /Users/jinan/Team Vault/docs/ontology'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-setup '/Users/jinan/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-setup '/Users/jinan/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas mcp-verify '/Users/jinan/Team Vault/docs/ontology' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.not.stringContaining('<absolute path to your team-vault folder>'),
    );
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
      "ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
    );
    expect(
      await screen.findByRole('button', {
        name: 'agent-setup 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('Tauri vault 경로가 있으면 codebase-root agent-setup 명령에 selected path 를 넣는다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/jinan/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
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
      "ontology-atlas agent-setup '/Users/jinan/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --write",
    );
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
      "ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
    );
    expect(
      await screen.findByRole('button', {
        name: '설정 상태 확인 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('Tauri vault 경로가 있으면 setup state 확인 명령에 selected path 를 넣는다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/jinan/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
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
      "ontology-atlas agent-setup '/Users/jinan/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --json",
    );
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
      expect.stringContaining('ontology-atlas validate .'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas workspace-brief .'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas agent-brief . --prompt'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas agent-brief . --graph-db-pack'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas agent-brief . --verify-fallbacks'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas hubs . --plan --limit 10 --types depends_on,relates'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas hubs . --limit 10 --types depends_on,relates'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas mcp-verify . --timeout-ms 15000'),
    );
    expect(
      screen.getByRole('list', { name: '복사되는 CLI 그래프 runbook 미리보기' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ontology-atlas agent-brief . --graph-db-pack')).toBeInTheDocument();
    expect(screen.getByText('ontology-atlas agent-brief . --verify-fallbacks')).toBeInTheDocument();
    expect(screen.getByText('ontology-atlas agent-brief . --verify-fallbacks --json')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'CLI 그래프 runbook 복사됨' }),
    ).toBeInTheDocument();
  });

  it('Tauri vault 경로가 있으면 CLI graph runbook 을 절대경로 기준으로 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/jinan/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
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
      expect.stringContaining(
        "ontology-atlas validate '/Users/jinan/Team Vault/docs/ontology'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas hubs '/Users/jinan/Team Vault/docs/ontology' --plan --limit 10 --types depends_on,relates",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas mcp-verify '/Users/jinan/Team Vault/docs/ontology' --timeout-ms 15000",
      ),
    );
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
      expect.stringContaining('ontology-atlas first-contact agent proof'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Setup gate:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "If setup state reports missing configs: ontology-atlas agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Restart Claude Code / Cursor / Codex from the codebase root after repair.',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas mcp-verify '<absolute path to your team-vault folder>' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
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
        "ontology-atlas workspace-brief '<absolute path to your team-vault folder>'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-brief '<absolute path to your team-vault folder>' --prompt",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-brief '<absolute path to your team-vault folder>' --graph-db-pack",
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
      expect.stringContaining('MCP verify: mcp-verify can boot the local MCP server, list the 24 tools including index_project'),
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

  it('Tauri vault 경로가 있으면 첫 연결 증거 패킷이 selected path 를 사용한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/jinan/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
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
      expect.stringContaining(
        "ontology-atlas agent-setup '/Users/jinan/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "If setup state reports missing configs: ontology-atlas agent-setup '/Users/jinan/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas mcp-verify '/Users/jinan/Team Vault/docs/ontology' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas agent-brief '/Users/jinan/Team Vault/docs/ontology' --graph-db-pack",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.not.stringContaining('<absolute path to your team-vault folder>'),
    );
  });

  it('AI agent 설정 패널에서 자동화 JSON gate 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderMenu({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/jinan/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
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
      "ontology-atlas agent-brief '/Users/jinan/Team Vault/docs/ontology' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    expect(screen.getByText('자동화 gate')).toBeInTheDocument();
    expect(
      screen.getByText(
        "ontology-atlas agent-brief '/Users/jinan/Team Vault/docs/ontology' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
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
      expect.stringContaining('ontology-atlas validate [vault]'),
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
      expect.stringContaining('"ontology-atlas"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('<absolute path to your team-vault folder>'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"ontology-atlas-mcp"'),
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
      expect.stringContaining('[mcp_servers.ontology-atlas]'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'OATLAS_VAULT = "<absolute path to your team-vault folder>"',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('args = ["-y", "ontology-atlas-mcp"]'),
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
      expect.stringContaining('codex mcp add ontology-atlas'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "OATLAS_VAULT='<absolute path to your team-vault folder>'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('npx -y ontology-atlas-mcp'),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Codex 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });
});
