import { render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import { OntologyStarterCta } from './OntologyStarterCta';

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('OntologyStarterCta', () => {
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
  });
});
