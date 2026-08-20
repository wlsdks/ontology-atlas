import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import type { AcpCheck } from '../model/acp-doctor';
import { useAgentDoctor } from './AgentDoctor';

/**
 * 연동 점검 화면 — **소음이 되지 않는가**가 이 시험의 주제다.
 *
 * 첫 판이 소유자에게 반려된 이유는 기능이 아니라 화면이었다: 「괜찮아요」가 일곱
 * 줄이었고, 그 목록이 행의 오른쪽 절반을 먹었다. 그래서 여기서 재는 것은
 * 「값을 잘 돌려주나」가 아니라 **「몇 줄을 그리나」** 다.
 */

const diagnoseAgent = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
const repairAgentCheck = vi.fn<(runtimeId: string, checkId: string) => Promise<AcpCheck[]>>();
const resetAgentConnection = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
const agentInstallPlan = vi.fn<(runtimeId: string) => Promise<string | null>>();
const installAgentCli = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
const nodeInstallPlan = vi.fn<() => Promise<string | null>>();
const installManagedNode = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();

vi.mock('../model/acp-doctor', async () => {
  const actual = await vi.importActual<typeof import('../model/acp-doctor')>('../model/acp-doctor');
  return {
    ...actual,
    diagnoseAgent: (runtimeId: string) => diagnoseAgent(runtimeId),
    repairAgentCheck: (runtimeId: string, checkId: string) => repairAgentCheck(runtimeId, checkId),
    resetAgentConnection: (runtimeId: string) => resetAgentConnection(runtimeId),
    agentInstallPlan: (runtimeId: string) => agentInstallPlan(runtimeId),
    installAgentCli: (runtimeId: string) => installAgentCli(runtimeId),
    nodeInstallPlan: () => nodeInstallPlan(),
    installManagedNode: (runtimeId: string) => installManagedNode(runtimeId),
  };
});

function Harness({ runtimeId = 'claude-acp' }: { runtimeId?: string }) {
  const doctor = useAgentDoctor(runtimeId);
  return (
    <NextIntlClientProvider locale="ko" messages={ko}>
      <div>
        {doctor.scanButton}
        {doctor.result}
      </div>
    </NextIntlClientProvider>
  );
}

function renderHarness(runtimeId = 'claude-acp') {
  // `useTranslations` 는 provider 안에서만 산다 — 훅을 부르는 컴포넌트 자체가
  // provider 밖이면 안 되므로 한 겹 더 감싼다.
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <Harness runtimeId={runtimeId} />
    </NextIntlClientProvider>,
  );
}

const ok = (id: string): AcpCheck => ({ id, state: 'ok', fixable: false, blocked: false });
const problem = (id: string, fixable = true): AcpCheck => ({ id, state: 'problem', fixable, blocked: false });
const unknown = (id: string): AcpCheck => ({ id, state: 'unknown', fixable: false, blocked: false });

beforeEach(() => {
  diagnoseAgent.mockReset();
  repairAgentCheck.mockReset();
  resetAgentConnection.mockReset();
  agentInstallPlan.mockReset();
  agentInstallPlan.mockResolvedValue(null);
  installAgentCli.mockReset();
  nodeInstallPlan.mockReset();
  nodeInstallPlan.mockResolvedValue(null);
  installManagedNode.mockReset();
});

