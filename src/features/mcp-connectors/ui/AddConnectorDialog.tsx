'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Info, Plus, X } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import {
  Checkbox,
  Chip,
  Dialog,
  IconButton,
  ServiceMark,
  resolveServiceMark,
} from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Input } from '@/shared/ui/input';
import { EmptyState } from '@/shared/ui/empty-state';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  connectorProblems,
  looksLikeSecretKey,
  type ConnectorProblem,
  type ConnectorRecord,
  type ConnectorTransport,
  type ConnectorValueEntry,
} from '@/shared/lib/connector-record';
import type { ConnectorWriteResult } from '@/shared/lib/connector-store';
import {
  isAttachableTransport,
  type ConnectorDiscoveryState,
  type DiscoveredConnector,
} from '@/shared/lib/tauri-connectors';
import { connectorSecretRef, connectorSecretSet } from '@/shared/lib/tauri-connector-secrets';
import {
  MCP_CATALOGUE,
  MCP_CATALOGUE_CAPTURED_AT,
  catalogueDraft,
  searchCatalogue,
  variantRuns,
  variantVariables,
  type CatalogueEntry,
  type CatalogueVariable,
  type CatalogueVariant,
} from '@/shared/config/mcp-catalogue';
import {
  resolveConnectorRuntimes,
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/tauri-connector-runtimes';

import { groupDiscovered, shortSourceKey, type DiscoveredGroup } from './discovered-groups';

/**
 * Adding a connector: one list under one search, like every surveyed MCP client, in the order
 * a person can act without typing: already on this computer (one press copies it), ready to
 * attach (`mcp-catalogue.generated.ts`, showing the verbatim address or command and what it
 * asks), and by hand (a folded form, where an install link lands filled in).
 *
 * A press attaches what asks nothing and asks in place for what asks one thing: a hosted OAuth
 * address goes straight into the folder switched off; a local program needing a token unfolds
 * one password field per required variable under its row. Nothing is written until the press,
 * and no value ever goes into the folder's file. Record: `docs/DECISIONS.md` (2026-09-07,
 * one list).
 */

/** `crypto.randomUUID` exists on every surface this ships to. */
export function newConnectorId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}`;
}

/** A name, a value, and where the value goes. */
interface DraftVariable {
  name: string;
  value: string;
  /** A credential-shaped name starts checked and cannot be unchecked. */
  secret: boolean;
}

/** Handed to the by-hand form by a catalogue entry or an install link. */
export interface CustomPrefill {
  name: string;
  transport: ConnectorTransport;
  command: string;
  args: string;
  url: string;
  variables: DraftVariable[];
  /** Drawn above the form; absent for a blank form. */
  provenance?: { title: string; detail: string; docsUrl?: string };
}

function prefillFromCatalogue(
  entry: CatalogueEntry,
  variant: CatalogueVariant,
  runtimes: readonly ResolvedRuntime[] | null,
): CustomPrefill {
  const record = catalogueDraft(entry, variant, {
    id: 'draft',
    capturedAt: MCP_CATALOGUE_CAPTURED_AT,
    runtimePath: variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null,
    secretRef: () => '',
  });
  return {
    name: record.name,
    transport: record.transport,
    command: record.command ?? '',
    args: record.args.join(' '),
    url: record.url ?? '',
    variables: variantVariables(variant).map((variable) => ({
      name: variable.name,
      value: '',
      // The publisher's own `isSecret`, not only a guess from the name: `OPENAPI_MCP_HEADERS` would
      // otherwise attach with no credential.
      secret: variable.secret || looksLikeSecretKey(variable.name),
    })),
    provenance: {
      title: entry.title,
      detail: variant.source,
      docsUrl: entry.docsUrl,
    },
  };
}

/** An install link's parsed record, in the by-hand shape. */
export function prefillFromRecord(record: ConnectorRecord): CustomPrefill {
  const entries: ConnectorValueEntry[] =
    record.transport === 'http' ? record.headers : record.env;
  return {
    name: record.name,
    transport: record.transport,
    command: record.command ?? '',
    args: record.args.join(' '),
    url: record.url ?? '',
    variables: entries.map((entry) => ({
      name: entry.name,
      value: '',
      secret: typeof entry.secretRef === 'string' || looksLikeSecretKey(entry.name),
    })),
  };
}

const EMPTY_PREFILL: CustomPrefill = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  variables: [],
};

type ProblemKey = `problem.${ConnectorProblem}`;
type SourceKey = `source.${ReturnType<typeof shortSourceKey>}`;

type AddFailureReason = 'noFolder' | 'malformed' | 'writeFailed' | 'secret';
type AddFailureKey = `addFailReason.${AddFailureReason}`;

function addFailureReason(result: ConnectorWriteResult | null): AddFailureReason | null {
  if (result === null) return 'noFolder';
  switch (result.status) {
    case 'saved':
      return null;
    case 'blocked_unavailable':
      return 'noFolder';
    case 'blocked_malformed':
      return 'malformed';
    case 'blocked_secret':
      return 'secret';
    default:
      return 'writeFailed';
  }
}

/** Enough to recognise a machine, not to list it. */
const FOUND_FOLD = 3;

function requiredVariables(variant: CatalogueVariant): readonly CatalogueVariable[] {
  return variantVariables(variant).filter((variable) => variable.required);
}

/**
 * The first hosted address, else the first local program: a hosted address asks nothing, so a
 * single press lands there when the vendor offers both.
 */
function primaryVariant(entry: CatalogueEntry): CatalogueVariant {
  return entry.variants.find((variant) => variant.kind === 'remote') ?? entry.variants[0];
}

/** For the unfolded panel and the test hooks. */
function variantKey(variant: CatalogueVariant): string {
  return variantRuns(variant);
}

type PressOutcome = 'attaches' | 'asks';
function pressOutcome(variant: CatalogueVariant): PressOutcome {
  return requiredVariables(variant).length > 0 ? 'asks' : 'attaches';
}

/** jsdom has no `scrollIntoView`; the form is still unfolded, which is the contract. */
function scrollFormIntoView(node: HTMLElement | null, reducedMotion: boolean): void {
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}

export function AddConnectorDialog({
  open,
  onClose,
  discovery,
  canDiscover,
  canStoreSecrets,
  attachedNames,
  onAddDiscovered,
  onAddCustom,
  /** A draft handed in from outside, such as an install link. */
  incoming,
  testIdPrefix,
}: {
  open: boolean;
  onClose: () => void;
  /** See `ConnectorDiscoveryState`; only `done` has rows. */
  discovery: ConnectorDiscoveryState;
  canDiscover: boolean;
  canStoreSecrets: boolean;
  attachedNames: Set<string>;
  onAddDiscovered: (server: DiscoveredConnector) => Promise<ConnectorWriteResult | null>;
  onAddCustom: (connector: ConnectorRecord) => Promise<ConnectorWriteResult | null>;
  incoming?: CustomPrefill | null;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const reducedMotion = usePrefersReducedMotion();
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<AddFailureReason | null>(null);
  const [prefill, setPrefill] = useState<CustomPrefill>(EMPTY_PREFILL);
  /** Bumped on every pre-fill so the form remounts with the new values. */
  const [prefillTick, setPrefillTick] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [asking, setAsking] = useState<{ entryId: string; variant: string } | null>(null);

  /**
   * This machine's runtimes, read once on open; asking per keystroke would walk directories
   * while somebody types.
   */
  const [runtimes, setRuntimes] = useState<ResolvedRuntime[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveConnectorRuntimes().then((result) => {
      if (!cancelled) setRuntimes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /*
   * Two resets adjusted during render, not in an effect, so the dialog never paints a frame in
   * the wrong state (`react-hooks/set-state-in-effect` refuses the effect): opening folds
   * everything back, and a draft from outside unfolds the form filled but unsaved, because a link
   * is an invitation and the press stays the person's (`src/shared/lib/mcp-install-link.ts`).
   */
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setQuery('');
      setFailure(null);
      setAsking(null);
      setCustomOpen(false);
    }
  }
  /*
   * Seeded `null`, not with `incoming`, so the first arrival is always a change; otherwise a link
   * opened the dialog with the filled form folded out of sight.
   */
  const [seenIncoming, setSeenIncoming] = useState<CustomPrefill | null>(null);
  if (open && incoming && incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    setPrefill(incoming);
    setPrefillTick((tick) => tick + 1);
    setCustomOpen(true);
  }

  /*
   * Focuses the search after the dialog records its opener. With `autoFocus` the trap recorded
   * the search box as opener, and Escape dropped focus to `<body>`. This parent effect runs after
   * the trap's child effect.
   */
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  /** So a pre-fill can bring the unfolded form into view. */
  const customRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (prefillTick === 0 || !customOpen) return;
    scrollFormIntoView(customRef.current, reducedMotion);
  }, [customOpen, prefillTick, reducedMotion]);

  /*
   * The empty search's door unfolds the form, scrolls to it and focuses its first field; the
   * card's button and the fold's toggle are never both on screen.
   */
  const focusCustomNameRef = useRef(false);
  useEffect(() => {
    if (!focusCustomNameRef.current || !customOpen) return;
    focusCustomNameRef.current = false;
    scrollFormIntoView(customRef.current, reducedMotion);
    document.getElementById(`${testIdPrefix}-custom-name`)?.focus({ preventScroll: true });
  }, [customOpen, reducedMotion, testIdPrefix]);

  const attempt = useCallback(
    async (write: () => Promise<ConnectorWriteResult | null>) => {
      const result = await write();
      const reason = addFailureReason(result);
      if (reason === null) {
        setFailure(null);
        onClose();
        return true;
      }
      setFailure(reason);
      return false;
    },
    [onClose],
  );

  /**
   * Writes the row, then stores tokens in the keychain only after the row is on disk, or a
   * failed write leaves an orphaned value on this machine (see `forgetSecrets`).
   */
  const addWithSecrets = useCallback(
    (connector: ConnectorRecord, secrets: Array<{ ref: string; value: string }>) =>
      attempt(async () => {
        const result = await onAddCustom(connector);
        if (result?.status === 'saved') {
          await Promise.all(
            secrets.map(({ ref, value }) => connectorSecretSet(ref, value).catch(() => null)),
          );
        }
        return result;
      }),
    [attempt, onAddCustom],
  );

  const discovered = discovery.status === 'done' ? discovery.connectors : null;
  const groups = useMemo(
    () => groupDiscovered((discovered ?? []).filter((server) => !attachedNames.has(server.name))),
    [attachedNames, discovered],
  );
  const needle = query.trim().toLowerCase();
  const foundMatches = needle
    ? groups.filter((group) =>
        `${group.server.name} ${
          group.server.url ?? [group.server.command, ...group.server.args].join(' ')
        }`
          .toLowerCase()
          .includes(needle),
      )
    : groups;
  const catalogueMatches = useMemo(() => searchCatalogue(MCP_CATALOGUE, query), [query]);
  const nothingMatches =
    needle.length > 0 && catalogueMatches.length === 0 && (!canDiscover || foundMatches.length === 0);

  /** As the record the folder will hold. */
  const catalogueRecord = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    const id = newConnectorId();
    return catalogueDraft(entry, variant, {
      id,
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null,
      secretRef: connectorSecretRef,
    });
  };

  /** Attaches what asks nothing; asks in place for what asks one thing. */
  const pressCatalogue = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    setFailure(null);
    if (pressOutcome(variant) === 'attaches') {
      setAsking(null);
      void addWithSecrets(catalogueRecord(entry, variant), []);
      return;
    }
    setAsking({ entryId: entry.id, variant: variantKey(variant) });
  };

  /** The same facts in the editable by-hand form. */
  const editCatalogue = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    setPrefill(prefillFromCatalogue(entry, variant, runtimes));
    setPrefillTick((tick) => tick + 1);
    setAsking(null);
    setCustomOpen(true);
    setFailure(null);
  };

  const foundSection = (
    <FoundSection
      canDiscover={canDiscover}
      discovery={discovery}
      matches={foundMatches}
      query={query}
      onAdd={(server) => void attempt(() => onAddDiscovered(server))}
      testIdPrefix={testIdPrefix}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      labelledBy={`${testIdPrefix}-add-title`}
      testId={`${testIdPrefix}-add-dialog`}
      initialFocus="none"
      /*
       * The title and search stay put while the groups scroll, so narrowing stays in reach.
       */
      /*
       * A fixed height, not a maximum, so narrowing the list does not move the search box.
       */
      className="flex h-[min(80vh,var(--dialog-max-h))] flex-col"
    >
      {/*
       * The close control sits in the top corner like every other dialog; Escape and the
       * scrim do the same.
       */}
      <div className="flex items-start justify-between gap-3">
        <h2
          id={`${testIdPrefix}-add-title`}
          className="min-w-0 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t('addTitle')}
        </h2>
        <IconButton
          label={t('close')}
          size="sm"
          tone="muted"
          data-testid={`${testIdPrefix}-add-close`}
          className="-mr-1 -mt-1 shrink-0"
          onClick={onClose}
        >
          <X size={ICON_SIZE.lg} aria-hidden />
        </IconButton>
      </div>

      {/*
       * One search narrows every group at once.
       */}
      {/*
       * Takes focus on open (see `searchRef`) and wears the strong border so it reads as the
       * control over all rows. `initialFocus="none"` keeps the trap off the corner close.
       */}
      <Input
        aria-label={t('searchLabel')}
        size="md"
        type="search"
        autoComplete="off"
        spellCheck={false}
        ref={searchRef}
        value={query}
        placeholder={t('searchPlaceholder')}
        data-testid={`${testIdPrefix}-search`}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-3 w-full border-[color:var(--color-border-strong)]"
      />

      <div
        data-testid={`${testIdPrefix}-add-scroll`}
        className="-mx-4 mt-4 min-h-0 flex-1 overflow-y-auto px-4"
      >
      <div className="flex flex-col gap-5" data-testid={`${testIdPrefix}-add-groups`}>
        {/*
         * A search matching nothing answers first, as one card for the whole dialog, with typing
         * it by hand as the next step; the groups step aside.
         */}
        {nothingMatches ? (
          <div data-testid={`${testIdPrefix}-add-none`}>
          <EmptyState
            size="compact"
            title={t('noneForSearchTitle', { query: query.trim() })}
            description={t('noneForSearchBody')}
            action={
              customOpen ? undefined : (
              <button
                type="button"
                data-testid={`${testIdPrefix}-add-none-custom`}
                onClick={() => {
                  focusCustomNameRef.current = true;
                  setCustomOpen(true);
                }}
                className={controlClass({
                  shape: 'chip',
                  size: 'lg',
                  tone: 'secondary',
                  hoverInk: 'strong',
                  hoverBorder: 'strong',
                  className: 'border-[color:var(--color-border-soft)]',
                })}
              >
                {t('noneForSearchAction')}
              </button>
              )
            }
          />
          </div>
        ) : null}
        {/*
         * The catalogue leads: on a developer's machine the scan lists many utilities that
         * would push the services a person came for out of the frame.
         */}
        <CatalogueSection
          entries={catalogueMatches}
          query={query}
          runtimes={runtimes}
          attachedNames={attachedNames}
          asking={asking}
          canStoreSecrets={canStoreSecrets}
          onPress={pressCatalogue}
          onEdit={editCatalogue}
          onDismiss={() => setAsking(null)}
          onAttach={(entry, variant, values) => {
            const record = catalogueRecord(entry, variant);
            const secrets = record.transport === 'http' ? record.headers : record.env;
            void addWithSecrets(
              record,
              secrets.flatMap((item) =>
                typeof item.secretRef === 'string' && values[item.name]?.trim()
                  ? [{ ref: item.secretRef, value: values[item.name].trim() }]
                  : [],
              ),
            );
          }}
          testIdPrefix={testIdPrefix}
        />

        {nothingMatches ? null : foundSection}

        {/*
         * By hand is the last row, folded; a link from outside unfolds it filled.
         */}
        <section ref={customRef} data-testid={`${testIdPrefix}-custom-section`} className="pb-2">
          {/* While the empty card offers the same door, the fold's toggle waits behind it. */}
          {nothingMatches && !customOpen ? null : (
          <button
            type="button"
            aria-expanded={customOpen}
            aria-controls={`${testIdPrefix}-custom-body`}
            data-testid={`${testIdPrefix}-custom-toggle`}
            onClick={() => setCustomOpen((value) => !value)}
            className={controlClass({
              shape: 'link',
              tone: 'muted',
              hoverInk: 'strong',
              className: 'gap-1 text-body font-[var(--font-weight-signature)]',
            })}
          >
            <ChevronRight
              size={ICON_SIZE.sm}
              aria-hidden
              className={customOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
            />
            {t('customToggle')}
          </button>
          )}
          {customOpen ? (
            <div id={`${testIdPrefix}-custom-body`} className="mt-3">
              <CustomConnectorForm
                key={prefillTick}
                prefill={prefill}
                runtimes={runtimes}
                canStoreSecrets={canStoreSecrets}
                onAdd={(connector, secrets) => void addWithSecrets(connector, secrets)}
                testIdPrefix={testIdPrefix}
              />
            </div>
          ) : null}
        </section>
      </div>

      {/*
       * Which sessions carry a connector is a fact to know, so it sits below the task.
       */}
      <p
        data-testid={`${testIdPrefix}-add-runtime`}
        className="mt-4 break-keep border-t border-[color:var(--color-border-soft)] pt-3 text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('runtimeNarrowing')}
      </p>

      {failure ? (
        <p
          role="alert"
          data-testid={`${testIdPrefix}-add-failed`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-danger)]"
        >
          {t('addFailed', { reason: t(`addFailReason.${failure}` as AddFailureKey) })}
        </p>
      ) : null}
      </div>
    </Dialog>
  );
}

/** One action with one shape wherever it is pressed. */
const CONNECTOR_SUBMIT_CLASS = controlClass({
  shape: 'chip',
  size: 'lg',
  tone: 'onAccent',
  className: 'border-transparent',
});
/** The same 32px step, so the row keeps one height. */
const CONNECTOR_QUIET_CLASS = controlClass({
  shape: 'chip',
  size: 'lg',
  tone: 'muted',
  hoverInk: 'strong',
  hoverBorder: 'strong',
  className: 'border-transparent',
});

/** What the rows below have in common, with a quiet fact beside it. */
function GroupHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {title}
      </h3>
      {meta ? (
        <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** One row per server that actually runs. */
function FoundSection({
  canDiscover,
  discovery,
  matches,
  query,
  onAdd,
  testIdPrefix,
}: {
  canDiscover: boolean;
  discovery: ConnectorDiscoveryState;
  matches: DiscoveredGroup[];
  query: string;
  onAdd: (server: DiscoveredConnector) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  /**
   * Folded past the first rows unless searching, because most scanned servers are developer
   * utilities; a search shows every match.
   */
  const [showAll, setShowAll] = useState(false);
  const searching = query.trim().length > 0;
  const visible = searching || showAll ? matches : matches.slice(0, FOUND_FOLD);
  const folded = matches.length - visible.length;
  if (!canDiscover) {
    /*
     * The degradation contract, not "coming soon": why it is missing and what still works, placed
     * after the working list so it does not read as a verdict on the dialog.
     */
    return (
      <div
        role="status"
        data-testid="connectors-discovery-unavailable"
        className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
      >
        <div className="flex items-start gap-2">
          <Info
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)]"
          />
          <div className="min-w-0">
            <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t('webTitle')}
            </p>
            <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {t('webBody')}
            </p>
            <Link
              href="/download/"
              data-testid="connectors-web-get-app"
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                className: 'mt-2 text-label font-[var(--font-weight-signature)]',
              })}
            >
              {t('webGetApp')}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  // Searching hides an empty group; the dialog's one line explains it.
  if (discovery.status === 'done' && matches.length === 0 && query.trim()) return null;
  return (
    <section data-testid={`${testIdPrefix}-found-section`}>
      <GroupHeading title={t('groupFound')} />
      {/*
       * A failed scan says so here, the only place scan results appear; "found none" would claim
       * something a failed read has not earned.
       */}
      {discovery.status === 'failed' ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-discovery-failed`}
          className="break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {t('discoveryFailed')}
        </p>
      ) : discovery.status === 'scanning' ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-scanning`}
          className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('scanning')}
        </p>
      ) : matches.length === 0 ? (
        <p
          data-testid={`${testIdPrefix}-found-empty`}
          className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('foundNone')}
        </p>
      ) : (
        <ul data-testid={`${testIdPrefix}-found`} className="flex flex-col gap-2">
          {visible.map((group) => {
            const server = group.server;
            const usable = isAttachableTransport(server.transport);
            const runs = server.url ?? [server.command, ...server.args].join(' ');
            return (
              <li
                key={group.key}
                data-testid={`${testIdPrefix}-found-item`}
                data-connector-transport={server.transport}
                data-connector-sources={group.sources.join(' ')}
                className="flex items-start gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2"
              >
                <ServiceMark
                  mark={resolveServiceMark(server.name, runs)}
                  className="mt-0.5 text-[color:var(--color-text-tertiary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                      {server.name}
                    </p>
                    {[...new Set(group.sources.map(shortSourceKey))].map((key) => (
                      <span
                        key={key}
                        data-testid={`${testIdPrefix}-found-source`}
                        className={badgeClass({
                          shape: 'micro',
                          className:
                            'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]',
                        })}
                      >
                        {t(`source.${key}` as SourceKey)}
                      </span>
                    ))}
                  </div>
                  {/*
                   * Verbatim and wrapped, never truncated: a confirmation that hides an argument is the
                   * DeepJack shape (`mcp-install-link.ts`).
                   */}
                  <code className="mt-0.5 block break-all font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {runs}
                  </code>
                  {!usable ? (
                    <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-status-warning)]">
                      {t('foundUnsupported', { transport: server.transport })}
                    </p>
                  ) : null}
                </div>
                {usable ? (
                  <Chip size="lg" data-testid={`${testIdPrefix}-found-add`} onClick={() => onAdd(server)}>
                    <Plus size={ICON_SIZE.sm} aria-hidden />
                    {t('add')}
                  </Chip>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!searching && matches.length > FOUND_FOLD ? (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={`${testIdPrefix}-found`}
          data-testid={`${testIdPrefix}-found-more`}
          onClick={() => setShowAll((value) => !value)}
          className={controlClass({
            shape: 'link',
            tone: 'muted',
            hoverInk: 'strong',
            className: 'mt-2 text-label',
          })}
        >
          {showAll ? t('foundLess') : t('foundMore', { count: folded })}
        </button>
      ) : null}
    </section>
  );
}

/**
 * The catalogue: each row carries the verbatim address or command and what the press asks.
 * A curated row and a registry row stay distinct in the unfolded panel, so Atlas does not
 * borrow the registry's authority.
 */
function CatalogueSection({
  entries,
  query,
  runtimes,
  attachedNames,
  asking,
  canStoreSecrets,
  onPress,
  onEdit,
  onDismiss,
  onAttach,
  testIdPrefix,
}: {
  entries: CatalogueEntry[];
  query: string;
  runtimes: readonly ResolvedRuntime[] | null;
  attachedNames: Set<string>;
  asking: { entryId: string; variant: string } | null;
  canStoreSecrets: boolean;
  onPress: (entry: CatalogueEntry, variant: CatalogueVariant) => void;
  onEdit: (entry: CatalogueEntry, variant: CatalogueVariant) => void;
  onDismiss: () => void;
  onAttach: (entry: CatalogueEntry, variant: CatalogueVariant, values: Record<string, string>) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  if (entries.length === 0 && query.trim()) return null;
  return (
    <section data-testid={`${testIdPrefix}-catalogue-section`}>
      {/*
       * When the list was captured and that nobody here audited it.
       */}
      <GroupHeading
        title={t('groupCatalogue')}
        meta={t('catalogueMeta', { date: MCP_CATALOGUE_CAPTURED_AT })}
      />
      <ul data-testid={`${testIdPrefix}-catalogue`} className="flex flex-col gap-2">
        {entries.map((entry) => {
          const primary = primaryVariant(entry);
          const others = entry.variants.filter((variant) => variant !== primary);
          const attached = attachedNames.has(entry.name);
          const askingHere =
            asking?.entryId === entry.id
              ? entry.variants.find((variant) => variantKey(variant) === asking.variant) ?? null
              : null;
          const primaryPath =
            primary.kind === 'local' ? runtimePath(runtimes, primary.runtime) : null;
          // One disclosure contract: the panel has an id and each opener says it controls it.
          const askId = `${testIdPrefix}-catalogue-ask-${entry.id}`;
          return (
            <li
              key={entry.id}
              data-testid={`${testIdPrefix}-catalogue-item`}
              data-catalogue-id={entry.id}
              data-catalogue-attached={attached ? 'true' : 'false'}
              className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2"
            >
              <div className="flex items-start gap-3">
                <ServiceMark
                  /*
                   * Not the docs URL: vendors' docs live on github.com. The command or address cannot
                   * lie about which service is on the other end.
                   */
                  mark={resolveServiceMark(
                    entry.name,
                    entry.variants.map((variant) => variantRuns(variant)).join(' '),
                  )}
                  className="mt-0.5 text-[color:var(--color-text-tertiary)]"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-body font-[var(--font-weight-signature)]',
                      attached
                        ? 'text-[color:var(--color-text-tertiary)]'
                        : 'text-[color:var(--color-text-primary)]',
                    )}
                  >
                    {entry.title}
                  </p>
                  {/*
                   * The line is localized; the facts are not (`messages/<locale>.json`).
                   */}
                  <p className="mt-0.5 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                    {t.has(`catalogueSummary.${entry.id}` as 'catalogueSummary.notion')
                      ? t(`catalogueSummary.${entry.id}` as 'catalogueSummary.notion')
                      : entry.summary}
                  </p>
                  {/*
                   * The verbatim address or command before the press: the last thing seen is what
                   * will run, the distance between this and the one-click CVEs.
                   */}
                  <p
                    data-testid={`${testIdPrefix}-catalogue-runs`}
                    className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 text-label leading-label text-[color:var(--color-text-quaternary)]"
                  >
                    <code className="min-w-0 max-w-full truncate font-mono">
                      {variantRuns(primary, primaryPath)}
                    </code>
                    <span className="break-keep">{asksClause(t, primary)}</span>
                  </p>
                  {others.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {/*
                       * The other ways in are drawn as controls; as muted links nobody pressed them.
                       */}
                      {others.map((variant) => (
                        <Chip
                          key={variantKey(variant)}
                          size="lg"
                          data-testid={`${testIdPrefix}-catalogue-other`}
                          data-variant-kind={variant.kind}
                          data-press={pressOutcome(variant)}
                          disabled={attached}
                          aria-expanded={
                            pressOutcome(variant) === 'asks' ? askingHere === variant : undefined
                          }
                          aria-controls={pressOutcome(variant) === 'asks' ? askId : undefined}
                          onClick={() => onPress(entry, variant)}
                        >
                          {variantLabel(t, variant)}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                </div>
                {attached ? (
                  <span
                    data-testid={`${testIdPrefix}-catalogue-attached`}
                    className="shrink-0 pt-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
                  >
                    {t('catalogueAttached')}
                  </span>
                ) : (
                  <Chip
                    size="lg"
                    data-testid={`${testIdPrefix}-catalogue-add`}
                    data-variant-kind={primary.kind}
                    data-press={pressOutcome(primary)}
                    aria-expanded={pressOutcome(primary) === 'asks' ? askingHere === primary : undefined}
                    aria-controls={pressOutcome(primary) === 'asks' ? askId : undefined}
                    onClick={() => onPress(entry, primary)}
                  >
                    <Plus size={ICON_SIZE.sm} aria-hidden />
                    {t('add')}
                  </Chip>
                )}
              </div>
              {askingHere ? (
                <VariantAsk
                  id={askId}
                  entry={entry}
                  variant={askingHere}
                  runtimes={runtimes}
                  canStoreSecrets={canStoreSecrets}
                  onAttach={(values) => onAttach(entry, askingHere, values)}
                  onEdit={() => onEdit(entry, askingHere)}
                  onDismiss={onDismiss}
                  testIdPrefix={testIdPrefix}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Translate = ReturnType<typeof useTranslations<'connectors'>>;

/** What pressing will ask of the person. */
function asksClause(t: Translate, variant: CatalogueVariant): string {
  const required = requiredVariables(variant);
  if (required.length > 0)
    return t('asksTokenShort', { keys: required.map((variable) => variable.name).join(', ') });
  if (variant.kind === 'remote' && variant.auth === 'oauth') return t('asksOauthShort');
  return t('variantAsksNothing');
}

function variantLabel(t: Translate, variant: CatalogueVariant): string {
  if (variant.kind === 'remote')
    return variant.label ? t('variantRemoteLabelled', { label: variant.label }) : t('variantRemote');
  return t('variantLocal', { runtime: variant.runtime });
}

/**
 * Unfolded under a row that needs one value: provenance, the command with this machine's
 * runtime, where the value goes, one password field per required variable, and the press.
 * Without a keychain the field is not offered, since its contents would be thrown away.
 */
function VariantAsk({
  id,
  entry,
  variant,
  runtimes,
  canStoreSecrets,
  onAttach,
  onEdit,
  onDismiss,
  testIdPrefix,
}: {
  id: string;
  entry: CatalogueEntry;
  variant: CatalogueVariant;
  runtimes: readonly ResolvedRuntime[] | null;
  canStoreSecrets: boolean;
  onAttach: (values: Record<string, string>) => void;
  onEdit: () => void;
  onDismiss: () => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const required = requiredVariables(variant);
  const [values, setValues] = useState<Record<string, string>>({});
  const resolved = variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null;
  const complete = required.every((variable) => (values[variable.name] ?? '').trim().length > 0);
  const firstField = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    firstField.current?.focus();
  }, []);
  return (
    <div
      id={id}
      data-testid={`${testIdPrefix}-catalogue-ask`}
      data-variant-kind={variant.kind}
      data-variant-source={variant.source}
      className="mt-2 border-l border-[color:var(--color-border-strong)] pl-3"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-secondary)]">
        <span>{variantLabel(t, variant)}</span>
        <span
          className={badgeClass({
            shape: 'micro',
            className:
              'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]',
          })}
        >
          {variant.source === 'registry'
            ? t('sourceRegistry')
            : t('sourceCurated', { date: entry.verifiedAt })}
        </span>
      </p>
      <code className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
        {variantRuns(variant, resolved)}
      </code>
      <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
        {canStoreSecrets
          ? t('variantAsksToken', { keys: required.map((variable) => variable.name).join(', ') })
          : t('secretsWeb', { keys: required.map((variable) => variable.name).join(', ') })}
      </p>
      {canStoreSecrets ? (
        <div className="mt-2 flex flex-col gap-2">
          {required.map((variable, index) => (
            <div key={variable.name} className="flex flex-col gap-1">
              <Input
                ref={index === 0 ? firstField : undefined}
                id={`${testIdPrefix}-ask-${variable.name}`}
                label={variable.name}
                size="md"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={values[variable.name] ?? ''}
                placeholder={t('valuePlaceholder')}
                data-testid={`${testIdPrefix}-catalogue-ask-value`}
                data-variable={variable.name}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [variable.name]: event.target.value }))
                }
                className="w-full"
              />
              {variable.issueUrl ? (
                <a
                  href={variable.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`${testIdPrefix}-catalogue-ask-issue`}
                  className={controlClass({
                    shape: 'link',
                    tone: 'muted',
                    hoverInk: 'strong',
                    className: 'self-start text-label',
                  })}
                >
                  <span aria-hidden data-external-link-marker>
                    ↗
                  </span>
                  {t('issueLink', { name: variable.name })}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {/*
       * Every control stands on the chip `lg` step, so the row has one height.
       */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canStoreSecrets ? (
          <button
            type="button"
            data-testid={`${testIdPrefix}-catalogue-ask-add`}
            disabled={!complete}
            onClick={() => onAttach(values)}
            className={CONNECTOR_SUBMIT_CLASS}
          >
            {t('customAdd')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid={`${testIdPrefix}-catalogue-ask-edit`}
          onClick={onEdit}
          className={CONNECTOR_QUIET_CLASS}
        >
          {t('askEdit')}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-catalogue-ask-dismiss`}
          onClick={onDismiss}
          className={CONNECTOR_QUIET_CLASS}
        >
          {t('askDismiss')}
        </button>
        <a
          href={entry.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${testIdPrefix}-catalogue-docs`}
          className={CONNECTOR_QUIET_CLASS}
        >
          <span aria-hidden data-external-link-marker>
            ↗
          </span>
          {t('catalogueDocs', { title: entry.title })}
        </a>
      </div>
    </div>
  );
}

function CustomConnectorForm({
  prefill,
  runtimes,
  canStoreSecrets,
  onAdd,
  testIdPrefix,
}: {
  prefill: CustomPrefill;
  runtimes: readonly ResolvedRuntime[] | null;
  canStoreSecrets: boolean;
  onAdd: (connector: ConnectorRecord, secrets: Array<{ ref: string; value: string }>) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const [transport, setTransport] = useState<ConnectorTransport>(prefill.transport);
  const [name, setName] = useState(prefill.name);
  const [command, setCommand] = useState(prefill.command);
  const [args, setArgs] = useState(prefill.args);
  const [url, setUrl] = useState(prefill.url);
  const [variables, setVariables] = useState<DraftVariable[]>(prefill.variables);
  /** Once the person types a path, the picker stops overwriting it. */
  const [typedCommand, setTypedCommand] = useState(false);

  const installed = (runtimes ?? []).filter((runtime) => runtime.path !== null);

  const draft = useMemo<ConnectorRecord>(() => {
    const id = 'draft';
    const entries: ConnectorValueEntry[] = variables
      .filter((variable) => variable.name.trim())
      .map((variable) => {
        const name = variable.name.trim();
        /*
         * The name decides too: `serializeConnectorState` refuses a literal under a credential
         * name, so the record agrees with the row's locked checkbox instead of failing the write.
         */
        const secret = variable.secret || looksLikeSecretKey(name);
        return secret
          ? { name, secretRef: connectorSecretRef(id, name) }
          : { name, ...(variable.value.trim() ? { value: variable.value.trim() } : {}) };
      });
    return {
      id,
      name: name.trim(),
      transport,
      ...(transport === 'stdio'
        ? { command: command.trim() }
        : { url: url.trim() }),
      args: transport === 'stdio' ? args.split(/\s+/).filter(Boolean) : [],
      env: transport === 'stdio' ? entries : [],
      headers: transport === 'http' ? entries : [],
      enabled: false,
    };
  }, [args, command, name, transport, url, variables]);

  const problems = connectorProblems(draft);
  const changeVariable = (index: number, next: Partial<DraftVariable>) =>
    setVariables((current) =>
      current.map((variable, position) =>
        position === index ? { ...variable, ...next } : variable,
      ),
    );

  return (
    <div data-testid={`${testIdPrefix}-custom`}>
      {prefill.provenance ? (
        /*
         * Provenance above a pre-filled form, or `connectors.json` would hold an untraceable row.
         */
        <p
          data-testid={`${testIdPrefix}-custom-provenance`}
          className="mb-3 break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-tertiary)]"
        >
          {t('customFromCatalogue', {
            title: prefill.provenance.title,
            date: MCP_CATALOGUE_CAPTURED_AT,
          })}
        </p>
      ) : (
        <p className="mb-3 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
          {t('customBody')}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Input
          id={`${testIdPrefix}-custom-name`}
          label={t('fieldName')}
          size="md"
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={name}
          placeholder="notion"
          data-testid={`${testIdPrefix}-custom-name`}
          onChange={(event) => setName(event.target.value)}
          className="w-full"
        />

        {/*
         * One exclusive choice, so a segmented control; `aria-pressed` chips announce two toggles.
         */}
        <div>
          <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
            {t('transportLabel')}
          </p>
          <SegmentedControl
            ariaLabel={t('transportLabel')}
            value={transport}
            onChange={setTransport}
            testId={`${testIdPrefix}-custom-transport`}
            className="mt-1"
            options={[
              {
                value: 'stdio' as ConnectorTransport,
                label: t('transport.stdio'),
                testId: `${testIdPrefix}-custom-transport-stdio`,
              },
              {
                value: 'http' as ConnectorTransport,
                label: t('transport.http'),
                testId: `${testIdPrefix}-custom-transport-http`,
              },
            ]}
          />
        </div>

        {transport === 'stdio' ? (
          <>
            <div data-testid={`${testIdPrefix}-custom-runtime`}>
              {/*
               * The group label only when there is a choice; otherwise `Input` owns the accessible
               * name and a second label would sit on the same box.
               */}
              {installed.length > 0 ? (
                <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
                  {t('fieldRuntime')}
                </p>
              ) : null}
              {installed.length > 0 ? (
                <>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {installed.map((runtime) => (
                      <Chip
                        key={runtime.name}
                        data-testid={`${testIdPrefix}-custom-runtime-${runtime.name}`}
                        aria-pressed={command === runtime.path}
                        tone={command === runtime.path ? 'accentOnTint' : 'secondary'}
                        onClick={() => {
                          setCommand(runtime.path ?? '');
                          setTypedCommand(false);
                        }}
                      >
                        {runtime.name}
                      </Chip>
                    ))}
                    <Chip
                      data-testid={`${testIdPrefix}-custom-runtime-other`}
                      aria-pressed={typedCommand}
                      tone={typedCommand ? 'accentOnTint' : 'secondary'}
                      onClick={() => setTypedCommand(true)}
                    >
                      {t('runtimeOther')}
                    </Chip>
                  </div>
                  {/*
                   * The full path is what gets written, so it is shown under the choice.
                   */}
                  {command && !typedCommand ? (
                    <code
                      data-testid={`${testIdPrefix}-custom-runtime-path`}
                      className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
                    >
                      {command}
                    </code>
                  ) : null}
                </>
              ) : null}
              {installed.length === 0 || typedCommand ? (
                <Input
                  id={`${testIdPrefix}-custom-command`}
                  label={t('fieldCommand')}
                  hint={t('fieldCommandHint')}
                  size="md"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={command}
                  placeholder="/opt/homebrew/bin/npx"
                  data-testid={`${testIdPrefix}-custom-command`}
                  onChange={(event) => {
                    setCommand(event.target.value);
                    setTypedCommand(true);
                  }}
                  className="mt-1 w-full"
                />
              ) : null}
            </div>
            <Input
              id={`${testIdPrefix}-custom-args`}
              label={t('fieldArgs')}
              size="md"
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={args}
              placeholder="-y @notionhq/notion-mcp-server"
              data-testid={`${testIdPrefix}-custom-args`}
              onChange={(event) => setArgs(event.target.value)}
              className="w-full"
            />
          </>
        ) : (
          <Input
            id={`${testIdPrefix}-custom-url`}
            label={t('fieldUrl')}
            size="md"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={url}
            placeholder="https://mcp.notion.com/mcp"
            data-testid={`${testIdPrefix}-custom-url`}
            onChange={(event) => setUrl(event.target.value)}
            className="w-full"
          />
        )}

        <div data-testid={`${testIdPrefix}-custom-variables`}>
          <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
            {transport === 'stdio' ? t('fieldEnvKeys') : t('fieldHeaderKeys')}
          </p>
          {variables.length === 0 ? (
            <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
              {t('variablesNone')}
            </p>
          ) : null}
          <ul className="mt-1 flex flex-col gap-2">
            {variables.map((variable, index) => {
              const locked = looksLikeSecretKey(variable.name);
              const secret = variable.secret || locked;
              return (
                <li
                  key={index}
                  data-testid={`${testIdPrefix}-custom-variable`}
                  data-variable-name={variable.name}
                  data-variable-secret={secret ? 'true' : 'false'}
                  className="rounded-chip border border-[color:var(--color-border-soft)] px-2.5 py-2"
                >
                  <div className="flex items-end gap-2">
                    <Input
                      label={t('variableName')}
                      size="md"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      value={variable.name}
                      placeholder="NOTION_TOKEN"
                      data-testid={`${testIdPrefix}-custom-variable-name`}
                      onChange={(event) => changeVariable(index, { name: event.target.value })}
                      className="min-w-0 flex-1"
                    />
                    <IconButton
                      label={t('variableRemove', { name: variable.name || t('variableName') })}
                      data-testid={`${testIdPrefix}-custom-variable-remove`}
                      hoverSurface="lift"
                      onClick={() =>
                        setVariables((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <X size={ICON_SIZE.md} aria-hidden />
                    </IconButton>
                  </div>
                  <Input
                    label={t('variableValue')}
                    size="md"
                    type={secret ? 'password' : 'text'}
                    spellCheck={false}
                    autoComplete="off"
                    value={variable.value}
                    placeholder={secret ? 'ntn_…' : t('valuePlaceholder')}
                    data-testid={`${testIdPrefix}-custom-variable-value`}
                    onChange={(event) => changeVariable(index, { value: event.target.value })}
                    className="mt-2 w-full"
                  />
                  <Checkbox
                    data-testid={`${testIdPrefix}-custom-variable-secret`}
                    label={t('variableSecret')}
                    checked={secret}
                    /*
                     * A credential name cannot be unchecked: `serializeConnectorState` refuses a
                     * literal under one, so the whole write would fail. Disabled on the web: there is
                     * no keychain.
                     */
                    disabled={locked || !canStoreSecrets}
                    onChange={(event) => changeVariable(index, { secret: event.target.checked })}
                    className="mt-2 text-label text-[color:var(--color-text-secondary)]"
                  />
                  {secret && !canStoreSecrets ? (
                    <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('secretsWeb', { keys: variable.name || t('variableName') })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Chip
            size="lg"
            data-testid={`${testIdPrefix}-custom-variable-add`}
            className="mt-2"
            onClick={() =>
              setVariables((current) => [...current, { name: '', value: '', secret: false }])
            }
          >
            <Plus size={ICON_SIZE.sm} aria-hidden />
            {t('variableAdd')}
          </Chip>
        </div>
      </div>

      {name.trim() && problems.length > 0 ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-custom-problem`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {problems.map((problem) => t(`problem.${problem}` as ProblemKey)).join(' ')}
        </p>
      ) : null}

      <button
        type="button"
        data-testid={`${testIdPrefix}-custom-add`}
        disabled={problems.length > 0}
        className={cn(CONNECTOR_SUBMIT_CLASS, 'mt-3')}
        onClick={() => {
          const id = newConnectorId();
          const secrets: Array<{ ref: string; value: string }> = [];
          const rekey = (entries: ConnectorValueEntry[]) =>
            entries.map((entry) => {
              if (!entry.secretRef) return entry;
              const reference = connectorSecretRef(id, entry.name);
              const typed = variables.find((variable) => variable.name.trim() === entry.name);
              if (typed?.value.trim()) secrets.push({ ref: reference, value: typed.value.trim() });
              return { ...entry, secretRef: reference };
            });
          onAdd(
            { ...draft, id, env: rekey(draft.env), headers: rekey(draft.headers) },
            secrets,
          );
        }}
      >
        {t('customAdd')}
      </button>
    </div>
  );
}
