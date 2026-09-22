'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Leaf, Star, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { withBasePath } from '@/shared/lib/base-path';
import { Button, Dialog, IconButton, RowButton, Textarea } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useCompanionJournal } from '../model/use-companion-journal';
import { KEEPSAKES, MEMORY_KINDS, MEMORY_LIMIT, type Keepsake, type MemoryKind } from '../model/companion-journal';
import { AgentMascotPresence } from './AgentMascotPresence';
import styles from './companion-home.module.css';

const OBJECTS = { book: BookOpen, plant: Leaf, star: Star };

function HomeScene({ keepsakes, celebration = false }: { keepsakes: Keepsake[]; celebration?: boolean }) {
  return (
    <span className={styles.room} aria-hidden="true" data-companion-room>
      <span className={styles.window}><span /><span /><span /><span /></span>
      <span className={styles.floor} />
      <span className={styles.resident}>
        <span key={String(celebration)} className={celebration ? 'atlas-mascot-sprite block size-16' : styles.idle}
          data-mascot-state={celebration ? 'success' : undefined}
          style={{ backgroundImage: `url(${withBasePath(celebration ? '/brand/mascot-success-row.png' : '/brand/mascot-compact.png')})` }} />
      </span>
      <span className={styles.shelf}>{KEEPSAKES.filter((item) => keepsakes.includes(item)).map((item) => {
        const ObjectIcon = OBJECTS[item];
        return <ObjectIcon key={item} size={ICON_SIZE.sm} data-keepsake={item} />;
      })}</span>
    </span>
  );
}

