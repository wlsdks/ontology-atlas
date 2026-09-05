'use client';

import { isAgentDoctorAvailable, useAgentDoctor } from '@/features/acp-doctor';
import { ChevronDown, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';

import { badgeClass } from '@/shared/ui/badge-class';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from '@/shared/lib/tauri-acp';
import { isGuardedRuntime } from '@/features/acp-session';
import { requestAgentChat } from '@/shared/lib/agent-chat-intent';

import { DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from './settings-primitives';

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
 * from the fill to the dot, while the label joins the row's neutral voice.
 *
 * `CommitDetail` keeps the filled pill on purpose. There the status **is** the subject of the line;
 * here it trails two controls, and the same treatment in the two places would be the divergence, not
 * the fix.
 */
const READY_INK =
  'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-secondary)]';

const NOT_READY_INK =
  'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]';


export function AcpRuntimeSettings({
  embedded = false,
  onOpenChat = requestAgentChat,
}: {
  embedded?: boolean;
  onOpenChat?: (runtimeId: string) => void;
} = {}) {
  const t = useTranslations('nav.settingsMenu.runtimes');
  const [runtimes, setRuntimes] = useState<AcpRuntimeStatus[] | null>(null);
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
  }, []);

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
  }, []);

  // A browser cannot spawn a process — impossible in principle, so the reason and
  // the place to go are stated together (`.claude/rules/surfaces.md`).
  if (!isAcpBridgeAvailable()) {
    return (
      <SettingsGroup>
        <SettingsRow
          label={t('webLabel')}
          caption={t('webCaption')}
          testId="app-settings-runtimes-web"
          /*
           * ⚠️ **A link, because the place it names is no longer on this screen**
           * (2026-09-05). The caption used to say "the «MCP connection» section on this
           * screen", and a section name is guidance only while that section is here to be
           * scrolled to. MCP became its own destination, so the row carries the way there
           * instead of a name — the same rule that forbids a degradation card from stating
           * a reason with nowhere to go.
           */
          control={
            <Link
              href={DESTINATION_HREF.mcp}
              data-testid="app-settings-runtimes-mcp-link"
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                className: 'font-[var(--font-weight-signature)]',
              })}
            >
              {t('webMcpLink')}
            </Link>
          }
        />
      </SettingsGroup>
    );
  }

  const ready = (runtimes ?? []).filter((r) => r.state === 'ready');
  const others = (runtimes ?? []).filter((r) => r.state !== 'ready');
  /*
   * The names inside the explanation — **not written by hand.** When more runners
   * become isolated the sentence follows on its own, and with none it branches to a
   * different sentence. Baking "only Claude Code for now" into a string starts it
   * rotting that day.
   */
  const guardedNames = ready
    .filter((r) => isGuardedRuntime(r.id, r.isolated))
    .map((r) => r.label);

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-runtimes">
      {/*
        ⚠️ **The destination does not draw this intro** (2026-08-20, caught in an
        installed-app capture). The page has already said the same thing in its own
        lede, and overlapping the two stands near-identical sentences one above the
        other — the "duplicate sentence" defect this screen already went through
        once, and the council's prescription was "explanatory paragraphs 3 → 1".

        In the sheet there is no title, so this line takes that place. So it is not
        deleted; **the caller decides.**
      */}
      <div
        className={`flex items-start gap-3 px-1 ${embedded ? 'justify-end' : 'justify-between'}`}
      >
        {embedded ? null : (
          <p className="min-w-0 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
            {t('intro')}
          </p>
        )}
        <Chip
          size="lg"
          tone="secondary"
          data-testid="app-settings-runtimes-recheck"
          disabled={checking}
          onClick={() => void refresh()}
          className={DETAIL_TOGGLE_CHIP}
        >
          <RefreshCw size={ICON_SIZE.md} aria-hidden />
          {t('recheck')}
        </Chip>
      </div>

      {runtimes === null ? (
        <SettingsGroup>
          <SettingsRow label={t('checking')} control={null} testId="app-settings-runtimes-loading" />
        </SettingsGroup>
      ) : (
        <>
          {ready.some((r) => !isGuardedRuntime(r.id, r.isolated)) ? (
            <p
              data-testid="app-settings-runtimes-guard-note"
              data-guarded-count={guardedNames.length}
              className="break-keep px-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
            >
              {guardedNames.length > 0
                ? t('guardedExplainer', { names: guardedNames.join(' · ') })
                : t('guardedExplainerNone')}
            </p>
          ) : null}
          {/*
            Say what appears on disk (2026-08-17).

            When a conversation starts, Rust creates a config folder for that tool
            inside the app's data directory and **symlinks the user's real
            credential files** into it (`link_credentials` in
            `src-tauri/src/acp.rs`). Isolating them breaks login, and copying
            secrets into the app folder is something the charter forbids, so a link
            is the answer in between — that is right. What was wrong is that
            **no screen said so.**

            The API key pane right beside this explains in two sentences how the key
            is stored. This side, which touches real credential files, staying
            silent does not add up. Gate:
            `tests/contract/acp-disk-disclosure.contract.test.ts`.
          */}
          <p
            data-testid="app-settings-runtimes-disk-note"
            className="break-keep px-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {t('diskNote')}
          </p>
          <SettingsGroup label={t('readyHeading', { count: ready.length })}>
            {ready.length === 0 ? (
              <SettingsRow label={t('noneReady')} caption={t('noneReadyCaption')} control={null} />
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
            <div className="grid min-w-0 gap-1.5">
              <Chip
                size="lg"
                tone="secondary"
                data-testid="app-settings-runtimes-others-toggle"
                aria-expanded={othersOpen || ready.length === 0}
                onClick={() => setOthersOpen((open) => !open)}
                className={DETAIL_TOGGLE_CHIP}
              >
                <ChevronDown
                  size={ICON_SIZE.md}
                  aria-hidden
                  className={
                    othersOpen || ready.length === 0
                      ? 'rotate-180 transition-transform'
                      : 'transition-transform'
                  }
                />
                {ready.length === 0
                  ? t('othersHeadingEmpty', { count: others.length })
                  : t('othersHeading', { count: others.length })}
              </Chip>
              {othersOpen || ready.length === 0 ? (
                <>
                  {/* What 「Cannot Verify」 means is explained only while those rows are visible — someone who has not expanded has nothing to explain. */}
                  {others.some((r) => r.state === 'cli-unknown') ? (
                    <p
                      data-testid="app-settings-runtimes-unknown-note"
                      className="break-keep px-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
                    >
                      {t('unknownExplainer')}
                    </p>
                  ) : null}
                  <SettingsGroup>
                    {others.map((runtime) => (
                      <RuntimeRow
                        key={runtime.id}
                        runtime={runtime}
                        onOpenChat={onOpenChat}
                        onRuntimesChanged={() => void refresh()}
                      />
                    ))}
                  </SettingsGroup>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
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
  const isReady = runtime.state === 'ready';

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
  const website = isReady ? null : runtime.website;

  /*
   * **The doctor is offered only for tools with a gate.** A tool whose isolation
   * was never measured has neither an app-owned configuration nor credential links,
   * so nearly every check comes back as "could not verify" — that is noise, not
   * help. On the web there is neither a process nor a keychain to see, so it is absent.
   */
  const doctor = useAgentDoctor(runtime.id, onRuntimesChanged);
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
        caption={runtime.state === 'login-needed' ? t('loginHint') : undefined}
        testId={`app-settings-runtime-${runtime.id}`}
        icon={runtime.icon}
        iconInk={runtime.brandInk}
        control={
          /* Owner (2026-08-20): *"The buttons are so close together it feels cramped"* — the buttons are so close together it feels cramped. Three controls plus a status badge stand on one row, and at `gap-1.5` (6px) the eye cannot tell where one button ends. Widen by one step on the ramp. */
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
            {isReady && isGuardedRuntime(runtime.id, runtime.isolated) ? (
              <Chip
                size="lg"
                tone="accentOnTint"
                data-testid={`app-settings-runtime-chat-${runtime.id}`}
                onClick={() => onOpenChat(runtime.id)}
                className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
              >
                <MessageSquare size={ICON_SIZE.md} aria-hidden />
                {t('openChat')}
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
            {showDoctor ? doctor.scanButton : null}
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
                  /* The row's third control — the same step as the doctor chips beside it. */
                  size: 'md',
                  tone: 'muted',
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
            <span
              data-runtime-state={runtime.state}
              /*
               * A state, not a control — so it keeps a badge shape rather than growing into a
               * button. But `micro` puts it on the caption ramp, and beside a row of 32px chips the
               * one thing stating whether the tool actually works was the smallest text there.
               * `tag` moves it one step onto the label ramp without pretending it is pressable.
               */
              className={badgeClass({
                shape: 'tag',
                className: cn(
                  'inline-flex items-center gap-1.5 py-0.5',
                  isReady ? READY_INK : NOT_READY_INK,
                ),
              })}
            >
              {isReady ? (
                <span
                  aria-hidden
                  data-testid="app-settings-runtime-ready-dot"
                  className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-status-success)]"
                />
              ) : null}
              {t(`state.${runtime.state}`)}
            </span>
          </span>
        }
      />
      {showDoctor ? <div className="min-w-0 px-3 pb-2.5">{doctor.result}</div> : null}
    </div>
  );
}
