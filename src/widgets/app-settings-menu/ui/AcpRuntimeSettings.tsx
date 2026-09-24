'use client';

import { isAgentDoctorAvailable, useAgentDoctor } from '@/features/acp-doctor';
import { Download, MessageSquare, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';

import { useArrivalMemory } from '@/shared/lib/route-arrival-memory';
import { controlClass } from '@/shared/ui/control-class';
import { Chip, Dialog, EmptyState, InfoHint, Surface } from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from '@/shared/lib/tauri-acp';
import { isGuardedRuntime } from '@/features/acp-session';
import { AGENT_CLIENTS } from '@/entities/vault-session';
import { RowStateBadge } from '@/features/docs-vault-local';
import { requestAgentChat } from '@/shared/lib/agent-chat-intent';

import {
  DETAIL_TOGGLE_CHIP,
  ProductMark,
  SettingsGroup,
  SettingsGroupHeading,
  SettingsRow,
} from './settings-primitives';
import { APP_CODING_TOOLS } from '../model/app-coding-tools';

/**
 * 「Runners」 (runners) — the coding agents this machine can invoke.
 *
 * ## The one job of this screen
 *
 * **Say what you can use right now.** Each row answers "can I talk to this tool
 * from here", and when it cannot, it says **what to do about it** on the same
 * row. That is why status is not flattened into installed/not-installed — the
 * tool missing and Node missing require different actions from the user.
 *
 * ## It is shown in two groups
 *
 * With 38 rows, one block cannot be scanned. **What is actually confirmed on this
 * computer** is expanded and the rest collapses — what you can do now comes first.
 *
 * ⚠️ **The meaning of "confirmed" was once wrong** (2026-08-16, owner: *"It looks odd that everything is shown like this"* — it looks odd that everything is shown). The old test
 * was `state === 'ready'`, which meant not "this tool is here" but **"npx exists,
 * so it could be launched"**. Only 12 of the CLI names we wrap were recorded, so
 * the other 26 could not be checked at all — and yet 20 rows carried a green 「Ready」. Rust now separates that case as `cli-unknown` (`acp.rs`), so this
 * screen's first group holds **only what was really confirmed**.
 *
 * ## Who asks on your behalf (owner call, 2026-08-16)
 *
 * The app launches runners with its own configuration, so it asks the user before
 * anything outside the vault is touched. But that isolation exists **only for the
 * runners we actually measured**. The rest use whatever configuration the user set
 * up for that tool, so anyone who set their tool to "do everything without asking"
 * gets no prompt even when we launch it.
 *
 * That fact is not hidden — the same reason this product never writes "coming
 * soon". But **where to write it** was wrong three times, and all three taught the
 * same thing: this fact **does not fit in a badge.** "Can the app ask on your
 * behalf when a file outside the folder is touched" is a sentence that needs both
 * its condition and its consequence to mean anything. The full history is in the
 * comments inside `RuntimeRow`.
 *
 * So **the sentence goes where a sentence belongs** — one line above the group,
 * naming the guarding tools **from the data**. When a second one appears the
 * sentence follows automatically. Writing "only Claude Code for now" by hand
 * starts rotting that day.
 */

/**
 * State → badge ink. Colour is decided by **which fact the badge carries**, so it
 * is passed here rather than by the value layer (`badgeClass` supplies geometry
 * only).
 *
 * Only "Ready" uses success — in this repository success is reserved for "it went
 * well" (connected, complete) and its use is not widened. The combination follows
 * exactly what `CommitDetail` uses for the same kind of badge; a new copy would
 * make the two screens' greens diverge.
 *
 * **The other states are not distinguished by colour.** Making "Installation Required" and
 * "Node Required" two differently coloured warnings would make colour the only channel
 * carrying the information, when the difference between them lives in **the words**.
 */
/*
 * ⚠️ **Ready is a dot, not a sticker** (owner, 2026-08-24: *"why is 「ready」 so small… the colour is
 * not good either"*).
 *
 * The ink itself measured fine — 9.56:1 on this ground. What was wrong was the **hierarchy**: the
 * row's least important element was its only saturated non-indigo fill, so a filled green pill sat
 * shouting beside the indigo action it should have been deferring to. The charter's own spelling of
 * a signal is *"one solid dot and three translucent surface/edge/text steps"*, and the dot is the
 * half that carries the meaning here. So the emerald stays — same tokens, no new hue — and moves
 * from the fill to the dot, while the label joins the row's neutral voice. The badge itself is
 * `RowStateBadge` (round 3), shared with the MCP tab's rows so 「Ready」 is one shape on both tabs.
 *
 * `CommitDetail` keeps the filled pill on purpose. There the status **is** the subject of the line;
 * here it trails two controls, and the same treatment in the two places would be the divergence, not
 * the fix.
 */
export function AcpRuntimeSettings({
  embedded = false,
  onOpenChat = requestAgentChat,
}: {
  embedded?: boolean;
  onOpenChat?: (runtimeId: string) => void;
} = {}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  /*
   * **The list this machine already has, kept across a route change** (2026-09-12).
   *
   * `null` means "searching", and it used to be the value on **every** arrival at the Agents
   * destination — so the screen whose whole content is this list started as one "checking…"
   * row each time. Measured at 1512×901 on the static export with the installed app's
   * runtime injected, the pane's content doubled 200-262 ms after the rail click on the
   * second arrival exactly as on the first, which is inside the route crossfade: the browser
   * captured the searching row as the screen it was fading into and then cut to the list.
   *
   * Not keyed on anything: which coding tools exist is a fact about this computer, so one
   * memory is the whole truth. Both detection passes still run on every mount (the fast
   * disk scan and the login check behind it) and replace this in place — the row that changes
   * from "Ready" to "Login required" is still the sign that the check finished, exactly as
   * the note below describes. What is gone is the state before any of it is known.
   */
  const [runtimes, setRuntimes] = useArrivalMemory<AcpRuntimeStatus[] | null>(
    "acp-runtimes",
    null,
  );
  const [checking, setChecking] = useState(false);
  /*
   * ⚠️ **Expanded from the start for someone who has nothing** (walkthrough,
   * 2026-08-20).
   *
   * With 0 confirmed tools the pane above is one line — "install one and it will
   * appear here" — and **the installation instructions lived only inside this
   * collapsed list**. The answer was hidden two clicks down, which is exactly the
   * shape this repository forbids for a degradation card: it says why and never
   * says where to.
   *
   * It collapses only when there is something above to look at. The reason for
   * collapsing is "keep the long list from burying the short one", and with no
   * short list there is nothing to bury.
   */
  const [othersOpen, setOthersOpen] = useState(false);
  /** What the person is typing in the other-tools dialog. Set every time it opens. */
  const [othersQuery, setOthersQuery] = useState('');
  /** The search chip opens it empty; a shelf tile opens it already searched to that tool. */
  const openOthers = (query: string) => {
    setOthersQuery(query);
    setOthersOpen(true);
  };

  /**
   * Re-scan from the button — it is a response to a press, so it shows "searching".
   * A press checks **all the way through login** (the user has accepted the wait).
   */
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setRuntimes(await detectAcpRuntimes({ probeLogin: true }));
    } finally {
      setChecking(false);
    }
  }, [setRuntimes]);

  // The first pass **does not use the button path**, for two reasons:
  // ① changing state directly in an effect body costs another render
  // ② a response arriving after this pane closes would touch a vanished screen's state
  // "Searching" is already said by `runtimes === null`, so there is nothing to switch on.
  useEffect(() => {
    // Do not set out to call a capability that is not there. In a browser the answer
    // is obvious, and calling anyway is the shape of retrying "maybe this time".
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    /*
     * **Called twice.** The first pass skips the login check — it only scans disk,
     * so it draws almost immediately. The second pass checks and corrects.
     *
     * It used to do everything at once, so the check's duration was added directly
     * to the time the screen took to appear (owner: *"The Agents tab takes about a second to load when pressed."* — pressing the Agents tab takes about a second to load).
     * The list could have been drawn first and nothing was being shown at all.
     *
     * A row may later change from "Ready" to "Login Required". That is not something
     * to hide but **the sign that the check finished**, and it beats a second of
     * empty screen.
     */
    void detectAcpRuntimes().then((fast) => {
      if (cancelled) return;
      setRuntimes(fast);
      void detectAcpRuntimes({ probeLogin: true }).then((full) => {
        if (!cancelled && full) setRuntimes(full);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [setRuntimes]);

  // A browser cannot spawn a process — impossible in principle, so the reason and
  // the place to go are stated together (`.claude/rules/surfaces.md`).
  if (!isAcpBridgeAvailable()) {
    /*
     * ⚠️ **An empty state, not a settings row** (2026-09-25, design polish). This was one
     * `SettingsRow`: a 110-character caption running as a single 796px line at 11px, and the
     * only way on an 11px text link to MCP. It is the whole content of the tab on the web, so it
     * takes the page's own empty-state shape: a title that says why, one line that says what
     * works from here, and the two ways on as real buttons — the app first, because it is the
     * path this tab is about; MCP second, because it works from here today. No icon tile:
     * `EmptyState` indents the text beside it but not the actions, which would give the card two
     * start lines.
     *
     * ⚠️ **What the app changes is the page lede's sentence, not this card's** (round 2). The lede
     * above already says the Mac app finds the tools and opens them inside Atlas; the caption used
     * to open with the same fact 160px lower. It now carries only what the lede does not: the way
     * that works in this browser today.
     */
    return (
      <div data-testid="app-settings-runtimes-web" className="grid min-w-0 gap-3">
        <EmptyState
          tone="solid"
          title={t('webLabel')}
          description={<span className="block break-keep">{t('webCaption')}</span>}
          action={
            <>
              <Link
                href="/download/"
                data-testid="app-settings-runtimes-get-app"
                /* The pill shape every web-only empty state uses (Harness, Automations), with the
                   touch floor (round 2). ⚠️ **Filled, on this tab alone** (round 4, 2026-09-25):
                   there the card is one state among the screen's content, here it is the tab's
                   only way forward, and an accent-ink pill beside a link weighed barely more than
                   the link. `onAccent` is the ramp's one filled press — the tone the folder
                   guide's own 「get the app」 uses — so the winner is said by the ramp, not by a
                   hand-mixed fill. */
                className={controlClass({
                  shape: 'pill',
                  size: 'lg',
                  tone: 'onAccent',
                  // The pill shape carries no gap of its own; the glyph takes the chip's 6px.
                  // The value layer's focus ring is an inset indigo ring, which vanishes on an
                  // indigo fill (1.00:1, `focus-ring-contrast.spec.ts`); on this press the inset
                  // ring takes the primary ink instead.
                  className:
                    'atlas-touch-floor atlas-touch-floor-wide gap-1.5 focus-visible:ring-[color:var(--color-text-primary)]',
                })}
              >
                <Download size={ICON_SIZE.md} aria-hidden />
                {t('webGetApp')}
              </Link>
              {/*
               * ⚠️ **A link, because the place it names is no longer on this screen**
               * (2026-09-05). The caption used to say "the «MCP connection» section on this
               * screen", and a section name is guidance only while that section is here to be
               * scrolled to. MCP became its own destination, so the card carries the way there
               * instead of a name — the same rule that forbids a degradation card from stating
               * a reason with nowhere to go.
               */}
              {/* ⚠️ **One winner** (round 3, 2026-09-25). As a second pill at the same 32px this
                  carried nearly the weight of 「get the Mac app」, and on a tab whose only job in a
                  browser is to send the person to the app there was no clear first press. It
                  steps back to a link: still a real way on, no longer a peer of the app. */}
              <Link
                href={DESTINATION_HREF.mcp}
                data-testid="app-settings-runtimes-mcp-link"
                className={controlClass({
                  shape: 'link',
                  size: 'lg',
                  tone: 'default',
                  hoverInk: 'strong',
                })}
              >
                {t('webMcpLink')}
              </Link>
            </>
          }
        />
        {/*
          ── What the app would find (round 4, 2026-09-25) ──────────────────────────────────────
          The card above was the whole tab, and 60% of the window stood empty under it. A browser
          cannot say which of these tools is on this computer, but it can say which tools the app
          looks for: the registry the app's detection walks ships in this build. So the space holds
          that list — marks and names, no states and no controls, because there is nothing true to
          report and nothing to press for any of them here. It is the fact the 「get the Mac app」
          press is buying, one glance below it, and it repeats nothing the lede or the card says.
        */}
        <section
          className="min-w-0"
          aria-labelledby="app-settings-runtimes-web-tools-heading"
          data-testid="app-settings-runtimes-web-tools"
        >
          <SettingsGroupHeading
            id="app-settings-runtimes-web-tools-heading"
            label={t('webToolsHeading', { count: APP_CODING_TOOLS.length })}
          />
          <ul className="mt-1.5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3 xl:grid-cols-4">
            {APP_CODING_TOOLS.map((tool) => (
              <li
                key={tool.id}
                data-testid={`app-settings-runtimes-web-tool-${tool.id}`}
                className="flex min-w-0 items-center gap-2.5"
              >
                {/* Stepped back like the desktop shelf's marks: 41 white plates at full weight
                    outweighed the one filled press above them. */}
                <span className="flex shrink-0 opacity-60">
                  <ProductMark icon={tool.icon} ink={tool.brandInk} monogram={tool.name} />
                </span>
                <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                  {tool.name}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const ready = (runtimes ?? []).filter((r) => isRuntimeUsable(r.state));
  const others = (runtimes ?? []).filter((r) => !isRuntimeUsable(r.state));

  /*
   * **The re-scan press belongs to the group it re-scans** (2026-09-20).
   *
   * It used to sit on the intro row, level with the sentence about which tools can open a
   * chat and a whole line above the heading that counts what it would re-count. The MCP tab
   * beside this one puts its "add a connector" press in its group heading, so the two tabs
   * asked to be read differently for no reason a person could name; the owner's own rule for
   * this screen is that a group's controls stand with the group, filling the row's width.
   *
   * ⚠️ **Not while the first scan is still running.** `checking` covers a re-scan this button
   * started; the very first detection, before any answer exists, left it live — so the row
   * offered "check again" beside a list that says it is still looking, and a press started a
   * second scan over the first. `runtimes` is null exactly until that first answer lands.
   */
  const recheck = (
    <Chip
      size="lg"
      tone="secondary"
      data-testid="app-settings-runtimes-recheck"
      disabled={checking || runtimes === null}
      onClick={() => void refresh()}
      className={`${DETAIL_TOGGLE_CHIP} shrink-0 whitespace-nowrap`}
    >
      <RefreshCw size={ICON_SIZE.md} aria-hidden />
      {t('recheck')}
    </Chip>
  );
  /*
   * The names inside the explanation — **not written by hand.** When more runners
   * become isolated the sentence follows on its own, and with none it branches to a
   * different sentence. Baking "only Claude Code for now" into a string starts it
   * rotting that day.
   */
  const guardedNames = ready
    .filter((r) => isGuardedRuntime(r.id, r.isolated))
    .map((r) => r.label);
  /*
    Say what appears on disk (2026-08-17).

    When a conversation starts, Rust creates a config folder for that tool inside the app's data
    directory and **symlinks the user's real credential files** into it (`link_credentials` in
    `src-tauri/src/acp.rs`). Isolating them breaks login, and copying secrets into the app folder is
    something the charter forbids, so a link is the answer in between — that is right. What was
    wrong is that **no screen said so.** Since 2026-09-19 it is said in a hint rather than as a
    paragraph above the list: the sentence matters at the moment of pressing "open a chat", and a
    hint is one press from that button without standing between the title and the tools.
    Gate: `tests/contract/acp-disk-disclosure.contract.test.ts`.

    ⚠️ **Only where a chat can start** (2026-09-20). `link_credentials` runs when a conversation
    opens, and a conversation opens only for a tool this screen confirmed and guards — so on a
    machine with none, this answered a question nobody can ask. The condition is the same one the
    chat button uses. The gate greps this file for the sentence and the testid, so it can see
    neither this change nor its reverse; the reason it is right is the disclosure's own subject.

    ⚠️ **It rides the heading row, because a hint has to hang off something** (2026-09-21). On the
    agents tab the intro sentence and the MCP link are the sheet's, not this tab's, so the row
    above the list was frequently the guard note and this hint — and with one confirmed tool that
    note does not draw either. What was left was a **lone question mark on a row of its own**,
    above the group it explains, marking nothing. Inside the group heading it has a subject: the
    row reads name · hint · re-scan, which is the grammar the MCP tab's own heading already uses
    beside its own `mcp.shareHeading`. `align="right"` follows the move — the panel now hangs from
    edge of the row rather than the left of a paragraph.
  */
  /** Whether any confirmed tool cannot open a chat — the one line this row still carries. */
  const showGuardNote =
    runtimes !== null && ready.some((r) => !isGuardedRuntime(r.id, r.isolated));
  const diskHint =
    runtimes !== null && ready.some((r) => isGuardedRuntime(r.id, r.isolated)) ? (
      <InfoHint label={t('hintLabel')} align="right">
        <p
          data-testid="app-settings-runtimes-disk-note"
          className="break-keep text-label leading-prose text-[color:var(--color-text-secondary)]"
        >
          {t('diskNote')}
        </p>
      </InfoHint>
    ) : null;

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-runtimes">
      {/*
        **One row above the list: what the list means, and the way to re-read it** (owner,
        2026-09-19: *"there is so much useless text here — tooltips if it is really needed"*).
        Three paragraphs used to stand between the page title and the first tool. What they
        said still matters at exactly two moments — *why does this tool open a chat and that
        one not*, and *what does starting a chat write to disk* — so the first is one sentence
        that names the tools it is about, and the second waits in a hint beside it. Nothing is
        dropped: the credential-link disclosure is still drawn
        (`tests/contract/acp-disk-disclosure.contract.test.ts`), one press away instead of in
        the way.

        In the sheet there is no title, so the intro line takes that place; **the caller
        decides**, as before.

        The link to the MCP tab that used to stand here left with the tabs (2026-09-19): the
        tab is on the same strip, a press away, and a sentence pointing at it was the dead
        pointer `.claude/rules/surfaces.md` forbids the moment the strip is visible.

        ⚠️ **The row is not drawn when it has nothing to say** (2026-09-21). On the agents tab
        the intro and the MCP link belong to the sheet, so this row's only possible content is
        the guard note — and rendered empty it was still a grid item, spending the parent's
        12px gap above a heading it no longer introduces.
      */}
      {!embedded || showGuardNote ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {embedded ? null : (
            <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
              {t('intro')}
            </p>
          )}
          {embedded ? null : (
            <Link
              href={DESTINATION_HREF.mcp}
              data-testid="app-settings-runtimes-mcp-link"
              className={controlClass({
                shape: 'link',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'text-label',
              })}
            >
              {t('mcpLink')}
            </Link>
          )}
          {showGuardNote ? (
            <p
              data-testid="app-settings-runtimes-guard-note"
              data-guarded-count={guardedNames.length}
              className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]"
            >
              {guardedNames.length > 0
                ? t('guardedExplainer', { names: guardedNames.join(' · ') })
                : t('guardedExplainerNone')}
            </p>
          ) : null}
        </div>
      ) : null}

      {runtimes === null ? (
        /*
         * **Named before it can be counted.** The group carries the plain name while the scan
         * is still running and the name with the count the moment it answers — the same shape
         * the MCP tab's connectors group uses, so the two tabs read alike. It matters here
         * because the heading is where the re-scan press now lives: without a heading in this
         * state the press would appear only after the first answer, and the guided tour
         * anchors on it.
         */
        <SettingsGroup label={t('heading')} trailing={recheck}>
          <SettingsRow label={t('checking')} control={null} testId="app-settings-runtimes-loading" />
        </SettingsGroup>
      ) : (
        <>
          {/* Name · hint · action, the order the MCP tab's own group heading uses. */}
          <SettingsGroup
            label={t('readyHeading', { count: ready.length })}
            trailing={
              <>
                {diskHint}
                {recheck}
              </>
            }
          >
            {ready.length === 0 ? (
              /* "The install guides are in the list below" is true only when there is a list below;
                 with none it pointed at nothing (design sweep, 2026-09-23). */
              <SettingsRow label={t('noneReady')} caption={t(others.length > 0 ? 'noneReadyCaption' : 'noneReadyCaptionNoList')} control={null} />
            ) : (
              ready.map((runtime) => (
                <RuntimeRow
                  key={runtime.id}
                  runtime={runtime}
                  onOpenChat={onOpenChat}
                  onRuntimesChanged={() => void refresh()}
                />
              ))
            )}
          </SettingsGroup>

          {others.length > 0 ? (
            /*
             * ── The rest, behind a dialog rather than a fold (owner, 2026-09-07) ──────────────
             *
             * *"Not like this — like MCP: a window opens and you scroll through it and pick the
             * one you want to set up. With a search."* The disclosure was the wrong container for
             * 36 rows. Expanded, it pushed a list nobody could scan onto the page a person had
             * come to for the three tools they can actually use; collapsed, the only way to find
             * one tool among 36 was to open it and read them all. There is no search inside a
             * fold, and there is nowhere to put one.
             *
             * `Dialog` is what this repository already uses for an errand with a beginning and an
             * end — scrim, focus trap, Escape, focus returned to the control that opened it — and
             * it is the same primitive the connector dialog uses one destination away, which is
             * the point: setting up a coding tool and attaching an MCP server should not feel
             * like two different products.
             *
             * ⚠️ **With nothing confirmed, the door is the emphasis.** A person with zero tools
             * has one line above this and nothing to do with it; the installation instructions
             * live in these rows, so the chip carries the indigo rather than making somebody find
             * a quiet control to reach the only answer on the screen (walkthrough, 2026-08-20 —
             * the same reasoning that used to auto-expand the fold).
             */
            <section
              className="min-w-0"
              aria-labelledby="app-settings-runtimes-others-heading"
              data-testid="app-settings-runtimes-others"
            >
              <SettingsGroupHeading
                id="app-settings-runtimes-others-heading"
                label={t('othersHeading', { count: others.length })}
                trailing={
                  <Chip
                    size="lg"
                    tone={ready.length === 0 ? 'accentOnTint' : 'secondary'}
                    data-testid="app-settings-runtimes-others-toggle"
                    aria-haspopup="dialog"
                    onClick={() => openOthers('')}
                    className={
                      ready.length === 0
                        ? `${DETAIL_TOGGLE_CHIP} shrink-0 whitespace-nowrap border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]`
                        : `${DETAIL_TOGGLE_CHIP} shrink-0 whitespace-nowrap`
                    }
                  >
                    <Search size={ICON_SIZE.md} aria-hidden />
                    {t('othersSearchLabel')}
                  </Chip>
                }
              />
              {/*
                ── The shelf (round 3, 2026-09-25) ─────────────────────────────────────────────
                The rest used to be one chip, 「show the other N」, and the destination's primary
                tab ended 600px above the window's bottom edge at 1512×949: one row, a chip, and a
                canvas with nothing on it. What that canvas can honestly hold is the fact the chip
                hid — **which other tools Atlas knows, and what state each is in** — so the names
                stand here as a compact shelf of marks: four across, one line of state under each
                name, no controls. A tile opens the same dialog, already searched to that tool,
                where its install guide and check live.

                ⚠️ **What this keeps from the 2026-09-07 owner call.** The complaint there was a
                fold of 36 full rows poured onto the page, with no search. Setting a tool up still
                happens in the window with a search; the page shows only a scannable index of
                names (nine lines at 36 tools, not 36 rows). Falsifier: if a walkthrough shows a
                person reading the shelf instead of reaching the ready tools above it, the shelf
                goes back behind the chip.
              */}
              <ul
                data-testid="app-settings-runtimes-others-shelf"
                className="mt-1.5 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4"
              >
                {others.map((runtime) => {
                  const mark = runtimeMark(runtime);
                  return (
                    <li key={runtime.id} className="min-w-0">
                      <button
                        type="button"
                        data-testid={`app-settings-runtimes-tile-${runtime.id}`}
                        aria-haspopup="dialog"
                        aria-label={t('othersTileLabel', {
                          name: runtime.label,
                          state: t(`state.${runtime.state}`),
                        })}
                        onClick={() => openOthers(runtime.label)}
                        className={controlClass({
                          shape: 'card',
                          size: 'md',
                          tone: 'secondary',
                          hoverInk: 'strong',
                          hoverBorder: 'strong',
                          className:
                            'group w-full gap-2.5 bg-[color:var(--color-overlay-1)] py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
                        })}
                      >
                        {/*
                          ⚠️ **The mark's weight follows the state, not the drawing** (round 4,
                          2026-09-25). Forty white brand plates at full strength made the shelf the
                          loudest thing on the tab, heavier than the one tool that can open a chat
                          above it. Nothing on this shelf is usable yet, so its marks step back to
                          60% and come forward under the pointer or focus — the tile that is about
                          to be pressed is the one at full weight.
                        */}
                        <span className="flex shrink-0 opacity-60 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
                          <ProductMark icon={mark.icon} ink={mark.ink} monogram={runtime.label} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body">{runtime.label}</span>
                          <span className="mt-0.5 block truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
                            {t(`state.${runtime.state}`)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <OtherRuntimesDialog
                open={othersOpen}
                onClose={() => setOthersOpen(false)}
                runtimes={others}
                query={othersQuery}
                onQueryChange={setOthersQuery}
                onOpenChat={onOpenChat}
                onRuntimesChanged={() => void refresh()}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * **Every other coding tool, in one scrolling window with a search.**
 *
 * The list is 38 rows and only two or three of them are usable on any given machine, so this
 * holds the other 36. What a person does here is find one by name and read what it needs — which
 * is a search and a list, and neither fits in the fold this replaced.
 *
 * ## What a row says, and what it does not
 *
 * The same `RuntimeRow` the ready group uses, unchanged. That is deliberate: a row that looked
 * different in here would be a second answer to "what state is this tool in", and the states are
 * the same states. The action on an unusable row is a link to that tool's own instructions and
 * nothing more — Atlas does not run an install script it cannot show as a diff
 * (`.claude/rules/forbidden.md`, and the reasoning written out in `RuntimeRow` below).
 *
 * ## Search reads the name and the description together
 *
 * Somebody looking for "the Google one" does not remember `gemini`, and somebody looking for
 * `amp` does not remember Sourcegraph. Either alone leaves half of them unfindable, which is the
 * same reasoning the connector dialog's search records.
 */
function OtherRuntimesDialog({
  open,
  onClose,
  runtimes,
  query,
  onQueryChange,
  onOpenChat,
  onRuntimesChanged,
}: {
  open: boolean;
  onClose: () => void;
  runtimes: AcpRuntimeStatus[];
  query: string;
  onQueryChange: (next: string) => void;
  onOpenChat: (runtimeId: string) => void;
  onRuntimesChanged: () => void;
}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? runtimes.filter((runtime) =>
        `${runtime.label} ${runtime.description} ${runtime.id}`.toLowerCase().includes(needle),
      )
    : runtimes;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      labelledBy="app-settings-runtimes-others-title"
      testId="app-settings-runtimes-others-dialog"
      className="max-h-[min(80vh,var(--dialog-max-h))] overflow-y-auto"
    >
      <h2
        id="app-settings-runtimes-others-title"
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {/* The errand, not the shelf's name (round 4): the heading on the page already counts
            these tools, and a dialog opening with the same words was the page said twice. */}
        {t('othersDialogTitle')}
      </h2>
      {/*
        What "could not check" means, stated once at the top rather than on every row. Nineteen
        copies of one sentence is the defect this screen already went through and recorded; the
        explanation goes before the list so somebody reading in order meets it first.
      */}
      {runtimes.some((runtime) => runtime.state === 'cli-unknown') ? (
        <p
          data-testid="app-settings-runtimes-unknown-note"
          className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('unknownExplainer')}
        </p>
      ) : null}
      <Input
        label={t('othersSearchLabel')}
        size="md"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={t('othersSearchPlaceholder')}
        data-testid="app-settings-runtimes-others-search"
        onChange={(event) => onQueryChange(event.target.value)}
        className="mt-3 w-full"
      />
      {matches.length === 0 ? (
        <p
          data-testid="app-settings-runtimes-others-empty"
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('othersNoneForSearch', { query: query.trim() })}
        </p>
      ) : (
        <div className="mt-3" data-testid="app-settings-runtimes-others-list">
          <SettingsGroup>
            {matches.map((runtime) => (
              <RuntimeRow
                key={runtime.id}
                runtime={runtime}
                onOpenChat={onOpenChat}
                onRuntimesChanged={onRuntimesChanged}
              />
            ))}
          </SettingsGroup>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Chip size="lg" tone="secondary" onClick={onClose} className={DETAIL_TOGGLE_CHIP}>
          {t('othersClose')}
        </Chip>
      </div>
    </Dialog>
  );
}

/**
 * **Present and launchable**, which is not the same as "we confirmed the sign-in".
 *
 * `login-unknown` means the sign-in probe failed, not that the tool is broken (owner report,
 * 2026-09-05: a load spike put 「Sign in needed」 on two runtimes that were signed in). Dropping
 * such a row into the collapsed group would do the very thing that report complained about —
 * take a working tool off the screen. It stays in the first group, without the confirmed dot and
 * with a caption saying the check did not come back.
 */
function isRuntimeUsable(state: AcpRuntimeStatus['state']): boolean {
  return state === 'ready' || state === 'login-unknown';
}

/**
 * **The same product wears the same mark on both tabs** (2026-09-25).
 *
 * The runtime list takes its mark from the registry, and a registry entry without one drew an
 * empty 32px tile — while the MCP tab one press away drew Claude Code, Codex and Cursor with their
 * full brand tiles. Where the registry is silent and the MCP tab knows the product (its bundled
 * mark is this runtime's own `/acp-icons/<id>.svg`), that mark and ink are used; anything else
 * falls back to the row's monogram, never to a blank tile.
 */
function runtimeMark(runtime: AcpRuntimeStatus): { icon: string | null; ink: string | null } {
  if (runtime.icon) return { icon: runtime.icon, ink: runtime.brandInk };
  const client = AGENT_CLIENTS.find((entry) => entry.icon === `/acp-icons/${runtime.id}.svg`);
  return client ? { icon: client.icon, ink: runtime.brandInk ?? client.brandInk } : { icon: null, ink: null };
}

function RuntimeRow({
  runtime,
  onOpenChat,
  onRuntimesChanged,
}: {
  runtime: AcpRuntimeStatus;
  onOpenChat: (runtimeId: string) => void;
  onRuntimesChanged?: () => void;
}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  /** Confirmed — this is what earns the green dot and the 「Ready」 word. */
  const isReady = runtime.state === 'ready';
  /** Present and launchable; `login-unknown` is here too, without the claim. */
  const isUsable = isRuntimeUsable(runtime.state);

  /*
   * ## Why a link to that tool's own instructions, not an 「Install」 button
   *
   * The reference product (Buzz) has an `Install` button in this same place, and pressing it **actually runs an install script** (measured: it runs `curl -fsSL https://…/install.sh | bash` through `run_install_command_with_retry`).
   *
   * We do not. "There is no defensible reason to run code nobody has reviewed" is this repository's rule (`forbidden.md`), and that script sits behind a URL, so **it can change at any time** — we cannot show what we are executing as a diff.
   *
   * ⚠️ We do run other people's code (`npx -y <package>@<version>`). Three grounds for calling that different: **the version is pinned** (that URL script is not), it **lives only inside a child process we launched** (not a system-wide install), and it happens **when the user opens a conversation** (not from a general-purpose "install" button).
   *
   * So there is exactly one thing done here — **send them to that tool's official instructions.** We do not even transcribe the install command (the vendor can change it, and our copy would go stale).
   */
  const website = isUsable ? null : runtime.website;

  /*
   * **The doctor is offered only for tools with a gate.** A tool whose isolation
   * was never measured has neither an app-owned configuration nor credential links,
   * so nearly every check comes back as "could not verify" — that is noise, not
   * help. On the web there is neither a process nor a keychain to see, so it is absent.
   */
  const doctor = useAgentDoctor(runtime.id, onRuntimesChanged);
  const mark = runtimeMark(runtime);
  const showDoctor = isGuardedRuntime(runtime.id, runtime.isolated) && isAgentDoctorAvailable();

  /*
   * ⚠️ **Results go «below» the row, not «inside» it.** `SettingsRow` is one
   * `flex items-center justify-between` line, so putting a large block in the
   * control position sends all the remaining width into the gap between name and
   * button and lets the diagnosis own the row (owner rejection, 2026-08-20). The
   * row stays one line and the result goes full width beneath it.
   */
  return (
    <div className="min-w-0">
        <SettingsRow
        label={runtime.label}
        // A tool that only lacks a login gets **the thing to do** written out — that
        // state had a badge and nothing anywhere in the code told you what to do
        // (review 2026-08-16).
        caption={
          runtime.state === 'login-needed'
            ? t('loginHint')
            : /* Asked and got nothing back. The caption says that, and says the tool still opens —
                 anything shorter reads as a second way of spelling 「Sign in needed」. */
              runtime.state === 'login-unknown'
              ? t('loginUnknownHint')
              : undefined
        }
        testId={`app-settings-runtime-${runtime.id}`}
        icon={mark.icon}
        iconInk={mark.ink}
        monogram={runtime.label}
        control={
          /* Owner (2026-08-20): *"The buttons are so close together it feels cramped"* — the buttons are so close together it feels cramped. Three controls plus a status badge stand on one row, and at `gap-1.5` (6px) the eye cannot tell where one button ends. Widen by one step on the ramp.

             ⚠️ **Columns are read from the right** (2026-09-25, design polish). The cluster is
             right-aligned, so the controls every row carries — the check and the state badge —
             stand at the right end and the optional ones (open a chat, install guide) at the
             left. In the other-tools dialog the check used to start at x=855 on one row and
             x=778 on the next because the optional install link stood between it and the name;
             now the check and the fixed-width badge share one edge down the whole list. */
        <span className="flex items-center gap-2">
            {/*
             * ⚠️ **The badge was revised three times and finally removed.** Worth recording:
             *
             * ① A **sentence** on every unguarded row → 18 of 20 rows carried the same sentence, so half the screen was a copy.
             * ② An **orange 「Not Verified」 badge** on every unguarded row → owner: *"I can't really tell what this means"* (I can't really tell what this means). You could not tell what 「Verify」 was verifying, and orange on 19 rows made the whole list look defective.
             * ③ **「Ask Before Proceeding」** on the one row that works → owner: *"I don't understand this either"* (I don't understand this either). The row count dropped to 1, but **the words still did not communicate.**
             *
             * What all three share: this fact is too large for a badge of 4–6 characters. "Can the app ask on your behalf when a file outside the folder is touched" needs both its condition and its consequence to mean anything. So **the sentence goes where a sentence belongs** (one line above the group, naming names) and rows carry no badge. The list goes quiet and the fact is still on screen.
             *
             * ⚠️ **Not copied off screen either.** The sentence was once left on every row as `sr-only`, which moved the very defect ("19 identical sentences") into an invisible layer — someone using a screen reader hears the same sentence 19 times. The explanation above the group sits **before** the list, so it reaches anyone reading in order first. That is enough.
             */}
            {/*
             * ⚠️ **There was no door through to connecting** (caught in the 2026-08-16 review).
             *
             * The first-step card's stage-one name is 「Connect AI Agent」 and its button opens here. But all this screen held was a list and outward links, so someone who came to 「Connect」 **could not connect** — the only place that opens a conversation was the conversation window's own header, which only someone who had already opened one can see.
             *
             * Offered only for tools with a gate. Opening a conversation with an ungated tool would break the promise this screen makes one sentence above (it asks first before going outside the folder).
             */}
            {isUsable && isGuardedRuntime(runtime.id, runtime.isolated) ? (
              <Chip
                size="lg"
                tone="accentOnTint"
                data-testid={`app-settings-runtime-chat-${runtime.id}`}
                /*
                 * **The verb alone, and the sentence as the name** (2026-09-19). The row already
                 * carries this tool's mark and its name, so "open a chat with this tool" says
                 * "this tool" a second time — and three of these sentences stacked down the
                 * column were what pushed the names to 0px at 390. A screen reader moving from
                 * control to control does not see the row beside it, so the accessible name
                 * keeps the whole sentence; the same split the MCP tab's rows use.
                 */
                aria-label={t('openChat')}
                onClick={() => onOpenChat(runtime.id)}
                className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
              >
                <MessageSquare size={ICON_SIZE.md} aria-hidden />
                {t('openChatShort')}
              </Chip>
            ) : null}
            {/*
             * **The doctor is offered only for tools with a gate.** A tool whose
             * isolation was never measured has neither an app-owned configuration
             * nor credential links, so nearly every check comes back as "could not
             * verify" — that is noise, not help.
             *
             * Why here: the problem card is seen only by someone who **already
             * opened a conversation**. Someone stuck on "the conversation will not
             * open at all" comes to this screen.
             */}
            {/*
             * ⚠️ Tools that only lacked a login were being offered 「Installation Method」 — to people who had already installed them. Different action, different sentence.
             */}
            {runtime.state === 'login-needed' ? null : website ? (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="app-settings-runtime-install"
                /* Owner (2026-08-20): put a box around it. The two controls beside it
                   are chips, so leaving this one as bare text puts **two kinds of
                   control on one row**, and then its shape does not read as
                   pressable. That it leaves the app is still said by the glyph (↗). */
                className={controlClass({
                  shape: 'chip',
                  /* One size for every control on the row (2026-09-25): the label size used to
                     step 12.5 → 11 across one row, so the smaller ones read as disabled. The
                     primary is told apart by tone, not by type size. */
                  size: 'lg',
                  tone: 'secondary',
                  hoverInk: 'strong',
                  className: 'shrink-0',
                })}
              >
                {/* A link that **leaves** the app, so the glyph precedes the label and declares itself. */}
                <span aria-hidden data-external-link-marker>
                  ↗
                </span>
                {t('installGuide')}
              </a>
            ) : null}
            {showDoctor ? doctor.scanButton : null}
            {/* A state, not a control — so it keeps a badge shape rather than growing into a
                button, on the label ramp beside the row's 32px chips. */}
            <RowStateBadge ready={isReady} data-runtime-state={runtime.state}>
              {t(`state.${runtime.state}`)}
            </RowStateBadge>
          </span>
        }
      />
      {/* Only when there is a result. The wrapper used to be drawn around a null result, so every
          guarded row carried an empty 10px strip under it: the card's content sat 16px from the
          top and 26px from the bottom (measured 2026-09-25). */}
      {/* ⚠️ Through `Surface`, not a bare conditional (round 2, 2026-09-25): the result arrives
          under a row the person just pressed, and a block that appears in one frame is the hard
          cut the motion charter forbids. `Surface` brings the ramp's enter/exit and the global
          reduced-motion cut; the result never returns to null while the row lives (a re-run
          keeps the previous checks until the new ones land), so the exit window never fades an
          empty box. */}
      {showDoctor ? (
        <Surface open={Boolean(doctor.result)} className="min-w-0 px-3 pb-2.5">
          {doctor.result}
        </Surface>
      ) : null}
    </div>
  );
}
