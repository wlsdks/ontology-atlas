'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { useLocalVault } from '@/entities/vault-session';
import { buildJevPayload, isJevAvailable, jevJudge, jevSecretClear, jevSecretSet, jevSecretStatus, JEV_DESTINATION, type JevJudgment, type JevSecretStatus } from '@/shared/lib/tauri-jev';
import { nativeErrorMessage } from '@/shared/lib/native-error';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { Button, Textarea } from '@/shared/ui';
import { Input } from '@/shared/ui/input';

export function JevPanel() {
  const t = useTranslations('agents.jev');
  const tErrors = useTranslations('nativeErrors');
  const vault = useLocalVault();
  const desktop = useSyncExternalStore(() => () => {}, isJevAvailable, () => false);
  const [status, setStatus] = useState<JevSecretStatus | null>(null);
  const [key, setKey] = useState('');
  const [claim, setClaim] = useState('');
  const [evidence, setEvidence] = useState('');
  const [result, setResult] = useState<JevJudgment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) : null;
  const payload = buildJevPayload(claim, evidence);

  useEffect(() => {
    if (!isJevAvailable()) return;
    let live = true;
    void jevSecretStatus().then((next) => { if (live) setStatus(next); })
      .catch((reason) => { if (live) setError(nativeErrorMessage(reason, tErrors)); });
    return () => { live = false; };
  }, [tErrors]);

  const save = async () => {
    const value = key;
    setKey('');
    setBusy(true);
    setError(null);
    try { setStatus(await jevSecretSet(value)); }
    catch (reason) { setError(nativeErrorMessage(reason, tErrors)); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try { setStatus(await jevSecretClear()); setResult(null); }
    catch (reason) { setError(nativeErrorMessage(reason, tErrors)); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!vaultPath) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try { setResult(await jevJudge(vaultPath, payload)); }
    catch (reason) { setError(nativeErrorMessage(reason, tErrors)); }
    finally { setBusy(false); }
  };

  if (!desktop) {
    return <section className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
      <h2 className="text-title font-[var(--font-weight-strong)]">{t('webTitle')}</h2>
      <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('webBody')}</p>
    </section>;
  }

  return <div className="flex max-w-3xl flex-col gap-5" data-testid="jev-panel">
    <section className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
      <h2 className="text-title font-[var(--font-weight-strong)]">{t('keyTitle')}</h2>
      <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('keyBody', { host: JEV_DESTINATION })}</p>
      <p className="mt-3 text-label text-[color:var(--color-text-tertiary)]" data-testid="jev-key-status">
        {status?.stored ? t('stored', { last4: status.last4 ?? '' }) : t('notStored')}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Input type="password" autoComplete="off" spellCheck={false} label={t('keyLabel')} value={key} onChange={(event) => setKey(event.target.value)} className="w-full sm:max-w-md" />
        <Button type="button" variant="primary" onClick={save} disabled={busy || !key.trim()}>{t('save')}</Button>
        {status?.stored && <Button type="button" variant="ghost" onClick={clear} disabled={busy}>{t('clear')}</Button>}
      </div>
    </section>
    <section className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
      <h2 className="text-title font-[var(--font-weight-strong)]">{t('judgeTitle')}</h2>
      <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('judgeBody')}</p>
      <div className="mt-3 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)] text-label text-[color:var(--color-text-secondary)]">
        <p className="font-[var(--font-weight-strong)]">{t('exampleTitle')}</p>
        <p className="mt-1">{t('exampleClaim')}</p>
        <p className="mt-1">{t('exampleEvidence')}</p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Textarea label={t('claimLabel')} placeholder={t('claimPlaceholder')} value={claim} onChange={(event) => { setClaim(event.target.value); setResult(null); }} rows={3} maxLength={2000} className="w-full" />
        <Textarea label={t('evidenceLabel')} placeholder={t('evidencePlaceholder')} value={evidence} onChange={(event) => { setEvidence(event.target.value); setResult(null); }} rows={5} maxLength={8000} className="w-full" />
      </div>
      <p className="mt-4 text-label text-[color:var(--color-text-tertiary)]">{t('transfer', { host: JEV_DESTINATION })}</p>
      <details className="mt-2 text-label text-[color:var(--color-text-secondary)]">
        <summary>{t('preview')}</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-card bg-[color:var(--color-canvas)] p-[var(--card-pad)] font-mono text-label">{payload}</pre>
      </details>
      {!vaultPath && <p className="mt-3 text-label text-[color:var(--color-text-tertiary)]">{t('needVault')}</p>}
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="primary" onClick={send} disabled={busy || !status?.stored || !vaultPath || !claim.trim() || !evidence.trim()}>{t('send')}</Button>
      </div>
      {result && <div role="status" className="mt-4 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
        <p className="text-body font-[var(--font-weight-strong)]">{t(`choices.${result.choice}`)}</p>
        <p className="mt-1 text-label text-[color:var(--color-text-secondary)]">{t('confidence', { value: Math.round(result.confidence * 100) })}</p>
        <p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">{t('advisory')}</p>
      </div>}
    </section>
    {error && <p role="alert" className="text-label text-[color:var(--color-danger-text)]">{error}</p>}
  </div>;
}
