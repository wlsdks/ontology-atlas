'use client';

import { ChevronDown, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { badgeClass } from '@/shared/ui/badge-class';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from '@/shared/lib/tauri-acp';

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
 * 목록이 38줄이라 한 덩어리로 두면 훑기가 안 된다. 「바로 쓸 수 있는 것」이
 * 펼쳐져 있고 「설치가 필요한 것」은 접힌다 — 지금 할 수 있는 일이 먼저다.
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
  const [othersOpen, setOthersOpen] = useState(false);

  /** 버튼으로 다시 찾기 — 누른 것에 대한 반응이라 「찾는 중」을 표시한다. */
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setRuntimes(await detectAcpRuntimes());
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
    void detectAcpRuntimes().then((list) => {
      if (!cancelled) setRuntimes(list);
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
  const guardedNames = ready.filter((r) => r.isolated).map((r) => r.label);

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
          {ready.some((r) => !r.isolated) ? (
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
          <SettingsGroup label={t('readyHeading', { count: ready.length })}>
            {ready.length === 0 ? (
              <SettingsRow label={t('noneReady')} caption={t('noneReadyCaption')} control={null} />
            ) : (
              ready.map((runtime) => <RuntimeRow key={runtime.id} runtime={runtime} />)
            )}
          </SettingsGroup>

          {others.length > 0 ? (
            <div className="grid min-w-0 gap-1.5">
              <Chip
                size="lg"
                tone="secondary"
                data-testid="app-settings-runtimes-others-toggle"
                aria-expanded={othersOpen}
                onClick={() => setOthersOpen((open) => !open)}
                className={DETAIL_TOGGLE_CHIP}
              >
                <ChevronDown
                  size={ICON_SIZE.md}
                  aria-hidden
                  className={othersOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                />
                {t('othersHeading', { count: others.length })}
              </Chip>
              {othersOpen ? (
                <SettingsGroup>
                  {others.map((runtime) => (
                    <RuntimeRow key={runtime.id} runtime={runtime} />
                  ))}
                </SettingsGroup>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function RuntimeRow({ runtime }: { runtime: AcpRuntimeStatus }) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const isReady = runtime.state === 'ready';

  return (
    <SettingsRow
      label={runtime.label}
      testId={`app-settings-runtime-${runtime.id}`}
      icon={runtime.icon}
      iconInk={runtime.brandInk}
      control={
        <span className="flex items-center gap-1.5">
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
  );
}
