'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { AcpRuntimeSettings, AgentSetupSection } from '@/widgets/app-settings-menu';
import { useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat-intent';
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';

/**
 * The "agents" destination — where this computer's AI coding tools are **downloaded, installed,
 * connected, repaired, and opened into a conversation**.
 *
 * **Why it left settings** (2026-08-20, ledger 90). Owner instruction: *[should we put settings
 * into the LNB entirely and use a whole window like other open source, instead of a popup?]* → of three
 * options, **"promote agents to top level"**.
 *
 * Five PO council seats and five design bench seats reviewed it, and the basis for the move is not
 * width (measured in the installed app: on the normal path 46–47% of the sheet is in fact empty). The
 * basis is **the container**:
 *
 * - A modal **dims and blocks what is behind it and owns Esc.** You cannot look at the map while 52MB
 *   downloads.
 * - A sheet **unmounts entirely when closed** — a completion signal can be lost. (That defect is
 *   independent of the move and was fixed separately. A destination does the same when you leave the route.)
 * - **Settings is where you pick values**, and this is **an operational task with progress state**.
 *
 * Picking a setting and running an operation with progress answer different questions, so they get
 * different destinations.
 *
 * **What this screen holds and does not.** Holds: the runner list, connection checks, app-only install,
 * reconnection, opening a conversation. Does not hold: **API keys** (the 2026-08-16 "freeze the path,
 * do not emphasize it" decision stands — promoting to a destination is itself emphasis and cannot
 * quietly reverse it) and **the workspace** (a vault answers a different axis; owned by
 * `local-vault-management`).
 */
export function AgentsPage() {
  const t = useTranslations('agents');
  const router = useRouter();
  const openChatOnMap = useCallback(
    (runtimeId: string) => {
      queueAgentChatIntent(runtimeId);
      router.push(DESTINATION_HREF.map);
    },
    [router],
  );

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
      className={`${PAGE_FRAME} max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]`}
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
      <p className="mt-2 max-w-2xl break-keep text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
        {t('lede')}
      </p>

      <section className="mt-6 min-w-0" aria-label={t('runtimesHeading')}>
        <h2 className="sr-only">{t('runtimesHeading')}</h2>
        <AcpRuntimeSettings embedded onOpenChat={openChatOnMap} />
      </section>

      {/*
        "MCP connection" is on this screen because of what the section above says on the web:
        *"in this screen too, from the «MCP connection» section …"*. Without that section here, that
        sentence **points at nothing**. And this really does work on the web — MCP attaches to a folder,
        not to a screen (2026-08-01 ledger).
      */}
      <section className="mt-8 min-w-0" aria-labelledby="agents-mcp-heading">
        <h2
          id="agents-mcp-heading"
          className="mb-3 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]"
        >
          {t('mcpHeading')}
        </h2>
        <AgentSetupSection />
      </section>
    </main>
  );
}
