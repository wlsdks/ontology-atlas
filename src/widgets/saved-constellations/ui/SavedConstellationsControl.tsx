'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  resolveConstellationCandidate,
  constellationMemberDrafts,
  isSavedConstellationsConflict,
  resolvedDraftCandidates,
  unresolvedDraftMembers,
  toggleConstellationCandidate,
  useSavedConstellations,
  type ConstellationCandidate,
  type ConstellationDraft,
  type SavedConstellation,
} from '@/features/saved-constellations';
import { Button, Checkbox, Dialog, IconButton, RowButton, Surface, Textarea, Tooltip } from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import { ChromeChip } from '@/shared/ui/chrome-chip';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';

interface Props {
  handle: FileSystemDirectoryHandle | null;
  candidates: readonly ConstellationCandidate[];
  selectedSlug: string | null;
  intent?: string | null;
  activeId?: string | null;
  onFocus: (id: string, memberSlugs: ReadonlySet<string>) => void;
  onClear: () => void;
  onPrepare: (saved: SavedConstellation) => void;
  canPrepare?: boolean;
}

const TITLE_ID = 'saved-constellation-editor-title';

type ConflictReview =
  | { stage: 'needs-review' | 'loading' | 'reload-error' }
  | { stage: 'ready'; latest: SavedConstellation | null; saveAsNew: boolean };

function starColor(kind: ConstellationCandidate['kind']): string {
  return `var(--map-galaxy-${kind})`;
}

