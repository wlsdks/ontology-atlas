'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Info, Plus, X } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import {
  Button,
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
 * **Adding a connector: one list under one search, and a press that does what the row says.**
 *
 * ## Why one list and not three tabs
 *
 * The 2026-09-07 morning build split this dialog into *Found here*, *Catalogue* and *By hand*
 * tabs. The owner read the result in the installed app the same afternoon and said the tabs were
 * the problem: a person opening "add" does not know which of three errands they are on, and a
 * strip that asks them to pick one before showing anything is the same "I don't know what to do
 * here" the tabs were built to answer. Every MCP client surveyed that day (Cline, Goose, Cursor,
 * VS Code, Claude Desktop, Codex) shows one list — name, one line, one button — and keeps "by
 * hand" as the last row or a separate form. So this dialog does too.
 *
 * Three groups, in the order somebody can act on them without typing:
 *
 * 1. **Already on this computer.** Registered in another tool's config. One press copies it.
 * 2. **Ready to attach.** The committed catalogue (`mcp-catalogue.generated.ts`). The row shows
 *    the address or command it will write, verbatim, and what it will ask.
 * 3. **By hand.** A disclosure at the bottom that unfolds the full form. It is also where an
 *    install link lands, filled in.
 *
 * ## What the press does
 *
 * One rule, so the button can read the same everywhere: **a press attaches what asks nothing and
 * asks, in place, for what asks one thing.** A hosted address with OAuth asks nothing of this
 * dialog — the coding agent opens the sign-in window and holds what comes back — so the row goes
 * straight into the folder, switched off. A local program that needs a token unfolds a small panel
 * under its own row: the command written out, one password field per required variable, and the
 * press. Nothing is written until that press, and no value ever goes into the folder's file.
 *
 * This overturns the morning's "picking fills the by-hand form" for catalogue rows; the record is
 * in `docs/DECISIONS.md` (2026-09-07, one list). What it keeps: the row shows what will run
 * before the press, the row is off after it, the origin is recorded, and a link only pre-fills.
 */