/** A personal home, deliberately separate from the vault and its review/approval state. */
export function CompanionHome({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('companion');
  const locale = useLocale();
  const vault = useLocalVault();
  const store = useCompanionJournal();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MemoryKind>('checked');
  const [keepsake, setKeepsake] = useState<Keepsake>('book');
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const saveLock = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreResetFocus = useRef(false);
  useEffect(() => {
    if (resetting || removing) confirmationCancelRef.current?.focus();
    else if (restoreResetFocus.current) {
      restoreResetFocus.current = false;
      resetTriggerRef.current?.focus();
    }
  }, [resetting, removing]);
  const memories = store.journal.memories;
  const objects = memories.map((memory) => memory.keepsake);
  const latest = memories[0];
  const show = () => { setOpen(true); setSaved(false); setError(false); setResetting(false); setRemoving(null); };
  const close = () => { setOpen(false); setResetting(false); };
  const save = () => {
    if (!note.trim() || saveLock.current) return;
    saveLock.current = true;
    const ok = store.save({
      id: crypto.randomUUID(), kind, keepsake, note: note.trim(),
      folder: (vault.status === 'loaded' ? vault.handle?.name ?? '' : '').slice(0, 160),
      createdAt: Date.now(),
    });
    setError(!ok);
    setSaved(ok);
    if (ok) { setNote(''); noteRef.current?.focus(); }
    saveLock.current = false;
  };

  return <>
    {compact ? (
      <IconButton label={t('open')} onClick={show} className="relative shrink-0" data-testid="companion-trigger">
        <span className={styles.workPose} aria-hidden="true">
          <span className={styles.idle} style={{ backgroundImage: `url(${withBasePath('/brand/mascot-compact.png')})` }} />
          <AgentMascotPresence inline />
        </span>
      </IconButton>
    ) : (
      <RowButton onClick={show} data-testid="companion-home" className="w-full">
        <span className={styles.homeRow}>
          <HomeScene keepsakes={objects} />
          <span className="min-w-0 text-left">
            <span className="block text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{t('home')}</span>
            <span className="mt-1 block truncate text-label text-[color:var(--color-text-secondary)]">{latest ? latest.note : t('emptyHome')}</span>
          </span>
          <ChevronRight size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" />
        </span>
      </RowButton>
    )}
    <Dialog open={open} onClose={close} labelledBy={`${id}-title`} size="sm" testId="companion-journal" className="my-[var(--chrome-inset)] flex max-h-[calc(100dvh-var(--chrome-inset)*2)] self-start flex-col gap-4 overflow-y-auto p-[var(--card-pad)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-title font-[var(--font-weight-strong)]">{t('title')}</h2>
          <p className="mt-1 text-label text-[color:var(--color-text-secondary)]">{t('personal')}</p>
        </div>
        <IconButton label={t('close')} onClick={close}><X size={ICON_SIZE.md} aria-hidden /></IconButton>
      </div>
      <div className="flex items-center gap-4 rounded-card bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        <HomeScene keepsakes={objects} celebration={saved} />
        <p className="min-w-0 text-body text-[color:var(--color-text-secondary)]">{t(memories.length ? 'settled' : 'welcome')}</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); save(); }} className="grid min-w-0 grid-cols-1 gap-3" data-testid="companion-memory-form">
        <SegmentedControl ariaLabel={t('kindLabel')} value={kind} onChange={(value) => { setKind(value); setSaved(false); }}
          options={MEMORY_KINDS.map((value) => ({ value, label: t(`kind.${value}`) }))} variant="chips" />
        <Textarea ref={noteRef} label={t('noteLabel')} placeholder={t('placeholder')} value={note} maxLength={240} rows={2}
          onChange={(event) => { setNote(event.target.value); setSaved(false); }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl ariaLabel={t('keepsakeLabel')} value={keepsake} onChange={setKeepsake} variant="chips"
            options={KEEPSAKES.map((value) => ({ value, label: t(`object.${value}`) }))} />
          <Button className="atlas-touch-floor atlas-touch-floor-wide" type="submit" variant="primary" disabled={!note.trim() || store.unreadable || memories.length >= MEMORY_LIMIT}>{t('save')}</Button>
        </div>
        <p role={error || store.unreadable ? 'alert' : 'status'} className="text-label text-[color:var(--color-text-secondary)]">
          {store.unreadable ? t('unreadable') : error ? t('saveFailed') : saved ? t('saved') : memories.length >= MEMORY_LIMIT ? t('full') : t('storage')}
        </p>
      </form>
      {memories.length ? <section aria-labelledby={`${id}-memories`} className={`grid gap-2 border-t border-[color:var(--color-border-soft)] pt-3 ${styles.memoryAdded}`}>
        <h3 id={`${id}-memories`} className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{t('memories')}</h3>
        <ul className="grid max-h-48 gap-3 overflow-y-auto" data-testid="companion-memories">
          {memories.map((memory) => {
            const ObjectIcon = OBJECTS[memory.keepsake];
            return <li key={memory.id} className="flex items-start gap-3">
              <ObjectIcon size={ICON_SIZE.sm} aria-hidden className="mt-1 shrink-0 text-[color:var(--color-text-secondary)]" />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-body text-[color:var(--color-text-primary)]">{memory.note}</p>
                <p className="mt-1 break-words text-label text-[color:var(--color-text-secondary)]">{t(`kind.${memory.kind}`)} · {new Date(memory.createdAt).toLocaleDateString(locale)}{memory.folder ? ` · ${memory.folder}` : ''}</p>
                {removing === memory.id ? <div className="mt-2 flex flex-wrap gap-2">
                  <p className="w-full text-label text-[color:var(--color-text-secondary)]">{t('removePrompt')}</p>
                  <Button ref={confirmationCancelRef} className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={() => { setRemoving(null); removeTriggerRef.current?.focus(); }}>{t('cancel')}</Button>
                  <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={() => { const ok = store.remove(memory.id); setError(!ok); if (ok) setRemoving(null); setSaved(false); noteRef.current?.focus(); }}>{t('removeConfirm')}</Button>
                </div> : null}
              </div>
              <IconButton label={t('remove', { note: memory.note })} onClick={(event) => { removeTriggerRef.current = event.currentTarget; setRemoving(memory.id); setResetting(false); }}><Trash2 size={ICON_SIZE.sm} aria-hidden /></IconButton>
            </li>;
          })}
        </ul>
      </section> : null}
      {(memories.length > 0 || store.unreadable) ? <div className="flex flex-wrap items-center gap-2">
        {resetting ? <>
          <p className="w-full text-label text-[color:var(--color-text-secondary)]">{t('resetPrompt')}</p>
          <Button ref={confirmationCancelRef} className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={() => { restoreResetFocus.current = true; setResetting(false); }}>{t('cancel')}</Button>
          <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={() => { const ok = store.reset(); setError(!ok); setResetting(!ok); setSaved(false); noteRef.current?.focus(); }}>{t('resetConfirm')}</Button>
        </> : <Button ref={resetTriggerRef} className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={() => { setResetting(true); setRemoving(null); }}>{t('reset')}</Button>}
      </div> : null}
    </Dialog>
  </>;
}
