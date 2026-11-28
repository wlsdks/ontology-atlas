import { useLocale, useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';
import { formatSize } from '@/shared/lib/format-size';
import { MODEL_DOWNLOAD_HOSTS, type VectorProbe } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { Button } from '@/shared/ui';
import { BUILTIN_MODEL_NAME } from '../model/model-choices';

export function WizardIntro({ probe, runners, onNext }: { probe: VectorProbe; runners: number; onNext: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const size = (bytes: number) => formatSize(bytes, locale);
  const builtin = probe.builtin;
  const short = !builtin.onDisk && builtin.freeBytes < builtin.neededFreeBytes;
  const rows = [
    {
      id: 'download',
      title: t('wizard.download'),
      body: builtin.onDisk
        ? t('wizard.downloadKept', { model: BUILTIN_MODEL_NAME })
        : t('wizard.downloadNeeded', { model: BUILTIN_MODEL_NAME, hosts: MODEL_DOWNLOAD_HOSTS.join(', '), size: size(builtin.downloadBytes) }),
      more: runners > 0 ? t('wizard.runnerToo', { count: runners }) : null,
    },
    { id: 'fit', title: t('wizard.fit'), body: t('wizard.fitBody'), more: null },
    { id: 'read', title: t('wizard.read'), body: t('wizard.readBody', { files: probe.files }), more: null },
  ];
  return (
    <div className="flex flex-col gap-5" data-testid="meaning-wizard-intro">
      <h3 className="text-body-lg font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t('wizard.introTitle')}</h3>
      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li key={row.id} className="flex gap-3" data-testid={`meaning-wizard-row-${row.id}`}>
            <span aria-hidden className="grid size-6 flex-none place-items-center rounded-full bg-[color:var(--color-indigo-a14)] text-label leading-label tabular-nums text-[color:var(--color-indigo-pale-a92)]">{index + 1}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-body leading-body text-[color:var(--color-text-primary)]">{row.title}</p>
              <p className="mt-0.5 max-w-[64ch] text-body leading-body text-[color:var(--color-text-secondary)]">{row.body}</p>
              {row.more ? <p className="mt-1 text-body leading-body text-[color:var(--color-indigo-accent)]">{row.more}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-divider)] pt-3">
        {builtin.onDisk ? <span /> : (
          <p className={cn('text-label leading-label tabular-nums', short ? 'text-[color:var(--color-danger-text)]' : 'text-[color:var(--color-text-tertiary)]')} data-testid="meaning-wizard-room">
            {t('wizard.room', { free: size(builtin.freeBytes), needed: size(builtin.neededFreeBytes) })}
          </p>
        )}
        <Button variant="primary" size="sm" onClick={onNext} data-testid="meaning-wizard-next">{t('wizard.next')}</Button>
      </div>
    </div>
  );
}
