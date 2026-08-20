'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';
import { type AcpCheck, diagnoseAgent, repairAgentCheck } from '../model/acp-doctor';

/**
 * 연동 점검 — **왜 안 되는지 단계별로 재고, 고칠 수 있는 것은 여기서 고친다.**
 *
 * ## 왜 이 자리에 있나 (2026-08-20 소유자 지시)
 *
 * *"연동이 안 되면 사실상 못 쓰는 거잖아."* 이 카드는 사용자가 **이미 막혀
 * 있을 때** 보고 있는 자리다. 점검을 설정 어딘가에 두면 막힌 사람은 그것을
 * 찾으러 가야 하고, 대개 안 간다.
 *
 * ## 화면이 지키는 것 둘
 *
 * 1. **모르는 것을 초록으로 그리지 않는다.** 상태는 셋이고(`ok`·`problem`·
 *    `unknown`), `unknown` 은 「확인할 방법이 없었다」다. 이 저장소가 실행기
 *    배지에서 이미 정한 규율과 같다.
 * 2. **고쳤다고 말하지 않고 다시 잰 값을 보여 준다.** `acp_repair` 는 고친 뒤
 *    상태를 다시 재서 돌려주므로, 「고쳤습니다」라고 적고 실제로는 그대로인
 *    경우가 생기지 않는다.
 */
export function AgentDoctor({ runtimeId }: { runtimeId: string }) {
  const t = useTranslations('acpChat.doctor');
  const [checks, setChecks] = useState<AcpCheck[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy('scan');
    setFailure(null);
    try {
      setChecks(await diagnoseAgent(runtimeId));
    } catch (error) {
      setFailure(String(error));
    } finally {
      setBusy(null);
    }
  }, [runtimeId]);

  const fix = useCallback(
    async (checkId: string) => {
      setBusy(checkId);
      setFailure(null);
      try {
        setChecks(await repairAgentCheck(runtimeId, checkId));
      } catch (error) {
        setFailure(String(error));
      } finally {
        setBusy(null);
      }
    },
    [runtimeId],
  );

  return (
    <div data-testid="agent-doctor" className="mt-3">
      <button
        type="button"
        data-testid="agent-doctor-scan"
        disabled={busy !== null}
        onClick={run}
        className={controlClass({ shape: 'chip', size: 'sm', tone: 'muted', hoverInk: 'strong' })}
      >
        {busy === 'scan' ? t('scanning') : t('scan')}
      </button>

      {failure ? (
        <p
          data-testid="agent-doctor-failure"
          className="mt-2 break-keep text-label leading-prose text-[color:var(--color-status-danger)]"
        >
          {t('failed')}
        </p>
      ) : null}

      {checks ? (
        <ul data-testid="agent-doctor-checks" className="mt-2 flex flex-col gap-1.5">
          {checks.map((check) => (
            <li
              key={check.id}
              data-testid={`agent-doctor-check-${check.id}`}
              data-state={check.state}
              className="flex items-start gap-2 break-keep text-label leading-prose"
            >
              {/*
                점 하나로 상태를 말한다. **색만으로 구분하지 않는다** — 바로
                옆의 문구가 같은 것을 글자로도 말하므로, 색을 못 가르는 사람도
                읽을 수 있다(이 저장소의 도해 규율).
              */}
              <span
                aria-hidden
                className={`mt-[0.45em] size-1.5 shrink-0 rounded-full ${
                  check.state === 'ok'
                    ? 'bg-[color:var(--color-status-success)]'
                    : check.state === 'problem'
                      ? 'bg-[color:var(--color-status-danger)]'
                      : 'bg-[color:var(--color-text-quaternary)]'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="text-[color:var(--color-text-secondary)]">
                  {t(`check.${check.id}`)}
                </span>
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
                  className={controlClass({ shape: 'chip', size: 'sm', tone: 'accent' })}
                >
                  {busy === check.id ? t('fixing') : t('fix')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
