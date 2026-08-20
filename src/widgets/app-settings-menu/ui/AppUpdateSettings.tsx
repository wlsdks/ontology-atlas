'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import { useAppUpdateContext } from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * 「앱」 — 지금 쓰는 버전과 **직접 누르는 갱신 확인.**
 *
 * ## 왜 없었나 (2026-08-20 소유자 지적)
 *
 * 자동 확인과 우하단 토스트는 2026-07-27 부터 있었다. 그런데 **사용자가 직접
 * 누를 길이 없었다** — `useAppUpdate` 가 `check(manual)` 을 내주는데 저장소
 * 전체에서 그것을 부르는 곳이 **0곳**이었고, 「최신이에요」(`current` 단계)는
 * 토스트가 `null` 로 되돌려서 **그려질 수조차 없었다.** 설계는 다 해 두고
 * 배선을 안 한 상태였다.
 *
 * 그 사이에 뚫려 있던 구멍: 자동 확인은 **하루 한 번**이고 거절은 그 버전에
 * 한해 기억된다. 즉 한 번 「나중에」를 누른 사람은 다음 버전이 나오기 전까지
 * 갱신에 **접근할 방법이 아예 없었다.**
 *
 * ## 왜 여기서 설치까지 안 하나
 *
 * 내려받기·설치·재시작은 이미 토스트가 한다. 같은 흐름을 두 벌 만들면 진행률이
 * 두 곳에서 각각 그려지고, 어느 쪽이 진짜인지 아무도 모른다. 이 칸이 하는 일은
 * **확인을 시작하는 것** 하나이고, 결과는 늘 같은 자리(토스트)에서 이어진다.
 *
 * ## 웹에서는 그리지 않는다
 *
 * 브라우저 탭은 자기를 교체할 수 없다. 거기서 갱신을 말하는 것은 **할 수 없는
 * 일을 제안하는 것**이라, 강등 카드조차 두지 않고 절 자체가 없다.
 */
export function AppUpdateSettings() {
  const t = useTranslations('nav.settingsMenu.appUpdate');
  const update = useAppUpdateContext();
  const [version, setVersion] = useState<string | null>(null);

  /*
   * 지금 도는 버전은 **번들이 아는 값**에서 가져온다. 빌드 상수를 쓰면 「내가
   * 지금 쓰는 것」이 아니라 「이 소스가 만들어질 때의 것」을 말하게 된다.
   */
  useEffect(() => {
    if (!isDesktopShell()) return;
    let alive = true;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (alive) setVersion(value);
      })
      .catch(() => {
        // 못 읽으면 버전 줄을 안 그린다 — 모르는 값을 지어내지 않는다.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!isDesktopShell() || !update) return null;

  const phase = update.phase;
  const checking = phase.kind === 'checking';
  /*
   * **무엇을 말하나** — 잰 것만 말한다. 아직 안 눌렀으면 결과 줄이 없다.
   * `available` 뒤에는 토스트가 이어받으므로 여기서는 그 사실만 알린다.
   */
  const outcome = (() => {
    switch (phase.kind) {
      case 'current':
        return t('resultCurrent');
      case 'available':
        return t('resultAvailable', { version: phase.version });
      case 'downloading':
        return t('resultDownloading', { version: phase.version });
      case 'ready':
        return t('resultReady', { version: phase.version });
      case 'failed':
        return t('resultFailed');
      default:
        return undefined;
    }
  })();

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-update">
      <p className="min-w-0 break-keep px-1 text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('intro')}
      </p>
      <SettingsGroup>
        <SettingsRow
          label={t('versionLabel')}
          caption={version ? t('versionValue', { version }) : undefined}
          testId="app-settings-update-version"
          control={
            <Chip
              size="lg"
              tone="secondary"
              data-testid="app-settings-update-check"
              disabled={checking}
              onClick={update.checkNow}
              className={DETAIL_TOGGLE_CHIP}
            >
              <RefreshCw size={ICON_SIZE.md} aria-hidden />
              {checking ? t('checking') : t('check')}
            </Chip>
          }
        />
      </SettingsGroup>
      {outcome ? (
        <p
          data-testid="app-settings-update-result"
          data-phase={phase.kind}
          role="status"
          aria-live="polite"
          className="min-w-0 break-keep px-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {outcome}
        </p>
      ) : null}
    </div>
  );
}
