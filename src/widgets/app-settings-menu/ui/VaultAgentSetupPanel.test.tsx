import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { agentServerFromBundle, agentServerUnavailable } from '@/shared/config';
import { copyText } from '@/shared/lib/copy-text';
import { TooltipProvider } from '@/shared/ui';
import { AGENT_CLIENTS } from '@/entities/vault-session';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/** Copy is read from the catalogue, so a wording change does not break the behaviour checks. */
const setupCopy = koMessages.docsVault.agentSetup;

vi.mock('@/shared/lib/copy-text', () => ({
  copyText: vi.fn(),
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: (handle: FileSystemDirectoryHandle) =>
    (handle as unknown as { rootPath?: string }).rootPath,
}));

const copyTextMock = vi.mocked(copyText);
const bundledServer = agentServerFromBundle(
  '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp',
);
/*
 * A web session carries no reason: the panel already explains the browser state in the reader's
 * language.
 */
const noServer = agentServerUnavailable(null);
/** The installed app that cannot find its own bundled server — the case that had a diagnosis and no renderer. */
const missingBinaryServer = agentServerUnavailable(
  'The bundled MCP server is missing at /Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp.',
);

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
  overrides: Partial<React.ComponentProps<typeof VaultAgentSetupPanel>['localVault']> = {},
): React.ComponentProps<typeof VaultAgentSetupPanel>['localVault'] {
  return {
    status: 'loaded',
    handle: null,
    manifest,
    agentConfigStatus: {
      mcpJson: false,
      mcpJsonValid: false,
      codexConfig: true,
      codexConfigValid: true,
      mcpExample: false,
      mcpExampleValid: false,
    },
    recentVaults: [],
    ensureAgentConfigs: vi.fn().mockResolvedValue({ created: 2, skipped: 1 }),
    ...overrides,
  };
}

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof VaultAgentSetupPanel>['localVault']> = {},
  props: Partial<Pick<React.ComponentProps<typeof VaultAgentSetupPanel>, 'validationSummary'>> = {},
) {
  const localVault = makeLocalVault(overrides);
  render(
    <VaultAgentSetupPanel
      canEditCurrent
      localVault={localVault}
      serverAvailability={bundledServer}
      validationSummary={props.validationSummary ?? null}
      onOpenWorkflowGuide={vi.fn()}
    />,
  );
  // Opens the verification dialog and its "not working?" fold so assertions can see their content.
  const verifyOpen = screen.queryByTestId('agent-setup-verify-open');
  if (verifyOpen) fireEvent.click(verifyOpen);
  const advancedToggle = screen.queryByTestId('agent-setup-advanced-toggle');
  if (advancedToggle) fireEvent.click(advancedToggle);
  return localVault;
}

