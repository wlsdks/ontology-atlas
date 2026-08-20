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

vi.mock('../model/acp-doctor', async () => {
  const actual = await vi.importActual<typeof import('../model/acp-doctor')>('../model/acp-doctor');
  return {
    ...actual,
    diagnoseAgent: (runtimeId: string) => diagnoseAgent(runtimeId),
    repairAgentCheck: (runtimeId: string, checkId: string) => repairAgentCheck(runtimeId, checkId),
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

const ok = (id: string): AcpCheck => ({ id, state: 'ok', fixable: false });
const problem = (id: string, fixable = true): AcpCheck => ({ id, state: 'problem', fixable });
const unknown = (id: string): AcpCheck => ({ id, state: 'unknown', fixable: false });

beforeEach(() => {
  diagnoseAgent.mockReset();
  repairAgentCheck.mockReset();
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
      { id: 'login', state: 'problem', fixable: false },
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
      { id: 'login', state: 'problem', fixable: false },
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

  it('점검이 실패하면 그 사실을 말한다 — 조용히 빈 화면이 되지 않는다', async () => {
    diagnoseAgent.mockRejectedValue(new Error('boom'));
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-failure')).toBeVisible());
    expect(screen.queryByTestId('agent-doctor-all-clear')).toBeNull();
  });
});
