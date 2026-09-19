'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { AgentSetupSection, SettingsGroupHeading } from '@/widgets/app-settings-menu';
import { ConnectorsPanel, useVaultConnectors, type VaultConnectorsState } from '@/features/mcp-connectors';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { useLocalVault } from '@/entities/vault-session';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';

import { MCP_SECTION_PARAM, parseMcpTab } from '../lib/mcp-tab-state';

/**
 * The **MCP** tab of the Agents destination — the folder's own MCP connection, and the external
 * connectors an agent reaches through it.
 *
 * ## Where it lives, and why (2026-09-05 → 2026-09-19)
 *
 * `/agents` once held this under the tool list, several screens down. It became its own
 * destination on 2026-09-05, folded back as a header tab on 2026-09-17, became a section below
 * the tool list on 2026-09-18 when the owner rejected the header band, and on 2026-09-19 became
 * the second tab of the page's own strip when the owner rejected the stack: *"I don't want
 * agents and MCP on one screen with a scroll — split them into tabs."* `/mcp/` still redirects
 * here with its section and `install` parameter, so the installed app's deep link resolves.
 *
 * ## Two groups, not two more tabs
 *
 * The 2026-09-05 destination split its body into a Share tab and a Connectors tab because the
 * share pane was several screens tall. On 2026-09-19 that pane became four rows, so the two are
 * two settings groups under one strip — a tab strip inside a tab strip was the nested switch
 * the 2026-09-17 dissent named. `?mcp=connectors` keeps resolving: it scrolls to the connectors
 * group, and an arriving `?install=` opens the add dialog from inside it as before.
 *
 * This view is the tab's **body only**: the page above draws the title, the one-line lede and
 * the strip. The app layer hands in the connectors store it already reads for the tab's count;
 * a second `useVaultConnectors` here would be a second reader of the same file that never
 * learns about the first one's writes.
 *
 * ## Why the whole tab is drawn on the web too
 *
 * MCP attaches to **the folder**, not to an Atlas screen: the agent starts the server on its own
 * side and that server reads and writes the vault on disk. So a browser user connects as well
 * (ledger 2026-08-01). What a browser cannot do is save the config file for you — it does not
 * know the folder's absolute path — and it cannot read this machine's agent config files or
 * hold a token in a keychain. Each of those is stated where it is missing rather than hidden.
 */
export function McpPage({
  connectors: providedConnectors,
  handle: providedHandle,
}: {
  /** Kept for the app layer's call site; the tab body has no other shape now. */
  embedded?: boolean;
  connectors?: VaultConnectorsState;
  handle?: FileSystemDirectoryHandle | null;
} = {}) {
  const t = useTranslations('mcp');
  const localVault = useLocalVault();
  // Kept across a rescan: a null handle here re-read the connectors from nothing each time.
  const ownHandle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const handle = providedHandle === undefined ? ownHandle : providedHandle;
  // Standalone (tests, a future second consumer) reads its own store; under the Agents page
  // the store arrives from above so the strip's count and this list never disagree.
  const ownConnectors = useVaultConnectors(providedConnectors ? null : handle);
  const connectors = providedConnectors ?? ownConnectors;
  const enabledCount = connectors.connectors.filter((connector) => connector.enabled).length;

  const searchParams = useSearchParams();
  const section = parseMcpTab(searchParams?.get(MCP_SECTION_PARAM));
  useEffect(() => {
    if (section !== 'connectors') return;
    document.getElementById('mcp-connectors')?.scrollIntoView({ block: 'start' });
  }, [section]);

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
           * **How many are switched on**, not how many are written down. Everything starts
           * off, and a list of five where none is on reaches an agent as nothing at all —
           * the number that answers "is anything actually attached" is this one.
           */
          label={t('connectorsHeadingCount', { count: enabledCount })}
        />
        <div className="mt-1.5">
          <ConnectorsPanel
            handle={handle}
            store={connectors}
            /*
             * The panel cannot import this itself: both are features, and a feature reaching
             * sideways into another adds an edge to a ledger that only falls
             * (`same-layer-cross-import-ratchet`). The view owns both, so it hands one to the
             * other — and the ask is this region's one emphasis, so it wears the indigo.
             */
            openFolderAction={
              <OpenVaultCta
                testId="connectors-open-vault"
                tone="accentOnTint"
                className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
              />
            }
          />
        </div>
      </section>
    </section>
  );
}