function previewPoints(members: readonly ConstellationCandidate[], width: number, height: number) {
  if (members.length === 0) return [];
  const paddingX = width * 0.11;
  const paddingY = height * 0.22;
  const xs = members.map((member) => member.galaxyPoint.x);
  const ys = members.map((member) => member.galaxyPoint.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(
    (width - paddingX * 2) / Math.max(1, spanX),
    (height - paddingY * 2) / Math.max(1, spanY),
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return members.map((member) => ({
    member,
    x: width / 2 + (member.galaxyPoint.x - centerX) * scale,
    y: height / 2 + (member.galaxyPoint.y - centerY) * scale,
  }));
}

function ConstellationPreview({
  members,
  compact = false,
  label,
  countLabel,
  emptyLabel,
}: {
  members: readonly ConstellationCandidate[];
  compact?: boolean;
  label?: string;
  countLabel?: string;
  emptyLabel?: string;
}) {
  const width = compact ? 80 : 480;
  const height = compact ? 52 : 112;
  const points = previewPoints(members, width, height);
  return (
    <div
      className={cn(
        'relative overflow-hidden border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]',
        compact ? 'h-[3.25rem] w-20 shrink-0 rounded-chip' : 'h-28 w-full rounded-panel',
      )}
      aria-label={compact ? undefined : `${label ?? ''}, ${countLabel ?? ''}`}
      aria-hidden={compact || undefined}
      role={compact ? undefined : 'img'}
      data-testid={compact ? undefined : 'constellation-preview'}
    >
      {!compact ? (
        <div className="pointer-events-none absolute inset-x-3 top-2 z-10 flex items-center justify-between gap-3 font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]">
          <span>{label}</span><span>{countLabel}</span>
        </div>
      ) : null}
      {points.length === 0 && !compact ? (
        <p className="absolute inset-x-5 top-1/2 -translate-y-1/2 text-center text-body text-[color:var(--color-text-tertiary)]">{emptyLabel}</p>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        {points.map(({ member, x, y }) => (
          <g key={member.uid} data-member-uid={member.uid}>
            <circle cx={x} cy={y} r={compact ? 7 : 9} fill={starColor(member.kind)} opacity="0.09" />
            <circle cx={x} cy={y} r={compact ? 3.2 : 4.2} fill={starColor(member.kind)} opacity="0.32" />
            <circle cx={x} cy={y} r={compact ? 1.35 : 1.8} fill={starColor(member.kind)} />
            <circle cx={x} cy={y} r={compact ? 0.55 : 0.75} fill="white" opacity="0.9" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function resolvedMembers(saved: SavedConstellation, candidates: readonly ConstellationCandidate[]) {
  return saved.items.flatMap((item) => {
    if (item.target.kind !== 'ontology') return [];
    const resolution = resolveConstellationCandidate(item.target.uid, candidates);
    return resolution.status === 'resolved' ? [resolution.candidate] : [];
  });
}

export function SavedConstellationsControl({ handle, candidates, selectedSlug, intent = null, activeId = null, onFocus, onClear, onPrepare, canPrepare = false }: Props) {
  const t = useTranslations('constellations');
  const tNode = useTranslations('topology.createNode');
  const store = useSavedConstellations(handle);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [memberDrafts, setMemberDrafts] = useState<Map<string, ConstellationDraft['members'][number]>>(new Map());
  const [query, setQuery] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [conflictReview, setConflictReview] = useState<ConflictReview | null>(null);
  const consumedIntentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!listOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setListOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setListOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [listOpen]);

  const candidateByMapId = useMemo(() => new Map(candidates.map((candidate) => [candidate.mapId, candidate])), [candidates]);
  const selectedMembers = useMemo(
    () => resolvedDraftCandidates(memberDrafts, candidates),
    [candidates, memberDrafts],
  );
  const unresolvedMembers = useMemo(
    () => unresolvedDraftMembers(memberDrafts, candidates),
    [candidates, memberDrafts],
  );
  const conflictMemberChanges = useMemo(() => {
    if (conflictReview?.stage !== 'ready' || !conflictReview.latest) return null;
    const latestByUid = new Map(conflictReview.latest.items.flatMap((item) =>
      item.target.kind === 'ontology' ? [[item.target.uid, item.label] as const] : []));
    const added = [...memberDrafts.values()]
      .filter((member) => !latestByUid.has(member.uid))
      .map((member) => member.label);
    const removed = [...latestByUid]
      .filter(([uid]) => !memberDrafts.has(uid))
      .map(([, label]) => label);
    return { added, removed };
  }, [conflictReview, memberDrafts]);
  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return candidates;
    return candidates.filter((candidate) =>
      `${candidate.label} ${candidate.mapId} ${candidate.lastKnownPath} ${candidate.kind}`.toLocaleLowerCase().includes(needle),
    );
  }, [candidates, query]);
  const activeConstellation = store.constellations.find((saved) => saved.folder.id === activeId) ?? null;
  const requestedConstellationMissing =
    Boolean(intent && intent !== 'new' && store.status === 'ready') &&
    !store.constellations.some((saved) => saved.folder.id === intent);

  const openEditor = (saved: SavedConstellation | null) => {
    setListOpen(false);
    setSaveError(null);
    setNameTouched(false);
    setSaveAttempted(false);
    setDeleteArmed(false);
    setConflictReview(null);
    setQuery('');
    if (saved) {
      setEditingId(saved.folder.id);
      setName(saved.folder.name);
      setPurpose(saved.folder.purpose ?? '');
      setMemberDrafts(constellationMemberDrafts(saved));
    } else {
      const selected = selectedSlug ? candidateByMapId.get(selectedSlug) : null;
      setEditingId(null);
      setName('');
      setPurpose('');
      setMemberDrafts(new Map(selected ? [[selected.uid, {
        uid: selected.uid,
        lastKnownPath: selected.lastKnownPath,
        label: selected.label,
      }]] : []));
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setConflictReview(null);
    if (intent === 'new') onClear();
  };

  const save = async (saveAsNew = false) => {
    setSaveAttempted(true);
    setNameTouched(true);
    if (!name.trim() || memberDrafts.size === 0) return;
    setSaving(true);
    if (!conflictReview) setSaveError(null);
    const draft: ConstellationDraft = {
      ...(!saveAsNew && editingId ? { id: editingId } : {}),
      name,
      purpose,
      members: [...memberDrafts.values()],
    };
    try {
      await store.saveConstellation(draft);
      setEditorOpen(false);
      setListOpen(true);
      if (intent === 'new') onClear();
    } catch (error) {
      if (isSavedConstellationsConflict(error)) {
        setConflictReview({ stage: 'needs-review' });
      }
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const reviewConflict = async () => {
    setConflictReview({ stage: 'loading' });
    const result = await store.reload();
    if (result.status !== 'ready') {
      setConflictReview({ stage: 'reload-error' });
      setSaveError(result.status === 'corrupt' || result.status === 'unsupported' || result.status === 'error'
        ? result.error
        : t('conflictReloadError'));
      return;
    }
    const latest = editingId
      ? result.constellations.find((saved) => saved.folder.id === editingId) ?? null
      : null;
    setConflictReview({ stage: 'ready', latest, saveAsNew: !latest });
    setSaveError(t('conflictMessage'));
  };

  const focus = (saved: SavedConstellation) => {
    const members = resolvedMembers(saved, candidates);
    onFocus(saved.folder.id, new Set(members.map((member) => member.mapId)));
    setListOpen(false);
  };

  const prepare = (saved: SavedConstellation) => {
    onPrepare(saved);
    setListOpen(false);
  };

  const consumeIntent = useEffectEvent((nextIntent: string) => {
    consumedIntentRef.current = nextIntent;
    if (nextIntent === 'new') {
      openEditor(null);
      return;
    }
    const saved = store.constellations.find((entry) => entry.folder.id === nextIntent);
    if (saved) focus(saved);
    else setListOpen(true);
  });

  useEffect(() => {
    if (!intent) {
      consumedIntentRef.current = null;
      return;
    }
    if (store.status !== 'ready' || consumedIntentRef.current === intent) return;
    const timeout = window.setTimeout(() => consumeIntent(intent), 0);
    return () => window.clearTimeout(timeout);
  }, [intent, store.status]);

  useEffect(() => {
    consumedIntentRef.current = null;
  }, [handle]);

  const remove = async () => {
    if (!editingId) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setSaving(true);
    try {
      await store.deleteConstellation(editingId);
      if (editingId === activeId) onClear();
      setEditorOpen(false);
      setListOpen(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-2" data-testid="saved-constellations-control">
      {activeConstellation ? (
        <Tooltip content={t('clearFocus')}>
          <ChromeChip
            type="button"
            icon={<X />}
            active
            onClick={onClear}
            aria-label={t('clearFocusNamed', { name: activeConstellation.folder.name })}
            data-testid="saved-constellation-active"
          >
            {activeConstellation.folder.name}
          </ChromeChip>
        </Tooltip>
      ) : null}
      <Tooltip content={t('openTooltip')}>
        <ChromeChip
          type="button"
          compact
          icon={<Sparkles size={ICON_SIZE.lg} />}
          aria-label={t('openLabel')}
          aria-haspopup="dialog"
          aria-expanded={listOpen}
          active={listOpen}
          onClick={() => setListOpen((open) => !open)}
          data-testid="saved-constellations-open"
        >
          {t('openLabel')}
        </ChromeChip>
      </Tooltip>
      <Surface
        open={listOpen}
        origin="top right"
        className="fixed right-[var(--chrome-inset)] top-[calc(4.75rem+var(--chrome-tile-size)+0.5rem)] z-40 w-[min(20rem,calc(100vw-var(--chrome-inset)*2))] overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-2)] [--topology-motion-panel-duration:var(--motion-fast)] md:absolute md:right-0 md:top-[calc(100%+0.5rem)] md:w-80"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--color-divider)] px-4 py-3">
          <div>
            <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">{t('eyebrow')}</p>
            <h2 className="mt-1 text-title text-[color:var(--color-text-primary)]">{t('listTitle')}</h2>
          </div>
          <Button size="sm" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => openEditor(null)} disabled={store.status !== 'ready' || candidates.length === 0}>
            <Plus size={ICON_SIZE.sm} aria-hidden="true" />
            {t('create')}
          </Button>
        </div>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto p-2" role="list">
          {requestedConstellationMissing ? (
            <p role="alert" className="mx-2 mb-2 rounded-chip bg-[color:var(--color-overlay-1)] px-3 py-2 text-body text-[color:var(--color-status-warning)]">{t('notFound')}</p>
          ) : null}
          {store.status === 'loading' ? (
            <p className="px-2 py-6 text-center text-body text-[color:var(--color-text-tertiary)]">{t('loading')}</p>
          ) : store.status === 'unavailable' ? (
            <p className="px-2 py-6 text-center text-body text-[color:var(--color-text-tertiary)]">{t('readOnly')}</p>
          ) : store.status === 'corrupt' || store.status === 'unsupported' || store.status === 'error' ? (
            <div className="space-y-3 px-2 py-4">
              <p role="alert" className="text-body text-[color:var(--color-status-danger)]">{t('loadError')}</p>
              <Button variant="outline" size="sm" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => void store.reload()}>{t('reload')}</Button>
            </div>
          ) : store.constellations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Sparkles size={ICON_SIZE.lg} className="mx-auto text-[color:var(--color-indigo-accent)]" aria-hidden="true" />
              <p className="mt-3 text-body-lg text-[color:var(--color-text-primary)]">{t('emptyTitle')}</p>
              <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">{t('emptyBody')}</p>
            </div>
          ) : store.constellations.map((saved) => {
            const members = resolvedMembers(saved, candidates);
            const missing = saved.items.filter((item) => item.target.kind === 'ontology').length - members.length;
            return (
              <div key={saved.folder.id} role="listitem" className="group flex items-center gap-1">
                <RowButton
                  onClick={() => focus(saved)}
                  hoverSurface="lift"
                  aria-label={`${saved.folder.name}, ${t('memberCount', { count: members.length })}`}
                  className="h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 px-2 py-2 text-left"
                >
                  <ConstellationPreview members={members} compact />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{saved.folder.name}</span>
                    <span className="mt-1 block line-clamp-1 text-body text-[color:var(--color-text-secondary)]">{saved.folder.purpose || t('purposeUnknown')}</span>
                    <span className="mt-1 block text-label text-[color:var(--color-text-tertiary)]">{t('memberCount', { count: members.length })}{missing > 0 ? ` · ${t('missingCount', { count: missing })}` : ''}</span>
                  </span>
                </RowButton>
                <div className="flex shrink-0 flex-col gap-1">
                  {canPrepare ? (
                    <Tooltip content={t('prepare')}>
                      <IconButton label={t('prepare')} size="sm" tone="accent" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => prepare(saved)}>
                        <MessageCircle size={ICON_SIZE.sm} aria-hidden="true" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip content={t('prepareUnavailable')}>
                      <span
                        className="inline-flex rounded-control"
                        tabIndex={0}
                        role="note"
                        aria-label={t('prepareUnavailable')}
                      >
                        <IconButton label={t('prepareUnavailable')} size="sm" tone="accent" className="atlas-touch-floor atlas-touch-floor-wide" disabled>
                          <MessageCircle size={ICON_SIZE.sm} aria-hidden="true" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip content={t('edit')}><IconButton label={t('edit')} size="sm" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => openEditor(saved)}><Pencil size={ICON_SIZE.sm} aria-hidden="true" /></IconButton></Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      <Dialog open={editorOpen} onClose={closeEditor} size="md" labelledBy={TITLE_ID} testId="saved-constellation-editor" className="flex max-h-[min(44rem,calc(100vh-2rem))] flex-col p-0">
        <div className="border-b border-[color:var(--color-divider)] px-5 py-4">
          <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">{t('eyebrow')}</p>
          <h2 id={TITLE_ID} className="mt-1 text-title text-[color:var(--color-text-primary)]">{editingId ? t('editTitle') : t('createTitle')}</h2>
          <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">{t('editorBody')}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <ConstellationPreview
            members={selectedMembers}
            label={t('previewLabel')}
            countLabel={t('memberCount', { count: selectedMembers.length })}
            emptyLabel={t('previewEmpty')}
          />
          <Input
            label={t('nameLabel')}
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setNameTouched(true)}
            maxLength={120}
            autoComplete="off"
            error={nameTouched && !name.trim() ? t('nameRequired') : undefined}
          />
          <Textarea
            label={t('purposeLabel')}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            rows={2}
            maxLength={4000}
            autoGrow
            maxRows={3}
            hint={t('purposeHint')}
          />
          <div className="space-y-2">
            <Input
              label={t('membersLabel')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
            />
            <div className="max-h-40 overflow-y-auto rounded-panel border border-[color:var(--color-divider)] p-[var(--card-pad)]" data-testid="constellation-member-picker">
              {filteredCandidates.length === 0 ? (
                <p className="px-2 py-4 text-center text-body text-[color:var(--color-text-tertiary)]">{t('noMatches')}</p>
              ) : filteredCandidates.map((candidate) => (
                <Checkbox
                  key={candidate.uid}
                  checked={[...memberDrafts.keys()].some((savedUid) => {
                    const resolution = resolveConstellationCandidate(savedUid, candidates);
                    return resolution.status === 'resolved' && resolution.candidate.uid === candidate.uid;
                  })}
                  onChange={(event) => setMemberDrafts((current) =>
                    toggleConstellationCandidate(current, candidate, candidates, event.target.checked))}
                  className="rounded-chip px-2 py-1.5 hover:bg-[color:var(--color-overlay-1)]"
                  label={(
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="truncate text-body text-[color:var(--color-text-primary)]">{candidate.label}</span>
                      <span className="shrink-0 font-mono text-label uppercase text-[color:var(--color-text-quaternary)]">
                        {candidate.kind === 'project'
                          ? tNode('kindProject')
                          : candidate.kind === 'domain'
                            ? tNode('kindDomain')
                            : candidate.kind === 'capability'
                              ? tNode('kindCapability')
                              : tNode('kindElement')}
                      </span>
                    </span>
                  )}
                />
              ))}
              {unresolvedMembers.map((member) => (
                <Checkbox
                  key={member.uid}
                  checked
                  onChange={() => setMemberDrafts((current) => {
                    const next = new Map(current);
                    next.delete(member.uid);
                    return next;
                  })}
                  className="rounded-chip px-2 py-1.5 hover:bg-[color:var(--color-overlay-1)]"
                  label={(
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="truncate text-body text-[color:var(--color-text-tertiary)]">{member.label}</span>
                      <span className="shrink-0 font-mono text-label uppercase text-[color:var(--color-status-warning)]">{t('missing')}</span>
                    </span>
                  )}
                />
              ))}
            </div>
            {saveAttempted && memberDrafts.size === 0 ? <p role="alert" className="text-label text-[color:var(--color-status-danger)]">{t('memberRequired')}</p> : null}
          </div>
          {conflictReview?.stage === 'ready' ? (
            <section
              className="max-h-40 overflow-y-auto rounded-panel border border-[color:var(--color-status-warning)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
              aria-labelledby="saved-constellation-conflict-review-title"
              data-testid="saved-constellation-conflict-review"
            >
              <h3 id="saved-constellation-conflict-review-title" className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                {t('conflictReviewTitle')}
              </h3>
              {conflictReview.latest ? (
                <div className="mt-3 space-y-3 text-body text-[color:var(--color-text-secondary)]">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('latestName')}</dt>
                    <dd>{conflictReview.latest.folder.name}</dd>
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('latestPurpose')}</dt>
                    <dd>{conflictReview.latest.folder.purpose || t('purposeUnknown')}</dd>
                  </dl>
                  {conflictMemberChanges && (conflictMemberChanges.added.length > 0 || conflictMemberChanges.removed.length > 0) ? (
                    <div className="space-y-2">
                      {conflictMemberChanges.added.length > 0 ? (
                        <p><span className="text-[color:var(--color-text-quaternary)]">{t('membersAdded')}</span> {conflictMemberChanges.added.join(', ')}</p>
                      ) : null}
                      {conflictMemberChanges.removed.length > 0 ? (
                        <p><span className="text-[color:var(--color-text-quaternary)]">{t('membersRemoved')}</span> {conflictMemberChanges.removed.join(', ')}</p>
                      ) : null}
                    </div>
                  ) : <p>{t('membersUnchanged')}</p>}
                </div>
              ) : (
                <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">
                  {editingId ? t('latestDeleted') : t('latestReloadedNew')}
                </p>
              )}
            </section>
          ) : null}
        </div>
        <div className="shrink-0 space-y-3 border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-4">
          {saveError ? (
            <p role="alert" className="text-body text-[color:var(--color-status-danger)]">
              {conflictReview?.stage === 'reload-error'
                ? t('conflictReloadError')
                : conflictReview
                  ? t('conflictMessage')
                  : t('saveError')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {editingId ? (
                <Button variant="ghost" size="sm" className="atlas-touch-floor atlas-touch-floor-wide text-[color:var(--color-status-danger)]" onClick={() => void remove()} disabled={saving || Boolean(conflictReview)}>
                  <Trash2 size={ICON_SIZE.sm} aria-hidden="true" />{deleteArmed ? t('confirmDelete') : t('delete')}
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="atlas-touch-floor atlas-touch-floor-wide" onClick={closeEditor} disabled={saving}>{t('cancel')}</Button>
              {conflictReview ? (
                conflictReview.stage === 'ready' ? (
                  <Button className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => void save(conflictReview.saveAsNew)} disabled={saving}>
                    {saving
                      ? t('saving')
                      : conflictReview.saveAsNew
                        ? t('saveDraftAsNew')
                        : t('applyDraft')}
                  </Button>
                ) : (
                  <Button className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => void reviewConflict()} disabled={conflictReview.stage === 'loading'}>
                    {conflictReview.stage === 'loading' ? t('reviewingChanges') : t('reviewChanges')}
                  </Button>
                )
              ) : (
                <Button className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => void save()} disabled={saving || !name.trim() || memberDrafts.size === 0}>{saving ? t('saving') : t('save')}</Button>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
