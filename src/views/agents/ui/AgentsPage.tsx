'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { AcpRuntimeSettings, ModelConnections } from '@/widgets/app-settings-menu';
import { TabBar } from '@/shared/ui';
import { useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat-intent';
import { isAcpBridgeAvailable } from '@/shared/lib/tauri-acp';
import { useSwapHeight } from '@/shared/lib/use-presence';
import { PAGE_FRAME_FORM, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';

import { AGENTS_TAB_PARAM, buildAgentsTabHref, parseAgentsTab, type AgentsTab } from '../lib/agents-tab-state';

/**
 * The "agents" destination — where this computer's AI coding tools are **downloaded, installed,
 * connected, repaired, and opened into a conversation**, and where the folder is handed to them
 * over MCP.
 *
 * **Why it left settings** (2026-08-20, ledger 90). Owner instruction: *[should we put settings
 * into the LNB entirely and use a whole window like other open source, instead of a popup?]* → of three
 * options, **"promote agents to top level"**. The basis is the container: a modal dims and blocks
 * what is behind it and owns Esc; a sheet unmounts entirely when closed; settings is where you
 * pick values, and this is an operational task with progress state.
 *
 * **Tabs in the body, not a header strip** (owner, 2026-09-19). MCP has been one subject
 * with Agents since 2026-09-17; on 2026-09-18 the owner rejected the *header* tab strip that
 * split them ("a 56px chrome band on two words"), and it became a section below the tool list.
 * The owner then rejected the stack as well: *"I don't want agents and MCP on one screen with a
 * scroll — split them into tabs, choose one, see that one."* Both objections hold at once when
 * the strip is the page's own, under the title where the Library and Insights carry theirs:
 * no chrome band, and one question on screen at a time. Only the selected tab mounts; the MCP
 * tab is the children the app layer hands in, so neither view imports the other.
 *
 * `?tab=mcp` is what `/mcp/` redirects into and what `DESTINATION_HREF.mcp` names, so every
 * older link and the installed app's deep link (`ontology-atlas://mcp?install=…`) keep resolving.
 *
 * **What this screen holds and does not.** Holds: the runner list, connection checks, app-only
 * install, reconnection, opening a conversation; on its second tab the **models** Atlas's own
 * conversation calls (API keys in the Keychain, local runners by address, the experimental Jev
 * check and the sent log — moved here from the settings sheet on 2026-09-25, overturning the
 * 2026-08-16 "freeze the `ai` path" clause); and on its third the folder's MCP connection and
 * connectors. Does not hold **the workspace** (a vault answers a different axis; owned by
 * `local-vault-management`).
 *
 * **One line above the strip, nothing else** (owner, 2026-09-19: *"there is so much useless text
 * here — tooltips if it is really needed"*). The 2026-09-06 fold ("what this screen does") and
 * the three paragraphs the tool list used to open with are gone from the page; what a person
 * comes back to ask — why one tool opens a chat and another does not, what starting a chat
 * writes to disk — sits in one hint beside the list, in `AcpRuntimeSettings`.
 */
export function AgentsPage({
  children,
  mcpCount,
}: { children?: ReactNode; mcpCount?: number } = {}) {
  const t = useTranslations('agents');
  const tMcp = useTranslations('mcp');
  const router = useRouter();
  const openChatOnMap = useCallback(
    (runtimeId: string) => {
      queueAgentChatIntent(runtimeId);
      router.push(DESTINATION_HREF.map);
    },
    [router],
  );

  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<AgentsTab>(() =>
    parseAgentsTab(searchParams?.get(AGENTS_TAB_PARAM)),
  );
  /*
   * The two panels are very different heights, and swapping them in one frame drops the page's
   * scroll position somewhere unrelated. `useSwapHeight` is this repository's grammar for exactly
   * that (`/ontology/insights`, the MCP section): measure before the change, transition the
   * host's height on `--motion-base`, and stand aside under reduced motion.
   */
  const { hostRef: panelHostRef, capture: capturePanelHeight } = useSwapHeight(tab);

  /*
   * A rail click on Agents while the MCP tab is up, or `DESTINATION_HREF.mcp` from the shortcut
   * sheet while the tool list is up, changes only the query of the same document — the view
   * stays mounted, so the tab has to follow the address, not just the first render.
   */
  const paramTab = parseAgentsTab(searchParams?.get(AGENTS_TAB_PARAM));
  // Adjusting state during render, React's own shape for "derive from a prop that changed":
  // an effect would paint the stale tab for one frame and then cascade a second render.
  const [seenParamTab, setSeenParamTab] = useState(paramTab);
  if (paramTab !== seenParamTab) {
    setSeenParamTab(paramTab);
    if (paramTab !== tab) {
      capturePanelHeight();
      setTabState(paramTab);
    }
  }

  /*
   * Back and forward have to move the tab too. Without this the address bar says `?tab=mcp`
   * while the screen still draws the tool list — the state and the URL disagreeing is exactly
   * what putting the tab in the URL was for.
   */
  useEffect(() => {
    const syncFromHistory = () => {
      capturePanelHeight();
      setTabState(parseAgentsTab(new URL(window.location.href).searchParams.get(AGENTS_TAB_PARAM)));
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, [capturePanelHeight]);

  const selectTab = (next: string) => {
    const nextTab = parseAgentsTab(next);
    capturePanelHeight();
    setTabState(nextTab);
    /*
     * Only the query view of the same document changes. A router navigation moves focus to the
     * document root in the WebView, which would throw away the tab strip's roving focus, so the
     * URL is updated through native history in the same event instead — the pattern
     * `/ontology/insights` already uses.
     */
    window.history.replaceState(
      window.history.state,
      '',
      buildAgentsTabHref(nextTab, new URL(window.location.href)),
    );
  };

  return (
    /*
     * ⚠️ **This is `<main>`, not `<div>`** (2026-08-20, caught by the accessibility ratchet).
     *
     * In this repository the shell does not own `<main>` — **each destination view owns its own.** The
     * first draft did not know that and drew a `<div>`, and the ratchet failed with
     * *"`/ko/agents/`: 0 elements inside `<main>`"* — exactly as that check says, "zero violations" was
     * not a pass but **nothing measured**. "Skip to content" also had nowhere to go, on this screen alone.
     *
     * `max-lg:pb-…` is the bottom tab-bar reserve. A scrolling surface that omits it hides its last line
     * behind the tab bar — becoming a destination made the `scroll-end-gap` gate see this route for the
     * first time, which is one of the promotion's benefits.
     */
    <main
      id="main"
      tabIndex={-1}
      data-testid="agents-page"
      data-agents-tab={tab}
      className={`${PAGE_FRAME_FORM} max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]`}
    >
      {/*
        ⚠️ **The description is «outside» the header.** `PAGE_HEADER_ROW` is a single
        `justify-between` row, so a description placed inside it is pushed to the opposite end from the
        title and reads as right-aligned (which is what the first draft did). The header's right slot
        belongs to «controls standing alongside the title».
      */}
      <header className={PAGE_HEADER_ROW}>
        <div className={PAGE_TITLE_ROW}>
          {/* The headline spec for a list-shaped destination — no new value is created. */}
          <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            {t('title')}
          </h1>
        </div>
      </header>
      {/* One line, and it belongs to the tab that is up: the tool list's sentence over the tool
          list, the connection's sentence over the connection. */}
      <p
        data-testid="agents-lede"
        className="mt-2 max-w-2xl break-keep text-body-lg leading-title text-[color:var(--color-text-tertiary)]"
      >
        {/* On the web the agents lede cannot say "Atlas finds": the card right under it says a
            browser cannot start programs. The app is the subject there (2026-09-25). */}
        {tab === 'mcp'
          ? tMcp('lede')
          : tab === 'models'
            ? t('models.lede')
            : isAcpBridgeAvailable()
              ? t('lede')
              : t('ledeWeb')}
      </p>

      <nav className="mt-5" data-testid="agents-tabs">
        <TabBar
          idPrefix="agents"
          ariaLabel={t('workspace.aria')}
          activeKey={tab}
          onSelect={selectTab}
          items={[
            { key: 'agents', label: t('workspace.agents'), testId: 'agents-tab-agents' },
            { key: 'models', label: t('workspace.models'), testId: 'agents-tab-models' },
            {
              key: 'mcp',
              label: t('workspace.mcp'),
              testId: 'agents-tab-mcp',
              /*
               * **How many connectors are switched on**, not how many are written down. The
               * number is the only rail-level sign that connectors exist at all, now that MCP
               * has no tile of its own; it is omitted until the store has answered, so the strip
               * never shows a zero that means "not read yet".
               */
              count: mcpCount,
              countTitle: t('workspace.mcpCount'),
            },
          ]}
        />
      </nav>

      {/*
        **One panel element, and the tab decides what is in it.** Only the selected tab's panel is
        rendered — the same shape `/ontology/insights` uses: drawing the other half into a hidden
        box pays for building a model nobody is looking at, while `aria-controls` only has to
        resolve for the selected tab. The `id` and `aria-labelledby` therefore follow the tab.
      */}
      <div
        ref={panelHostRef}
        role="tabpanel"
        id={`agents-tabpanel-${tab}`}
        aria-labelledby={`agents-tab-${tab}`}
        data-testid="agents-tabpanel"
        className="mt-5 min-w-0"
      >
        {tab === 'agents' ? (
          /*
            The section keeps its label for assistive tech and for the tests that find this
            panel by region, but it no longer repeats it as an `sr-only` heading: since
            2026-09-20 the tool group inside draws that name **visibly**, so the heading was a
            screen reader hearing the same words twice before the rows it introduces.
          */
          <section className="min-w-0" aria-label={t('runtimesHeading')}>
            <AcpRuntimeSettings embedded onOpenChat={openChatOnMap} />
          </section>
        ) : tab === 'models' ? (
          <section className="min-w-0" aria-label={t('workspace.models')}>
            <ModelConnections />
          </section>
        ) : (
          children
        )}
      </div>
    </main>
  );
}
