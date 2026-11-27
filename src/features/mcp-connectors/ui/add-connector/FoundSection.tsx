import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

import { Chip, ServiceMark, resolveServiceMark } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import {
  isAttachableTransport,
  type ConnectorDiscoveryState,
  type DiscoveredConnector,
} from '@/shared/lib/connectors/tauri-connectors';

import { shortSourceKey, type DiscoveredGroup } from '../../model/discovered-groups';
import { GroupHeading } from './GroupHeading';

type SourceKey = `source.${ReturnType<typeof shortSourceKey>}`;

const FOUND_FOLD = 3;

export function FoundSection({
  discovery,
  matches,
  query,
  onAdd,
  testIdPrefix,
}: {
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
            const commandLine = [server.command, ...server.args].join(' ');
            const runs = server.transport === 'stdio' ? commandLine : (server.url ?? commandLine);
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
