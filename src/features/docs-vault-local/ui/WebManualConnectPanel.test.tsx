/**
 * 웹 세션의 「연결」이 **그 자리에서 끝나는지** 잠근다.
 *
 * 종전 결함 둘을 각각 겨눈다:
 * ① 카드가 「이 화면에서는 연결할 수 없어요」라고 능력을 실제보다 좁게 말했다.
 * ② 유일한 대안이 문서 링크라 연결하려던 사람이 시트를 잃었다.
 *
 * 그래서 여기서 지키는 것은 "입력칸이 있다" 가 아니라 **복사한 것이 그대로
 * 실행 가능한가** 다 — 자리표시자가 남은 설정은 복사되지 않아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { AgentClientButtons } from './AgentClientButtons';
import { WebManualConnectPanel } from './WebManualConnectPanel';
import ko from '../../../../messages/ko.json';

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <WebManualConnectPanel />
    </NextIntlClientProvider>,
  );
}

function fill(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe('WebManualConnectPanel — 브라우저는 경로를 모르지만 사람은 안다', () => {
  it('채우기 전에도 무엇을 해야 하는지 보인다 — 자리표시자가 든 진짜 설정', () => {
    renderPanel();
    const body = screen.getByTestId('web-manual-connect-config-body');
    expect(body.textContent).toContain('mcpServers');
    expect(body.textContent).toContain('[문서함 폴더의 절대 경로]');
  });

  it('덜 채운 설정은 복사되지 않는다 — 붙지 않는 설정은 함정이다', () => {
    renderPanel();
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();
    expect(screen.getByTestId('web-manual-connect-copy-cli')).toBeDisabled();

    fill('web-manual-connect-vault-input', '/Users/me/notes');
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();

    fill('web-manual-connect-checkout-input', '/Users/me/ontology-atlas');
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();
    fireEvent.click(screen.getByTestId('web-manual-connect-path-confirmation'));
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeEnabled();
    expect(screen.getByTestId('web-manual-connect-copy-verify')).toBeEnabled();
  });

  it('두 경로가 채워지면 자리표시자 없는 실행 가능한 설정이 나온다', () => {
    renderPanel();
    fill('web-manual-connect-vault-input', '/Users/me/notes');
    fill('web-manual-connect-checkout-input', '/Users/me/ontology-atlas');
    fireEvent.click(screen.getByTestId('web-manual-connect-path-confirmation'));
    const parsed = JSON.parse(screen.getByTestId('web-manual-connect-config-body').textContent ?? '');
    expect(parsed.mcpServers['ontology-atlas'].env.OATLAS_VAULT).toBe('/Users/me/notes');
    expect(parsed.mcpServers['ontology-atlas'].args).toEqual([
      '/Users/me/ontology-atlas/mcp/src/index.js',
    ]);
  });

  it('도구를 바꾸면 그 도구의 설정 파일과 포맷이 나온다', () => {
    renderPanel();
    fill('web-manual-connect-vault-input', '/Users/me/notes');
    fill('web-manual-connect-checkout-input', '/Users/me/ontology-atlas');
    fireEvent.click(screen.getByTestId('web-manual-connect-path-confirmation'));
    fireEvent.click(screen.getByTestId('web-manual-connect-tool-codex'));
    const card = screen.getByTestId('web-manual-connect-config-codex');
    expect(within(card).getByText('.codex/config.toml')).toBeInTheDocument();
    expect(screen.getByTestId('web-manual-connect-config-body').textContent).toContain(
      '[mcp_servers.ontology-atlas]',
    );
  });

  it('물결(~)을 잡고, 왜 안 되는지 말한다 — 설정 파일에서 펼쳐지지 않는다', () => {
    renderPanel();
    fill('web-manual-connect-vault-input', '~/notes');
    expect(screen.getByTestId('web-manual-connect-vault-input-issue').textContent).toMatch(/물결/);
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();
  });

  it('상대 경로를 잡는다', () => {
    renderPanel();
    fill('web-manual-connect-checkout-input', './atlas');
    expect(screen.getByTestId('web-manual-connect-checkout-input-issue').textContent).toMatch(
      /절대 경로/,
    );
  });

  it('빈 값은 오류로 꾸짖지 않는다 — 아직 안 채운 것뿐이다', () => {
    renderPanel();
    expect(screen.queryByTestId('web-manual-connect-vault-input-issue')).toBeNull();
  });

  it('확인했다고 말하지 않는다 — 모양만 본다고 화면이 먼저 말한다', () => {
    renderPanel();
    expect(screen.getByTestId('web-manual-connect-shape-only').textContent).toMatch(
      /경로의 모양만[\s\S]*같은 폴더인지 증명할 수 없어요/,
    );
  });
});

describe('AgentClientButtons — 웹 강등이 막다른 길이 아니다', () => {
  it('연결 불가라고 말하지 않고, 그 자리에서 만드는 길을 함께 준다', () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AgentClientButtons
          serverAvailability={{ kind: 'unavailable', launch: null, binaryPath: null, reason: null }}
          onWriteConfigs={null}
          cursorDeeplink={null}
          mcpJsonSnippet="{}"
          codexCommand="codex mcp add"
          needsManualPath
        />
      </NextIntlClientProvider>,
    );
    const card = screen.getByTestId('agent-server-unavailable');
    expect(card.textContent).not.toMatch(/연결할 수 없어요/);
    // 못 하는 것은 「자동 저장」 하나라고 정확히 말한다.
    expect(card.textContent).toMatch(/설정 파일을 대신 저장하지 못합니다/);
    // 앱은 더 쉬운 길로 남는다 — 웹이 막혔다고 말하지 않을 뿐이다.
    expect(screen.getByTestId('agent-connect-web-get-app')).toBeInTheDocument();
    // 주 경로는 이 자리다.
    expect(screen.getByTestId('web-manual-connect')).toBeInTheDocument();
  });
});
