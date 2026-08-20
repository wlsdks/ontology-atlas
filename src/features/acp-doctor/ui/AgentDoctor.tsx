'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CheckCircle2, ChevronDown, RotateCcw, Stethoscope } from 'lucide-react';

import { Chip } from '@/shared/ui/controls';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { formatDownloadProgress } from '@/shared/lib/progress-format';
import {
  type AcpCheck,
  type AcpInstallProgress,
  agentInstallPlan,
  diagnoseAgent,
  formatBytes,
  installAgentCli,
  installManagedNode,
  listenInstallProgress,
  nodeInstallPlan,
  repairAgentCheck,
  resetAgentConnection,
} from '../model/acp-doctor';

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
/**
 * 사람이 할 일을 적어 둔 검사. 앱이 못 고치는 문제에만 뜻이 있다.
 *
 * 여기 없는 id 는 문구도 없으므로 아무것도 안 그린다 — 없는 문구를 부르면
 * 화면에 키가 그대로 찍힌다.
 */
const NEXT_STEP = new Set(['cli', 'launcher', 'login', 'gate']);

export function useAgentDoctor(
  runtimeId: string,
  /**
   * 앱이 뭔가 바꿨을 때 부르는 것 — 목록을 다시 재게 한다.
   *
   * 없으면 설치·수리 직후에 **위의 배지가 옛말을 하고 바로 아래 진단이 새 말을
   * 한다.** 한 화면에서 두 문장이 어긋나는 것이 이 라운드 내내 고쳐 온 결함
   * 그 자체라, 여기서 다시 만들지 않는다.
   */
  onChanged?: () => void,
) {
  const t = useTranslations('acpChat.doctor');
  const [checks, setChecks] = useState<AcpCheck[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /*
   * **설치가 어디까지 왔나.** `null` 이면 그린 적이 없다는 뜻이고, 아무것도
   * 안 그린다 — 시작하지 않은 일에 0% 막대를 세우지 않는다.
   */
  const [progress, setProgress] = useState<AcpInstallProgress | null>(null);

  /*
   * 구독은 **한 번만** 붙인다. 설치를 누를 때마다 붙였다 떼면 Rust 가 먼저 낸
   * 첫 이벤트를 놓친다 — 이 파일 위쪽의 `acp://exit` 배선이 같은 이유로 스레드로
   * 옮겨진 적이 있다.
   */
  useEffect(() => {
    let alive = true;
    let stop: (() => void) | null = null;
    void listenInstallProgress(runtimeId, (next) => {
      if (alive) setProgress(next);
    }).then((unlisten) => {
      if (alive) stop = unlisten;
      else unlisten();
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [runtimeId]);

  const run = useCallback(async () => {
    setBusy('scan');
    setFailed(false);
    // 다시 재기 시작하면 **지난 설치의 결과 줄은 지운다** — 방금 한 일이
    // 아닌 것을 「방금 됐어요」처럼 남겨 두지 않는다.
    setProgress(null);
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
      onChanged?.();
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
      }
    },
    [runtimeId, onChanged],
  );

  const reset = useCallback(async () => {
    setBusy('reset');
    setFailed(false);
    try {
      setChecks(await resetAgentConnection(runtimeId));
      onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId, onChanged]);

  /**
   * 앞 단계가 막혔나 — 그러면 「연결 다시 맺기」도 소용없다. 도구가 없는데
   * 설정 폴더를 다시 만들어 봐야 대화는 안 열린다(2026-08-20 워크스루).
   */
  /**
   * **명령 원문을 먼저 보여 준다** — 원장 2026-08-20 (88) 의 조건 ②.
   *
   * 점검에서 「도구가 없다」가 나왔을 때만 물어본다. 멀쩡한 사람에게 설치
   * 제안을 상시로 보여 주면 그건 안내가 아니라 광고다.
   */
  const [installPlan, setInstallPlan] = useState<string | null>(null);
  const toolMissing = useMemo(
    () => (checks ?? []).some((check) => check.id === 'cli' && check.state === 'problem'),
    [checks],
  );
  useEffect(() => {
    // effect 본문에서 동기로 setState 하지 않는다(래칫이 잡는다) — 「도구가
    // 멀쩡할 때 안 보인다」는 상태를 지우는 것이 아니라 **그리지 않는 것**으로
    // 지킨다. 아래 렌더 조건이 `toolMissing` 을 함께 본다.
    if (!toolMissing) return;
    let alive = true;
    void agentInstallPlan(runtimeId).then((plan) => {
      if (alive) setInstallPlan(plan);
    });
    return () => {
      alive = false;
    };
  }, [toolMissing, runtimeId]);

  /**
   * **Node 도 앱이 받아 줄 수 있다** — 원장 (89). 「도구를 띄울 수 있나」가
   * 막혔을 때만 물어본다. 이것이 도구가 하나도 없는 사람의 마지막 막다른
   * 길이었다.
   */
  const [nodePlan, setNodePlan] = useState<string | null>(null);
  const launcherMissing = useMemo(
    () => (checks ?? []).some((check) => check.id === 'launcher' && check.state === 'problem'),
    [checks],
  );
  useEffect(() => {
    if (!launcherMissing) return;
    let alive = true;
    void nodeInstallPlan().then((plan) => {
      if (alive) setNodePlan(plan);
    });
    return () => {
      alive = false;
    };
  }, [launcherMissing]);

  const getNode = useCallback(async () => {
    setBusy('node');
    setFailed(false);
    try {
      setChecks(await installManagedNode(runtimeId));
      onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId, onChanged]);

  const install = useCallback(async () => {
    setBusy('install');
    setFailed(false);
    try {
      setChecks(await installAgentCli(runtimeId));
      onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId, onChanged]);

  const prerequisiteBlocked = useMemo(
    () => (checks ?? []).some((check) => check.blocked),
    [checks],
  );

  const blocked = useMemo(
    () => (checks ?? []).filter((check) => check.state !== 'ok'),
    [checks],
  );

  const scanButton = (
    <>
    {/*
      ⚠️ **프리미티브로 쓴다** (2026-08-20 소유자: *"버튼은 사이즈 통일좀"*).
      손으로 쓴 `<button>` + `controlClass` 는 크기 클래스가 같아도 옆의
      `Chip`(아이콘을 안고 있다)과 **다른 물건으로 읽힌다** — 그리고 이
      저장소에는 손으로 쓴 컨트롤을 늘리지 못하게 하는 래칫이 이미 있다.
    */}
    <Chip
      size="sm"
      tone="muted"
      hoverInk="strong"
      data-testid="agent-doctor-scan"
      disabled={busy !== null}
      onClick={() => void run()}
      className="shrink-0"
    >
      <Stethoscope size={ICON_SIZE.sm} aria-hidden />
      {busy === 'scan' ? t('scanning') : t('scan')}
    </Chip>
    {/*
      **「로그아웃」이 아니라 「다시 맺기」다.** 이 앱에는 앱 몫 로그인이 없어서
      로그아웃을 내주면 남의 로그인을 지우거나 그런 척하게 된다. 앱이 만든 것만
      지우고 다시 만드는 것이 이 구조에서 「재연동」의 정확한 뜻이다.

      **점검 결과를 본 뒤에만 낸다.** 아무 문제 없는 사람에게 「다시 맺기」를
      상시로 보여 주면, 그건 뭔가 잘못됐다는 신호로 읽힌다.
    */}
    {checks && !prerequisiteBlocked ? (
      <Chip
        size="sm"
        tone="muted"
        hoverInk="strong"
        data-testid="agent-doctor-reset"
        disabled={busy !== null}
        onClick={() => void reset()}
        className="ml-1.5 shrink-0"
      >
        <RotateCcw size={ICON_SIZE.sm} aria-hidden />
        {busy === 'reset' ? t('resetting') : t('reset')}
      </Chip>
    ) : null}
    </>
  );

  /**
   * **설치가 도는 동안 화면이 말을 한다.**
   *
   * 규율 셋:
   *
   * ① **모르는 퍼센트를 그리지 않는다.** 분모가 있는 것은 Node 내려받기뿐이고,
   *    npm 은 분모가 없으므로 막대 대신 **그 도구가 실제로 뱉은 줄**을 보여
   *    준다. 이 앱의 갱신 토스트가 이미 같은 규율을 따른다.
   * ② **끝났다는 것을 남긴다.** 소유자가 물은 「완료된것도 체크해주고 하나」의
   *    답이 이 줄이다 — 목록이 조용히 초록으로 바뀌는 것만으로는 방금 누른
   *    것이 됐는지 알 수 없다.
   * ③ **장식이 없다.** 무채색 트랙 + 인디고 한 색. 이 저장소의 헌장 그대로다.
   */
  const percent =
    progress && progress.received !== null
      ? formatDownloadProgress(progress.received, progress.total)
      : null;
  const doneNow = progress?.stage === 'done';
  const progressRow = progress ? (
    <div
      data-testid="agent-doctor-progress"
      data-job={progress.job}
      data-stage={progress.stage}
      role="status"
      aria-live="polite"
      className="mb-2 flex min-w-0 flex-col gap-1"
    >
      <p className="flex min-w-0 items-center gap-1.5 break-keep text-label leading-prose text-[color:var(--color-text-secondary)]">
        {doneNow ? (
          <CheckCircle2
            size={ICON_SIZE.sm}
            aria-hidden
            className="shrink-0 text-[color:var(--color-success-text-a90)]"
          />
        ) : null}
        <span className="min-w-0 flex-1">
          {t(`progress.${progress.job}.${progress.stage}`)}
          {percent ? (
            <span className="ml-1.5 text-[color:var(--color-text-tertiary)]">
              {percent}
              {progress.total !== null ? (
                <span className="ml-1 text-[color:var(--color-text-quaternary)]">
                  {formatBytes(progress.received ?? 0)} / {formatBytes(progress.total)}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </p>
      {percent ? (
        /* 분모를 아는 동안에만 막대를 세운다. 모르면 막대 자체가 거짓말이다. */
        <span
          data-testid="agent-doctor-progress-bar"
          aria-hidden
          className="block h-1 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
        >
          <span
            className="block h-full rounded-full bg-[color:var(--color-indigo-brand)] transition-[width]"
            style={{ width: percent }}
          />
        </span>
      ) : progress.note ? (
        /*
         * 퍼센트가 없을 때 보여 주는 것은 **그 도구가 뱉은 줄 그대로**다.
         * 한 줄로 자른다 — npm 은 수백 줄을 뱉고, 그걸 다 부으면 안내가 아니다.
         */
        <code
          data-testid="agent-doctor-progress-note"
          className="block min-w-0 truncate text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {progress.note}
        </code>
      ) : null}
    </div>
  ) : null;

  const result =
    failed || checks || progress ? (
      <div
        data-testid="agent-doctor"
        data-blocked={blocked.length}
        className="mt-1.5 min-w-0 border-t border-[color:var(--color-divider)] pt-2"
      >
        {progressRow}
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
           * 이 화면은 그 실패를 이미 한 번 겪었다.
           *
           * ⚠️ **개수를 세어 주는 것도 반려됐다** (2026-08-20, 소유자:
           * *"3단계 괜찮아요 이런 말 뭔지 알아듣지를 못하겠어"*). 「단계」는
           * 우리 내부 말이고, 게다가 도구마다 검사 수가 달라서(Claude 7 ·
           * Codex 3) **사용자가 알 수 없는 이유로 숫자가 달라 보인다** — 그
           * 숫자는 정보가 아니라 우리 구현이 새어 나온 것이었다.
           *
           * 그래서 상태는 사람 말로 한 줄만 하고, 무엇을 봤는지는 **접어 둔다.**
           * 궁금한 사람은 펴 보면 되고, 아닌 사람에게는 한 줄이다.
           *
           * ⚠️ **누를 수 있다는 것이 보여야 한다** (2026-08-20 소유자:
           * *"이게 열었다 닫았다가 가능한건지?"*). 글자만 두면 `<details>` 여도
           * 아무도 그것을 모른다. 이 화면이 이미 쓰는 표시를 그대로 쓴다 —
           * 열리면 도는 갈매기표.
           */
          <details data-testid="agent-doctor-all-clear" className="group">
            <summary
              className={controlClass({
                shape: 'link',
                size: 'sm',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'list-none',
              })}
            >
              {t('allClear')}
              <span className="ml-1.5 inline-flex items-center gap-1 text-[color:var(--color-text-quaternary)]">
                {t('whatWeChecked')}
                <ChevronDown
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className="transition-transform group-open:rotate-180"
                />
              </span>
            </summary>
            <ul
              data-testid="agent-doctor-checked-list"
              className="mt-1.5 flex min-w-0 flex-col gap-1"
            >
              {(checks ?? []).map((check) => (
                <li
                  key={check.id}
                  className="break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
                >
                  {t(`check.${check.id}`)}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <ul data-testid="agent-doctor-checks" className="flex min-w-0 flex-col gap-1.5">
            {blocked.map((check) => (
              <li
                key={check.id}
                data-testid={`agent-doctor-check-${check.id}`}
                data-state={check.state}
                className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 break-keep text-label leading-prose"
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
                {/*
                  **앱이 못 고치는 것에는 사람이 할 일을 적는다.** 이 저장소가
                  강등 카드에 대해 정해 둔 것과 같은 규율이다 — 왜 안 되는지만
                  말하고 어디로 가면 되는지를 안 말하면, 그건 막다른 길이다.
                */}
                {check.state === 'problem' && check.fixable ? (
                  <Chip
                    size="sm"
                    tone="accentOnTint"
                    data-testid={`agent-doctor-fix-${check.id}`}
                    disabled={busy !== null}
                    onClick={() => void fix(check.id)}
                    className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
                  >
                    {busy === check.id ? t('fixing') : t('fix')}
                  </Chip>
                ) : null}
                {check.id === 'cli' && check.state === 'problem' && toolMissing && installPlan ? (
                  /*
                    조건 ②④ 가 화면에 보인다: 무엇을 실행하는지 원문 그대로,
                    그리고 어디에만 깔리는지. 누르기 전에 둘 다 읽을 수 있다.
                  */
                  <span
                    data-testid="agent-doctor-install-plan"
                    className="w-full basis-full min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
                  >
                    <span className="block break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('installPlanTitle')}
                    </span>
                    {/*
                      ⚠️ **한 줄로 고정하지 않는다** (2026-08-20 소유자: *"이거 왜이래
                      디자인"*). 실측: 이 명령은 **142자**이고 caption(11px) 기준 약
                      900px 인데, 설정 시트의 오른쪽 칸은 **698px**(880 − LNB 180)
                      이다. 종전에는 `whitespace-pre` 로 한 줄에 묶고 넘치는 1/3 을
                      가로 스크롤 뒤에 뒀는데, **가로 스크롤은 아무도 발견하지
                      못한다** — 즉 조건 ②(무엇을 실행하는지 먼저 보여 준다)를
                      화면이 실제로는 안 지키고 있었다.

                      경로에는 공백이 있으므로(`Application Support`) 단어 경계로만
                      접으면 여전히 넘친다. `break-all` 이 어디서든 접게 한다.
                    */}
                    <code className="mt-1 block min-w-0 break-all whitespace-pre-wrap text-caption leading-caption text-[color:var(--color-text-secondary)]">
                      {installPlan}
                    </code>
                    <span className="mt-1.5 block break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                      {t('installPlanNote')}
                    </span>
                    <span className="mt-2 block">
                      <Chip
                        size="sm"
                        tone="accentOnTint"
                        data-testid="agent-doctor-install"
                        disabled={busy !== null}
                        onClick={() => void install()}
                        className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
                      >
                        {busy === 'install' ? t('installing') : t('install')}
                      </Chip>
                    </span>
                  </span>
                ) : null}
                {check.id === 'launcher' && check.state === 'problem' && launcherMissing && nodePlan ? (
                  <span
                    data-testid="agent-doctor-node-plan"
                    className="w-full basis-full min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
                  >
                    <span className="block break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('nodePlanTitle')}
                    </span>
                    <code className="mt-1 block min-w-0 break-all whitespace-pre-wrap text-caption leading-caption text-[color:var(--color-text-secondary)]">
                      {nodePlan}
                    </code>
                    <span className="mt-1.5 block break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                      {t('nodePlanNote')}
                    </span>
                    <span className="mt-2 block">
                      <Chip
                        size="sm"
                        tone="accentOnTint"
                        data-testid="agent-doctor-install-node"
                        disabled={busy !== null}
                        onClick={() => void getNode()}
                        className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
                      >
                        {busy === 'node' ? t('installingNode') : t('installNode')}
                      </Chip>
                    </span>
                  </span>
                ) : null}
                {/*
                  ⚠️ **앱이 대신 해 줄 수 있으면 「직접 하세요」를 말하지 않는다.**

                  2026-08-20 스크린샷에서 두 문장이 한 화면에 같이 서 있었다:
                  바로 위 「이 앱에 설치」 버튼과, 그 아래 *"이 목록에서 그 도구의
                  「설치 방법」을 눌러 설치한 뒤, 위의 「다시 확인」을 눌러 주세요"*.
                  앱이 해 주겠다고 해 놓고 같은 자리에서 직접 하라고 시키는 것은
                  안내가 아니라 **모순**이고, 사용자는 둘 중 무엇이 진짜인지 모른다.

                  그래서 이 자리는 **앱이 내줄 길이 없을 때만** 말한다.
                */}
                {check.state === 'problem' &&
                !check.fixable &&
                NEXT_STEP.has(check.id) &&
                !(check.id === 'cli' && installPlan) &&
                !(check.id === 'launcher' && nodePlan) ? (
                  <span
                    data-testid={`agent-doctor-next-${check.id}`}
                    className="w-full basis-full break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
                  >
                    {t(`next.${check.id}`)}
                  </span>
                ) : null}
              </li>
            ))}
            {/* 통과한 것도 개수로는 남는다 — 「무엇을 안 쟀나」가 안 보이면 안 된다. */}
            {(checks?.length ?? 0) > blocked.length ? (
              <li
                data-testid="agent-doctor-rest"
                className="break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
              >
                {t('restFine')}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    ) : null;

  return { scanButton, result };
}
