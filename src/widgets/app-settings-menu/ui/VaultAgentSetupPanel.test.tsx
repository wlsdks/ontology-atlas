import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { agentServerFromBundle, agentServerUnavailable } from '@/shared/config';
import { copyText } from '@/shared/lib/copy-text';
import { TooltipProvider } from '@/shared/ui';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

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
const noServer = agentServerUnavailable(
  'The bundled MCP server is only available in the installed app.',
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
      codexConfig: true,
      mcpExample: false,
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
  // C13 — 상세 검증/스니펫/게이트는 "고급" 접기 뒤로 강등됐다. 이 접기를
  // 검사하는 기존 어서션이 내용을 보게 펼쳐 둔다(첫 화면 3단계는 그대로 노출).
  const advancedToggle = screen.queryByTestId('agent-setup-advanced-toggle');
  if (advancedToggle) fireEvent.click(advancedToggle);
  return localVault;
}

describe('VaultAgentSetupPanel', () => {
  beforeEach(() => {
    copyTextMock.mockReset();
  });

  it('vault가 loaded가 아니면 렌더하지 않는다', () => {
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

  it('로컬 vault의 AI agent 설정 누락 상태와 복구 버튼을 보여준다', async () => {
    const localVault = renderPanel();

    expect(
      screen.getByRole('region', { name: '내 에이전트 연결' }),
    ).toBeInTheDocument();
    // 같은 사실을 세 번 말하던 앰버 배지는 사라졌다 (2026-08-02 디자인 카운슬
    // S2) — 수를 말하는 줄이 바로 아래에 그대로 있고, 그것이 유일한 진술이다.
    expect(screen.queryByText('누락')).toBeNull();
    expect(screen.getByText('연결 파일 1/3개 준비됨')).toBeInTheDocument();
    expect(screen.getByText('· 다음: .mcp.json 만들기')).toBeInTheDocument();
    expect(
      screen.getByText('이 폴더 기준으로 설정돼요 · 다른 코드 폴더에서 열려면 절대경로가 필요해요'),
    ).toBeInTheDocument();
    expect(screen.getByText('밖의 도구를 잇는 자리예요')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ontology Atlas 안에서 Claude Code·Codex·Cursor 대화를 여는 게 아니에요. 연결 파일과 다시 켜는 안내, 확인 방법을 준비해 두면 각 도구가 자기 앱이나 터미널에서 이 폴더를 읽고 씁니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('더 확인하려면')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: '더 확인할 것' }),
    ).not.toBeVisible();

    fireEvent.click(screen.getByText('더 확인하려면'));

    expect(
      screen.getByRole('list', { name: '더 확인할 것' }),
    ).toBeVisible();
    // 앞 셋(설정 파일 · 다시 켜기 · 연결 확인)은 **3단계로 승격**됐다 — 여기
    // 남는 것은 그 뒤에 오는 셋뿐이다. 번호 배지가 네 벌이던 화면의 정리다.
    expect(
      screen.getByText('고치기 전에 확인 명령을 돌려 「되나」와 「빠른가」를 따로 봅니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('에이전트를 연 폴더에서 mcp-verify 를 돌려 도구 33개가 잡히는지 봅니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('처음 고치기 전에 폴더 요약(workspace-brief · agent-brief)을 먼저 읽습니다.'),
    ).toBeInTheDocument();
    // 승격된 셋은 사라진 게 아니라 위로 올라갔다 — 3단계가 이름으로 실재한다.
    expect(screen.getByTestId('agent-setup-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-3')).toBeInTheDocument();
    expect(
      screen.getByLabelText('지금 확인된 것'),
    ).toBeInTheDocument();
    expect(screen.getByText('폴더')).toBeInTheDocument();
    expect(screen.getByText('이 폴더에서 문서 1개를 읽었어요')).toBeInTheDocument();
    expect(screen.getByText('상태')).toBeInTheDocument();
    expect(screen.getByText('아직 검사 결과가 없어요')).toBeInTheDocument();
    // 「연결 파일 {ready}/{total}」 행은 뺐다 — 머리 요약이 같은 수를 항상 말한다.
    expect(screen.getByText('여는 자리')).toBeInTheDocument();
    expect(
      screen.getByText('다른 코드 폴더에서 열기 전에 연결 설정을 복사하세요'),
    ).toBeInTheDocument();
    expect(screen.getByText('확인 명령')).toBeInTheDocument();
    expect(screen.getByText('자체 점검')).toBeInTheDocument();
    expect(screen.getByText('고치기 전에 아래 명령을 복사해 실행하세요')).toBeInTheDocument();
    expect(screen.getByLabelText('첫 연결에서 확인되는 것')).toBeInTheDocument();
    // 「연결 파일 상태」는 두 자리에 있다 — 접기의 묶음 제목과 첫 연결 증거의
    // 항목 이름. 둘 다 같은 것을 가리키므로 존재만 본다.
    expect(screen.getAllByText('연결 파일 상태').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'agent-setup --json 이 고치기 전에 도구별 연결 파일이 준비됐는지 알려줘요.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('서버 연결')).toBeInTheDocument();
    expect(
      screen.getByText('mcp-verify 가 로컬 서버를 띄우고 도구 33개를 세고, 이 폴더를 실제로 읽어 봅니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('확인 명령')).toBeInTheDocument();
    expect(
      screen.getByText('agent-brief --verify-fallbacks --json 이 고치기 전에 「되나」와 「빠른가」를 알려줘요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('폴더 요약')).toBeInTheDocument();
    expect(
      screen.getByText('workspace-brief 와 agent-brief --graph-db-pack 이 같은 폴더를 각각 설명해요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('쓰는 방식'),
    ).toBeInTheDocument();
    expect(screen.getByText('터미널만')).toBeInTheDocument();
    expect(screen.getByText('도구에 연결')).toBeInTheDocument();
    expect(screen.getByText('그래프 묶음')).toBeInTheDocument();
    expect(screen.getByText('먼저 확인')).toBeInTheDocument();
    expect(
      screen.getByText('Claude Code·Codex·Cursor 가 도구 33개를 직접 부르고, 고칠 때 안전장치를 받아요.'),
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
    expect(screen.getByText('안 됨')).toBeInTheDocument();
    expect(screen.getByText('느림')).toBeInTheDocument();
    expect(screen.getByText('준비됨')).toBeInTheDocument();
    expect(screen.getByText('코드를 고친 뒤')).toBeInTheDocument();
    expect(
      screen.getByText(
        '도메인·역량·요소·관계가 새로 생기거나 이름이 바뀌었으면 끝내기 전에 이 폴더를 맞춰 주세요. 오타·주석·서식·설정·픽스처만 바뀐 변경은 건너뜁니다.',
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
      screen.getByText('이 폴더 자체를 열면 확인·요약 명령이 현재 폴더(.)를 그대로 씁니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('다른 코드 폴더에서')).toBeInTheDocument();
    expect(
      screen.getByText('제품 코드 폴더에서 열면 상태 확인·수리·서버 확인 명령 모두 이 폴더의 절대경로를 적어야 합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('.mcp.json')).toBeInTheDocument();
    expect(screen.getByText('.codex/config.toml')).toBeInTheDocument();
    expect(screen.getByText('.mcp.json.example')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '빠진 연결 파일 만들기' }),
    );

    await waitFor(() => expect(localVault.ensureAgentConfigs).toHaveBeenCalledTimes(1));
  });

  it('Tauri 데스크톱 vault 경로가 있으면 mcp-verify 미리보기에 절대경로를 넣는다', () => {
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

  it('AI agent 설정이 모두 있으면 준비됨으로 표시하고 복구 버튼을 숨긴다', () => {
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    // 같은 사실을 세 번 말하던 앰버 배지는 사라졌다 (2026-08-02 디자인 카운슬
    // S2) — 수를 말하는 줄이 바로 아래에 그대로 있고, 그것이 유일한 진술이다.
    expect(screen.queryByText('누락')).toBeNull();
    expect(screen.getByText('연결 파일 3/3개 준비됨')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '빠진 연결 파일 만들기' }),
    ).not.toBeInTheDocument();
  });

  it('AI 에이전트별 MCP 연결 상태와 확인 명령을 분리해 보여준다', () => {
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    // 파일 상태는 「잘 안 되나요?」 안의 한 목록이 소유한다 — 이름 · 경로 · 상태.
    const connections = screen.getByRole('list', {
      name: '도구별 연결 파일 상태',
    });
    expect(within(connections).getByText('Claude Code · Cursor')).toBeInTheDocument();
    expect(within(connections).getByText('.mcp.json')).toBeInTheDocument();
    expect(within(connections).getByText('Codex')).toBeInTheDocument();
    expect(within(connections).getByText('.codex/config.toml')).toBeInTheDocument();
    expect(within(connections).getByText('다른 코드 폴더')).toBeInTheDocument();
    expect(within(connections).getAllByText('파일 준비됨')).toHaveLength(3);
    expect(
      screen.getByText('여기서 아는 것은 연결 파일이 있는지까지예요. Ontology Atlas 는 에이전트에 직접 접속하지 않으니, 다시 켠 뒤 각 도구에서 실제 연결을 확인하세요.'),
    ).toBeInTheDocument();

    // 도구별 «어떻게 확인하나» 는 3단계의 내용이다 — 「연결 확인」을 열면 나온다.
    fireEvent.click(screen.getByTestId('agent-setup-step-3-toggle'));
    const step3 = screen.getByTestId('agent-setup-step-3');
    expect(within(step3).getByText('/mcp 로 확인')).toBeInTheDocument();
    expect(within(step3).getByText('codex mcp list 로 확인')).toBeInTheDocument();
  });

  it('AI agent setup gate proof에 validation 결과를 반영한다', () => {
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

    expect(screen.getByText('경고 2개 — 훑어보면 좋아요')).toBeInTheDocument();
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

  it('AI agent setup gate proof에서 validation 오류를 agent 수정 차단으로 표시한다', () => {
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

    expect(screen.getByText('오류 1개 — 커밋을 남길 수 없어요')).toBeInTheDocument();
  });

  // ⑤ — 「5개가 막음」이 갈 곳을 갖는다. 종전 이 블록의 인터랙티브 요소는 0개였고
  // 어느 파일이 잘못됐는지 한 글자도 없었다: 사람이 수치를 읽고 나서 할 수 있는
  // 일이 창을 닫는 것뿐이었다. 게이트가 «링크가 있다» 만 보지 않고 «깨끗할 때는
  // 없다» 까지 보는 이유는, 항상 뜨는 링크는 상태를 안 나르기 때문이다.
  it('검사 결과 행이 「할 일」 큐로 가는 길을 준다 (깨끗하면 주지 않는다)', () => {
    renderPanel(
      { agentConfigStatus: { mcpJson: true, codexConfig: true, mcpExample: true } },
      { validationSummary: { errorCount: 5, warningCount: 4 } },
    );

    const link = screen.getByTestId('agent-setup-proof-health-link');
    // 후행 슬래시는 라우터 설정(`trailingSlash`)이 붙이는 것이라 jsdom 렌더에는
    // 없다. 게이트가 재야 하는 것은 «목적지와 탭» 이지 슬래시가 아니다.
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('/ontology/insights');
    expect(href).toContain('tab=do-next');
    expect(link).toHaveTextContent('할 일에서 보기');
  });

  it('검사 결과가 깨끗하면 「할 일에서 보기」 링크가 없다', () => {
    renderPanel(
      { agentConfigStatus: { mcpJson: true, codexConfig: true, mcpExample: true } },
      { validationSummary: null },
    );
    expect(screen.queryByTestId('agent-setup-proof-health-link')).toBeNull();
  });

  it('AI agent handoff 전에 vault validation gate를 별도 상태로 보여준다', () => {
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
        '오류가 있으면 커밋(되돌릴 지점 남기기)이 거절돼요. 읽기와 고치기는 그대로 되지만, 되돌릴 자리를 못 만듭니다.',
      ),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 파일이 있어도 ontology-atlas MCP 설정이 아니면 점검 대상으로 표시한다', () => {
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

    // 같은 사실을 세 번 말하던 앰버 배지는 사라졌다 (2026-08-02 디자인 카운슬
    // S2) — 수를 말하는 줄이 바로 아래에 그대로 있고, 그것이 유일한 진술이다.
    expect(screen.queryByText('누락')).toBeNull();
    expect(screen.getByText('연결 파일 2/3개 준비됨')).toBeInTheDocument();
    expect(
      screen.getByText('· 점검: .codex/config.toml 는 Ontology Atlas 연결 설정이 아니에요'),
    ).toBeInTheDocument();
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

  it('AI agent 설정 패널에서 첫 연결 검증 프롬프트를 복사한다', async () => {
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
      expect.stringContaining('node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4'),
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
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={localVault}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={onOpenWorkflowGuide}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-setup-advanced-toggle'));
    fireEvent.click(screen.getByRole('button', { name: '기능 문서 열기' }));

    expect(onOpenWorkflowGuide).toHaveBeenCalledTimes(1);
  });

  it('AI agent 설정 패널에서 전체 연결 설정을 복사한다', async () => {
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
        "5. Gate fallback performance: node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
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
        "node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Machine-readable setup gate when the vault folder is the current directory:',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
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

  it('Tauri vault 경로가 있으면 연결 설정이 selected path 를 사용한다', async () => {
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

  it('AI agent 설정 패널에서 codebase-root agent-setup 명령을 복사한다', async () => {
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

  it('Tauri vault 경로가 있으면 codebase-root agent-setup 명령에 selected path 를 넣는다', async () => {
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

  it('AI agent 설정 패널에서 codebase-root setup state 확인 명령을 먼저 복사한다', async () => {
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

  it('Tauri vault 경로가 있으면 setup state 확인 명령에 selected path 를 넣는다', async () => {
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

  it('AI agent 설정 패널에서 CLI graph runbook 을 복사한다', async () => {
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
        'node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
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
    expect(screen.getByText('node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '터미널 명령 모음 복사됨' }),
    ).toBeInTheDocument();
  });

  it('Tauri vault 경로가 있으면 CLI graph runbook 을 절대경로 기준으로 복사한다', async () => {
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

  it('AI agent 설정 패널에서 첫 연결 증거 패킷을 복사한다', async () => {
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
        "node $ATLAS/cli/src/index.mjs agent-brief '<absolute path to your team-vault folder>' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
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
      expect.stringContaining('JSON setup gate: agent-brief --verify-fallbacks --json returns ok/performanceOk'),
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

  it('Tauri vault 경로가 있으면 첫 연결 증거 패킷이 selected path 를 사용한다', async () => {
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

  it('AI agent 설정 패널에서 자동화 JSON gate 명령을 복사한다', async () => {
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

    const agentSetup = screen.getByRole('region', { name: '내 에이전트 연결' });
    fireEvent.click(
      within(agentSetup).getByRole('button', { name: '확인 명령 복사' }),
    );

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      "node $ATLAS/cli/src/index.mjs agent-brief '/Users/dana/Team Vault/docs/ontology' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    expect(screen.getByText('상태 확인')).toBeInTheDocument();
    expect(
      screen.getByText(
        "node $ATLAS/cli/src/index.mjs agent-brief '/Users/dana/Team Vault/docs/ontology' --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '확인 명령 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 post-change ontology sync gate를 독립적으로 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    renderPanel({
      agentConfigStatus: {
        mcpJson: true,
        codexConfig: true,
        mcpExample: true,
      },
    });

    const agentSetup = screen.getByRole('region', { name: '내 에이전트 연결' });
    fireEvent.click(
      within(agentSetup).getByRole('button', { name: '맞추기 절차 복사' }),
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
      expect.stringContaining('node $ATLAS/cli/src/index.mjs validate [vault]'),
    );
    expect(
      await screen.findByRole('button', { name: '맞추기 절차 복사됨' }),
    ).toBeInTheDocument();
  });

  it('AI agent 설정 패널에서 codebase-root MCP JSON 템플릿을 복사한다', async () => {
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

  it('AI agent 설정 패널에서 codebase-root Codex TOML 템플릿을 복사한다', async () => {
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

  it('AI agent 설정 패널에서 Codex mcp add 한 줄 명령을 복사한다', async () => {
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
    // npm 발행 계획 폐기 후: 복사되는 명령은 앱이 아는 실행 경로여야 한다.
    // 웹/테스트처럼 번들 서버를 모르는 자리에서는 소스 체크아웃 자리표시자.
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

  it('첫 화면은 3단계 + 원클릭 버튼을 보이고 상세 검증은 접혀 있다', () => {
    render(
      <VaultAgentSetupPanel
        canEditCurrent
        localVault={makeLocalVault()}
        serverAvailability={bundledServer}
        validationSummary={null}
        onOpenWorkflowGuide={vi.fn()}
      />,
    );
    // 3단계 카드 + 클라이언트 버튼은 첫 화면에 노출
    expect(screen.getByTestId('agent-setup-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-step-3')).toBeInTheDocument();
    expect(screen.getByTestId('agent-client-claude-code')).toBeInTheDocument();
    expect(screen.getByTestId('agent-connect-server-line')).toBeInTheDocument();
    // 상세 검증(모드 chooser 등)은 접힌 상태라 안 보인다
    expect(screen.queryByTestId('agent-setup-advanced')).not.toBeInTheDocument();
    // 펼치면 나타난다
    fireEvent.click(screen.getByTestId('agent-setup-advanced-toggle'));
    expect(screen.getByTestId('agent-setup-advanced')).toBeInTheDocument();
  });

  it('missing 설정은 생성 버튼이고 이미 유효한 설정은 준비 상태다', () => {
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

  it('기존 설정이 invalid면 완료나 자동 생성으로 오판하지 않고 교체 설정을 복사한다', async () => {
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
      screen.queryByText('이 폴더에 .mcp.json 을 만들었어요'),
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

  it('유효한 설정은 다시 누르는 버튼이 아니라 준비 상태로 표시한다', () => {
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

    // 셋 다 준비된 상태라 1단계는 「완료」로 접혀 있다 — 도구 열을 보려면 연다.
    // (접은 것이지 지운 것이 아니라는 증명이 이 한 줄이다.)
    fireEvent.click(screen.getByTestId('agent-setup-step-1-toggle'));

    expect(screen.getByRole('status', { name: '.mcp.json 준비됨' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Codex 설정 준비됨' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '.mcp.json 준비됨' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Codex 설정 준비됨' }),
    ).not.toBeInTheDocument();
  });

  it('공개 패키지가 없으면 실행 불가능한 설정과 후속 단계를 숨긴다', () => {
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

    // 2026-08-01 — 종전 단언은 「연결할 수 없어요」였고 그 문장은 거짓이었다.
    // 브라우저가 못 하는 것은 **자동 저장** 하나다(원장 2026-08-01).
    const card = screen.getByTestId('agent-server-unavailable');
    expect(card).toHaveTextContent('설정 파일을 대신 저장하지 못합니다');
    expect(card).not.toHaveTextContent('연결할 수 없어요');
    expect(screen.getByTestId('web-manual-connect')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-step-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-step-3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claude Code에 연결' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-setup-advanced-toggle')).not.toBeInTheDocument();
    expect(localVault.ensureAgentConfigs).not.toHaveBeenCalled();
  });
});
