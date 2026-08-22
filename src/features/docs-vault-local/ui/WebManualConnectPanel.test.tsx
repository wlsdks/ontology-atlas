/**
 * Locks that "connect" in a web session **finishes in place**.
 *
 * It targets the two previous defects:
 * ① the card understated the capability, saying "you cannot connect from this screen"
 * ② the only alternative was a documentation link, so someone trying to connect lost the sheet
 *
 * So what is protected here is not "there is an input box" but **whether what was copied is directly
 * runnable** — a config still holding a placeholder must not be copyable.
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
    /*
     * Assert against the message itself, not a hand-typed excerpt of it. The old
     * regex pinned two fragments of the sentence, so rewording the copy — even into
     * plainer Korean that says exactly the same thing — turned this red while the
     * screen was fine. `documentation.md`: never pin a sentence a human wrote.
     */
    renderPanel();
    expect(screen.getByTestId('web-manual-connect-shape-only').textContent).toContain(
      ko.agentConnect.manualShapeOnlyNote,
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
    // It names precisely one thing as impossible: saving the file automatically.
    expect(card.textContent).toMatch(/설정 파일을 대신 저장하지 못합니다/);
    // The app remains the easier path — it simply no longer says the web is blocked.
    expect(screen.getByTestId('agent-connect-web-get-app')).toBeInTheDocument();
    // The primary path is this slot.
    expect(screen.getByTestId('web-manual-connect')).toBeInTheDocument();
  });
});
