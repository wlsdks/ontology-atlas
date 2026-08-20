'use client';

import { isAgentDoctorAvailable } from '@/features/acp-doctor/model/acp-doctor';
import { useAgentDoctor } from '@/features/acp-doctor/ui/AgentDoctor';
import { ChevronDown, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from '@/shared/lib/tauri-acp';
import { isGuardedRuntime } from '@/features/acp-session/model/runtime-gate';
import { requestAgentChat } from '@/shared/lib/agent-chat-intent';

import { DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * 「실행기」 — 이 기기에서 앱이 부를 수 있는 코딩 에이전트 목록.
 *
 * ## 이 화면이 하는 일 하나
 *
 * **무엇을 지금 쓸 수 있는지 말한다.** 목록의 각 줄은 「이 도구로 여기서 바로
 * 대화할 수 있나」에 답하고, 못 하면 **무엇을 해야 하는지**까지 같은 줄에서
 * 말한다. 상태를 「설치됨/아님」 둘로 뭉개지 않는 이유가 그것이다 — 도구가
 * 없는 것과 Node 가 없는 것은 사용자가 할 일이 다르다.
 *
 * ## 두 갈래로 나눠 보여 준다
 *
 * 목록이 38줄이라 한 덩어리로 두면 훑기가 안 된다. **이 컴퓨터에서 실제로
 * 확인된 것**이 펼쳐져 있고 나머지는 접힌다 — 지금 할 수 있는 일이 먼저다.
 *
 * ⚠️ **「확인된 것」의 뜻이 한 번 틀렸다** (2026-08-16 소유자 지적: *"이렇게
 * 다 보여서 좀 이상한데"*). 종전 기준은 `state === 'ready'` 였는데, 그 값은
 * 「그 도구가 여기 있다」가 아니라 **「npx 가 있으니 띄울 수는 있다」**였다.
 * 우리가 감싸는 CLI 이름을 12개만 적어 둬서 나머지 26개는 확인할 방법 자체가
 * 없었는데도 20줄이 초록 「준비됨」을 달고 있었다. Rust 쪽에서 그 갈래를
 * `cli-unknown` 으로 갈랐고(`acp.rs`), 그래서 이 화면의 첫 묶음은 이제
 * **정말 확인한 것**만 담는다.
 *
 * ## 누가 대신 물어봐 주나 (소유자 확정 2026-08-16)
 *
 * 앱은 자기 설정으로 실행기를 띄워서, 볼트 밖 파일을 건드리려 할 때 사용자에게
 * 묻는다. 그런데 그 격리를 **우리가 실제로 재 본 실행기에만** 해 뒀다. 나머지는
 * 사용자가 그 도구에 해 둔 설정을 그대로 쓰므로, 그 도구를 「묻지 말고 다 해」로
 * 설정해 둔 사람에게는 앱에서 띄워도 안 묻는다.
 *
 * 그 사실은 숨기지 않는다 — 이 제품이 「곧 됩니다」를 안 쓰는 것과 같은 이유다.
 * 다만 **그것을 어디에 적느냐**는 세 번 틀렸고, 셋 다 같은 것을 가르쳤다:
 * 이 사실은 **배지 한 칸에 안 들어간다.** 「폴더 밖 파일을 건드릴 때 앱이 대신
 * 물어봐 줄 수 있느냐」는 조건과 결과가 다 있어야 뜻이 서는 문장이다.
 * 자세한 경위는 `RuntimeRow` 안의 주석에 있다.
 *
 * 그래서 **문장이 있어야 할 자리에 문장을 둔다** — 묶음 위 한 줄이고, 막아 주는
 * 도구의 **이름을 데이터에서 가져와** 댄다. 나중에 둘째가 생기면 문장이 저절로
 * 따라온다. 「지금은 Claude Code 뿐」이라고 손으로 적으면 그 문장은 그날부터
 * 썩기 시작한다.
 */

/**
 * 상태 → 배지 잉크. 색은 그 배지가 **무슨 사실을 나르는지**가 정하므로 값 층이
 * 아니라 여기서 넘긴다(`badgeClass` 는 기하만 낸다).
 *
 * 「준비됨」에만 success 를 쓴다 — 이 저장소에서 success 는 "연결됨 / 완료"
 * 처럼 잘 됐다는 뜻일 때만 쓰는 색이고, 쓰임을 넓히지 않는다. 조합은
 * `CommitDetail` 이 같은 종류의 배지에 쓰는 것을 그대로 따랐다 — 사본을 새로
 * 만들면 두 화면의 초록이 서로 달라진다.
 *
 * 나머지 상태는 **색으로 구별하지 않는다.** 「설치 필요」와 「Node 필요」를 색이
 * 다른 두 경고로 만들면 색이 정보를 나르는 유일한 채널이 되고, 정작 그 둘의
 * 차이는 색이 아니라 **글자**에 있다.
 */
const READY_INK =
  'bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]';

const NOT_READY_INK =
  'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]';


export function AcpRuntimeSettings() {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const [runtimes, setRuntimes] = useState<AcpRuntimeStatus[] | null>(null);
  const [checking, setChecking] = useState(false);
  /*
   * ⚠️ **아무것도 없는 사람에게는 처음부터 펴 둔다** (2026-08-20 워크스루).
   *
   * 확인된 도구가 0개면 위 칸은 「설치하면 여기에 나타나요」 한 줄뿐이고,
   * **설치 방법은 이 접힌 목록 안에만** 있었다. 즉 답이 두 클릭 아래에 숨어
   * 있었고, 그건 이 저장소가 강등 카드에 대해 금지한 모양 그대로다 —
   * 왜만 말하고 어디로를 안 말한다.
   *
   * 위에 볼 것이 있을 때만 접는다. 접는 이유가 「긴 목록이 짧은 목록을
   * 덮지 않게」인데, 짧은 목록이 없으면 덮을 것도 없다.
   */
  const [othersOpen, setOthersOpen] = useState(false);

  /**
   * 버튼으로 다시 찾기 — 누른 것에 대한 반응이라 「찾는 중」을 표시한다.
   * 누른 경우에는 **처음부터 로그인까지** 확인한다(기다릴 각오를 한 것이다).
   */
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setRuntimes(await detectAcpRuntimes({ probeLogin: true }));
    } finally {
      setChecking(false);
    }
  }, []);

  // 처음 한 번은 **버튼 경로를 쓰지 않는다.** 두 가지 이유다:
  // ① effect 본문에서 곧바로 상태를 바꾸면 렌더가 한 번 더 돈다
  // ② 이 칸이 닫힌 뒤에 응답이 오면 사라진 화면의 상태를 건드리게 된다
  // 「찾는 중」은 `runtimes === null` 이 이미 말하므로 따로 켤 것도 없다.
  useEffect(() => {
    // 없는 능력을 부르러 나서지 않는다. 브라우저에서는 답이 뻔하고, 부르는
    // 것 자체가 「혹시 되나」를 매번 시도하는 모양이 된다.
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    /*
     * **두 번 부른다.** 첫 번째는 로그인 확인 없이 — 디스크만 훑으므로 거의
     * 즉시 그려진다. 그다음 확인까지 해서 고친다.
     *
     * 종전에는 한 번에 다 했고, 그래서 화면이 뜨는 데 그 확인 시간이 그대로
     * 얹혔다(소유자: *"Agents 탭 누르면 로딩 속도가 1초인가 느린데?"*).
     * 목록을 먼저 그릴 수 있는데도 아무것도 안 보여 주고 있었던 것이다.
     *
     * 줄이 나중에 「준비됨」에서 「로그인 필요」로 바뀔 수 있다. 그건 숨길
     * 일이 아니라 **확인이 끝났다는 뜻**이고, 빈 화면 1초보다 낫다.
     */
    void detectAcpRuntimes().then((fast) => {
      if (cancelled) return;
      setRuntimes(fast);
      void detectAcpRuntimes({ probeLogin: true }).then((full) => {
        if (!cancelled && full) setRuntimes(full);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 브라우저는 프로세스를 띄울 수 없다 — 원리적으로 못 하는 일이라 이유와
  // 갈 곳을 함께 말한다(`.claude/rules/surfaces.md`).
  if (!isAcpBridgeAvailable()) {
    return (
      <SettingsGroup>
        <SettingsRow
          label={t('webLabel')}
          caption={t('webCaption')}
          testId="app-settings-runtimes-web"
          control={null}
        />
      </SettingsGroup>
    );
  }

  const ready = (runtimes ?? []).filter((r) => r.state === 'ready');
  const others = (runtimes ?? []).filter((r) => r.state !== 'ready');
  /*
   * 설명문에 들어갈 이름들 — **손으로 적지 않는다.** 격리되는 실행기가 늘면
   * 문장이 저절로 따라오고, 하나도 없으면 다른 문장으로 갈린다. 「지금은 Claude
   * Code 뿐」을 문자열에 박아 두면 그 문장은 그날부터 썩는다.
   */
  const guardedNames = ready
    .filter((r) => isGuardedRuntime(r.id, r.isolated))
    .map((r) => r.label);

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-runtimes">
      <div className="flex items-start justify-between gap-3 px-1">
        <p className="min-w-0 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
          {t('intro')}
        </p>
        <Chip
          size="lg"
          tone="secondary"
          data-testid="app-settings-runtimes-recheck"
          disabled={checking}
          onClick={() => void refresh()}
          className={DETAIL_TOGGLE_CHIP}
        >
          <RefreshCw size={ICON_SIZE.md} aria-hidden />
          {t('recheck')}
        </Chip>
      </div>

      {runtimes === null ? (
        <SettingsGroup>
          <SettingsRow label={t('checking')} control={null} testId="app-settings-runtimes-loading" />
        </SettingsGroup>
      ) : (
        <>
          {ready.some((r) => !isGuardedRuntime(r.id, r.isolated)) ? (
            <p
              data-testid="app-settings-runtimes-guard-note"
              data-guarded-count={guardedNames.length}
              className="break-keep px-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
            >
              {guardedNames.length > 0
                ? t('guardedExplainer', { names: guardedNames.join(' · ') })
                : t('guardedExplainerNone')}
            </p>
          ) : null}
          {/*
            디스크에 무엇이 생기는지 말한다 (2026-08-17).

            대화를 시작하면 Rust 가 앱 데이터 안에 그 도구용 설정 폴더를 만들고,
            사용자의 **실제 자격증명 파일에 심볼릭 링크를 건다**
            (`src-tauri/src/acp.rs` 의 `link_credentials`). 격리하면 로그인이
            깨지고, 비밀을 앱 폴더로 복사하는 것은 헌장이 막는 일이라 링크가
            그 사이의 답이다 — 그건 옳다. 다만 **아무 화면도 그 사실을 말하지
            않고 있었다.**

            바로 옆 API 키 칸은 키를 어떻게 두는지 두 문장으로 설명한다. 실제
            자격증명 파일을 건드리는 이쪽이 침묵하는 것은 앞뒤가 안 맞는다.
            게이트: `tests/contract/acp-disk-disclosure.contract.test.ts`.
          */}
          <p
            data-testid="app-settings-runtimes-disk-note"
            className="break-keep px-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {t('diskNote')}
          </p>
          <SettingsGroup label={t('readyHeading', { count: ready.length })}>
            {ready.length === 0 ? (
              <SettingsRow label={t('noneReady')} caption={t('noneReadyCaption')} control={null} />
            ) : (
              ready.map((runtime) => (
                <RuntimeRow key={runtime.id} runtime={runtime} onRuntimesChanged={() => void refresh()} />
              ))
            )}
          </SettingsGroup>

          {others.length > 0 ? (
            <div className="grid min-w-0 gap-1.5">
              <Chip
                size="lg"
                tone="secondary"
                data-testid="app-settings-runtimes-others-toggle"
                aria-expanded={othersOpen || ready.length === 0}
                onClick={() => setOthersOpen((open) => !open)}
                className={DETAIL_TOGGLE_CHIP}
              >
                <ChevronDown
                  size={ICON_SIZE.md}
                  aria-hidden
                  className={
                    othersOpen || ready.length === 0
                      ? 'rotate-180 transition-transform'
                      : 'transition-transform'
                  }
                />
                {ready.length === 0
                  ? t('othersHeadingEmpty', { count: others.length })
                  : t('othersHeading', { count: others.length })}
              </Chip>
              {othersOpen || ready.length === 0 ? (
                <>
                  {/* 「확인 못 함」이 무슨 뜻인지는 그 줄들이 보일 때만 말한다 —
                      안 펼친 사람에게는 설명할 것이 없다. */}
                  {others.some((r) => r.state === 'cli-unknown') ? (
                    <p
                      data-testid="app-settings-runtimes-unknown-note"
                      className="break-keep px-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
                    >
                      {t('unknownExplainer')}
                    </p>
                  ) : null}
                  <SettingsGroup>
                    {others.map((runtime) => (
                      <RuntimeRow
                        key={runtime.id}
                        runtime={runtime}
                        onRuntimesChanged={() => void refresh()}
                      />
                    ))}
                  </SettingsGroup>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function RuntimeRow({
  runtime,
  onRuntimesChanged,
}: {
  runtime: AcpRuntimeStatus;
  onRuntimesChanged?: () => void;
}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const isReady = runtime.state === 'ready';

  /*
   * ## 왜 「설치」 버튼이 아니라 **그 도구의 안내로 보내는 링크**인가
   *
   * 참고 제품(Buzz)의 같은 자리에는 `Install` 버튼이 있고, 누르면 **설치
   * 스크립트를 실제로 실행한다**(실측: `curl -fsSL https://…/install.sh | bash`
   * 를 `run_install_command_with_retry` 로 돌린다).
   *
   * 우리는 그것을 안 한다. 「아무도 검사하지 않은 코드를 돌릴 이유를 댈 수
   * 없다」가 이 저장소의 규칙이고(`forbidden.md`), 그 스크립트는 URL 뒤에 있어
   * **언제든 바뀔 수 있다** — 우리가 무엇을 실행하는지 diff 로 보여 줄 수 없다.
   *
   * ⚠️ 우리도 남의 코드를 돌리기는 한다(`npx -y <패키지>@<버전>`). 다르다고
   * 주장하는 근거는 셋이다: **버전이 못 박혀 있고**(그 URL 스크립트는 아니다),
   * 우리가 띄운 **자식 프로세스 안에서만 살고**(시스템 전역 설치가 아니다),
   * **사용자가 대화를 열 때** 일어난다(범용 「설치」 버튼이 아니다).
   *
   * 그래서 여기서 하는 일은 하나다 — **그 도구의 공식 안내로 보낸다.** 설치
   * 명령을 우리가 베껴 적지도 않는다(그건 그 벤더가 바꿀 수 있는 것이고,
   * 우리가 적어 두면 그 사본이 낡는다).
   */
  const website = isReady ? null : runtime.website;

  /*
   * **점검은 관문 있는 도구에만 낸다.** 격리를 재 본 적 없는 도구는 앱 몫 설정도
   * 자격증명 링크도 없어서 검사 목록이 거의 다 「확인 못 했어요」가 된다 —
   * 그건 도움이 아니라 소음이다. 웹에서는 프로세스도 키체인도 못 보므로 없다.
   */
  const doctor = useAgentDoctor(runtime.id, onRuntimesChanged);
  const showDoctor = isGuardedRuntime(runtime.id, runtime.isolated) && isAgentDoctorAvailable();

  /*
   * ⚠️ **결과는 행 「안」이 아니라 「아래」다.** `SettingsRow` 는
   * `flex items-center justify-between` 한 줄이라, 큰 덩어리를 컨트롤 자리에
   * 넣으면 남는 폭이 전부 이름과 버튼 사이의 틈으로 가고 진단이 행의 주인이
   * 된다(2026-08-20 소유자 반려). 행은 한 줄로 두고, 결과는 그 아래 전폭에
   * 놓는다.
   */
  return (
    <div className="min-w-0">
        <SettingsRow
        label={runtime.label}
        // 로그인만 안 된 도구에는 **할 일**을 적는다 — 그 상태에는 배지만 있고
        // 무엇을 하라는 말이 코드 어디에도 없었다(2026-08-16 검수).
        caption={runtime.state === 'login-needed' ? t('loginHint') : undefined}
        testId={`app-settings-runtime-${runtime.id}`}
        icon={runtime.icon}
        iconInk={runtime.brandInk}
        control={
          /* 소유자(2026-08-20): *"너무 버튼이 붙어있어서 답답하고"*. 컨트롤 셋과
           상태 배지가 한 줄에 서므로 `gap-1.5`(6px)로는 어디까지가 한 버튼인지
           눈이 못 가른다. 램프의 다음 칸으로 한 단 벌린다. */
        <span className="flex items-center gap-2">
            {/*
             * ⚠️ **배지를 세 번 고치고 결국 없앴다.** 기록해 둘 값어치가 있다:
             *
             * ① 못 막는 줄마다 **문장** → 20줄 중 18줄이 같은 문장이라 화면의
             *    절반이 사본이었다.
             * ② 못 막는 줄마다 **「확인 안 됨」 주황 배지** → 소유자: *"이게 무슨
             *    말인지 잘 이해 안 가고"*. 「확인」이 무엇의 확인인지 알 수 없고,
             *    19줄에 붙은 주황이 목록 전체를 결함처럼 보이게 했다.
             * ③ 되는 줄 하나에 **「물어보고 진행」** → 소유자: *"이건 뭔 말인지도
             *    모르겠고"*. 줄 수는 1개로 줄었지만 **말이 여전히 안 통했다.**
             *
             * 세 번의 공통점: 배지 한 칸(4~6글자)에 담기에는 이 사실이 너무 크다.
             * 「폴더 밖 파일을 건드릴 때 앱이 대신 물어봐 줄 수 있느냐」는 조건과
             * 결과가 다 있어야 뜻이 서는 문장이다. 그래서 **문장이 있어야 할
             * 자리에 문장을 두고**(묶음 위 한 줄, 이름까지 댄다), 줄에는 배지를
             * 안 단다. 목록은 조용해지고, 사실은 그대로 화면에 있다.
             *
             * ⚠️ **화면 밖에도 복사하지 않는다.** 한 번은 이 문장을 줄마다
             * `sr-only` 로 남겼는데, 그건 「같은 문장 19개」라는 바로 그 결함을
             * 안 보이는 층으로 옮긴 것이었다 — 낭독기로 듣는 사람은 같은 문장을
             * 19번 듣는다. 묶음 위 설명은 목록 **앞에** 있으므로 순서대로 읽는
             * 사람에게 먼저 도착한다. 그거면 된다.
             */}
            {/*
             * ⚠️ **연결로 넘어갈 문이 없었다** (2026-08-16 검수에서 적발).
             *
             * 첫 걸음 카드의 1단 이름은 「AI 에이전트 연결」이고 그 버튼이 여는
             * 곳이 여기다. 그런데 이 화면에 있던 것은 목록과 바깥 링크뿐이라,
             * 「연결」하러 온 사람이 **연결할 수가 없었다** — 대화를 여는 유일한
             * 자리는 그 대화창의 머리, 즉 이미 대화를 연 사람만 보는 곳이었다.
             *
             * 관문이 있는 도구에만 낸다. 관문이 없는 도구로 대화를 열면 이 화면이
             * 바로 위 문장에서 한 약속(폴더 밖은 먼저 물어본다)을 못 지킨다.
             */}
            {isReady && isGuardedRuntime(runtime.id, runtime.isolated) ? (
              <Chip
                size="sm"
                tone="accentOnTint"
                data-testid={`app-settings-runtime-chat-${runtime.id}`}
                onClick={() => requestAgentChat(runtime.id)}
                className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
              >
                <MessageSquare size={ICON_SIZE.sm} aria-hidden />
                {t('openChat')}
              </Chip>
            ) : null}
            {/*
             * **점검은 관문 있는 도구에만 낸다.** 격리를 재 본 적 없는 도구는
             * 앱 몫 설정도 자격증명 링크도 없어서, 검사 목록이 거의 다
             * 「확인 못 했어요」가 된다 — 그건 도움이 아니라 소음이다.
             *
             * 여기 두는 이유: 문제 카드는 **이미 대화를 연 사람**만 본다.
             * 「대화가 아예 안 열린다」로 막힌 사람이 찾아오는 곳은 이 화면이다.
             */}
            {showDoctor ? doctor.scanButton : null}
            {/*
             * ⚠️ 로그인만 안 된 도구에 「설치 방법」을 내밀고 있었다 — 이미
             * 설치한 사람에게. 할 일이 다르므로 문장도 다르다.
             */}
            {runtime.state === 'login-needed' ? null : website ? (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="app-settings-runtime-install"
                /* 소유자(2026-08-20): 박스로 둘러싼다. 옆의 두 컨트롤이 칩인데
                   이것만 맨 글자면 **한 줄에 두 종류의 컨트롤**이 서고, 그러면
                   이게 눌리는 것인지가 모양으로 안 읽힌다. 밖으로 나간다는
                   사실은 글리프(↗)가 계속 말한다. */
                className={controlClass({
                  shape: 'chip',
                  size: 'sm',
                  tone: 'muted',
                  hoverInk: 'strong',
                  className: 'shrink-0',
                })}
              >
                {/* 앱을 **떠나는** 링크라 글리프가 라벨 앞에 서고 스스로를 선언한다. */}
                <span aria-hidden data-external-link-marker>
                  ↗
                </span>
                {t('installGuide')}
              </a>
            ) : null}
            <span
              data-runtime-state={runtime.state}
              className={badgeClass({
                shape: 'micro',
                className: isReady ? READY_INK : NOT_READY_INK,
              })}
            >
              {t(`state.${runtime.state}`)}
            </span>
          </span>
        }
      />
      {showDoctor ? <div className="min-w-0 px-3 pb-2.5">{doctor.result}</div> : null}
    </div>
  );
}
