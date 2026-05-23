import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import { OntologyStarterCta } from './OntologyStarterCta';
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
      screen.getByRole('region', { name: 'ontology starter 시드' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('starter에 포함된 AI agent 검증 단계'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Claude Code, Cursor, Codex용/)).toBeInTheDocument();
    expect(screen.getByText(/validate_vault/)).toBeInTheDocument();
    expect(screen.getByText(/workspace_brief/)).toBeInTheDocument();
    expect(screen.getByText(/agent_brief/)).toBeInTheDocument();
    expect(screen.getByText(/mcp-verify/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'agent 검증 프롬프트 복사' }),
    ).toBeInTheDocument();
  });

  it('agent 검증 프롬프트를 clipboard 로 복사한다', async () => {
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={0} onScaffold={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'agent 검증 프롬프트 복사' }));

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
    expect(await screen.findByRole('button', { name: '프롬프트 복사됨' })).toBeInTheDocument();
  });

  it('기존 vault 에서도 starter 추가 없이 agent 검증 프롬프트를 복사할 수 있다', async () => {
    const onScaffold = vi.fn();
    copyTextMock.mockResolvedValue(true);
    render(<OntologyStarterCta docCount={3} onScaffold={onScaffold} />);

    expect(
      screen.getByRole('button', { name: 'ontology starter 추가' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'agent 검증 프롬프트 복사' }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(onScaffold).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '프롬프트 복사됨' })).toBeInTheDocument();
  });
});
