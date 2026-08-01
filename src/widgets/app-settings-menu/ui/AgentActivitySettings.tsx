'use client';

import { useTranslations } from 'next-intl';

import { AGENT_NOTIFICATION_KINDS } from '@/shared/lib/agent-notifications';
import {
  useAgentActivityStatusEnabled,
  useAgentNotificationsEnabled,
  useMutedAgentNotificationKinds,
  writeAgentActivityStatus,
  writeAgentNotificationsEnabled,
  writeMutedAgentNotificationKinds,
} from '@/shared/lib/appearance-preferences';
import { SegmentSwitch, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * 「작업 중 표시」·「알림」 설정.
 *
 * **기본이 켜짐**인 이유는 프레임 계기와 다르다 — 계기는 진단 도구라 옵트인이고,
 * 이건 *"내 폴더에서 지금 일이 벌어지고 있다"* 는 **사실**이다. 사실을 옵트인
 * 뒤에 숨기면 켠 적 없는 사람은 자기 폴더가 고쳐지는 동안 아무것도 못 본다.
 * 그래서 이 칸은 **끄는** 쪽으로만 쓰인다.
 *
 * 갈래 고르기가 「알림」 아래 들여쓰기로 있는 이유: 알림을 통째로 끈 사람에게
 * 갈래 여섯 줄은 결정이 아니라 소음이다. 켜져 있을 때만 나타난다.
 */
export function AgentActivitySettings() {
  const t = useTranslations('nav.settingsMenu');
  const tEvent = useTranslations('agentActivity');
  const statusOn = useAgentActivityStatusEnabled();
  const notificationsOn = useAgentNotificationsEnabled();
  const muted = useMutedAgentNotificationKinds();

  const onOff = [
    { value: true, label: t('toggleOn') },
    { value: false, label: t('toggleOff') },
  ];

  return (
    <SettingsGroup>
      <SettingsRow
        testId="app-settings-agent-status"
        label={t('agentStatusLabel')}
        caption={t('agentStatusCaption')}
        control={
          <SegmentSwitch
            ariaLabel={t('agentStatusLabel')}
            testId="app-settings-agent-status-switch"
            value={statusOn}
            onChange={writeAgentActivityStatus}
            options={onOff}
          />
        }
      />
      <SettingsRow
        testId="app-settings-agent-notifications"
        label={t('agentNotificationsLabel')}
        caption={t('agentNotificationsCaption')}
        control={
          <SegmentSwitch
            ariaLabel={t('agentNotificationsLabel')}
            testId="app-settings-agent-notifications-switch"
            value={notificationsOn}
            onChange={writeAgentNotificationsEnabled}
            options={onOff}
          />
        }
      />
      {notificationsOn ? (
        <SettingsRow
          testId="app-settings-agent-notification-kinds"
          label={t('agentNotificationKindsLabel')}
          caption={t('agentNotificationKindsCaption')}
          control={
            <div className="flex flex-wrap justify-end gap-1.5">
              {AGENT_NOTIFICATION_KINDS.map((kind) => {
                const on = !muted.has(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    data-testid={`app-settings-agent-kind-${kind}`}
                    onClick={() => {
                      const next = new Set(muted);
                      if (on) next.add(kind);
                      else next.delete(kind);
                      writeMutedAgentNotificationKinds(next);
                    }}
                    className={
                      on
                        ? 'flex h-8 items-center rounded-chip border border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-a14)] px-2.5 text-body text-[color:var(--color-indigo-accent)] transition-colors'
                        : 'flex h-8 items-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2.5 text-body text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]'
                    }
                  >
                    {tEvent(EVENT_LABEL_KEY[kind])}
                  </button>
                );
              })}
            </div>
          }
        />
      ) : null}
    </SettingsGroup>
  );
}

/** 갈래 → 문구 키. 알림함과 **같은 어휘**를 쓴다 — 이름이 두 벌이면 같은 것으로 안 읽힌다. */
const EVENT_LABEL_KEY: Readonly<Record<(typeof AGENT_NOTIFICATION_KINDS)[number], string>> = {
  'task-start': 'event.taskStart',
  'task-end': 'event.taskEnd',
  'domain-added': 'event.domainAdded',
  'domain-removed': 'event.domainRemoved',
  'bridge-inserted': 'event.bridgeInserted',
  'vault-problem': 'event.vaultProblem',
};
