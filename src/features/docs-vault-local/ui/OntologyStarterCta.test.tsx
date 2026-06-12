import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import {
  buildOntologyStarterCliVerifyCommands,
  buildOntologyStarterJsonGateCommand,
  ONTOLOGY_STARTER_CLI_VERIFY_COMMANDS,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  OntologyStarterCta,
} from './OntologyStarterCta';
import { copyText } from '@/shared/lib/copy-text';

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

describe('OntologyStarterCta', () => {
  beforeEach(() => {
    copyTextMock.mockReset();
  });

  it('빈 vault CTA에서 AI agent 검증 루프를 생성 전에 보여준다', () => {
    render(<OntologyStarterCta docCount={0} onScaffold={vi.fn()} />);

    expect(
      screen.getByRole('region', { name: '온톨로지 시작 시드' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('시작 시드에 포함된 AI 검증 단계'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Claude Code, Cursor, Codex용/)).toBeInTheDocument();
    expect(screen.getByText('온톨로지 정의')).toBeInTheDocument();
    expect(screen.getByText(/실행 가능한 의미 모델/)).toBeInTheDocument();
    expect(screen.getByText(/소유권, 의존성, 근거, 변경 영향/)).toBeInTheDocument();
    expect(screen.getByText('로컬')).toBeInTheDocument();
    expect(screen.getByText('그래프 근거')).toBeInTheDocument();
    expect(screen.getByText('AI 흐름')).toBeInTheDocument();
    expect(screen.getByText(/validate_vault/)).toBeInTheDocument();
    expect(screen.getAllByText(/workspace_brief/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/agent_brief/).length).toBeGreaterThan(0);
    expect(screen.getByText(/mcp-verify/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'AI 검증 프롬프트 복사' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '터미널 근거 복사' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '자동화 JSON 점검 복사' }),
    ).toBeInTheDocument();
  });

  it('AI 검증 프롬프트를 clipboard 로 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={0} onScaffold={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'AI 검증 프롬프트 복사' }));

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
      expect.stringContaining('Do not write to the ontology'),
    );
    expect(await screen.findByRole('button', { name: '프롬프트 복사됨' })).toBeInTheDocument();
  });

  it('기존 vault 에서도 시작 시드 추가 없이 AI 검증 프롬프트를 복사할 수 있다', async () => {
    const onScaffold = vi.fn();
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={3} onScaffold={onScaffold} />);

    expect(
      screen.getByRole('button', { name: '온톨로지 시작 시드 추가' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AI 검증 프롬프트 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(onScaffold).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '프롬프트 복사됨' })).toBeInTheDocument();
  });

  it('AI 없이 재현 가능한 터미널 근거 묶음을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={3} onScaffold={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '터미널 근거 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(ONTOLOGY_STARTER_CLI_VERIFY_COMMANDS);
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas agent-brief . --graph-db-pack'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas agent-brief . --verify-fallbacks'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('ontology-atlas mcp-verify . --timeout-ms 15000'),
    );
    expect(await screen.findByRole('button', { name: '터미널 근거 복사됨' })).toBeInTheDocument();
  });

  it('자동화에서 파싱 가능한 JSON gate 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={0} onScaffold={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '자동화 JSON 점검 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(ONTOLOGY_STARTER_JSON_GATE_COMMAND);
    expect(copyTextMock).toHaveBeenCalledWith(
      'ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
    );
    expect(await screen.findByRole('button', { name: 'JSON 점검 복사됨' })).toBeInTheDocument();
  });

  it('데스크톱 vault 절대경로가 있으면 바로 실행 가능한 proof 명령을 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <OntologyStarterCta
        docCount={3}
        onScaffold={vi.fn()}
        vaultPath="/Users/jinan/Team Vault/docs/ontology"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '터미널 근거 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      buildOntologyStarterCliVerifyCommands('/Users/jinan/Team Vault/docs/ontology'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ontology-atlas validate '/Users/jinan/Team Vault/docs/ontology'",
      ),
    );
  });

  it('vault 절대경로에 작은따옴표가 있어도 JSON gate 명령을 shell-safe 하게 만든다', () => {
    expect(buildOntologyStarterJsonGateCommand("/Users/jinan/Client's Vault")).toContain(
      "ontology-atlas agent-brief '/Users/jinan/Client'\\''s Vault' --verify-fallbacks --json",
    );
  });
});
