import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

import { Chip, ServiceMark, resolveServiceMark } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import {
  MCP_CATALOGUE_CAPTURED_AT,
  variantRuns,
  type CatalogueEntry,
  type CatalogueVariant,
} from '@/shared/config/mcp-catalogue';
import {
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/connectors/tauri-connector-runtimes';

import { pressOutcome, primaryVariant, variantKey } from '../../model/catalogue-variant';
import { GroupHeading } from './GroupHeading';
import { VariantAsk } from './VariantAsk';
import { asksClause, variantLabel } from './variant-labels';

/**
 * The catalogue: each row carries the verbatim address or command and what the press asks.
 * A curated row and a registry row stay distinct in the unfolded panel, so Atlas does not
 * borrow the registry's authority.
 */
export function CatalogueSection({
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
                    <code className="min-w-0 max-w-full break-all font-mono">
                      {variantRuns(primary, primaryPath)}
                    </code>
                    <span className="break-keep">{asksClause(t, primary)}</span>
                    {primary.kind === 'local' ? (
                      <span data-testid={`${testIdPrefix}-catalogue-version`}>
                        {t('catalogueVersion', { version: primary.version, date: entry.verifiedAt })}
                      </span>
                    ) : null}
                  </p>
                  {others.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {others.map((variant) => (
                        <Chip
                          key={variantKey(variant)}
                          size="lg"
                          data-testid={`${testIdPrefix}-catalogue-other`}
                          data-variant-kind={variant.kind}
                          data-press={pressOutcome(entry, variant)}
                          disabled={attached}
                          aria-expanded={
                            pressOutcome(entry, variant) === 'asks'
                              ? askingHere === variant
                              : undefined
                          }
                          aria-controls={
                            pressOutcome(entry, variant) === 'asks' ? askId : undefined
                          }
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
                    data-press={pressOutcome(entry, primary)}
                    aria-expanded={
                      pressOutcome(entry, primary) === 'asks' ? askingHere === primary : undefined
                    }
                    aria-controls={pressOutcome(entry, primary) === 'asks' ? askId : undefined}
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