/** A short, stable id. `crypto.randomUUID` exists in every surface this ships to. */
export function newConnectorId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}`;
}

/** One variable being drafted in the by-hand form: a name, a value, and where the value goes. */
interface DraftVariable {
  name: string;
  value: string;
  /** The person's choice. A credential-shaped name starts checked and cannot be unchecked. */
  secret: boolean;
}

/** The draft a catalogue entry or an install link hands to the by-hand form. */
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

type ProblemKey = `problem.${ConnectorProblem}`;
type SourceKey = `source.${ReturnType<typeof shortSourceKey>}`;

/** What to tell somebody when the folder saved nothing. */
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


/** How many scanned rows show before the fold. Enough to recognise a machine, not to list it. */
const FOUND_FOLD = 3;

/** The variables a variant cannot attach without. */
function requiredVariables(variant: CatalogueVariant): readonly CatalogueVariable[] {
  return variantVariables(variant).filter((variable) => variable.required);
}

/**
 * The row's own button goes to the first hosted address, else the first local program. A hosted
 * address is the one that asks nothing, which is what a single press should land on when the
 * vendor offers both; the local program stays one press further, named for what it is.
 */
function primaryVariant(entry: CatalogueEntry): CatalogueVariant {
  return entry.variants.find((variant) => variant.kind === 'remote') ?? entry.variants[0];
}

/** A stable key for a variant inside its entry, for the unfolded panel and the test hooks. */
function variantKey(variant: CatalogueVariant): string {
  return variantRuns(variant);
}

/** What a press on this variant will do: write the row, or ask for something first. */
type PressOutcome = 'attaches' | 'asks';
function pressOutcome(variant: CatalogueVariant): PressOutcome {
  return requiredVariables(variant).length > 0 ? 'asks' : 'attaches';
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
  /** A draft handed in from outside — an install link, today; a deep link once it is registered. */
  incoming,
  testIdPrefix,
}: {
  open: boolean;
  onClose: () => void;
  /** Scanning / failed / done — see `ConnectorDiscoveryState`; `done` is the only one with rows. */
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
  /** Bumped on every pre-fill so the form remounts and takes the new values. */
  const [prefillTick, setPrefillTick] = useState(0);
  /** Whether the by-hand form is unfolded at the bottom. */
  const [customOpen, setCustomOpen] = useState(false);
  /** The one catalogue variant currently asking for its value, if any. */
  const [asking, setAsking] = useState<{ entryId: string; variant: string } | null>(null);

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
   * last render and correct immediately, so the dialog never paints one frame in the wrong state.
   * An effect would do the same work a frame later — and `react-hooks/set-state-in-effect`
   * refuses it for the same reason.
   *
   * ① **Opening** folds everything back: no search, no panel asking for a value, the form closed.
   * ② **A draft arriving from outside** (an install link) unfolds the by-hand form already filled.
   *    It is deliberately not saved: a link is an invitation, and the press is still the
   *    person's (`src/shared/lib/mcp-install-link.ts` carries the CVE that rule comes from).
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
   * ⚠️ **Seeded `null`, not with what arrived** (caught in the rendered run, 2026-09-07). Seeding
   * with `incoming` made the first render already equal to it, so the comparison never fired and
   * a link opened the dialog with the form folded — filled form, out of sight, and nothing saying
   * why. `null` means the first arrival is always a change.
   */
  const [seenIncoming, setSeenIncoming] = useState<CustomPrefill | null>(null);
  if (open && incoming && incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    setPrefill(incoming);
    setPrefillTick((tick) => tick + 1);
    setCustomOpen(true);
  }

  /** The unfolded form, so a pre-fill from a link or a row can bring it into view. */
  const customRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (prefillTick === 0 || !customOpen) return;
    const node = customRef.current;
    // jsdom has no `scrollIntoView`; the form is still unfolded, which is the contract.
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [customOpen, prefillTick, reducedMotion]);

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
   * A row plus the values it asked for. The token goes into the keychain **only after the row is
   * on disk**. Storing it first and then failing the write leaves a value on this machine that
   * nothing on screen points at — the orphan the removal path already had to fix once
   * (`forgetSecrets`, 2026-09-05).
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

  /** A catalogue row, as the record the folder will hold. */
  const catalogueRecord = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    const id = newConnectorId();
    return catalogueDraft(entry, variant, {
      id,
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null,
      secretRef: connectorSecretRef,
    });
  };

  /** The one rule: attach what asks nothing, ask in place for what asks one thing. */
  const pressCatalogue = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    setFailure(null);
    if (pressOutcome(variant) === 'attaches') {
      setAsking(null);
      void addWithSecrets(catalogueRecord(entry, variant), []);
      return;
    }
    setAsking({ entryId: entry.id, variant: variantKey(variant) });
  };

  /** The escape hatch out of a row: the same facts, in the by-hand form, editable. */
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
       * The title and the search stay put; the groups scroll under them. Scrolling the whole
       * panel took the search box off screen at the fourth row (own review, 2026-09-07), which
       * is the moment somebody wants to narrow the list.
       */
      /*
       * A fixed height, not a maximum (installed-app check, 2026-09-07): as a search narrowed the
       * list the panel shrank and re-centred, and the search box under the person's cursor moved
       * by half a screen. The groups scroll inside; the frame does not move.
       */
      className="flex h-[min(80vh,var(--dialog-max-h))] flex-col"
    >
      {/*
        The close control sits where every other dialog in this app keeps it, at the top corner,
        and Escape and the scrim do the same. A "Close" button under a list that scrolls was the
        last thing on screen and the least useful (owner, 2026-09-07).
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
        **One search over everything below.** Somebody typing "notion" does not yet know whether
        this machine already registers it, whether the catalogue holds it, or whether they will end
        up typing it themselves — and the list answers by narrowing every group at once.
      */}
      {/*
        It takes focus on open and wears the strong border at rest (design lead, 2026-09-07):
        drawn like the rows under it, it read as "row zero" rather than the one control that
        acts on all of them. `initialFocus="none"` on the dialog is what lets it, since the
        trap's "first" would land on the corner close.
      */}
      <Input
        aria-label={t('searchLabel')}
        size="md"
        type="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus
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
          The catalogue leads on every surface (installed-app check, 2026-09-07). The scan of this
          machine led at first, and on a developer's machine it is nine rows of chrome-devtools,
          codegraph and the like that pushed Notion off the bottom of the frame; the services a
          person came here for are the short list, so they come first, and the scan follows,
          folded past its first few rows.
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

        {foundSection}

        {nothingMatches ? (
          <p
            data-testid={`${testIdPrefix}-add-none`}
            className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
            {t('noneForSearch', { query: query.trim() })}
          </p>
        ) : null}

        {/*
          **By hand is the last row, folded.** It reaches every server the two lists do not, and it
          says so in its one line; unfolding it is the only step, and a link arriving from outside
          unfolds it already filled.
        */}
        <section ref={customRef} data-testid={`${testIdPrefix}-custom-section`} className="pb-2">
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
        The caveat about which sessions carry a connector is true and stays, below the task
        rather than ahead of it (design lead, 2026-09-07): it is a fact to know, not a step.
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

/** A group's one-line heading: what the rows below have in common, and a quiet fact beside it. */
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

/** What this machine already registers — one row per thing that actually runs. */
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
   * Folded past the first few rows unless a search is on (installed-app check, 2026-09-07). The
   * scan finds every MCP server another tool registered, most of them developer utilities, and
   * all of them stood between the person and the folded by-hand row. A search shows everything
   * it matches, because then the person asked.
   */
  const [showAll, setShowAll] = useState(false);
  const searching = query.trim().length > 0;
  const visible = searching || showAll ? matches : matches.slice(0, FOUND_FOLD);
  const folded = matches.length - visible.length;
  if (!canDiscover) {
    /*
     * Why it is missing and what still works — the degradation contract, not "coming soon". It
     * stands where the scan would, after the list that does work here; the panel behind is fully
     * usable, and putting this first would read as a verdict on the whole dialog.
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
  // Searching hides an empty group rather than explaining it; the dialog's one line does that.
  if (discovery.status === 'done' && matches.length === 0 && query.trim()) return null;
  return (
    <section data-testid={`${testIdPrefix}-found-section`}>
      <GroupHeading title={t('groupFound')} />
      {/*
        A failed scan says so here as well. This group is the only place the scan's results
        appear, so leaving it on "reading…" after the command rejected is where the wait looks
        endless; and the sentence has to be different from "found none", which is a claim about
        this computer that a failed read has not earned.
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
                  {/* Verbatim and unwrapped-away: a confirmation that hides an argument is the
                      DeepJack shape (`mcp-install-link.ts`). */}
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
                  <Chip data-testid={`${testIdPrefix}-found-add`} onClick={() => onAdd(server)}>
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
 * The catalogue — **a shortcut past typing a package name, and it says so.**
 *
 * Every row carries the address or command it would write, verbatim, and one clause saying what
 * the press will ask. The press attaches a row that asks nothing; a row that needs a value unfolds
 * `VariantAsk` under itself and waits. A curated row and a registry row are still told apart, in
 * the unfolded panel: Atlas must not borrow the registry's authority for a line one of us typed.
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
        The facts the steward's review made conditions, in one quiet line: when the list was
        captured and that nobody here audited it. Its size is the list itself, and the folded row
        under it is where everything it does not hold goes in.
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
          // One disclosure contract for every control that opens the asking panel (interaction
          // seat, 2026-09-07): the panel has an id, and each opener says it controls it.
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
                   * ⚠️ **Not the docs URL** (caught in the rendered capture, 2026-09-07). Every
                   * vendor's instructions live on github.com, so matching against `docsUrl` put
                   * GitHub's mark on the Atlassian row. The command or address is the part that
                   * cannot lie about which service is on the other end.
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
                    The one line is localized; the facts are not. `summary` is what a person read
                    on the vendor's English page; `messages/<locale>.json` carries the sentence.
                  */}
                  <p className="mt-0.5 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                    {t.has(`catalogueSummary.${entry.id}` as 'catalogueSummary.notion')
                      ? t(`catalogueSummary.${entry.id}` as 'catalogueSummary.notion')
                      : entry.summary}
                  </p>
                  {/*
                    **What the press writes and what it asks, before the press.** The address or
                    command is verbatim — the last thing seen before a row lands in the folder is
                    still the thing that will run, which is the whole distance between this and
                    the one-click CVEs.
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
                        The other ways in are controls, drawn as controls. As muted links they read
                        as a third caption line (rendered check, 2026-09-07) and nobody pressed them.
                      */}
                      {others.map((variant) => (
                        <Chip
                          key={variantKey(variant)}
                          size="sm"
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

/** The one clause after the verbatim line: what pressing will ask of the person. */
function asksClause(t: Translate, variant: CatalogueVariant): string {
  const required = requiredVariables(variant);
  if (required.length > 0)
    return t('asksTokenShort', { keys: required.map((variable) => variable.name).join(', ') });
  if (variant.kind === 'remote' && variant.auth === 'oauth') return t('asksOauthShort');
  return t('variantAsksNothing');
}

/** The name of a secondary way in, as a person would say it. */
function variantLabel(t: Translate, variant: CatalogueVariant): string {
  if (variant.kind === 'remote')
    return variant.label ? t('variantRemoteLabelled', { label: variant.label }) : t('variantRemote');
  return t('variantLocal', { runtime: variant.runtime });
}

/**
 * **A row asking for the one thing it cannot attach without**, unfolded under itself.
 *
 * What it shows, in order: where these facts came from; the command written out, with this
 * machine's resolved runtime where one was found; the sentence saying where the value goes; one
 * password field per required variable with a link to where it is issued; and the press. On a
 * surface with no keychain the field is not offered — a box whose contents would be thrown away
 * is worse than no box — and the sentence says what to do instead.
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
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {canStoreSecrets ? (
          <Button
            variant="primary"
            data-testid={`${testIdPrefix}-catalogue-ask-add`}
            disabled={!complete}
            onClick={() => onAttach(values)}
          >
            {t('customAdd')}
          </Button>
        ) : null}
        <button
          type="button"
          data-testid={`${testIdPrefix}-catalogue-ask-edit`}
          onClick={onEdit}
          className={controlClass({ shape: 'link', tone: 'muted', hoverInk: 'strong', className: 'text-label' })}
        >
          {t('askEdit')}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-catalogue-ask-dismiss`}
          onClick={onDismiss}
          className={controlClass({ shape: 'link', tone: 'muted', hoverInk: 'strong', className: 'text-label' })}
        >
          {t('askDismiss')}
        </button>
        <a
          href={entry.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${testIdPrefix}-catalogue-docs`}
          className={controlClass({ shape: 'link', tone: 'muted', hoverInk: 'strong', className: 'text-label' })}
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
