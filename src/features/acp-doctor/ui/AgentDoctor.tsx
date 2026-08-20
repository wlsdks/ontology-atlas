'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';
import { type AcpCheck, diagnoseAgent, repairAgentCheck } from '../model/acp-doctor';

/**
 * 연동 점검 — **왜 안 되는지 단계별로 재고, 고칠 수 있는 것은 여기서 고친다.**
 *
 * ## 왜 이 자리에 있나 (2026-08-20 소유자 지시)
 *
 * *"연동이 안 되면 사실상 못 쓰는 거잖아."* 막힌 사람이 이미 보고 있는 자리에
 * 둔다 — 점검을 어딘가 깊이 두면 막힌 사람은 찾으러 가야 하고, 대개 안 간다.
 *
 * ## ⚠️ 첫 판을 소유자가 반려했다 (2026-08-20): *"디자인적으로 많이 아쉬운데"*
 *
 * 결과 목록을 행의 **네 번째 플렉스 자식**으로 넣었더니 셋이 한꺼번에 무너졌다.
 *
 * ① **위계가 뒤집혔다.** 그 행의 일은 「이 도구가 있고, 여기서 대화를 연다」인데,
 *    부차적인 진단 7줄이 행의 오른쪽 절반을 먹고 「준비됨」 배지를 끝으로 밀어
 *    냈다. 눈이 먼저 닿아야 할 것이 이름과 버튼인데 진단이 이겼다.
 * ② **이름과 버튼 사이가 텅 비었다.** `justify-between` 한 줄에 큰 덩어리를
 *    끼우면 남는 폭이 전부 그 틈으로 간다.
 * ③ **「괜찮아요」가 7줄이었다.** 바로 그 파일(`AcpRuntimeSettings.tsx`)이
 *    *"20줄 중 18줄이 같은 문장이라 화면의 절반이 사본이었다"* 는 실패를 이미
 *    적어 두었는데, 같은 실패를 다시 했다.
 *
 * 그래서 셋을 고쳤다. **버튼은 행 안의 다른 컨트롤 옆에**, **결과는 행 아래
 * 전폭**(행은 다시 한 줄이 된다), 그리고 **다 괜찮으면 한 줄로 접는다** —
 * 막힌 것이 있을 때만 그 줄들을 편다. 사실은 그대로 화면에 있고(요약이 개수를
 * 댄다), 조용해지는 것은 사본뿐이다.
 *
 * ## 화면이 지키는 것 둘
 *
 * 1. **모르는 것을 초록으로 그리지 않는다.** 상태는 셋이고 `unknown` 은
 *    「확인할 방법이 없었다」다.
 * 2. **고쳤다고 말하지 않고 다시 잰 값을 보여 준다.** `acp_repair` 가 고친 뒤
 *    상태를 다시 재서 돌려준다.
 */
/**
 * 점검 버튼과 결과를 **따로** 내주는 훅.
 *
 * 하나의 컴포넌트가 둘 다 그리면 호출부가 그 둘을 갈라 놓을 수 없다 — 버튼은
 * 행 안에, 결과는 행 아래여야 하는데 한 덩어리면 그게 불가능하다. 그게 첫 판이
 * 무너진 구조적 이유다.
 */
export function useAgentDoctor(runtimeId: string) {
  const t = useTranslations('acpChat.doctor');
  const [checks, setChecks] = useState<AcpCheck[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    setBusy('scan');
    setFailed(false);
    try {
      setChecks(await diagnoseAgent(runtimeId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId]);

  const fix = useCallback(
    async (checkId: string) => {
      setBusy(checkId);
      setFailed(false);
      try {
        setChecks(await repairAgentCheck(runtimeId, checkId));
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
      }
    },
    [runtimeId],
  );

  const blocked = useMemo(
    () => (checks ?? []).filter((check) => check.state !== 'ok'),
    [checks],
  );

  const scanButton = (
    <button
      type="button"
      data-testid="agent-doctor-scan"
      disabled={busy !== null}
      onClick={() => void run()}
      className={controlClass({
        shape: 'chip',
        size: 'sm',
        tone: 'muted',
        hoverInk: 'strong',
        className: 'shrink-0',
      })}
    >
      {busy === 'scan' ? t('scanning') : t('scan')}
    </button>
  );

  const result =
    failed || checks ? (
      <div
        data-testid="agent-doctor"
        data-blocked={blocked.length}
        className="mt-1.5 min-w-0 border-t border-[color:var(--color-divider)] pt-2"
      >
        {failed ? (
          <p
            data-testid="agent-doctor-failure"
            className="break-keep text-label leading-prose text-[color:var(--color-status-danger)]"
          >
            {t('failed')}
          </p>
        ) : blocked.length === 0 ? (
          /*
           * **다 괜찮으면 한 줄이다.** 같은 문장 일곱 개는 정보가 아니라 사본이고,
           * 이 화면은 그 실패를 이미 한 번 겪었다. 개수를 대므로 무엇을 쟀는지는
           * 그대로 화면에 있다.
           */
          <p
            data-testid="agent-doctor-all-clear"
            className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]"
          >
            {t('allClear', { count: checks?.length ?? 0 })}
          </p>
        ) : (
          <ul data-testid="agent-doctor-checks" className="flex min-w-0 flex-col gap-1.5">
            {blocked.map((check) => (
              <li
                key={check.id}
                data-testid={`agent-doctor-check-${check.id}`}
                data-state={check.state}
                className="flex min-w-0 items-start gap-2 break-keep text-label leading-prose"
              >
                {/*
                  점 하나로 상태를 말하되 **색만으로 구분하지 않는다** — 바로 옆
                  문구가 같은 것을 글자로도 말한다.
                */}
                <span
                  aria-hidden
                  className={`mt-[0.45em] size-1.5 shrink-0 rounded-full ${
                    check.state === 'problem'
                      ? 'bg-[color:var(--color-status-danger)]'
                      : 'bg-[color:var(--color-text-quaternary)]'
                  }`}
                />
                <span className="min-w-0 flex-1 text-[color:var(--color-text-secondary)]">
                  {t(`check.${check.id}`)}
                  <span className="ml-1.5 text-[color:var(--color-text-quaternary)]">
                    {t(`state.${check.state}`)}
                  </span>
                </span>
                {check.state === 'problem' && check.fixable ? (
                  <button
                    type="button"
                    data-testid={`agent-doctor-fix-${check.id}`}
                    disabled={busy !== null}
                    onClick={() => void fix(check.id)}
                    className={controlClass({ shape: 'chip', size: 'sm', tone: 'accent', className: 'shrink-0' })}
                  >
                    {busy === check.id ? t('fixing') : t('fix')}
                  </button>
                ) : null}
              </li>
            ))}
            {/* 통과한 것도 개수로는 남는다 — 「무엇을 안 쟀나」가 안 보이면 안 된다. */}
            {(checks?.length ?? 0) > blocked.length ? (
              <li
                data-testid="agent-doctor-rest"
                className="break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
              >
                {t('restFine', { count: (checks?.length ?? 0) - blocked.length })}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    ) : null;

  return { scanButton, result };
}
