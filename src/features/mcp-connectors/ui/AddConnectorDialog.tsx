'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Plus, X } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  IconButton,
  ServiceMark,
  TabBar,
  resolveServiceMark,
} from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Input } from '@/shared/ui/input';
import { controlClass } from '@/shared/ui/control-class';
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
  type CatalogueVariant,
} from '@/shared/config/mcp-catalogue';
import {
  resolveConnectorRuntimes,
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/tauri-connector-runtimes';

import { groupDiscovered, shortSourceKey, type DiscoveredGroup } from './discovered-groups';

/**
 * **Adding a connector, as three errands under one search.**
 *
 * ## Why tabs, and why these three
 *
 * The owner read this dialog in the installed app on 2026-09-07 and said two things: split what
 * was found from what is being added, and *"I don't know what I'm supposed to do here"* about the
 * form underneath. Both are the same defect. The dialog stacked a scan of this machine on top of
 * a five-field form, so a person met an answer and a blank page at once and could not tell which
 * one was theirs.
 *
 * The three are not arbitrary — they are the three states a person is actually in:
 *
 * 1. **Found here.** They already typed this server into another tool. One press copies it.
 * 2. **Catalogue.** They know the *service* by name — Notion, GitHub — and nothing else. The
 *    committed list (`src/shared/config/mcp-catalogue.generated.ts`) fills in the rest.
 * 3. **By hand.** Nothing on this computer and nothing in the list knows about it. This is the
 *    path that always works, and it is last because it is the rarest.
 *
 * One search box above the strip filters all three, because somebody typing "notion" does not
 * know which of the three will answer them, and making them guess is the thing tabs are worst at.
 *
 * ## What the catalogue is not
 *
 * Not a marketplace. No counts, no ranking, no "recommended", nothing fetched while the app runs
 * (`.claude/rules/forbidden.md`, and the generator's own header). Every row says where its facts
 * came from and when they were captured, and the tab says out loud that the list is short and
 * that Atlas has audited none of it. Borrowing the registry's authority for a line one of us
 * typed is the failure this disclosure exists to prevent (PO steward, 2026-09-07).
 */

type ProblemKey = `problem.${ConnectorProblem}`;
type SourceKey = `source.${ReturnType<typeof shortSourceKey>}`;

/** What to tell somebody when the folder saved nothing. */
export type AddFailureReason = 'noFolder' | 'malformed' | 'writeFailed' | 'secret';
type AddFailureKey = `addFailReason.${AddFailureReason}`;

export function addFailureReason(result: ConnectorWriteResult | null): AddFailureReason | null {
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

export type AddTab = 'found' | 'catalogue' | 'custom';

/** A short, stable id. `crypto.randomUUID` exists in every surface this ships to. */
export function newConnectorId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}`;
}

/** One variable being drafted in the by-hand form: a name, a value, and where the value goes. */
export interface DraftVariable {
  name: string;
  value: string;
  /** The person's choice. A credential-shaped name starts checked and cannot be unchecked. */
  secret: boolean;
}

/** The draft a catalogue entry or an install link hands to the by-hand tab. */
export interface CustomPrefill {
  name: string;
  transport: ConnectorTransport;
  command: string;
  args: string;
  url: string;
  variables: DraftVariable[];
  /** One line naming where this came from, drawn above the form. Absent for a blank form. */
  provenance?: { title: string; detail: string; docsUrl?: string };
}

export function prefillFromCatalogue(
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
      // The publisher's own `isSecret`, not a guess from the name. `OPENAPI_MCP_HEADERS` is the
      // measured case where the guess was wrong and the connector attached with no credential.
      secret: variable.secret || looksLikeSecretKey(variable.name),
    })),
    provenance: {
      title: entry.title,
      detail: variant.source,
      docsUrl: entry.docsUrl,
    },
  };
}

/** A connector record already parsed (an install link) → the same by-hand shape. */
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

export function AddConnectorDialog({
  open,
  onClose,
  discovered,
  canDiscover,
  canStoreSecrets,
  attachedNames,
  onAddDiscovered,
  onAddCustom,
  /** A draft handed in from outside — an install link, today; a deep link once it is registered. */
  incoming,
  testIdPrefix,
}: {
  open: boolean;
  onClose: () => void;
  discovered: DiscoveredConnector[] | null;
  canDiscover: boolean;
  canStoreSecrets: boolean;
  attachedNames: Set<string>;
  onAddDiscovered: (server: DiscoveredConnector) => Promise<ConnectorWriteResult | null>;
  onAddCustom: (connector: ConnectorRecord) => Promise<ConnectorWriteResult | null>;
  incoming?: CustomPrefill | null;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<AddTab>('found');
  const [failure, setFailure] = useState<AddFailureReason | null>(null);
  const [prefill, setPrefill] = useState<CustomPrefill>(EMPTY_PREFILL);
  /** Bumped on every pre-fill so the form remounts and takes the new values. */
  const [prefillTick, setPrefillTick] = useState(0);

  /**
   * Where this machine's runtimes are. Read once when the dialog opens, because the answer is the
   * difference between a path a person guesses and one they choose — and asking on every
   * keystroke would run a directory walk while somebody types.
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
   * ── Two resets, adjusted during render rather than in an effect ───────────────────────────
   *
   * Both are the React "adjust state when a prop changes" pattern: compare with what was seen
   * last render and correct immediately, so the dialog never paints one frame on the wrong tab.
   * An effect would do the same work a frame later — and `react-hooks/set-state-in-effect`
   * refuses it for the same reason.
   *
   * ① **Opening** lands on whichever tab can answer somebody without typing: what this computer
   *    already registers, or — where nothing can be scanned — the catalogue.
   * ② **A draft arriving from outside** (an install link) opens the by-hand tab already filled.
   *    It is deliberately not saved: a link is an invitation, and the press is still the
   *    person's (`src/shared/lib/mcp-install-link.ts` carries the CVE that rule comes from).
   */
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setTab(canDiscover ? 'found' : 'catalogue');
      setFailure(null);
    }
  }
  /*
   * ⚠️ **Seeded `null`, not with what arrived** (caught in the rendered run, 2026-09-07). Seeding
   * with `incoming` made the first render already equal to it, so the comparison never fired and
   * a link opened the dialog on the tab it would have opened on anyway — filled form, wrong tab,
   * and nothing saying why. `null` means the first arrival is always a change.
   */
  const [seenIncoming, setSeenIncoming] = useState<CustomPrefill | null>(null);
  if (open && incoming && incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    setPrefill(incoming);
    setPrefillTick((tick) => tick + 1);
    setTab('custom');
  }

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

  const chooseCatalogue = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    setPrefill(prefillFromCatalogue(entry, variant, runtimes));
    setPrefillTick((tick) => tick + 1);
    setTab('custom');
    setFailure(null);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      labelledBy={`${testIdPrefix}-add-title`}
      testId={`${testIdPrefix}-add-dialog`}
      className="max-h-[min(80vh,var(--dialog-max-h))] overflow-y-auto"
    >
      <h2
        id={`${testIdPrefix}-add-title`}
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t('addTitle')}
      </h2>
      <p
        data-testid={`${testIdPrefix}-add-runtime`}
        className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('runtimeNarrowing')}
      </p>

      {/*
        **The search stands above the strip, not inside a tab.** Somebody typing "notion" does not
        yet know whether this machine already registers it, whether the catalogue holds it, or
        whether they will end up typing it themselves — and a search that only looks inside the
        tab you happen to be on makes them guess. The counts on the tabs answer the guess instead.
      */}
      <Input
        label={t('searchLabel')}
        size="md"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={t('searchPlaceholder')}
        data-testid={`${testIdPrefix}-search`}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-3 w-full"
      />

      <div className="mt-3" data-testid={`${testIdPrefix}-add-tabs`}>
        <TabBar
          idPrefix={`${testIdPrefix}-add`}
          ariaLabel={t('addTablistAriaLabel')}
          activeKey={tab}
          onSelect={(next) => setTab(next as AddTab)}
          items={[
            {
              key: 'found',
              label: t('tabFound'),
              count: canDiscover ? foundMatches.length : undefined,
              countTitle: canDiscover ? t('tabFoundCountTitle') : undefined,
            },
            {
              key: 'catalogue',
              label: t('tabCatalogue'),
              count: catalogueMatches.length,
              countTitle: t('tabCatalogueCountTitle'),
            },
            { key: 'custom', label: t('tabCustom') },
          ]}
        />
      </div>

      <div
        role="tabpanel"
        id={`${testIdPrefix}-add-tabpanel-${tab}`}
        aria-labelledby={`${testIdPrefix}-add-tab-${tab}`}
        data-testid={`${testIdPrefix}-add-tabpanel`}
        data-add-tab={tab}
        className="mt-3 min-w-0"
      >
        {tab === 'found' ? (
          <FoundTab
            canDiscover={canDiscover}
            discovered={discovered}
            matches={foundMatches}
            query={query}
            onAdd={(server) => void attempt(() => onAddDiscovered(server))}
            testIdPrefix={testIdPrefix}
          />
        ) : null}
        {tab === 'catalogue' ? (
          <CatalogueTab
            entries={catalogueMatches}
            query={query}
            runtimes={runtimes}
            onChoose={chooseCatalogue}
            testIdPrefix={testIdPrefix}
          />
        ) : null}
        {tab === 'custom' ? (
          <CustomConnectorForm
            key={prefillTick}
            prefill={prefill}
            runtimes={runtimes}
            canStoreSecrets={canStoreSecrets}
            onAdd={(connector, secrets) =>
              void attempt(async () => {
                const result = await onAddCustom(connector);
                /*
                 * The token goes into the keychain **only after the row is on disk**. Storing it
                 * first and then failing the write leaves a value on this machine that nothing
                 * on screen points at — the orphan the removal path already had to fix once
                 * (`forgetSecrets`, 2026-09-05).
                 */
                if (result?.status === 'saved') {
                  await Promise.all(
                    secrets.map(({ ref, value }) => connectorSecretSet(ref, value).catch(() => null)),
                  );
                }
                return result;
              })
            }
            testIdPrefix={testIdPrefix}
          />
        ) : null}
      </div>

      {failure ? (
        <p
          role="alert"
          data-testid={`${testIdPrefix}-add-failed`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-danger)]"
        >
          {t('addFailed', { reason: t(`addFailReason.${failure}` as AddFailureKey) })}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Dialog>
  );
}

/** What this machine already registers — one row per thing that actually runs. */
function FoundTab({
  canDiscover,
  discovered,
  matches,
  query,
  onAdd,
  testIdPrefix,
}: {
  canDiscover: boolean;
  discovered: DiscoveredConnector[] | null;
  matches: DiscoveredGroup[];
  query: string;
  onAdd: (server: DiscoveredConnector) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  if (!canDiscover) {
    /*
     * Why it is missing and what still works — the degradation contract, not "coming soon". It
     * stands inside this tab because finding is what happens here; the list on the screen behind
     * is fully usable, and putting this out there would read as a verdict on the whole panel.
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
  if (discovered === null) {
    return (
      <p
        role="status"
        data-testid={`${testIdPrefix}-scanning`}
        className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('scanning')}
      </p>
    );
  }
  if (matches.length === 0) {
    return (
      <p
        data-testid={`${testIdPrefix}-found-empty`}
        className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {query.trim() ? t('foundNoneForSearch', { query: query.trim() }) : t('foundNone')}
      </p>
    );
  }
  return (
    <ul data-testid={`${testIdPrefix}-found`} className="flex flex-col gap-2">
      {matches.map((group) => {
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
              <p className="truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                {server.name}
              </p>
              {/* Verbatim and unwrapped-away: a confirmation that hides an argument is the
                  DeepJack shape (`mcp-install-link.ts`). */}
              <code className="mt-0.5 block break-all font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
                {runs}
              </code>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-label leading-label text-[color:var(--color-text-quaternary)]">
                  {t('sourceLabel')}
                </span>
                {[...new Set(group.sources.map(shortSourceKey))].map((key) => (
                  <span
                    key={key}
                    data-testid={`${testIdPrefix}-found-source`}
                    className={badgeClass({
                      shape: 'micro',
                      className:
                        'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]',
                    })}
                  >
                    {t(`source.${key}` as SourceKey)}
                  </span>
                ))}
              </div>
              {!usable ? (
                <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-status-warning)]">
                  {t('foundUnsupported', { transport: server.transport })}
                </p>
              ) : null}
            </div>
            {usable ? (
              <Chip data-testid={`${testIdPrefix}-found-add`} onClick={() => onAdd(server)}>
                {t('add')}
              </Chip>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The catalogue — **a shortcut past typing a package name, and it says so.**
 *
 * A row does not attach anything. It fills the by-hand form, so the last thing a person sees
 * before the press is still the command or the address, written out. That ordering is not
 * politeness: it is the difference between this and the deep-link CVEs.
 */
function CatalogueTab({
  entries,
  query,
  runtimes,
  onChoose,
  testIdPrefix,
}: {
  entries: CatalogueEntry[];
  query: string;
  runtimes: readonly ResolvedRuntime[] | null;
  onChoose: (entry: CatalogueEntry, variant: CatalogueVariant) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  return (
    <>
      {/*
        The three sentences the steward's review made conditions: how big and how old the list is,
        that nobody here audited it, and that the by-hand tab reaches everything this does not.
        A catalogue that implies completeness is a catalogue that lies by omission.
      */}
      <p
        data-testid={`${testIdPrefix}-catalogue-provenance`}
        className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('catalogueProvenance', {
          count: MCP_CATALOGUE.length,
          date: MCP_CATALOGUE_CAPTURED_AT,
        })}
      </p>
      {entries.length === 0 ? (
        <p
          data-testid={`${testIdPrefix}-catalogue-empty`}
          className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('catalogueNoneForSearch', { query: query.trim() })}
        </p>
      ) : (
        <ul data-testid={`${testIdPrefix}-catalogue`} className="mt-2 flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`${testIdPrefix}-catalogue-item`}
              data-catalogue-id={entry.id}
              className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
            >
              <div className="flex items-start gap-3">
                <ServiceMark
                  /*
                   * ⚠️ **Not the docs URL** (caught in the rendered capture, 2026-09-07). Every
                   * vendor's instructions live on github.com, so matching against `docsUrl` put
                   * GitHub's mark on the Atlassian row — someone else's brand on a row that is
                   * not theirs, which is worse than the generic plug. The command or address is
                   * the part that cannot lie about which service is on the other end, the same
                   * reasoning the attached list already records.
                   */
                  mark={resolveServiceMark(entry.name, entry.variants.map((variant) => variantRuns(variant)).join(' '))}
                  className="mt-0.5 text-[color:var(--color-text-tertiary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {entry.title}
                  </p>
                  {/*
                    ⚠️ **The one line is localized; the facts are not.** `summary` in the
                    generated file is what a person read on the vendor's English page, and it
                    stayed English on the Korean screen (caught in the rendered capture,
                    2026-09-07) — a Korean reader met a Korean dialog with English sentences
                    inside it. The catalogue keeps its English as the record of what was read,
                    and `messages/<locale>.json` carries the sentence, falling back to the file
                    for an entry nobody has translated yet. That is the same split the vault
                    already uses: `title` is the canonical name, `display_<locale>` is the shown
                    one.
                  */}
                  <p className="mt-0.5 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                    {t.has(`catalogueSummary.${entry.id}` as 'catalogueSummary.notion')
                      ? t(`catalogueSummary.${entry.id}` as 'catalogueSummary.notion')
                      : entry.summary}
                  </p>
                </div>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {entry.variants.map((variant) => {
                  const secrets = variantVariables(variant).filter((variable) => variable.required);
                  const resolved =
                    variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null;
                  return (
                    <li
                      key={variantRuns(variant)}
                      data-testid={`${testIdPrefix}-catalogue-variant`}
                      data-variant-kind={variant.kind}
                      data-variant-source={variant.source}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l border-[color:var(--color-border-strong)] pl-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
                          {variant.kind === 'remote'
                            ? t('variantRemote', { label: variant.label ?? '' }).trim()
                            : t('variantLocal', { runtime: variant.runtime })}
                        </p>
                        <code className="mt-0.5 block break-all font-mono text-label leading-label text-[color:var(--color-text-quaternary)]">
                          {variantRuns(variant, resolved)}
                        </code>
                        <p className="mt-0.5 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
                          {/*
                            **What this one will ask of you**, before it is chosen. An OAuth
                            address asks for nothing and ends in the coding agent's own browser
                            window — Atlas neither opens it nor holds what comes back, and saying
                            otherwise would claim custody it does not have.
                          */}
                          {variant.kind === 'remote' && variant.auth === 'oauth'
                            ? t('variantAsksOauth')
                            : secrets.length > 0
                              ? t('variantAsksToken', {
                                  keys: secrets.map((variable) => variable.name).join(', '),
                                })
                              : t('variantAsksNothing')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
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
                        <Chip
                          data-testid={`${testIdPrefix}-catalogue-choose`}
                          onClick={() => onChoose(entry, variant)}
                        >
                          {t('catalogueChoose')}
                        </Chip>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <a
                href={entry.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`${testIdPrefix}-catalogue-docs`}
                className={controlClass({
                  shape: 'link',
                  tone: 'muted',
                  hoverInk: 'strong',
                  className: 'mt-2 text-label',
                })}
              >
                <span aria-hidden data-external-link-marker>
                  ↗
                </span>
                {t('catalogueDocs', { title: entry.title })}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * **By hand — one question per line, and nothing typed that this machine already knows.**
 *
 * Three things changed on 2026-09-07, all from the same owner sentence (*"I don't know what I'm
 * supposed to do here"*):
 *
 * 1. **The program is chosen, not typed.** The old field asked for an absolute path, because a
 *    connector inherits no `PATH` and a bare `npx` silently produces no tools. Nobody knows where
 *    their `npx` is. `resolve_connector_runtimes` does, so the five it knows about are buttons
 *    with the resolved path underneath, and the typed field is the escape hatch behind them.
 * 2. **A variable is a name and a value on one row**, not a comma-separated list of names with the
 *    values entered somewhere else afterwards. The old form could not finish the job it started.
 * 3. **The secret choice is on the row it belongs to.** A checked row's value goes to this
 *    machine's keychain and the folder's file gets only the name; a credential-shaped name is
 *    checked and locked, because `serializeConnectorState` refuses to write a literal for one and
 *    a box whose contents are thrown away is worse than no box.
 */
export function CustomConnectorForm({
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
  /** True once the person types a path themselves — the picker then stops overwriting it. */
  const [typedCommand, setTypedCommand] = useState(false);

  const installed = (runtimes ?? []).filter((runtime) => runtime.path !== null);

  const draft = useMemo<ConnectorRecord>(() => {
    const id = 'draft';
    const entries: ConnectorValueEntry[] = variables
      .filter((variable) => variable.name.trim())
      .map((variable) => {
        const name = variable.name.trim();
        /*
         * ⚠️ **The name decides too, and the row's checkbox is not the only vote.** A row typed
         * as `GITHUB_TOKEN` with the box untouched used to build an entry with a literal, which
         * `serializeConnectorState` then refused — so the press did nothing and the reason was a
         * write failure rather than the truth, which is that a credential never goes in the
         * file. The row draws the box checked and locked for such a name; this makes the record
         * agree with what the row is showing.
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
        ? { command: command.trim(), args: args.split(/\s+/).filter(Boolean) }
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
         * Where this form's contents came from, standing above them. Without it a pre-filled form
         * is indistinguishable from one the person typed, and `connectors.json` would carry a row
         * nobody can trace back (PO steward, 2026-09-07).
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
          A program or an address is one exclusive choice, so it is a segmented control — two chips
          wearing `aria-pressed` announce two independent toggles that happen never to be pressed
          together (2026-09-05).
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
                ⚠️ **The group label exists only when there is a group** (rendered capture,
                2026-09-07). With no runtimes resolved — every browser, and any machine where
                none of the five is installed — this collapsed to "What starts it" sitting
                directly on top of the field's own "Command", two labels for one box. `Input`
                already owns the accessible name; a heading above it is for the choice, and with
                nothing to choose there is nothing to head.
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
                  {/* The full path, under the choice. It is what gets written down, so it is
                      shown rather than implied by a friendly name. */}
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
                     * A credential-shaped name cannot be unchecked: `serializeConnectorState`
                     * refuses to write a literal under one, so the box would be somewhere to type
                     * something that is then silently dropped. Disabled on the web for the other
                     * reason — there is no keychain to put it in, and the row says so.
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

      <Chip
        data-testid={`${testIdPrefix}-custom-add`}
        disabled={problems.length > 0}
        tone="accentOnTint"
        className="mt-3"
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
      </Chip>
    </div>
  );
}
