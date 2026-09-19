'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { AgentSetupSection } from '@/widgets/app-settings-menu';
import { ConnectorsPanel, useVaultConnectors, type VaultConnectorsState } from '@/features/mcp-connectors';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { useLocalVault } from '@/entities/vault-session';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { TabBar } from '@/shared/ui';
import { useSwapHeight } from '@/shared/lib/use-presence';

import { MCP_SECTION_PARAM, buildMcpTabHref, parseMcpTab, type McpTab } from '../lib/mcp-tab-state';

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
 * This view is the tab's **body only**: the page above draws the title, the one-line lede and
 * the strip, so a second heading here would name the same thing twice at the same eye level.
 * The app layer hands in the connectors store it already reads for the tab's count; a second
 * `useVaultConnectors` here would be a second reader of the same file that never learns about
 * the first one's writes.
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
  const [tab, setTabState] = useState<McpTab>(() => parseMcpTab(searchParams?.get(MCP_SECTION_PARAM)));
  /*
   * The two panels are very different heights, and swapping them in one frame drops the page's
   * scroll position somewhere unrelated. `useSwapHeight` is this repository's grammar for exactly
   * that: measure before the change, transition the host's height on `--motion-base`, and stand
   * aside under reduced motion.
   */
  const { hostRef: panelHostRef, capture: capturePanelHeight } = useSwapHeight(tab);

  /*
   * Back and forward have to move the section too. Without this the address bar says
   * `?mcp=connectors` while the screen still draws the share section — the state and the URL
   * disagreeing is exactly what putting the section in the URL was for.
   */
  useEffect(() => {
    const syncFromHistory = () => {
      capturePanelHeight();
      setTabState(parseMcpTab(new URL(window.location.href).searchParams.get(MCP_SECTION_PARAM)));
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, [capturePanelHeight]);

  const selectTab = (next: string) => {
    const nextTab = parseMcpTab(next);
    capturePanelHeight();
    setTabState(nextTab);
    /*
     * Only the query view of the same document changes. A router navigation moves focus to the
     * document root in the WebView, which would throw away the tab strip's roving focus, so the
     * URL is updated through native history in the same event instead.
     */
    window.history.replaceState(
      window.history.state,
      '',
      buildMcpTabHref(nextTab, window.location.pathname),
    );
  };

  return (
    <section
      id="agents-mcp"
      data-testid="mcp-page"
      data-mcp-tab={tab}
      aria-label={t('title')}
      className="min-w-0"
    >
      <div data-testid="mcp-tabs">
        <TabBar
          idPrefix="mcp"
          ariaLabel={t('tablistAriaLabel')}
          activeKey={tab}
          onSelect={selectTab}
          items={[
            { key: 'share', label: t('shareHeading') },
            {
              key: 'connectors',
              label: t('connectorsHeading'),
              /*
               * **How many are switched on**, not how many are written down. Everything starts
               * off, and a list of five where none is on reaches an agent as nothing at all —
               * the number that answers "is anything actually attached" is this one.
               */
              count: enabledCount,
              countTitle: t('connectorsCountTitle'),
            },
          ]}
        />
      </div>

      {/*
        **One panel element, and the section decides what is in it.** Only the selected
        section's panel is rendered — drawing the other half into a hidden box pays for building
        a model nobody is looking at, while `aria-controls` only has to resolve for the selected
        tab. The `id` and `aria-labelledby` therefore follow the tab, keeping `TabBar`'s prefix
        contract intact.
      */}
      <div
        ref={panelHostRef}
        role="tabpanel"
        id={`mcp-tabpanel-${tab}`}
        aria-labelledby={`mcp-tab-${tab}`}
        data-testid="mcp-tabpanel"
        className="mt-5 min-w-0"
      >
        {tab === 'share' ? (
          <AgentSetupSection />
        ) : (
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
        )}
      </div>
    </section>
  );
}
