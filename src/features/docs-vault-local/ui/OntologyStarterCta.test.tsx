import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import {
  buildOntologyStarterAgentVerifyPrompt,
  OntologyStarterCta,
} from './OntologyStarterCta';
import { copyText } from '@/shared/lib/clipboard/copy-text';

vi.mock('@/shared/lib/clipboard/copy-text', () => ({
  copyText: vi.fn(),
}));

const copyTextMock = vi.mocked(copyText);

function render(ui: React.ReactElement) {
  return rtlRender(
    <IntlProvider locale="ko" messages={koMessages}>
      {ui}
    </IntlProvider>,
  );
}

describe('OntologyStarterCta', () => {
  beforeEach(() => {
    copyTextMock.mockReset();
  });

  it('shows the AI agent verification loop before creation in the empty-vault CTA', () => {
    render(<OntologyStarterCta docCount={0} onScaffold={vi.fn()} />);

    expect(
      screen.getByRole('region', { name: '온톨로지 시작 시드' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('시작 시드에 포함된 AI 검증 단계'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Claude Code, Cursor, Codex용/)).toBeInTheDocument();
    expect(screen.getByText('온톨로지가 기록하는 것')).toBeInTheDocument();
    expect(screen.getByText(/무엇에 의존하며/)).toBeInTheDocument();
    expect(screen.getByText(/프로젝트·도메인·역량·요소와 관계/)).toBeInTheDocument();
    expect(screen.getByText('로컬 파일')).toBeInTheDocument();
    expect(screen.getByText('연결 검사')).toBeInTheDocument();
    expect(screen.getByText('먼저 읽기')).toBeInTheDocument();
    expect(screen.getByText(/validate_vault/)).toBeInTheDocument();
    expect(screen.getAllByText(/workspace_brief/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/agent_brief/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: '검증 프롬프트 복사' }),
    ).toBeInTheDocument();
  });

  it('copies the AI verification prompt to the clipboard', async () => {
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={0} onScaffold={vi.fn()} />);

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
      expect.stringContaining('Do not write to the ontology'),
    );
    expect(await screen.findByRole('button', { name: '프롬프트 복사됨' })).toBeInTheDocument();
  });

  it('copies the AI verification prompt in an existing vault without adding the starter seed', async () => {
    const onScaffold = vi.fn();
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={3} onScaffold={onScaffold} />);

    expect(
      screen.getByRole('button', { name: '온톨로지 시작 시드 추가' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '검증 프롬프트 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(onScaffold).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '프롬프트 복사됨' })).toBeInTheDocument();
  });

  it('hands the agent only MCP calls, so a person with only the app can follow every step', () => {
    for (const prompt of [
      buildOntologyStarterAgentVerifyPrompt(),
      buildOntologyStarterAgentVerifyPrompt('/Users/dana/Team Vault/docs/ontology'),
    ]) {
      expect(prompt).not.toMatch(/\$ATLAS|cli\/src\/index\.mjs|--verify-fallbacks/);
      expect(prompt).toContain('Agents > MCP');
    }
    expect(
      buildOntologyStarterAgentVerifyPrompt('/Users/dana/Team Vault/docs/ontology'),
    ).toContain('The ontology folder is /Users/dana/Team Vault/docs/ontology.');
  });
});
