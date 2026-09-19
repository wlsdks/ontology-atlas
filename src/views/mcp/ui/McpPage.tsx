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
  connectors?: VaultConnectorsState;
  handle?: FileSystemDirectoryHandle | null;
} = {}) {
  const t = useTranslations('mcp');
  const tConnectors = useTranslations('connectors');
  const localVault = useLocalVault();
  // Kept across a rescan: a null handle here re-read the connectors from nothing each time.
  const ownHandle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const handle = providedHandle === undefined ? ownHandle : providedHandle;
  // Standalone (tests, a future second consumer) reads its own store; under the Agents page
  // the store arrives from above so the strip's count and this list never disagree.
  const ownConnectors = useVaultConnectors(providedConnectors ? null : handle);
  const connectors = providedConnectors ?? ownConnectors;
  const enabledCount = connectors.connectors.filter((connector) => connector.enabled).length;
  /*
   * **The heading states the count only once it knows one.** `connectors` is an empty list
   * while the folder is still being read, so a count taken then says "0 switched on" — a
   * fact, in the same breath as the panel below saying it is still looking. The plain name
   * until the store answers; the number the moment it does.
   */
  const countKnown = connectors.status === 'ready';
  const noFolder = connectors.status === 'unavailable';

  /*
   * The "add a connector" press lives in the group heading, beside the count, where the share
   * group keeps its own control — the two groups read the same way, and the card no longer
   * opens with a row that holds one chip and empty span. The panel keeps the dialog and the
   * empty state's indigo ask; this heading chip only asks it to open, and lends its ref so
   * focus returns here after a removal (`ConnectorsPanel`, `externalAddOpener`).
   */
  const addOpenerRef = useRef<HTMLButtonElement | null>(null);
  const [addOpenRequest, setAddOpenRequest] = useState(0);
  /*
   * **The press appears once the folder has answered.** `ready` is the only status where a
   * write can land: while the store is `loading` the list is empty because nothing has been
   * read yet, and the previous condition let the chip through on that emptiness — offering to
   * add a connector to a file still being opened. `malformed` and `unavailable` cannot take a
   * write at all, and the panel says why in each case.
   */
  const connectorsListed =
    handle !== null && connectors.status === 'ready' && connectors.connectors.length > 0;

  const searchParams = useSearchParams();
  const section = parseMcpTab(searchParams?.get(MCP_SECTION_PARAM));
  /*
   * ⚠️ **The scroll waits for the list, or it lands nowhere near it** (measured 2026-09-19 at
   * four viewports, then in the spec's own fixture). `?mcp=connectors` is where
   * `/mcp/?tab=connectors` and the installed app's `ontology-atlas://mcp?install=…` land.
   * Scrolling on mount runs while the connector store is still `loading`, against a page at
   * its short height: the list then renders and pushes the group down, and the scroll stays
   * where it was. With two connectors attached in a 1440×600 window the group ended up
   * **1315px below the fold**; with none attached, at 1440×600, it overshot the other way and
   * left the heading 140px **above** the viewport. At 1280×900 nothing scrolls at all — the
   * group is already in view — which is why one desktop size hid all of it.
   *
   * Waiting for the store to settle scrolls once, against the height the person will see.
   *
   * ⚠️ **And it scrolls the shell's own scroller, not `scrollIntoView`.** That call walks every
   * scrollable ancestor, including one with `overflow-y: hidden` between this section and the
   * slot: measured, it took 242px of the scroll into an element nothing can scroll back, and the
   * group still landed 845px below a 600px fold. Moving `app-shell-body-slot` by the measured
   * delta touches the one container that is meant to move, and repeats harmlessly.
   */
  const connectorsSettled = connectors.status !== 'loading';
  useEffect(() => {
    if (section !== 'connectors' || !connectorsSettled) return;
    /*
     * **Corrects until the position stops moving, rather than guessing a frame.** The first
     * version scrolled two frames after the store settled and landed correctly against a dev
     * server and below the fold against the lane's own — a timing guess, which is what a
     * render-order race always turns into. The invariant is not "n frames"; it is "the delta
     * is zero". So it re-applies each frame while the page is still growing under it and
     * stops on the first frame that needs no correction, bounded so nothing can fight a
     * person's own scrolling for long.
     */
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
           * **How many are switched on**, not how many are written down. Everything starts
           * off, and a list of five where none is on reaches an agent as nothing at all —
           * the number that answers "is anything actually attached" is this one.
           */
          label={
            countKnown ? t('connectorsHeadingCount', { count: enabledCount }) : t('connectorsHeading')
          }
          trailing={
            connectorsListed ? (
              <Chip
                ref={addOpenerRef}
                size="sm"
                tone="secondary"
                data-testid="connectors-add-open"
                hoverSurface="lift"
                onClick={() => setAddOpenRequest((n) => n + 1)}
              >
                <Plus size={ICON_SIZE.sm} aria-hidden />
                {tConnectors('addOpen')}
              </Chip>
            ) : null
          }
        />
        {noFolder ? (
          /*
           * **One ask, not two** (2026-09-19). With no folder open the share group above already
           * says so and carries the button, and the connectors card said it again in its own
           * words with a second button of its own — the same request twice on one tab. The
           * heading stays, because a person should still learn this screen holds connectors;
           * what goes is the duplicate card. The panel keeps its own no-folder state for every
           * other caller, and its component test still owns it.
           */
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
        )}
      </section>
    </section>
  );
}