describe('VaultAgentSetupPanel', () => {
  beforeEach(() => {
    copyTextMock.mockReset();
  });

  it('renders nothing unless the vault is loaded', () => {
    const { container } = rtlRender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TooltipProvider>
          <VaultAgentSetupPanel
            canEditCurrent
            localVault={makeLocalVault({ status: 'idle', agentConfigStatus: null })}
            serverAvailability={bundledServer}
            validationSummary={null}
            onOpenWorkflowGuide={vi.fn()}
          />
        </TooltipProvider>
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows missing agent setup for a local vault with a repair button', async () => {
    const localVault = renderPanel();

    expect(
      screen.getByRole('region', { name: 'MCP 연결' }),
    ).toBeInTheDocument();
    // One statement of the count: the row below says it, so no amber badge repeats it.
    expect(screen.queryByText('누락')).toBeNull();
    expect(screen.getByText(
        setupCopy.statusSummary.replace('{tools}', 'Claude Code · Codex').replace('{ready}', '1').replace('{total}', '2'),
      )).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-status-next')).toHaveTextContent('다음: .mcp.json 만들기');
    expect(
      screen.getByText(setupCopy.rootSummaryMissing),
    ).toBeInTheDocument();
    expect(screen.getByText(setupCopy.boundaryTitle)).toBeInTheDocument();
    expect(
      screen.getByText(setupCopy.boundaryDesc),
    ).toBeInTheDocument();
    expect(screen.getByText(setupCopy.nextStepsSummary)).toBeInTheDocument();
    // Inside the dialog (a framer surface whose opacity jsdom never animates), visibility is
    // the `<details>` open state, not computed style.
    const deeper = screen.getByText(setupCopy.nextStepsSummary).closest('details');
    expect(deeper).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText(setupCopy.nextStepsSummary));

    expect(deeper).toHaveAttribute('open');
    // The first three (config files · restart · verify connection) were **promoted
    // into the three steps**, so only the three that follow remain here. This is the
    // cleanup of a screen that had four separate numbering systems.
    expect(
      screen.getByText(setupCopy.stepGate),
    ).toBeInTheDocument();
    expect(
      screen.getByText(setupCopy.stepMcpVerify),
    ).toBeInTheDocument();
    expect(
      screen.getByText(setupCopy.stepGraphProof),
    ).toBeInTheDocument();
    // The tool rows stand on the page; restart and check stand in the dialog (open above).
    expect(screen.getByTestId('agent-setup-steps')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-3')).toBeInTheDocument();
    expect(
      screen.getByLabelText('지금 확인된 것'),
    ).toBeInTheDocument();
    expect(screen.getByText('폴더')).toBeInTheDocument();
    expect(screen.getByText('이 폴더에서 문서 1개를 읽었어요')).toBeInTheDocument();
    expect(screen.getByText('상태')).toBeInTheDocument();
    expect(screen.getByText('아직 검사 결과가 없어요')).toBeInTheDocument();
    expect(screen.getByText('여는 자리')).toBeInTheDocument();
    expect(
      screen.getByText('다른 코드 폴더에서 열기 전에 연결 설정을 복사하세요'),
    ).toBeInTheDocument();
    expect(screen.getByText('확인 명령')).toBeInTheDocument();
    expect(screen.getByText('자체 점검')).toBeInTheDocument();
    expect(screen.getByText('고치기 전에 아래 명령을 복사해 실행하세요')).toBeInTheDocument();
    expect(screen.getByLabelText('첫 연결에서 확인되는 것')).toBeInTheDocument();
    // 「Connection file status」 appears in two places — the fold's group title and the first
    // connection evidence's item name. Both point at the same thing, so only
    // existence is checked.
    expect(screen.getAllByText('연결 파일 상태').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'agent-setup --json이 고치기 전에 도구별 연결 파일이 준비됐는지 알려줘요.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('서버 연결')).toBeInTheDocument();
    expect(
      screen.getByText('mcp-verify가 로컬 서버를 띄우고 현재 도구 목록을 확인한 뒤, 이 폴더를 실제로 읽어 봐요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('확인 명령')).toBeInTheDocument();
    expect(
      screen.getByText('agent-brief --verify-fallbacks --json --exit-zero이 고치기 전에 「되나」와 「빠른가」를 알려줘요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('폴더 요약')).toBeInTheDocument();
    expect(
      screen.getByText('workspace-brief와 agent-brief --graph-db-pack이 같은 폴더를 각각 설명해요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('쓰는 방식'),
    ).toBeInTheDocument();
    expect(screen.getByText('터미널만')).toBeInTheDocument();
    expect(screen.getByText('도구에 연결')).toBeInTheDocument();
    expect(screen.getByText('그래프 묶음')).toBeInTheDocument();
    expect(screen.getByText('먼저 확인')).toBeInTheDocument();
    expect(
      screen.getByText('Claude Code·Codex·Cursor가 서버의 현재 도구를 직접 부르고, 고칠 때 안전장치를 받아요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('서버 연결 확인 명령 미리보기'),
    ).toHaveTextContent('node $ATLAS/cli/src/index.mjs mcp-verify . --timeout-ms 15000');
    expect(
      screen.getByText('설정이 애매하거나 다른 코드 폴더에서 열었을 때, 고치기 전에 「되나」와 「빠른가」를 먼저 봐요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('확인 명령 결과 읽는 법'),
    ).toBeInTheDocument();
    // Scoped to the gate-rules list: the ready word is also a tool row's button label.
    const gateRules = screen.getByLabelText('확인 명령 결과 읽는 법');
    expect(within(gateRules).getByText('안 됨')).toBeInTheDocument();
    expect(within(gateRules).getByText('느림')).toBeInTheDocument();
    expect(within(gateRules).getByText('준비됨')).toBeInTheDocument();
    expect(screen.getByText('코드를 고친 뒤')).toBeInTheDocument();
    expect(
      screen.getByText(
        '도메인·역량·요소·관계가 새로 생기거나 이름이 바뀌었으면 끝내기 전에 이 폴더를 맞춰 주세요. 오타·주석·서식·설정·픽스처만 바뀐 변경은 건너뛰어요.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '맞추기 절차 복사' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '상태 확인 명령 복사' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('어느 폴더에서 여느냐')).toBeInTheDocument();
    expect(screen.getByText('이 폴더에서')).toBeInTheDocument();
    expect(
      screen.getByText('이 폴더 자체를 열면 확인·요약 명령이 현재 폴더(.)를 그대로 써요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('다른 코드 폴더에서')).toBeInTheDocument();
    expect(
      screen.getByText('제품 코드 폴더에서 열면 상태 확인·수리·서버 확인 명령 모두 이 폴더의 절대경로를 적어야 해요.'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('agent-setup-inspection')).getByText('.mcp.json')).toBeInTheDocument();
    expect(within(screen.getByTestId('agent-setup-inspection')).getByText('.codex/config.toml')).toBeInTheDocument();
    expect(screen.getByText(/\.mcp\.json\.example은 다른 폴더에서 쓸 본보기/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '빠진 연결 파일 만들기' }),
    );

    await waitFor(() => expect(localVault.ensureAgentConfigs).toHaveBeenCalledTimes(1));
  });

  it('puts the absolute desktop vault path in the mcp-verify preview', () => {
    renderPanel({
      handle: {
        name: 'ontology',
        rootPath: '/Users/dana/side-project/ontology-atlas/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
    });

    expect(
      screen.getByLabelText('서버 연결 확인 명령 미리보기'),
    ).toHaveTextContent(
      "node $ATLAS/cli/src/index.mjs mcp-verify '/Users/dana/side-project/ontology-atlas/docs/ontology' --timeout-ms 15000",
    );
  });

  it('shows ready when both real connection configs are valid, without the example file', () => {
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        mcpJsonValid: true,
        codexConfig: true,
        codexConfigValid: true,
        mcpExample: false,
        mcpExampleValid: false,
      },
    });

    // One statement of the count: the row below says it, so no amber badge repeats it.
    expect(screen.queryByText('누락')).toBeNull();
    expect(screen.getByText('Claude Code · Codex 연결 파일 2/2개 준비됨')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '빠진 연결 파일 만들기' }),
    ).not.toBeInTheDocument();
  });

  it('shows MCP connection status and the check command per agent', () => {
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    // File status is owned by one list inside 「Having trouble?」 — name · path · status.
    const connections = screen.getByRole('list', {
      name: '도구별 연결 파일 상태',
    });
    // Only the two files Atlas reads are named here; Cursor's own scope is .cursor/mcp.json,
    // which this screen writes and never reads back.
    expect(within(connections).getByText('Claude Code')).toBeInTheDocument();
    expect(within(connections).queryByText(/Cursor/)).toBeNull();
    expect(within(connections).getByText('.mcp.json')).toBeInTheDocument();
    expect(within(connections).getByText('Codex')).toBeInTheDocument();
    expect(within(connections).getByText('.codex/config.toml')).toBeInTheDocument();
    expect(within(connections).queryByText('다른 코드 폴더')).not.toBeInTheDocument();
    expect(within(connections).queryByText('.mcp.json.example')).not.toBeInTheDocument();
    expect(within(connections).getAllByText('파일 준비됨')).toHaveLength(2);
    expect(
      screen.getByText('.mcp.json.example은 다른 폴더에서 쓸 본보기라 연결 파일 수에 넣지 않아요. 여기는 실행 방식과 이 폴더 경로까지만 확인하므로, 다시 켠 뒤 각 도구에서 실제 연결을 확인하세요.'),
    ).toBeInTheDocument();

    // The per-tool «how do I check» is the check section's content, inside the dialog.
    const step3 = screen.getByTestId('agent-setup-step-3');
    expect(within(step3).getByText('/mcp로 확인')).toBeInTheDocument();
    expect(within(step3).getByText('codex mcp list로 확인')).toBeInTheDocument();
  });

  it('reflects the validation result in the setup gate proof', () => {
    renderPanel(
      {
        agentConfigStatus: {
          mcpJson: true,
          codexConfig: true,
          mcpExample: true,
        },
      },
      { validationSummary: { errorCount: 0, warningCount: 2 } },
    );

    expect(screen.getByText(/경고 2개: 훑어보면/)).toBeInTheDocument();
    expect(
      screen.getByText('이 폴더에서 다시 켜거나, 다른 코드 폴더에서는 본보기를 복사해 쓰세요'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('이 폴더의 연결 파일은 폴더 자신을 가리키도록 준비됐어요'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('이 폴더에서 다시 켜거나, 다른 코드 폴더에서는 본보기를 복사해 쓰세요'),
    ).toBeInTheDocument();
  });

  it('shows validation errors as blocking agent edits in the setup gate proof', () => {
    renderPanel(
      {
        agentConfigStatus: {
          mcpJson: true,
          codexConfig: true,
          mcpExample: true,
        },
      },
      { validationSummary: { errorCount: 1, warningCount: 0 } },
    );

    expect(screen.getByText(/오류 1개: 커밋을/)).toBeInTheDocument();
  });

  // Present with findings and absent when clean, since an always-present link carries no state.
  it('links the validation row to the to-do queue when there are findings', () => {
    renderPanel(
      { agentConfigStatus: { mcpJson: true, codexConfig: true, mcpExample: true } },
      { validationSummary: { errorCount: 5, warningCount: 4 } },
    );

    const link = screen.getByTestId('agent-setup-proof-health-link');
    // The trailing slash is added by the router config (`trailingSlash`), so it is
    // absent from a jsdom render. What the gate has to measure is «destination and
    // tab», not the slash.
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('/ontology/insights');
    expect(href).toContain('tab=do-next');
    expect(link).toHaveTextContent('할 일에서 보기');
  });

  it('omits the to-do link when validation is clean', () => {
    renderPanel(
      { agentConfigStatus: { mcpJson: true, codexConfig: true, mcpExample: true } },
      { validationSummary: null },
    );
    expect(screen.queryByTestId('agent-setup-proof-health-link')).toBeNull();
  });

  it('shows the vault validation gate as its own status before agent handoff', () => {
    renderPanel(
      {
        agentConfigStatus: {
          mcpJson: true,
          codexConfig: true,
          mcpExample: true,
        },
      },
      { validationSummary: { errorCount: 2, warningCount: 1 } },
    );

    const validationGate = screen.getByRole('status', {
      name: '폴더 상태',
    });

    expect(within(validationGate).getByText('오류 있음')).toBeInTheDocument();
    expect(
      within(validationGate).getByText('오류 2개 · 경고 1개'),
    ).toBeInTheDocument();
    expect(
      within(validationGate).getByText(
        '오류가 있으면 커밋(되돌릴 지점 남기기)이 거절돼요. 읽기와 고치기는 그대로 되지만, 되돌릴 자리를 못 만들어요.',
      ),
    ).toBeInTheDocument();
  });

  it('flags an agent config without the ontology-atlas MCP entry for review', () => {
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
        mcpJsonValid: true,
        codexConfigValid: false,
        mcpExampleValid: true,
      },
    });

    // One statement of the count: the row below says it, so no amber badge repeats it.
    expect(screen.queryByText('누락')).toBeNull();
    expect(screen.getByText('Claude Code · Codex 연결 파일 1/2개 준비됨')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-status-next')).toHaveTextContent(
      '점검: .codex/config.toml는 Ontology Atlas 연결 설정이 아니에요',
    );
    expect(screen.getByText('점검 필요')).toBeInTheDocument();
    expect(
      screen.getByText(
        '이미 있는 파일은 덮어쓰지 않아요. 연결 설정이나 본보기를 복사해 점검 대상 파일을 직접 바꿔주세요.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '빠진 연결 파일 만들기' }),
    ).not.toBeInTheDocument();
  });

  it('copies the first-connection verification prompt', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '확인 프롬프트 복사' }));

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
      expect.stringContaining('node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('performanceOk=false'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('After any non-trivial code change, sync docs/ontology before finishing'),
    );
    expect(
      await screen.findByRole('button', { name: '확인 프롬프트 복사됨' }),
    ).toBeInTheDocument();
  });

  it('opens the capability documents', () => {
    const onOpenWorkflowGuide = vi.fn();
    const localVault = makeLocalVault({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={localVault}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={onOpenWorkflowGuide}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-setup-verify-open'));
    fireEvent.click(screen.getByTestId('agent-setup-advanced-toggle'));
    fireEvent.click(screen.getByRole('button', { name: '기능 문서 열기' }));

    expect(onOpenWorkflowGuide).toHaveBeenCalledTimes(1);
  });

  it('copies the full connection config', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '연결 설정 한 번에 복사' }));

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
      expect.stringContaining('call connection_info for the current toolCount'),
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
      expect.stringContaining('list the tools including finalize_project_meaning'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('JSON setup gate: agent-brief --verify-fallbacks --json --exit-zero returns ok/performanceOk'),
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
        "1. Check config state: node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "2. Repair only if state reports missing configs: node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('3. Restart Claude Code / Cursor / Codex from the agent root.'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "4. Verify MCP tools: node $ATLAS/cli/src/index.mjs mcp-verify '<absolute path to your team-vault folder>' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "5. Gate fallback performance: node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "6. Read the graph: node $ATLAS/cli/src/index.mjs workspace-brief '<absolute path to your team-vault folder>' && node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --prompt",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs agent-setup'),
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
      expect.stringContaining('mcp/src/index.js'),
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
      expect.stringContaining('node $ATLAS/cli/src/index.mjs mcp-verify . --timeout-ms 15000'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Machine-readable setup gate for automation from the codebase root:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Machine-readable setup gate when the vault folder is the current directory:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Machine-readable config state check before repair:'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('<absolute path to your team-vault folder>'),
    );
    expect(
      await screen.findByRole('button', { name: '연결 설정을 복사했어요' }),
    ).toBeInTheDocument();
  });

  it('uses the selected desktop vault path in the connection config', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/dana/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '연결 설정 한 번에 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'The ontology vault path below came from the installed desktop app',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Ontology vault: /Users/dana/Team Vault/docs/ontology'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-setup '/Users/dana/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-setup '/Users/dana/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs mcp-verify '/Users/dana/Team Vault/docs/ontology' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.not.stringContaining('<absolute path to your team-vault folder>'),
    );
  });

  it('copies the codebase-root agent-setup command', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '설정 만들기 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
    );
    expect(
      await screen.findByRole('button', {
        name: '설정 만들기 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('puts the selected desktop vault path in the agent-setup command', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/dana/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '설정 만들기 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "node $ATLAS/cli/src/index.mjs agent-setup '/Users/dana/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --write",
    );
  });

  it('copies the codebase-root setup state check command first', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '상태 확인 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
    );
    expect(
      await screen.findByRole('button', {
        name: '상태 확인 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('puts the selected desktop vault path in the setup state check command', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/dana/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '상태 확인 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "node $ATLAS/cli/src/index.mjs agent-setup '/Users/dana/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --json",
    );
  });

  it('copies the CLI graph runbook', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '터미널 명령 모음 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs validate .'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs workspace-brief .'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs agent-brief . --prompt'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs agent-brief . --graph-db-pack'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs hubs . --plan --limit 10 --types depends_on,relates'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs hubs . --limit 10 --types depends_on,relates'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('node $ATLAS/cli/src/index.mjs mcp-verify . --timeout-ms 15000'),
    );
    expect(
      screen.getByRole('list', { name: '복사되는 터미널 명령 미리보기' }),
    ).toBeInTheDocument();
    expect(screen.getByText('node $ATLAS/cli/src/index.mjs agent-brief . --graph-db-pack')).toBeInTheDocument();
    expect(screen.getByText('node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks')).toBeInTheDocument();
    expect(screen.getByText('node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --exit-zero')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '터미널 명령 모음 복사됨' }),
    ).toBeInTheDocument();
  });

  it('copies the CLI graph runbook with the absolute desktop vault path', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/dana/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '터미널 명령 모음 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs validate '/Users/dana/Team Vault/docs/ontology'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs hubs '/Users/dana/Team Vault/docs/ontology' --plan --limit 10 --types depends_on,relates",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs mcp-verify '/Users/dana/Team Vault/docs/ontology' --timeout-ms 15000",
      ),
    );
  });

  it('copies the first-connection evidence packet', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '첫 연결 확인 절차 복사' }),
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
        "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "If setup state reports missing configs: node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Restart Claude Code / Cursor / Codex from the codebase root after repair.',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs mcp-verify '<absolute path to your team-vault folder>' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
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
        "node $ATLAS/cli/src/index.mjs workspace-brief '<absolute path to your team-vault folder>'",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --prompt",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --graph-db-pack",
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
      expect.stringContaining('list the tools including finalize_project_meaning'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('JSON setup gate: agent-brief --verify-fallbacks --json --exit-zero returns ok/performanceOk'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Graph briefs: workspace-brief and agent-brief --graph-db-pack describe the same local vault'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Post-change ontology sync:'),
    );
    expect(
      await screen.findByRole('button', { name: '첫 연결 확인 절차 복사됨' }),
    ).toBeInTheDocument();
  });

  it('uses the selected desktop vault path in the evidence packet', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/dana/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '첫 연결 확인 절차 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-setup '/Users/dana/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --json",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "If setup state reports missing configs: node $ATLAS/cli/src/index.mjs agent-setup '/Users/dana/Team Vault/docs/ontology' --root '<absolute path to your codebase root>' --write",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs mcp-verify '/Users/dana/Team Vault/docs/ontology' --timeout-ms 15000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "node $ATLAS/cli/src/index.mjs agent-brief '/Users/dana/Team Vault/docs/ontology' --graph-db-pack",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.not.stringContaining('<absolute path to your team-vault folder>'),
    );
  });

  it('copies the automation JSON gate command', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: {
        name: 'team-vault',
        rootPath: '/Users/dana/Team Vault/docs/ontology',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    // The verification dialog portals to `document.body`, outside the panel's region.
    fireEvent.click(screen.getByRole('button', { name: '확인 명령 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "node $ATLAS/cli/src/index.mjs agent-brief '/Users/dana/Team Vault/docs/ontology' --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    expect(screen.getByText('상태 확인')).toBeInTheDocument();
    expect(
      screen.getByText(
        "node $ATLAS/cli/src/index.mjs agent-brief '/Users/dana/Team Vault/docs/ontology' --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '확인 명령 복사됨' }),
    ).toBeInTheDocument();
  });

  it('copies the post-change ontology sync gate on its own', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '맞추기 절차 복사' }));

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
      expect.stringContaining('node $ATLAS/cli/src/index.mjs validate [vault]'),
    );
    expect(
      await screen.findByRole('button', { name: '맞추기 절차 복사됨' }),
    ).toBeInTheDocument();
  });

  it('copies the codebase-root MCP JSON template', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '다른 폴더용 MCP 설정 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"ontology-atlas"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('<absolute path to your team-vault folder>'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('mcp/src/index.js'),
    );
    expect(
      await screen.findByRole('button', {
        name: 'MCP 설정 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('copies the codebase-root Codex TOML template', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: '다른 폴더용 Codex 설정 복사' }),
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
      expect.stringContaining('mcp/src/index.js'),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Codex 설정 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it('copies the one-line Codex mcp add command', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      handle: { name: 'team-vault' } as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Codex 등록 명령 복사' }),
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
    // After the npm publishing plan was dropped: the copied command has to be a run
    // path the app actually knows. Where the bundled server is unknown (web, tests)
    // it is a source-checkout placeholder.
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('mcp/src/index.js'),
    );
    expect(copyTextMock).not.toHaveBeenCalledWith(expect.stringContaining('npx'));
    expect(
      await screen.findByRole('button', {
        name: 'Codex 명령 복사됨',
      }),
    ).toBeInTheDocument();
  });

  it("states on the row that another server's config exists", () => {
    // A row offering a replacement must say why, or it reads as unexplained among connect rows.
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault({
          agentConfigStatus: {
            mcpJson: true,
            mcpJsonValid: true,
            codexConfig: true,
            codexConfigValid: false,
            mcpExample: false,
            mcpExampleValid: false,
          },
        })}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );
    const codexRow = screen.getByTestId('agent-setup-row-codex');
    expect(codexRow).toHaveTextContent(
      '점검: .codex/config.toml는 Ontology Atlas 연결 설정이 아니에요',
    );
    // The row whose file is ours keeps the plain path.
    expect(screen.getByTestId('agent-setup-row-claude-code')).toHaveTextContent('.mcp.json');
    expect(screen.getByTestId('agent-setup-row-claude-code')).not.toHaveTextContent('점검:');
  });

  it('renders no claim before the server lookup answers', () => {
    // `launch: null` alone cannot tell a browser from the app still asking, so this panel used
    // to open on the browser's degradation card inside the installed app.
    const { container } = render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={{ ...agentServerUnavailable(null), pending: true }}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('agent-server-unavailable')).toBeNull();
    expect(screen.queryByTestId('agent-setup-steps')).toBeNull();
  });

  it('shows four tool rows first, with checks and detailed validation behind a dialog', () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );
    // One row per tool, each with its file and its own control.
    const rows = screen.getByTestId('agent-setup-steps');
    // Render order is derived from `AGENT_CLIENTS`: change the array order and the rows follow.
    expect(
      [...rows.querySelectorAll("[data-testid^='agent-setup-row-']")].map((el) =>
        el.getAttribute('data-testid'),
      ),
    ).toEqual(AGENT_CLIENTS.map((client) => `agent-setup-row-${client.id}`));
    expect(within(rows).getByTestId('agent-setup-row-claude-code')).toHaveTextContent('.mcp.json');
    expect(within(rows).getByTestId('agent-setup-row-codex')).toHaveTextContent('.codex/config.toml');
    expect(within(rows).getByTestId('agent-setup-row-cursor')).toBeInTheDocument();
    expect(within(rows).getByTestId('agent-setup-row-antigravity')).toBeInTheDocument();
    expect(screen.getByTestId('agent-client-claude-code')).toBeInTheDocument();
    // The server-lifetime sentence is still drawn — in the hint beside the heading.
    expect(screen.getByTestId('agent-connect-server-line')).toBeInTheDocument();
    // Restart, check and the detailed verification wait behind one press.
    expect(screen.queryByTestId('agent-setup-step-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-step-3')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-setup-verify-open'));
    expect(screen.getByTestId('agent-setup-verify-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-3')).toBeInTheDocument();
    // The detailed verification (mode chooser and so on) is collapsed, so it is not visible.
    expect(screen.queryByTestId('agent-setup-advanced')).not.toBeInTheDocument();
    // Expanding reveals it.
    fireEvent.click(screen.getByTestId('agent-setup-advanced-toggle'));
    expect(screen.getByTestId('agent-setup-advanced')).toBeInTheDocument();
  });

  // Counted rather than matched on a sentence, so rewording that keeps it once still passes.
  it("states the check dialog's name and count once each", () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('agent-setup-verify-open'));
    const dialog = screen.getByTestId('agent-setup-verify-dialog');
    const title = koMessages.agentConnect.step3Title;
    const headings = [...dialog.querySelectorAll('h2, h3')].map((h) => h.textContent?.trim());
    expect(headings.filter((h) => h === title)).toHaveLength(1);

    // Matched on the count's shape, so the catalogue can be reworded.
    const countShape = /\d+\/\d+개 준비됨/;
    const saidTheCount = [...dialog.querySelectorAll('p, span')].filter((el) =>
      countShape.test(el.textContent ?? ''),
    );
    // Ancestors repeat a descendant's text, so the deepest element carrying it is the count.
    const owners = saidTheCount.filter(
      (el) => !saidTheCount.some((other) => other !== el && el.contains(other)),
    );
    expect(owners).toHaveLength(1);
  });

  it('with no connection file yet, the dialog skips the restart step and states zero once', () => {
    renderPanel({
      agentConfigStatus: {
        mcpJson: false,
        mcpJsonValid: false,
        codexConfig: false,
        codexConfigValid: false,
        mcpExample: false,
        mcpExampleValid: false,
      },
    });
    const dialog = screen.getByTestId('agent-setup-verify-dialog');
    // Restarting "the tool you just connected" means nothing before anything is connected.
    expect(within(dialog).queryByTestId('agent-setup-step-2')).toBeNull();
    // The count names whose files it counts, so "0/2" cannot be read against the four tool rows.
    expect(within(dialog).getByTestId('agent-setup-status-summary')).toHaveTextContent(
      'Claude Code · Codex 연결 파일 0/2개 준비됨',
    );
    // The next step is the line under the count, not a second sentence restating zero.
    expect(within(dialog).getByTestId('agent-setup-status-next')).toHaveTextContent('.mcp.json');
    expect(within(dialog).queryByText(/아직 연결 파일이 없어요/)).toBeNull();
  });

  it('once one file exists the restart step returns and the next line names the missing file', () => {
    renderPanel();
    const dialog = screen.getByTestId('agent-setup-verify-dialog');
    expect(within(dialog).getByTestId('agent-setup-step-2')).toBeInTheDocument();
    expect(within(dialog).getByTestId('agent-setup-status-next')).toBeInTheDocument();
  });

  it('offers create for a missing config and shows ready for a valid one', () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Claude Code에 연결' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Codex 설정 준비됨' }),
    ).toBeInTheDocument();
  });

  it('copies a replacement for an invalid config instead of claiming done or creating it', async () => {
    copyTextMock.mockResolvedValue(true);
    const localVault = makeLocalVault({
      handle: {
        name: 'broken-vault',
        rootPath: '/private/tmp/broken-vault',
      } as unknown as FileSystemDirectoryHandle,
      agentConfigStatus: {
        mcpJson: true,
        mcpJsonValid: false,
        codexConfig: true,
        codexConfigValid: false,
        mcpExample: true,
        mcpExampleValid: true,
      },
    });

    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={localVault}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    expect(
      screen.queryByText('이 폴더에 .mcp.json을 만들었어요'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Claude Code에 연결' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Codex에 연결' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '올바른 .mcp.json 복사' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: '올바른 Codex 설정 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(2));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"OATLAS_VAULT": "."'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('[mcp_servers.ontology-atlas]'),
    );
    expect(localVault.ensureAgentConfigs).not.toHaveBeenCalled();
  });

  it('shows a valid config as ready, not as a button', () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault({
          agentConfigStatus: {
            mcpJson: true,
            mcpJsonValid: true,
            codexConfig: true,
            codexConfigValid: true,
            mcpExample: true,
            mcpExampleValid: true,
          },
        })}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    // With all three ready, the rows stay where they are and say so.
    expect(screen.getByRole('status', { name: '.mcp.json 준비됨' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Codex 설정 준비됨' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '.mcp.json 준비됨' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Codex 설정 준비됨' }),
    ).not.toBeInTheDocument();
  });

  it('hides unrunnable configs and later steps without a public package', () => {
    const localVault = makeLocalVault({
      agentConfigStatus: {
        mcpJson: true,
        mcpJsonValid: true,
        codexConfig: true,
        codexConfigValid: true,
        mcpExample: true,
        mcpExampleValid: true,
      },
    });

    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={localVault}
        serverAvailability={noServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    // A browser can connect; the one thing it cannot do is save the config automatically.
    const card = screen.getByTestId('agent-server-unavailable');
    expect(card).toHaveTextContent('설정 파일을 대신 저장하지 못해요');
    expect(card).not.toHaveTextContent('연결할 수 없어요');
    expect(screen.getByTestId('web-manual-connect')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-step-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-step-3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claude Code에 연결' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-advanced-toggle')).not.toBeInTheDocument();
    expect(localVault.ensureAgentConfigs).not.toHaveBeenCalled();
  });
  // The reason `agent_setup.rs` writes is shown verbatim.
  it('shows why the bundled server file was not found', () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={missingBinaryServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    const row = screen.getByTestId('agent-setup-server-reason');
    expect(row).toHaveTextContent('이 앱 안에서 MCP 서버 파일을 찾지 못했어요');
    expect(row).toHaveTextContent('The bundled MCP server is missing at');
  });

  it('omits the diagnosis row on the web', () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={noServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('agent-setup-server-reason')).not.toBeInTheDocument();
  });

  // The per-tool button awaits the handler, so a swallowed failure would show success.
  it('names the config file that failed to write and says the folder is unchanged', async () => {
    const localVault = makeLocalVault({
      ensureAgentConfigs: vi
        .fn()
        .mockRejectedValue(new Error('Permission denied (os error 13)')),
    });
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={localVault}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Claude Code에 연결' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('.mcp.json 파일을 쓰지 못했어요');
    expect(alert).toHaveTextContent('폴더 안은 그대로예요');
    expect(alert).toHaveTextContent('Permission denied (os error 13)');
    // The pressed button must not claim success for a write that did not happen.
    await waitFor(() =>
      expect(screen.getByTestId('agent-client-claude-code')).toHaveAttribute(
        'data-state',
        'failed',
      ),
    );
  });

  it('draws no empty parentheses when no reason is returned', async () => {
    const localVault = makeLocalVault({
      ensureAgentConfigs: vi.fn().mockRejectedValue(new Error('')),
    });
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={localVault}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Claude Code에 연결' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('.mcp.json 파일을 쓰지 못했어요');
    expect(alert.textContent).not.toContain('()');
  });
});
