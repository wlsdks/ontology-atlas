'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { AgentSetupSection, SettingsGroupHeading } from '@/widgets/app-settings-menu';
import { ConnectorsPanel, useVaultConnectors, type VaultConnectorsState } from '@/features/mcp-connectors';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { useLocalVault } from '@/entities/vault-session';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { MCP_SECTION_PARAM, parseMcpTab } from '../lib/mcp-tab-state';

/**
 * The Agents page's MCP tab body: the folder's own MCP connection and its connectors, as two
 * groups, since a strip inside the strip would nest switches. Drawn on the web too, since MCP
 * attaches to the folder; what a browser cannot do is stated where it is missing.
 */
export function McpPage({
  connectors: providedConnectors,
  handle: providedHandle,
}: {
  connectors?: VaultConnectorsState;
  handle?: FileSystemDirectoryHandle | null;
} = {}) {
  const t = useTranslations('mcp');
  const tConnectors = useTranslations('connectors');
  const localVault = useLocalVault();
  // Kept across a rescan, or connectors are re-read from nothing each time.
  const ownHandle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const handle = providedHandle === undefined ? ownHandle : providedHandle;
  // Under the Agents page the store arrives from above, or a second reader misses the first one's writes.
  const ownConnectors = useVaultConnectors(providedConnectors ? null : handle);
  const connectors = providedConnectors ?? ownConnectors;
  const enabledCount = connectors.connectors.filter((connector) => connector.enabled).length;
  const countKnown = connectors.status === 'ready';
  const noFolder = connectors.status === 'unavailable';

  /* The heading's add chip opens the panel's dialog and takes focus back after a removal. */
  const addOpenerRef = useRef<HTMLButtonElement | null>(null);
  const [addOpenRequest, setAddOpenRequest] = useState(0);
  /* Only `ready` can take a write; an empty list while loading means nothing was read yet. */
  const connectorsListed =
    handle !== null && connectors.status === 'ready' && connectors.connectors.length > 0;

  const searchParams = useSearchParams();
  const section = parseMcpTab(searchParams?.get(MCP_SECTION_PARAM));
  /*
   * The ?mcp=connectors query scrolls only once the store settles, or the list renders afterwards and
   * pushes the group away. It moves `app-shell-body-slot`, not `scrollIntoView`, which also
   * scrolls an `overflow-y: hidden` ancestor nothing can scroll back.
   */
  const connectorsSettled = connectors.status !== 'loading';
  useEffect(() => {
    if (section !== 'connectors' || !connectorsSettled) return;
    /* Re-applied each frame until the delta is zero, bounded so it never fights a person's scrolling. */
    let frame = 0;
    let framesLeft = 30;
    const step = () => {
      const group = document.getElementById('mcp-connectors');
      const slot = group?.closest<HTMLElement>('[data-testid="app-shell-body-slot"]');
      if (!group || !slot) return;
      const delta = group.getBoundingClientRect().top - slot.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      slot.scrollTop += delta;
      framesLeft -= 1;
      if (framesLeft > 0) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [section, connectorsSettled]);

  return (
    <section
      id="agents-mcp"
      data-testid="mcp-page"
      data-mcp-section={section}
      aria-label={t('title')}
      className="flex min-w-0 flex-col gap-6"
    >
      <AgentSetupSection />

      <section id="mcp-connectors" aria-labelledby="mcp-connectors-heading" className="min-w-0">
        <SettingsGroupHeading
          id="mcp-connectors-heading"
          /*
           * "N of M on", said only here (`countInHeading` silences the panel's line), and only once
           * the store answers, or it claims 0 while still reading. With none, the empty card says it.
           */
          label={
            countKnown && connectors.connectors.length > 0
              ? t('connectorsHeadingCount', {
                  on: enabledCount,
                  total: connectors.connectors.length,
                })
              : t('connectorsHeading')
          }
          trailing={
            connectorsListed ? (
              /* The destination's one heading-action size. */
              <Chip
                ref={addOpenerRef}
                size="lg"
                tone="secondary"
                data-testid="connectors-add-open"
                hoverSurface="lift"
                onClick={() => setAddOpenRequest((n) => n + 1)}
                className="shrink-0 whitespace-nowrap"
              >
                <Plus size={ICON_SIZE.md} aria-hidden />
                {tConnectors('addOpen')}
              </Chip>
            ) : null
          }
        />
        {noFolder ? (
          /* Without a folder the share group already asks, so no second card asks again. */
          <p
            data-testid="mcp-connectors-need-folder"
            className="mt-1.5 max-w-2xl break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
            {t('connectorsNeedFolder')}
          </p>
        ) : (
        <div className="mt-1.5">
          <ConnectorsPanel
            handle={handle}
            store={connectors}
            addOpenRequest={addOpenRequest}
            externalAddOpener={addOpenerRef}
            countInHeading
            /* Handed in, since a feature importing another breaks `same-layer-cross-import-ratchet`. */
            openFolderAction={
              <OpenVaultCta
                testId="connectors-open-vault"
                tone="accentOnTint"
                className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
              />
            }
          />
        </div>
        )}
      </section>
    </section>
  );
}
