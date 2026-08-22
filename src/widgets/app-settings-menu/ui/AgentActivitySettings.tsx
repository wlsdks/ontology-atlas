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
import { controlClass } from '@/shared/ui/control-class';

/**
 * 「작업 중 표시」 (work-in-progress indicator) and 「알림」 (notifications) settings.
 *
 * **On by default**, for a different reason than the frame meter — the meter is a
 * diagnostic tool and therefore opt-in, while this is the **fact** that *"something
 * is happening in my folder right now"*. Hiding a fact behind an opt-in means
 * someone who never switched it on sees nothing while their folder is being edited.
 * So this pane is only ever used to **turn things off**.
 *
 * Why the kind picker is indented under 「알림」: to someone who turned notifications
 * off entirely, six rows of kinds are noise, not a decision. It appears only while
 * they are on.
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
                    className={controlClass({
                      shape: 'chip',
                      size: 'md',
                      tone: on ? 'accentOnTint' : 'muted',
                      className: on
                        ? 'h-8 border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-a14)] px-2.5 text-body'
                        : 'h-8 border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2.5 text-body hover:text-[color:var(--color-text-secondary)]',
                    })}
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

/** Kind → copy key. It uses the **same vocabulary** as the notification inbox — two sets of names do not read as the same thing. */
const EVENT_LABEL_KEY: Readonly<Record<(typeof AGENT_NOTIFICATION_KINDS)[number], string>> = {
  'task-start': 'event.taskStart',
  'task-end': 'event.taskEnd',
  'domain-added': 'event.domainAdded',
  'domain-removed': 'event.domainRemoved',
  'bridge-inserted': 'event.bridgeInserted',
  'vault-problem': 'event.vaultProblem',
};
