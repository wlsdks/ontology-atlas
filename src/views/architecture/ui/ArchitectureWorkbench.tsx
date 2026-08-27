"use client";

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Boxes, CircleHelp, FileCode2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat-intent';
import {
  buildArchitectureAgentPrompt,
  buildArchitectureDraftPrompt,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import type { ArchitectureRecord, ArchitectureRecordStatus } from '@/entities/architecture-record';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { badgeClass } from '@/shared/ui/badge-class';
import { Button, EmptyState, RowButton, Surface, buttonVariants } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { useDraftHandoffRoute } from '../model/use-draft-handoff-route';
import { ArchitectureFlow } from './ArchitectureFlow';

type Mode = 'understand' | 'plan' | 'verify';
type CopyState = 'idle' | 'pending' | 'copied' | 'error';

/*
 * Receipt-status ink (2026-08-27 council, point 5): the three verdicts wear the existing signal
 * families — success emerald, error red, amber for unknown — and nothing else. The counts always
 * ride beside the verdict; a bare status word is a lie by omission.
 */
const RECORD_TONE_CLASS: Record<ArchitectureRecordStatus, string> = {
  conforms:
    'border border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]',
  violated:
    'border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]',
  unknown:
    'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
};

const RECORD_STATUS_ICON: Record<ArchitectureRecordStatus, typeof ShieldCheck> = {
  conforms: ShieldCheck,
  violated: ShieldAlert,
  unknown: CircleHelp,
};

export function ArchitectureWorkbench({
  profiles,
  handoffContexts = {},
  sourceModulesByProfile = {},
  sourceListingCapable = false,
  recordsByProfile = {},
  conceptsByProfile = {},
}: {
  profiles: ArchitectureProfile[];
  handoffContexts?: Readonly<Record<string, ArchitectureHandoffContext | undefined>>;
  /** Per profile slug, the read-only source-directory walk the page performed (installed app). */
  sourceModulesByProfile?: Readonly<Record<string, Record<string, RoleSourceModule[]>>>;
  /** Whether this surface can list a source folder at all — false in a browser, by nature. */
  sourceListingCapable?: boolean;
  /** Per profile slug, the persisted conformance receipt read from the vault sidecar. */
  recordsByProfile?: Readonly<Record<string, ArchitectureRecord | undefined>>;
  /** Per profile slug, the reviewed concepts joined into each role (the click-open detail). */
  conceptsByProfile?: Readonly<Record<string, Record<string, RoleConcept[]>>>;
}) {
  const t = useTranslations('architecture');
  const draftHandoff = useDraftHandoffRoute();
  const draftRoute = draftHandoff.route;
  const [draftCopyState, setDraftCopyState] = useState<CopyState>('idle');
  const [selectedSlug, setSelectedSlug] = useState(profiles[0]?.slug ?? null);
  const [mode, setMode] = useState<Mode>('understand');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const layoutScrollRef = useRef<HTMLDivElement>(null);
  const stagePanelRef = useRef<HTMLElement>(null);
  const reanchorScrollEndRef = useRef(false);
  const modeChangedRef = useRef(false);
  const selected = useMemo(
    () => profiles.find((profile) => profile.slug === selectedSlug) ?? profiles[0] ?? null,
    [profiles, selectedSlug],
  );

  useLayoutEffect(() => {
    /*
     * Below xl the stage panel stacks under the blueprint, so a mode press up in the header can
     * change content the person cannot see (measured 2026-08-27: at 1040 and 390 the panel top
     * sat at 701/902 in shorter viewports and nothing visibly happened). When the press was not
     * the scroll-end case below, bring the newly entered stage into view. `modeChangedRef` keeps
     * the initial mount from scrolling a fresh page.
     */
    if (!reanchorScrollEndRef.current) {
      if (
        modeChangedRef.current &&
        typeof window !== 'undefined' &&
        !window.matchMedia('(min-width: 1280px)').matches
      ) {
        const active = stagePanelRef.current?.querySelector<HTMLElement>(
          `[data-architecture-stage="${mode}"]`,
        );
        if (typeof active?.scrollIntoView === 'function') {
          active.scrollIntoView({ block: 'nearest' });
        }
      }
      return;
    }
    const scroller = layoutScrollRef.current;
    const panel = stagePanelRef.current;
    if (!scroller || !panel) {
      reanchorScrollEndRef.current = false;
      return;
    }

    const alignWhenActiveStageMounts = () => {
      const active = panel.querySelector(
        `[data-architecture-stage="${mode}"][data-surface-state="entered"]`,
      );
      if (!active) return false;
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      reanchorScrollEndRef.current = false;
      return true;
    };

    if (alignWhenActiveStageMounts()) return;
    const observer = new MutationObserver(() => {
      if (alignWhenActiveStageMounts()) observer.disconnect();
    });
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ['data-surface-state'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [mode]);

  if (!selected) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center p-5 md:p-10">
        <EmptyState
          title={t('noProfiles')}
          titleAs="h1"
          description={
            draftRoute === 'clipboard'
              ? `${t('noProfilesBody')} ${t('draftNoAgentBody')}`
              : t('noProfilesBody')
          }
          icon={<Boxes aria-hidden />}
          tone="solid"
          align="center"
          /*
           * A whole-route fallback still needs the route's page-headline rung.
           * EmptyState intentionally demotes centred titles to body text, so this
           * page-owned h1 restores the existing display/strong/primary contract.
           */
          className="max-w-[640px] [&_h1]:break-keep [&_h1]:font-[var(--font-weight-strong)] [&_h1]:text-display [&_h1]:text-[color:var(--color-text-primary)]"
          /*
           * ⚠️ **The button carries the task; it used to only change the address.**
           *
           * This was a bare link to the map, defended by "the map is where an agent is already
           * connected". Measured on the installed rc.15 with the owner's own folder: pressing it
           * moved the person to the map and produced nothing, while the sentence above promised an
           * agent would read the folder and the imports and draft this. Being *where* an agent
           * lives is not the agent doing the thing the sentence promised.
           *
           * `queueAgentChatIntent` is the bridge that survives the route change — a window event
           * alone is lost, because the map's subscriber does not exist on this route. The runner is
           * left unnamed: this screen holds the task, not a runner list, and the map already reads
           * `runtimeId ?? acpRuntime?.id`.
           *
           * The app still does not call MCP itself. That is the 2026-08-24 decision behind the
           * first-run door: analysing the repository here would be a second canonical
           * implementation of `analyze_repo_structure`, which `AGENTS.md` forbids.
           */
          /*
           * ⚠️ **Two doors, because one of them was silently a dead end.**
           *
           * The agent door queues the sentence and moves to the map, where the dock opens it as
           * the first turn. But the map resolves the runner as `runtimeId ?? acpRuntime?.id`, and
           * with neither it returns early and the queued sentence is consumed and discarded — so
           * with no agent connected the person pressed a button, changed screens, and nothing
           * happened. That is the defect this button was built to fix, relocated one route right.
           *
           * The clipboard door is the one that always works, including in a browser, where
           * spawning a process is an impossibility rather than a gap. It reuses Plan mode's
           * clipboard vocabulary verbatim; a second set of words for the same act is how two
           * dialects start.
           *
           * The app still does not call MCP itself. That is the 2026-08-24 decision behind the
           * first-run door: analysing the repository here would be a second canonical
           * implementation of `analyze_repo_structure`, which `AGENTS.md` forbids.
           */
          action={(
            <div className="flex flex-wrap items-center justify-center gap-2">
              {draftRoute === 'clipboard' ? null : (
                <Link
                  href="/topology/"
                  className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
                  data-testid="architecture-draft-from-code"
                  /*
                   * Written synchronously before the navigation, so the sentence is already in
                   * session storage by the time the map mounts and consumes it. It stays an anchor
                   * because the act really is a navigation — the agent dock lives on the map.
                   */
                  onClick={() => queueAgentChatIntent(draftHandoff.runtimeId, buildArchitectureDraftPrompt(null))}
                >
                  {t('draftFromCode')}
                </Link>
              )}
              <Button
                variant={draftRoute === 'clipboard' ? 'primary' : 'outline'}
                size="md"
                disabled={draftCopyState === 'pending'}
                data-testid="architecture-copy-draft-handoff"
                data-architecture-draft-copy-state={draftCopyState}
                onClick={() => {
                  setDraftCopyState('pending');
                  navigator.clipboard
                    .writeText(buildArchitectureDraftPrompt(null))
                    .then(() => setDraftCopyState('copied'))
                    .catch(() => setDraftCopyState('error'));
                }}
              >
                {draftCopyState === 'pending'
                  ? t('copyingHandoff')
                  : draftCopyState === 'copied'
                    ? t('copiedHandoff')
                    : draftCopyState === 'error'
                      ? t('copyHandoffError')
                      : t('copyHandoff')}
              </Button>
              <span className="sr-only" role="status" aria-live="polite">
                {draftCopyState === 'copied'
                  ? t('copiedHandoff')
                  : draftCopyState === 'error'
                    ? t('copyHandoffError')
                    : ''}
              </span>
            </div>
          )}
        />
      </main>
    );
  }

  const handoff = buildArchitectureAgentPrompt(selected, handoffContexts[selected.slug] ?? null);
  const selectedModules = sourceModulesByProfile[selected.slug] ?? null;
  /*
   * ⚠️ **The receipt is rendered as what it is: a dated machine measurement, not a live claim**
   * (2026-08-27 council, point 5). Three states: no record keeps the amber "Source check
   * required" — not measured on this computer, never a defect. A record renders its stamp —
   * date plus commit short sha for git sources, the fingerprint sentence (never a sha) for
   * folder sources, "with uncommitted edits" when dirty — and the verdict always carries the
   * counts beside it: violations and unknown-edge accounting, type-only edges labelled when the
   * scanner reported them. This surface cannot re-probe the source (a browser cannot, and no
   * re-verification bridge exists yet), so it says exactly that instead of claiming the stamp
   * is current.
   */
  const record = recordsByProfile[selected.slug] ?? null;
  const conformance = record?.brief.conformance ?? null;
  const measured = record?.brief.measured ?? null;
  const recordDate = measured ? measured.at.slice(0, 10) : '';
  const recordDirty = measured?.source.kind === 'git' && measured.source.dirty;
  const recordCounts = conformance
    ? [
        t('recordCounts', {
          violations: conformance.violationCount,
          unmapped: (conformance.unknown?.unmappedEdges ?? 0) + (conformance.unknown?.unruledEdges ?? 0),
        }),
        ...(conformance.typeOnlyEdgeCount !== undefined
          ? [t('recordTypeOnly', { count: conformance.typeOnlyEdgeCount })]
          : []),
      ].join(' · ')
    : null;
  const RecordStatusIcon = conformance ? RECORD_STATUS_ICON[conformance.status] : CircleHelp;
  /* Unique placements: one module two globs both reach is one module, not two. */
  const moduleTotal = selectedModules
    ? new Set(Object.values(selectedModules).flat().map((module) => module.path)).size
    : null;
  const patternLabel = (name: string) =>
    t.has(`patternLabels.${name}`) ? t(`patternLabels.${name}`) : name;
  const roleLabel = (id: string) =>
    t.has(`roleLabels.${id}`) ? t(`roleLabels.${id}`) : id;

  async function copyHandoff() {
    setCopyState('pending');
    try {
      await navigator.clipboard.writeText(handoff);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  function changeMode(nextMode: Mode) {
    const scroller = layoutScrollRef.current;
    const maxScrollTop = scroller
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      : 0;
    reanchorScrollEndRef.current = Boolean(
      scroller && maxScrollTop > 0 && maxScrollTop - scroller.scrollTop <= 1,
    );
    if (nextMode !== mode) setCopyState('idle');
    modeChangedRef.current = true;
    setMode(nextMode);
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-canvas)]">
      <header className="shrink-0 border-b border-[color:var(--color-border-soft)] px-5 py-4 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
              {t('eyebrow')}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
                {t('title')}
              </h1>
              <span className="text-body-lg text-[color:var(--color-text-tertiary)]">
                {selected.title}
              </span>
            </div>
            <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">
              {t('description')}
            </p>
          </div>
          <SegmentedControl
            ariaLabel={t('modesAria')}
            value={mode}
            onChange={changeMode}
            options={([
              ['understand', t('modes.understand')],
              ['plan', t('modes.plan')],
              ['verify', t('modes.verify')],
            ] as const).map(([value, label]) => ({
              value,
              label,
              testId: `architecture-mode-${value}`,
            }))}
            size="md"
          />
        </div>
      </header>

      <div
        ref={layoutScrollRef}
        data-testid="architecture-layout-scroll"
        data-architecture-scroll-reanchor="mode-end"
        className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden"
      >
        <aside className="border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-4 lg:border-b-0 lg:border-r xl:min-h-0 xl:overflow-y-auto">
          <h2 className="text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
            {t('profileList')}
          </h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {profiles.map((profile) => (
              <RowButton
                key={profile.uid}
                active={profile.slug === selected.slug}
                hoverInk="strong"
                hoverSurface="lift"
                onClick={() => setSelectedSlug(profile.slug)}
                className="w-full justify-start px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-lg font-[var(--font-weight-signature)]">
                    {profile.title}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-[color:var(--color-text-tertiary)]">
                    {profile.scopePaths.join(' · ')}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-[color:var(--color-text-quaternary)]">
                    {t('railRoles', { count: profile.roles.length })}
                    {profile.patterns[0] ? ` · ${patternLabel(profile.patterns[0].name)}` : ''}
                  </span>
                </span>
              </RowButton>
            ))}
          </div>
        </aside>

        <section className="min-w-0 p-5 md:p-8 xl:min-h-0 xl:overflow-y-auto" aria-labelledby="architecture-blueprint-title" data-testid="architecture-blueprint" tabIndex={0}>
          <div className="mx-auto flex w-full max-w-5xl flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="architecture-blueprint-title" className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                  {t('roles')}
                </h2>
                <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">
                  {selected.dependencyPolicy === 'lower-only'
                    ? t('dependencyLowerOnly')
                    : t('dependencyExplicit')}
                </p>
              </div>
              {record && conformance && measured ? (
                <div
                  className="flex min-w-0 max-w-[400px] flex-col items-end gap-1 text-right"
                  data-testid="architecture-record-status"
                  data-architecture-record-status={conformance.status}
                >
                  <span
                    className={badgeClass({
                      shape: 'pill',
                      className: RECORD_TONE_CLASS[conformance.status],
                    })}
                    data-testid="architecture-record-pill"
                  >
                    <RecordStatusIcon size={ICON_SIZE.sm} aria-hidden />
                    {t(`recordStatus.${conformance.status}`)} · {recordCounts}
                  </span>
                  <p
                    className="text-caption text-[color:var(--color-text-tertiary)]"
                    data-testid="architecture-record-stamp"
                  >
                    {measured.source.kind === 'git'
                      ? t('recordCheckedGit', { date: recordDate, sha: measured.source.revision })
                      : t('recordCheckedFolder', { date: recordDate })}
                    {recordDirty ? ` ${t('recordDirty')}` : ''}
                  </p>
                  <p
                    className="text-caption text-[color:var(--color-text-quaternary)]"
                    data-testid="architecture-record-cannot-confirm"
                  >
                    {t('recordCannotConfirm')}
                  </p>
                </div>
              ) : (
                <span className={badgeClass({
                  shape: 'pill',
                  className: 'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
                })}>
                  <CircleHelp size={ICON_SIZE.sm} aria-hidden />
                  {t('sourceCheckRequired')}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {selected.patterns.map((pattern) => (
                <span
                  key={`${pattern.axis}:${pattern.name}`}
                  className={badgeClass({
                    shape: 'tag',
                    className: 'border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-text-soft)]',
                  })}
                >
                  {pattern.axis} · {patternLabel(pattern.name)}
                </span>
              ))}
            </div>

            {/*
              ⚠️ **One artifact, not a picture and then a list of the same thing.** This was two
              blocks -- a diagram of four boxes, then four cards repeating the same roles -- and the
              owner's reaction to the installed build was that it neither looked good nor read as a
              flow. Saying everything twice is why: neither half could use the width, so the screen
              was simultaneously redundant and empty. One band per role carries the name, the globs
              and the allowances, and the arrows run down the gutter beside them.

              `data-architecture-mode` stays here because the scroll-reanchor test uses it to tell
              which stage is mounted; it moved with the block it was attached to.
            */}
            <div className="mt-3" data-testid="architecture-flow-panel" data-architecture-mode={mode}>
              {/* The policy sentence is the section description above; do not print it twice. */}
              <ArchitectureFlow
                profile={selected}
                modules={selectedModules}
                concepts={conceptsByProfile[selected.slug] ?? {}}
                roleLabel={roleLabel}
                reachLabel={(role, targets) => t('reachAria', { role, targets })}
                sinkLabel={t('reachNone')}
                directionLabel={t('ladderDirection')}
                moduleCountLabel={(count) => t('moduleCount', { count })}
                moreLabel={(count) => t('moreOccupants', { count })}
                showFewerLabel={t('fewerOccupants')}
                sourceUnavailableBody={sourceListingCapable ? null : t('sourceListingUnavailable')}
                reachInlineLabel={(targets) => t('reachInline', { targets })}
                layerConceptsLabel={t('layerConcepts')}
                conceptCountLabel={(count) => t('conceptCount', { count })}
              />
            </div>
          </div>
        </section>

        <aside ref={stagePanelRef} className="border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-5 lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:border-l xl:border-t-0 xl:overflow-y-auto">
          <div className="grid">
          <Surface open={mode === 'understand'} as="section" data-architecture-stage="understand" className="col-start-1 row-start-1 min-w-0">
            <FileCode2 size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <h2 className="mt-3 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('understandTitle')}
            </h2>
            {/* Numbers before prose: the derived facts win the first glance, the explanation
                follows for whoever wants it. Every number here comes from the reviewed profile
                and the source walk — the reference mockup's stat cards carried an uptime nobody
                measures, and that is the part that did not survive translation. */}
            <dl className="mt-4 grid grid-cols-2 gap-2" data-testid="architecture-stats">
              {([
                [selected.roles.length, t('statRoles')],
                ...(moduleTotal !== null ? ([[moduleTotal, t('statModules')]] as const) : []),
                [selected.patterns.length, t('patterns')],
                [selected.evidence.length, t('statEvidence')],
              ] as const).map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
                >
                  <dd className="m-0 text-display font-[var(--font-weight-strong)] leading-display-tight tabular-nums text-[color:var(--color-text-primary)]">
                    {value}
                  </dd>
                  <dt className="mt-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
            <p className="mt-4 break-keep text-body leading-prose text-[color:var(--color-text-tertiary)]">
              {t('understandBody')}
            </p>
            <h3 className="mt-6 text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
              {t('evidenceTitle')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {selected.evidence.map((entry) => (
                <li key={entry} className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {entry}
                </li>
              ))}
            </ul>
            <p className="mt-5 break-keep text-body text-[color:var(--color-text-tertiary)]">
              {t('sourceCheckBody')}
            </p>
          </Surface>

          <Surface open={mode === 'plan'} as="section" data-architecture-stage="plan" className="col-start-1 row-start-1 min-w-0">
            <Bot size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <h2 className="mt-3 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('planTitle')}
            </h2>
            <p className="mt-2 break-keep text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
              {t('planBody')}
            </p>
            <pre
              className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-3 font-mono text-caption leading-prose text-[color:var(--color-text-tertiary)]"
              aria-label={t('handoffPreview')}
              tabIndex={0}
            >
              {handoff}
            </pre>
            <Button
              className="mt-4"
              variant="primary"
              size="sm"
              disabled={copyState === 'pending'}
              data-architecture-copy-state={copyState}
              onClick={() => void copyHandoff()}
            >
              {copyState === 'pending'
                ? t('copyingHandoff')
                : copyState === 'copied'
                  ? t('copiedHandoff')
                  : copyState === 'error'
                    ? t('copyHandoffError')
                    : t('copyHandoff')}
            </Button>
            <p className="sr-only" role="status" aria-live="polite">
              {copyState === 'copied'
                ? t('copiedHandoff')
                : copyState === 'error'
                  ? t('copyHandoffError')
                  : ''}
            </p>
          </Surface>

          <Surface open={mode === 'verify'} as="section" data-architecture-stage="verify" className="col-start-1 row-start-1 min-w-0">
            <ShieldCheck size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <h2 className="mt-3 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('verifyTitle')}
            </h2>
            <p className="mt-2 break-keep text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
              {t('verifyBody')}
            </p>
            <p className="mt-4 rounded-card border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-3 py-3 text-body text-[color:var(--color-amber-source-a90)]">
              {t('unknownIsNotCompliant')}
            </p>
            <p className="mt-4 font-mono text-caption leading-prose text-[color:var(--color-text-tertiary)]">
              {t('verifyCommands')}
            </p>
          </Surface>
          </div>
        </aside>
        <div
          aria-hidden
          data-testid="architecture-bottom-tab-reserve"
          className="h-[var(--topology-mobile-bottom-tab-reserve)] lg:hidden"
        />
      </div>
    </main>
  );
}
