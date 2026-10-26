'use client';

import { isAgentDoctorAvailable, useAgentDoctor } from '@/features/acp-doctor';
import { Download, MessageSquare, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';

import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { buttonVariants, Chip, Dialog, EmptyState, InfoHint, Surface } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { TermHint } from '@/shared/ui/hints/term-hint';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from '@/shared/lib/agent-chat/tauri-acp';
import { isGuardedRuntime } from '@/features/acp-session';
import { AGENT_CLIENTS } from '@/entities/vault-session';
import { RowStateBadge } from '@/features/docs-vault-local';
import { requestAgentChat } from '@/shared/lib/agent-chat/agent-chat-intent';
import { usePanelPresence, useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';

import {
  DETAIL_TOGGLE_CHIP,
  ProductMark,
  SettingsGroup,
  SettingsGroupHeading,
  SettingsRow,
} from './settings-primitives';
import { APP_CODING_TOOLS } from '../model/app-coding-tools';

/**
 * The coding agents this machine can invoke. Each row says whether the tool can be used from
 * here and, if not, what to do on that row (a missing tool and missing Node need different
 * actions). What is confirmed on this computer comes first; `cli-unknown` (`src-tauri/src/acp/detection.rs`) keeps
 * unverified tools out of that group. Only the measured runners run isolated and ask before
 * touching files outside the vault; that fact needs a sentence, so it stands once above the
 * group and names the guarded tools from the data rather than as a per-row badge.
 */

export function AcpRuntimeSettings({
  embedded = false,
  onOpenChat = requestAgentChat,
}: {
  embedded?: boolean;
  onOpenChat?: (runtimeId: string) => void;
} = {}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  /*
   * The last known list survives a route change, so a return arrival does not flash the
   * searching row inside the route crossfade. Unkeyed, since installed tools are a fact about
   * this computer; both detection passes still run on every mount and replace it in place.
   */
  const [runtimes, setRuntimes] = useArrivalMemory<AcpRuntimeStatus[] | null>(
    "acp-runtimes",
    null,
  );
  const [checking, setChecking] = useState(false);
  /*
   * Expanded when nothing is confirmed, since the install instructions live in these rows;
   * collapsing only keeps a long list from burying a short one.
   */
  const [othersOpen, setOthersOpen] = useState(false);
  /** What the person is typing in the other-tools dialog. Set every time it opens. */
  const [othersQuery, setOthersQuery] = useState('');
  /** The search chip opens it empty; a shelf tile opens it already searched to that tool. */
  const openOthers = (query: string) => {
    setOthersQuery(query);
    setOthersOpen(true);
  };

  /** A pressed re-scan shows searching and checks through login, since the person chose to wait. */
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setRuntimes(await detectAcpRuntimes({ probeLogin: true, force: true }));
    } finally {
      setChecking(false);
    }
  }, [setRuntimes]);

  // The first pass **does not use the button path**, for two reasons:
  // ① changing state directly in an effect body costs another render
  // ② a response arriving after this pane closes would touch a vanished screen's state
  // "Searching" is already said by `runtimes === null`, so there is nothing to switch on.
  useEffect(() => {
    // Do not set out to call a capability that is not there. In a browser the answer
    // is obvious.
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    /*
     * Two passes: a disk-only scan draws at once, then the login check corrects it. A row
     * turning from Ready to Login Required is the sign the check finished.
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
  }, [setRuntimes]);

  // A browser cannot spawn a process — impossible in principle, so the reason and
  // the place to go are stated together (`.claude/rules/surfaces.md`).
  if (!isAcpBridgeAvailable()) {
    /*
     * On the web this empty state is the tab: why, what works from here, then the app and MCP
     * as the ways on. No icon tile, which `EmptyState` would indent apart from the actions.
     */
    return (
      <div data-testid="app-settings-runtimes-web" className="grid min-w-0 gap-3">
        <EmptyState
          tone="solid"
          /* The quiet next-step card surface; the surface-vocabulary ratchet refuses a new combination. */
          className="rounded-card border-[color:var(--color-border-soft)]"
          title={t('webLabel')}
          description={<span className="block">{t('webCaption')}</span>}
          action={
            <>
              <Link
                href="/download/"
                data-testid="app-settings-runtimes-get-app"
                /* The tab's only way forward: the standard primary button every web-only door wears. */
                className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor atlas-touch-floor-wide')}
              >
                <Download size={ICON_SIZE.md} aria-hidden />
                {t('webGetApp')}
              </Link>
              {/* A link, not a button: MCP is another destination, and the Mac app stays the one first press. */}
              <Link
                href={DESTINATION_HREF.mcp}
                data-testid="app-settings-runtimes-mcp-link"
                className={controlClass({
                  shape: 'link',
                  size: 'lg',
                  tone: 'default',
                  hoverInk: 'strong',
                })}
              >
                {t('webMcpLink')}
              </Link>
            </>
          }
        />
        {/*
          The tools the app would look for, from the bundled registry: marks and names only,
          since a browser has no state to report and nothing to press.
        */}
        <section
          className="min-w-0"
          aria-labelledby="app-settings-runtimes-web-tools-heading"
          data-testid="app-settings-runtimes-web-tools"
        >
          <SettingsGroupHeading
            id="app-settings-runtimes-web-tools-heading"
            label={t('webToolsHeading', { count: APP_CODING_TOOLS.length })}
          />
          <ul className="mt-1.5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3 xl:grid-cols-4">
            {APP_CODING_TOOLS.map((tool) => (
              <li
                key={tool.id}
                data-testid={`app-settings-runtimes-web-tool-${tool.id}`}
                className="flex min-w-0 items-center gap-2.5"
              >
                {/* Stepped back like the desktop shelf's marks, so they do not outweigh the press above. */}
                <span className="flex shrink-0 opacity-55">
                  <ProductMark icon={tool.icon} ink={tool.brandInk} monogram={tool.name} />
                </span>
                <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                  {tool.name}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const ready = (runtimes ?? []).filter((r) => isRuntimeUsable(r.state));
  const others = (runtimes ?? []).filter((r) => !isRuntimeUsable(r.state));
  /** What a person can make ready: a sign-in first (one terminal run), then the installs. */
  const nextUp = others
    .filter((r) => r.state !== 'cli-unknown')
    .sort((a, b) => nextStepRank(a.state) - nextStepRank(b.state));
  const undetectable = others.filter((r) => r.state === 'cli-unknown');
  /*
   * On the page a chat-capable tool keeps its row, in registry order, before it is ready: it is
   * named once, and arriving changes its ink and last slot in place instead of moving it.
   */
  const listed = embedded
    ? (runtimes ?? []).filter((r) => isRuntimeUsable(r.state) || (r.state !== 'cli-unknown' && isGuardedRuntime(r.id, r.isolated)))
    : ready;
  const shelf = embedded ? nextUp.filter((r) => !isGuardedRuntime(r.id, r.isolated)) : nextUp;
  const waiting = listed.length - ready.length;
  /* With nothing ready the first install guide carries the indigo the search door used to. */
  const leadId = embedded && ready.length === 0
    ? listed.find((r) => r.website && r.state !== 'login-needed')?.id
    : undefined;
  const chatCount = listed.filter((r) => isRuntimeUsable(r.state) && isGuardedRuntime(r.id, r.isolated)).length;
  const pageNote = !embedded || (ready.length > 0 && waiting === 0)
    ? null
    : waiting > 0
      ? t('waitingNote', { names: listed.filter((r) => !isRuntimeUsable(r.state)).map((r) => r.label).join(' · ') })
      : t(others.length > 0 ? 'noneReadyCaption' : 'noneReadyCaptionNoList');
  const hasShelf = runtimes !== null && others.length > 0;

  // The setup window's door, on the first shelf group's heading; emphasised when nothing is confirmed.
  const searchChip = (
    <Chip
      size="lg"
      tone={listed.length === 0 ? 'accentOnTint' : 'secondary'}
      data-testid="app-settings-runtimes-others-toggle"
      aria-haspopup="dialog"
      onClick={() => openOthers('')}
      className={`${DETAIL_TOGGLE_CHIP} shrink-0 whitespace-nowrap${listed.length === 0 ? ` ${LEAD_CHIP}` : ''}`}
    >
      <Search size={ICON_SIZE.md} aria-hidden />
      {t('othersSearchLabel')}
    </Chip>
  );

  /*
   * The re-scan press sits in the group heading it re-counts, as on the MCP tab. Disabled until
   * the first scan answers (`runtimes` is null until then), or a press would start a second scan.
   */
  const recheck = (
    <Chip
      size="lg"
      tone="secondary"
      data-testid="app-settings-runtimes-recheck"
      disabled={checking || runtimes === null}
      onClick={() => void refresh()}
      className={`${DETAIL_TOGGLE_CHIP} shrink-0 whitespace-nowrap`}
    >
      <RefreshCw size={ICON_SIZE.md} aria-hidden />
      {t('recheck')}
    </Chip>
  );
  // The guarded names come from the data, so the sentence follows when more runners are isolated.
  const guardedNames = ready
    .filter((r) => isGuardedRuntime(r.id, r.isolated))
    .map((r) => r.label);
  /** Whether any confirmed tool cannot open a chat — the one line this row still carries. */
  const showGuardNote =
    runtimes !== null && ready.some((r) => !isGuardedRuntime(r.id, r.isolated));
  /*
    Discloses that starting a chat symlinks the user's credential files into the app's data folder
    (`link_credentials` in `src-tauri/src/acp/isolation.rs`; gate: `tests/contract/security/acp-disk-disclosure.contract.test.ts`).
    Shown only where a chat can start, the chat button's own condition, as a hint in the group
    heading beside the re-scan press.
  */
  const diskHint =
    runtimes !== null && ready.some((r) => isGuardedRuntime(r.id, r.isolated)) ? (
      <InfoHint label={t('hintLabel')} align="right">
        <p
          data-testid="app-settings-runtimes-disk-note"
          className="break-keep text-label leading-prose text-[color:var(--color-text-secondary)]"
        >
          {t('diskNote')}
        </p>
      </InfoHint>
    ) : null;

  return (
    <div
      className="grid min-w-0 gap-3"
      data-testid="app-settings-runtimes"
    >
      <>
        {/*
          One row above the list: in the sheet the intro line, and the guard note naming the tools
          that open a chat. Not drawn when empty, or it would still spend the grid gap.
        */}
        {!embedded || showGuardNote ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {embedded ? null : (
              <p className="break-keep text-body leading-body text-[color:var(--color-text-quaternary)]">
                {t('intro')}
              </p>
            )}
            {embedded ? null : (
              <Link
                href={DESTINATION_HREF.mcp}
                data-testid="app-settings-runtimes-mcp-link"
                className={controlClass({
                  shape: 'link',
                  tone: 'muted',
                  hoverInk: 'strong',
                  className: 'text-label',
                })}
              >
                {t('mcpLink')}
              </Link>
            )}
            {showGuardNote ? (
              <p
                data-testid="app-settings-runtimes-guard-note"
                data-guarded-count={guardedNames.length}
                className="break-keep text-body leading-body text-[color:var(--color-text-tertiary)]"
              >
                {guardedNames.length > 0
                  ? t('guardedExplainer', { names: guardedNames.join(' · ') })
                  : t('guardedExplainerNone')}{' '}
                <TermHint term="acp" />
              </p>
            ) : null}
          </div>
        ) : null}

        {runtimes === null ? (
          /*
           * Named while the scan runs and counted once it answers, so the heading that holds the
           * re-scan control exists from the start.
           */
          <SettingsGroup label={t(embedded ? 'pageHeading' : 'heading')} trailing={recheck}>
            <SettingsRow label={t('checking')} control={null} testId="app-settings-runtimes-loading" />
          </SettingsGroup>
        ) : (
          /* Name · hint · action, the order the MCP tab's own group heading uses. */
          <SettingsGroup
            label={t(embedded ? 'pageReadyHeading' : 'readyHeading', { count: ready.length })}
            trailing={
              <>
                {diskHint}
                {recheck}
              </>
            }
          >
            {listed.length === 0 ? (
              /* "The install guides are in the list below" only when there is a list below. */
              <SettingsRow label={t('noneReady')} caption={embedded ? undefined : t(others.length > 0 ? 'noneReadyCaption' : 'noneReadyCaptionNoList')} control={null} />
            ) : (
              listed.map((runtime) => (
                <RuntimeRow
                  key={runtime.id}
                  runtime={runtime}
                  onOpenChat={onOpenChat}
                  onRuntimesChanged={() => void refresh()}
                  page={embedded}
                  lead={runtime.id === leadId}
                  oneOfSeveralChats={chatCount > 1}
                />
              ))
            )}
          </SettingsGroup>
        )}
        {runtimes !== null && pageNote ? (
          <p data-testid="app-settings-runtimes-page-note" className="text-body leading-body text-[color:var(--color-text-tertiary)]">
            {pageNote}
          </p>
        ) : null}
      </>

      {hasShelf ? (
        /*
         * The other tools: a shelf of marks sorted by next step (sign-in, then installs, then
         * the undetectable group), each opening the searchable setup `Dialog` at its tool, the
         * same primitive as the connector dialog. With nothing confirmed the door carries the
         * indigo, since the install instructions live there. Falsifier: if people read the
         * shelf instead of reaching the ready tools, it goes back behind the chip.
         */
        <>
          {shelf.length > 0 ? (
            <section
              className="min-w-0"
              aria-labelledby="app-settings-runtimes-others-heading"
              data-testid="app-settings-runtimes-others"
            >
              <SettingsGroupHeading
                id="app-settings-runtimes-others-heading"
                label={t('nextHeading', { count: shelf.length })}
                trailing={searchChip}
              />
              <ul
                data-testid="app-settings-runtimes-others-shelf"
                className="mt-1.5 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4"
              >
                {shelf.map((runtime) => (
                  <ShelfTile key={runtime.id} runtime={runtime} onOpen={openOthers} />
                ))}
              </ul>
            </section>
          ) : null}
          {undetectable.length > 0 ? (
            /*
             * What Atlas cannot detect: the heading names the state once and the tiles are
             * name-only entries, still opening each tool's install guide.
             */
            <section
              className="min-w-0"
              aria-labelledby="app-settings-runtimes-unknown-heading"
              data-testid={shelf.length > 0 ? 'app-settings-runtimes-unknown' : 'app-settings-runtimes-others'}
            >
              <SettingsGroupHeading
                id="app-settings-runtimes-unknown-heading"
                label={t('unknownHeading', { count: undetectable.length })}
                trailing={shelf.length > 0 ? null : searchChip}
              />
              <p
                data-testid="app-settings-runtimes-unknown-shelf-note"
                className="text-body leading-prose text-[color:var(--color-text-tertiary)]"
              >
                {t('unknownShelfNote')}
              </p>
              <ul
                data-testid="app-settings-runtimes-unknown-shelf"
                className="mt-1 grid min-w-0 grid-cols-2 gap-x-2 md:grid-cols-3 xl:grid-cols-4"
              >
                {undetectable.map((runtime) => (
                  <ShelfTile key={runtime.id} runtime={runtime} onOpen={openOthers} quiet />
                ))}
              </ul>
            </section>
          ) : null}
          <OtherRuntimesDialog
            open={othersOpen}
            onClose={() => setOthersOpen(false)}
            runtimes={others}
            query={othersQuery}
            onQueryChange={setOthersQuery}
            onOpenChat={onOpenChat}
            onRuntimesChanged={() => void refresh()}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Every other coding tool in one searchable scrolling window, drawn with the same `RuntimeRow`
 * as the ready group so a state reads one way. Unusable rows link to the tool's own
 * instructions only (`.claude/rules/forbidden.md`). Search matches name and description
 * together, since people remember one or the other.
 */
function OtherRuntimesDialog({
  open,
  onClose,
  runtimes,
  query,
  onQueryChange,
  onOpenChat,
  onRuntimesChanged,
}: {
  open: boolean;
  onClose: () => void;
  runtimes: AcpRuntimeStatus[];
  query: string;
  onQueryChange: (next: string) => void;
  onOpenChat: (runtimeId: string) => void;
  onRuntimesChanged: () => void;
}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? runtimes.filter((runtime) =>
        `${runtime.label} ${runtime.description} ${runtime.id}`.toLowerCase().includes(needle),
      )
    : runtimes;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      labelledBy="app-settings-runtimes-others-title"
      testId="app-settings-runtimes-others-dialog"
      className="max-h-[min(80vh,var(--dialog-max-h))] overflow-y-auto"
    >
      <h2
        id="app-settings-runtimes-others-title"
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {/* The errand, not the shelf's name, which the page heading already says. */}
        {t('othersDialogTitle')}
      </h2>
      {/* What "could not check" means, once and before the list rather than on every row. */}
      {/* Only while a listed row carries that state; a search can leave none. */}
      {matches.some((runtime) => runtime.state === 'cli-unknown') ? (
        <p
          data-testid="app-settings-runtimes-unknown-note"
          className="mt-1 break-keep text-body leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('unknownExplainer')}
        </p>
      ) : null}
      <Input
        label={t('othersSearchLabel')}
        size="md"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={t('othersSearchPlaceholder')}
        data-testid="app-settings-runtimes-others-search"
        onChange={(event) => onQueryChange(event.target.value)}
        className="mt-3 w-full"
      />
      {matches.length === 0 ? (
        <p
          data-testid="app-settings-runtimes-others-empty"
          className="mt-3 break-keep text-body leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('othersNoneForSearch', { query: query.trim() })}
        </p>
      ) : (
        <div className="mt-3" data-testid="app-settings-runtimes-others-list">
          <SettingsGroup>
            {matches.map((runtime) => (
              <RuntimeRow
                key={runtime.id}
                runtime={runtime}
                onOpenChat={onOpenChat}
                onRuntimesChanged={onRuntimesChanged}
              />
            ))}
          </SettingsGroup>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Chip size="lg" tone="secondary" onClick={onClose} className={DETAIL_TOGGLE_CHIP}>
          {t('othersClose')}
        </Chip>
      </div>
    </Dialog>
  );
}

/**
 * Present and launchable, not necessarily signed in: `login-unknown` means the sign-in probe
 * failed, so the row stays in the first group without the confirmed dot.
 */
function isRuntimeUsable(state: AcpRuntimeStatus['state']): boolean {
  return state === 'ready' || state === 'login-unknown';
}

/**
 * How near a tool is to usable: a sign-in is one terminal run, an install is a download, and a
 * tool that needs a runtime first (Node, uv) or its own installer is one step further. The sort
 * is stable, so tools in one state keep the registry's order.
 */
const NEXT_STEP_ORDER: readonly AcpRuntimeStatus['state'][] = [
  'login-needed',
  'cli-missing',
  'node-missing',
  'uvx-missing',
  'binary-missing',
];
function nextStepRank(state: AcpRuntimeStatus['state']): number {
  const rank = NEXT_STEP_ORDER.indexOf(state);
  return rank === -1 ? NEXT_STEP_ORDER.length : rank;
}

/**
 * One tool on the shelf: mark, name and, where it varies, state; pressing it opens the setup
 * window searched to this tool. Marks rest greyscale at 70% and regain colour on pointer or
 * focus, so brand ink never outweighs the state.
 */
function ShelfTile({
  runtime,
  onOpen,
  quiet = false,
}: {
  runtime: AcpRuntimeStatus;
  onOpen: (query: string) => void;
  /** The undetectable group: no state line (its heading says it once), no card. */
  quiet?: boolean;
}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const mark = runtimeMark(runtime);
  const label = t('othersTileLabel', { name: runtime.label, state: t(`state.${runtime.state}`) });
  if (quiet) {
    /* A name, not a card, so the names share the heading's start line and read as an index. */
    return (
      <li className="min-w-0">
        <button
          type="button"
          data-testid={`app-settings-runtimes-tile-${runtime.id}`}
          data-shelf-tone="quiet"
          aria-haspopup="dialog"
          aria-label={label}
          onClick={() => onOpen(runtime.label)}
          className={controlClass({
            shape: 'link',
            size: 'lg',
            tone: 'default',
            hoverInk: 'strong',
            className:
              'atlas-touch-floor min-h-8 w-full min-w-0 text-left text-[color:var(--color-text-tertiary)]',
          })}
        >
          <span className="min-w-0 truncate">{runtime.label}</span>
        </button>
      </li>
    );
  }
  return (
    <li className="min-w-0">
      <button
        type="button"
        data-testid={`app-settings-runtimes-tile-${runtime.id}`}
        data-shelf-tone="next"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => onOpen(runtime.label)}
        className={controlClass({
          shape: 'card',
          size: 'md',
          tone: 'secondary',
          hoverInk: 'strong',
          hoverBorder: 'strong',
          className:
            'group w-full gap-2.5 bg-[color:var(--color-overlay-1)] py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
        })}
      >
        <span className="flex shrink-0 opacity-55 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          <ProductMark icon={mark.icon} ink={mark.ink} monogram={runtime.label} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-[var(--font-weight-signature)]">{runtime.label}</span>
          <span className="mt-0.5 block truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t(`state.${runtime.state}`)}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The registry's mark, else the MCP tab's bundled one for the same product, else the row's
 * monogram, so one product wears one mark on both tabs.
 */
function runtimeMark(runtime: AcpRuntimeStatus): { icon: string | null; ink: string | null } {
  if (runtime.icon) return { icon: runtime.icon, ink: runtime.brandInk };
  const client = AGENT_CLIENTS.find((entry) => entry.icon === `/acp-icons/${runtime.id}.svg`);
  return client ? { icon: client.icon, ink: runtime.brandInk ?? client.brandInk } : { icon: null, ink: null };
}

const LEAD_CHIP = 'border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]';

function RuntimeRow({
  runtime,
  onOpenChat,
  onRuntimesChanged,
  page = false,
  lead = false,
  oneOfSeveralChats = false,
}: {
  runtime: AcpRuntimeStatus;
  onOpenChat: (runtimeId: string) => void;
  onRuntimesChanged?: () => void;
  lead?: boolean;
  oneOfSeveralChats?: boolean;
  /** The Agents page: the last slot holds the state until a chat can open, then the press. */
  page?: boolean;
}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const isUsable = isRuntimeUsable(runtime.state);
  const guarded = isGuardedRuntime(runtime.id, runtime.isolated);

  /*
   * A link to the tool's own instructions, never an install button: a script behind a URL can
   * change and cannot be shown as a diff (`forbidden.md`). The pinned `npx` a chat runs differs:
   * versioned, child-process only, and started by the person. No install command is copied here.
   */
  const website = isUsable ? null : runtime.website;
  /* A tool that only needs a login gets no install link. */
  const showInstall = website !== null && runtime.state !== 'login-needed';
  const install = usePanelPresence(page && showInstall);
  const slot = isUsable && guarded ? 'chat' : runtime.state;
  const { leaving } = useSurfaceSwap(page ? slot : '');

  /*
   * The doctor is offered only for gated tools: an unmeasured tool has no app-owned config or
   * credential links to check, and the web has no process or keychain.
   */
  const doctor = useAgentDoctor(runtime.id, onRuntimesChanged);
  const mark = runtimeMark(runtime);
  const showDoctor = guarded && isAgentDoctorAvailable();

  /*
   * Filled while it is the tab's one chat; beside another chat each takes the tint, so no tool
   * is ranked. Gated tools only, or the promise that the app asks before leaving the folder breaks.
   */
  const chat = (copy = false) => (
    <Chip
      size="lg"
      tone={oneOfSeveralChats ? 'accentOnTint' : 'onAccent'}
      data-testid={copy ? undefined : `app-settings-runtime-chat-${runtime.id}`}
      aria-label={t('openChat')}
      onClick={() => onOpenChat(runtime.id)}
      className={cn('shrink-0', oneOfSeveralChats ? LEAD_CHIP : 'focus-visible:ring-[color:var(--color-text-primary)]')}
    >
      <MessageSquare size={ICON_SIZE.md} aria-hidden />
      {t('openChatShort')}
    </Chip>
  );
  /* A state, not a control (`RowStateBadge`, as on the MCP tab), so it does not outshout the action. */
  const badge = (state: AcpRuntimeStatus['state'], copy = false) => (
    <RowStateBadge ready={state === 'ready'} data-runtime-state={copy ? undefined : state}>
      {t(`state.${state}`)}
    </RowStateBadge>
  );
  /* Someone whose chat will not open at all comes here, not only to the chat's problem card. */
  const installLink = (exiting = false) => (
    <a
      href={runtime.website ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="app-settings-runtime-install"
      inert={exiting}
      /* One chip size for every control on the row; the ↗ before the label says it leaves the app. */
      className={controlClass({
        shape: 'chip',
        size: 'lg',
        tone: lead ? 'accentOnTint' : 'secondary',
        hoverInk: 'strong',
        className: cn('shrink-0', lead && LEAD_CHIP, exiting && 'motion-swap-out pointer-events-none'),
      })}
    >
      <span aria-hidden data-external-link-marker>
        ↗
      </span>
      {t('installGuide')}
    </a>
  );

  /*
   * In the sheet the controls every row has (check, badge) share the right edge. On the page the
   * last slot is the state or the chat press, and arriving crossfades one into the other there.
   */
  const control = page ? (
    <span className="flex items-center gap-2">
      {install.mounted ? installLink(install.exiting) : null}
      {showDoctor ? doctor.scanButton : null}
      <span className="grid min-w-24 justify-items-end" data-testid={`app-settings-runtime-slot-${runtime.id}`}>
        <span key={slot} className={cn('col-start-1 row-start-1', leaving !== null && 'motion-swap-in')}>
          {slot === 'chat' ? chat() : badge(runtime.state)}
        </span>
        {leaving === null ? null : (
          <span key={`leaving:${leaving}`} aria-hidden inert className="motion-swap-out pointer-events-none col-start-1 row-start-1">
            {leaving === 'chat' ? chat(true) : badge(leaving as AcpRuntimeStatus['state'], true)}
          </span>
        )}
      </span>
    </span>
  ) : (
    <span className="flex items-center gap-2">
      {isUsable && guarded ? chat() : null}
      {showInstall ? installLink() : null}
      {showDoctor ? doctor.scanButton : null}
      {badge(runtime.state)}
    </span>
  );

  return (
    <div
      className={cn(
        'min-w-0',
        page && '[&_[data-vendor-mark]]:transition-opacity [&_[data-vendor-mark]]:duration-[var(--motion-settle)] [&_[data-vendor-mark]]:ease-[var(--motion-ease)]',
        page && !isUsable && '[&_[data-vendor-mark]]:opacity-55',
      )}
      data-runtime-row-state={page ? runtime.state : undefined}
    >
      <SettingsRow
        label={runtime.label}
        caption={
          runtime.state === 'login-needed'
            ? t('loginHint')
            : runtime.state === 'login-unknown'
              ? t('loginUnknownHint')
              : undefined
        }
        testId={`app-settings-runtime-${runtime.id}`}
        icon={mark.icon}
        iconInk={mark.ink}
        monogram={runtime.label}
        control={control}
      />
      {/* Through `Surface` for the ramp's enter/exit, and only when there is a result. */}
      {showDoctor ? (
        <Surface open={Boolean(doctor.result)} className="min-w-0 px-4 pb-3">
          {doctor.result}
        </Surface>
      ) : null}
    </div>
  );
}