describe('연동 점검 화면', () => {
  it('누르기 전에는 아무 줄도 안 그린다', () => {
    renderHarness();
    expect(screen.queryByTestId('agent-doctor')).toBeNull();
    expect(screen.getByTestId('agent-doctor-scan')).toBeVisible();
  });

  it('다 괜찮으면 **한 줄**로 접는다 — 일곱 줄이 아니다', async () => {
    diagnoseAgent.mockResolvedValue(['cli', 'launcher', 'npx-cache', 'config-dir', 'credentials-link', 'shadow-keychain', 'login'].map(ok));
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    // 이것이 첫 판의 결함이었다: 목록이 그려지면 안 된다.
    expect(screen.queryByTestId('agent-doctor-checks')).toBeNull();
    // ⚠️ **개수를 세어 주지 않는다** (2026-08-20 반려): 「단계」는 우리 내부
    // 말이고, 도구마다 검사 수가 달라서 사용자가 알 수 없는 이유로 숫자가 달라
    // 보인다. 상태는 사람 말 한 줄이고, 무엇을 봤는지는 접어 둔다.
    const summary = screen.getByTestId('agent-doctor-all-clear').textContent ?? '';
    expect(summary).not.toMatch(/\d/);
    expect(summary).toContain('문제 없어요');
    // 접혀 있어도 목록은 DOM 에 있다 — 궁금하면 펴 보면 된다.
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('막힌 것만 펴고, 통과한 것은 개수로 남긴다', async () => {
    diagnoseAgent.mockResolvedValue([
      ok('cli'),
      ok('launcher'),
      ok('npx-cache'),
      ok('config-dir'),
      ok('credentials-link'),
      problem('shadow-keychain'),
      { id: 'login', state: 'problem', fixable: false, blocked: false },
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    // 막힌 둘만 줄이 된다.
    expect(screen.getByTestId('agent-doctor-check-shadow-keychain')).toBeVisible();
    expect(screen.getByTestId('agent-doctor-check-login')).toBeVisible();
    expect(screen.queryByTestId('agent-doctor-check-cli')).toBeNull();
    // 안 그린 다섯이 사라진 것처럼 보이면 안 된다.
    expect(screen.getByTestId('agent-doctor-rest').textContent).not.toMatch(/\d/);
  });

  it('고칠 수 있는 것에만 버튼이 붙는다', async () => {
    diagnoseAgent.mockResolvedValue([
      problem('shadow-keychain', true),
      { id: 'login', state: 'problem', fixable: false, blocked: false },
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    expect(screen.getByTestId('agent-doctor-fix-shadow-keychain')).toBeVisible();
    // 앱이 못 고치는 것에 버튼을 달면, 눌렀는데 아무 일도 안 나는 화면이 된다.
    expect(screen.queryByTestId('agent-doctor-fix-login')).toBeNull();
  });

  it('고친 뒤에는 말이 아니라 **다시 잰 값**을 그린다', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli'), problem('shadow-keychain')]);
    repairAgentCheck.mockResolvedValue([ok('cli'), ok('shadow-keychain')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-fix-shadow-keychain')).toBeVisible());

    fireEvent.click(screen.getByTestId('agent-doctor-fix-shadow-keychain'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(repairAgentCheck).toHaveBeenCalledWith('claude-acp', 'shadow-keychain');
    expect(screen.queryByTestId('agent-doctor-check-shadow-keychain')).toBeNull();
  });

  it('모르는 것은 **괜찮음이 아니다** — 줄로 그려진다', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli'), unknown('login')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    const row = screen.getByTestId('agent-doctor-check-login');
    expect(row.dataset.state).toBe('unknown');
    // 모르는 것에 「고치기」를 달면 앱이 못 하는 일을 하겠다고 말하는 것이다.
    expect(screen.queryByTestId('agent-doctor-fix-login')).toBeNull();
    expect(screen.queryByTestId('agent-doctor-all-clear')).toBeNull();
  });

  it('앱이 못 고치는 문제에는 **사람이 할 일**을 적는다', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'cli', state: 'problem', fixable: false, blocked: false },
      problem('shadow-keychain'),
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    // 왜 안 되는지만 말하고 어디로 가면 되는지를 안 말하면 막다른 길이다.
    expect(screen.getByTestId('agent-doctor-next-cli')).toBeVisible();
    // 앱이 고칠 수 있는 것에는 버튼이 답이므로 문장을 더하지 않는다.
    expect(screen.queryByTestId('agent-doctor-next-shadow-keychain')).toBeNull();
  });

  it('「연결 다시 맺기」는 점검을 본 뒤에만 나온다', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    renderHarness();

    // 아무 문제 없는 사람에게 상시로 보여 주면 뭔가 잘못됐다는 신호로 읽힌다.
    expect(screen.queryByTestId('agent-doctor-reset')).toBeNull();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-reset')).toBeVisible());
  });

  it('다시 맺으면 **다시 잰 값**을 그린다', async () => {
    diagnoseAgent.mockResolvedValue([problem('config-dir')]);
    resetAgentConnection.mockResolvedValue([ok('config-dir')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-reset')).toBeVisible());

    fireEvent.click(screen.getByTestId('agent-doctor-reset'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(resetAgentConnection).toHaveBeenCalledWith('claude-acp');
  });

  /**
   * **무너진 앞단 위에 고치기 버튼을 세우지 않는다** (2026-08-20 워크스루).
   *
   * 도구가 아예 없는 사람에게 「앱 몫 설정 고치기」와 「연결 다시 맺기」를
   * 권하고 있었다. 눌러도 소용없다 — 띄울 도구 자체가 없으니까.
   */
  it('앞 단계가 막히면 뒷 단계의 수리를 권하지 않는다', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'cli', state: 'problem', fixable: false, blocked: false },
      { id: 'config-dir', state: 'problem', fixable: false, blocked: true },
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    expect(screen.queryByTestId('agent-doctor-fix-config-dir')).toBeNull();
    // 「연결 다시 맺기」도 같다 — 도구가 없는데 설정을 다시 만들어 봐야 소용없다.
    expect(screen.queryByTestId('agent-doctor-reset')).toBeNull();
    // 그래도 **무엇을 하면 되는지**는 남아 있어야 한다.
    expect(screen.getByTestId('agent-doctor-next-cli')).toBeVisible();
  });

  /**
   * **명령 원문을 먼저 보여 준다** — 원장 2026-08-20 (88) 의 조건 ②.
   *
   * 「이 앱에 설치」 버튼만 있고 무엇을 실행하는지 안 보여 주면, 그건 사용자가
   * 자기 기계에서 무슨 일이 일어나는지 모른 채 누르는 것이다.
   */
  it('설치 버튼 옆에 실행할 명령이 그대로 적힌다', async () => {
    diagnoseAgent.mockResolvedValue([{ id: 'cli', state: 'problem', fixable: false, blocked: false }]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /app/managed-node --global @anthropic-ai/claude-code@2.1.236');
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-install-plan')).toBeVisible());

    const card = screen.getByTestId('agent-doctor-install-plan').textContent ?? '';
    expect(card).toContain('--prefix');
    expect(card).toContain('@anthropic-ai/claude-code@2.1.236');
    expect(screen.getByTestId('agent-doctor-install')).toBeVisible();
  });

  it('깔 수 없는 도구에는 설치 제안을 안 낸다', async () => {
    diagnoseAgent.mockResolvedValue([{ id: 'cli', state: 'problem', fixable: false, blocked: false }]);
    agentInstallPlan.mockResolvedValue(null);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    // 확인한 적 없는 패키지를 사용자 기계에 깔겠다고 말하면 안 된다.
    expect(screen.queryByTestId('agent-doctor-install')).toBeNull();
    // 그래도 사람이 할 일은 남아 있어야 한다.
    expect(screen.getByTestId('agent-doctor-next-cli')).toBeVisible();
  });

  it('설치한 뒤에는 다시 잰 값을 그린다', async () => {
    diagnoseAgent.mockResolvedValue([{ id: 'cli', state: 'problem', fixable: false, blocked: false }]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /app/managed-node --global x@1.0.0');
    installAgentCli.mockResolvedValue([ok('cli')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-install')).toBeVisible());
    fireEvent.click(screen.getByTestId('agent-doctor-install'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(installAgentCli).toHaveBeenCalledWith('claude-acp');
  });

  it('도구가 멀쩡하면 설치 제안이 안 나온다', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /app/managed-node --global x@1.0.0');
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());

    // 멀쩡한 사람에게 설치 제안을 상시로 보여 주면 그건 안내가 아니라 광고다.
    expect(screen.queryByTestId('agent-doctor-install-plan')).toBeNull();
  });

  /**
   * **Node 도 앱이 받아 준다** — 원장 (89). 이것이 도구가 하나도 없는 사람의
   * 마지막 막다른 길이었다: 어댑터를 띄우려면 Node 가 필요한데 없으면 화면이
   * 할 수 있는 말이 「직접 설치하세요」뿐이었다.
   */
  it('Node 가 없으면 받을 주소와 해시를 보여 준다', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'launcher', state: 'problem', fixable: false, blocked: false },
    ]);
    nodeInstallPlan.mockResolvedValue('https://nodejs.org/dist/v24.18.0/node-v24.18.0-darwin-arm64.tar.gz (e1a97e14c99c)');
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-node-plan')).toBeVisible());

    const card = screen.getByTestId('agent-doctor-node-plan').textContent ?? '';
    // 어디서 받는지 · 무엇으로 대조하는지 둘 다 누르기 전에 읽을 수 있어야 한다.
    expect(card).toContain('https://nodejs.org/dist/');
    expect(card).toContain('e1a97e14c99c');
    expect(screen.getByTestId('agent-doctor-install-node')).toBeVisible();
  });

  it('등재 안 된 플랫폼에는 Node 받기를 안 낸다', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'launcher', state: 'problem', fixable: false, blocked: false },
    ]);
    nodeInstallPlan.mockResolvedValue(null);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    expect(screen.queryByTestId('agent-doctor-install-node')).toBeNull();
    // 그래도 사람이 할 일은 남아 있어야 한다.
    expect(screen.getByTestId('agent-doctor-next-launcher')).toBeVisible();
  });

  it('Node 를 받은 뒤에는 다시 잰 값을 그린다', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'launcher', state: 'problem', fixable: false, blocked: false },
    ]);
    nodeInstallPlan.mockResolvedValue('https://nodejs.org/dist/v24.18.0/x.tar.gz (abc123)');
    installManagedNode.mockResolvedValue([ok('launcher')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-install-node')).toBeVisible());
    fireEvent.click(screen.getByTestId('agent-doctor-install-node'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(installManagedNode).toHaveBeenCalledWith('claude-acp');
  });

  it('점검이 실패하면 그 사실을 말한다 — 조용히 빈 화면이 되지 않는다', async () => {
    diagnoseAgent.mockRejectedValue(new Error('boom'));
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-failure')).toBeVisible());
    expect(screen.queryByTestId('agent-doctor-all-clear')).toBeNull();
  });
});
