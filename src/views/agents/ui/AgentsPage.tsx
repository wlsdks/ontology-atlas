'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { AcpRuntimeSettings } from '@/widgets/app-settings-menu';
import { Disclosure } from '@/shared/ui';
import { useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat-intent';
import { PAGE_FRAME_FORM, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';

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
 * quietly reverse it), **the workspace** (a vault answers a different axis; owned by
 * `local-vault-management`), and — since 2026-09-05 — **MCP**.
 *
 * ## Why MCP left (2026-09-05)
 *
 * This destination had grown two jobs that only share a word. "Which coding tools does this
 * computer have" is about programs on this machine and is the reason the screen exists. "What does
 * an agent reach over MCP" — the folder's own server plus the external connectors — is about a wire
 * that works the same in a browser, and it was the taller half of the page. The owner read the
 * merged screen and asked for the split: *"Agents itself needs a redesign — MCP separately (doesn't
 * it need its own LNB tab?)"*. It is now `/mcp`.
 *
 * The runner list's web row used to point at *"the «MCP connection» section on this screen"*. A
 * section name is guidance only while that section is on the same screen, so that sentence now
 * carries a **link** to the new destination instead (`AcpRuntimeSettings`).
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
      {/*
        ⚠️ **One line stands, the rest folds** (owner review, 2026-09-06: three long lines of body
        copy stood between the title and the first card). The screen's job is a list of tools on
        this machine, and a paragraph naming everything it does and does not do is a preface to a
        list nobody has reached yet. The first sentence says what the screen is; what it also does,
        and what it deliberately does not hold, is one row away — nothing is dropped, because the
        boundary lines (no API keys, no folder here) are the ones people come back to ask about.
      */}
      <p className="mt-2 max-w-2xl break-keep text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
        {t('lede')}
      </p>
      <Disclosure className="mt-2" summary={t('ledeMore')}>
        <p className="mt-2 max-w-2xl break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
          {t('ledeDetail')}
        </p>
      </Disclosure>

      <section className="mt-6 min-w-0" aria-label={t('runtimesHeading')}>
        <h2 className="sr-only">{t('runtimesHeading')}</h2>
        <AcpRuntimeSettings embedded onOpenChat={openChatOnMap} />
      </section>

    </main>
  );
}
