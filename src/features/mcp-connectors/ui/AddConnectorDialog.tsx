'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { CloseButton, Dialog } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { EmptyState } from '@/shared/ui/status/empty-state';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';
import type { ConnectorWriteResult } from '@/shared/lib/connectors/connector-store';
import type {
  ConnectorDiscoveryState,
  DiscoveredConnector,
} from '@/shared/lib/connectors/tauri-connectors';

import type { AddFailureReason } from '../model/add-failure-reason';
import type { CustomPrefill } from '../model/connector-draft';
import { useAddConnectorDialog } from '../model/use-add-connector-dialog';
import { CatalogueSection } from './add-connector/CatalogueSection';
import { CustomConnectorForm } from './add-connector/CustomConnectorForm';
import { FoundSection } from './add-connector/FoundSection';

type AddFailureKey = `addFailReason.${AddFailureReason}`;

/**
 * Adding a connector: one list under one search, ordered by what a person can act on without typing.
 * A press attaches what its row shows, else unfolds in place; no value ever goes into the folder's
 * file.
 */
export function AddConnectorDialog({
  open,
  onClose,
  discovery,
  canDiscover,
  canStoreSecrets,
  attachedNames,
  onAddDiscovered,
  onAddCustom,
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
  /** A draft handed in from outside, such as an install link. */
  incoming?: CustomPrefill | null;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const {
    query,
    setQuery,
    failure,
    prefill,
    prefillTick,
    customOpen,
    setCustomOpen,
    openCustomAndFocusName,
    asking,
    dismissAsking,
    runtimes,
    searchRef,
    customRef,
    foundMatches,
    catalogueMatches,
    nothingMatches,
    pressCatalogue,
    editCatalogue,
    attachCatalogue,
    addFound,
    addWithSecrets,
  } = useAddConnectorDialog({
    open,
    onClose,
    discovery,
    canDiscover,
    attachedNames,
    onAddDiscovered,
    onAddCustom,
    incoming,
    testIdPrefix,
  });

  const foundSection = (
    <FoundSection
      canDiscover={canDiscover}
      discovery={discovery}
      matches={foundMatches}
      query={query}
      onAdd={addFound}
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
       * The title and search stay put while the groups scroll. A fixed height, not a maximum, so
       * narrowing the list does not move the search box.
       */
      className="flex h-[min(80vh,var(--dialog-max-h))] flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={`${testIdPrefix}-add-title`}
          className="min-w-0 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t('addTitle')}
        </h2>
        <CloseButton
          label={t('close')}
          data-testid={`${testIdPrefix}-add-close`}
          className="-mr-2 -mt-1 shrink-0"
          onClick={onClose}
        />
      </div>

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
                onClick={openCustomAndFocusName}
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
          onDismiss={dismissAsking}
          onAttach={attachCatalogue}
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
