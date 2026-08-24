import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault, useVaultCreateFlow } from '@/features/docs-vault-local';
import {
  FIRST_RUN_STARTER_DISMISSED_KEY,
  readFirstRunStarterDismissed,
  writeFirstRunStarterDismissed,
} from './first-run-starter-dismiss';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { requestAgentChat } from '@/shared/lib/agent-chat-intent';
import { buildFromCodePrompt } from './build-from-code-prompt';
import type { ProjectVaultLocation } from './project-vault-location';
import { useBuildFromCode } from './use-build-from-code';
import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

/**
 * All the logic behind the INDEX panel's "get started" module
 * (`FirstRunStarterModule`) — dismiss policy, the open-folder and create-vault
 * actions, and Escape consumption — encapsulated away from the markup, so the
 * module only consumes this hook and needs to know nothing about JSX.
 *
 * **Revisit contract**: `visible` requires both
 * `useFirstRunSampleModeSettled()` (static mode plus a completed restore
 * attempt) and `!dismissed`. When an existing vault restores, the mode becomes
 * 'local' and `visible` turns false automatically, with no extra handling.
 *
 * **Escape priority**: registered on `window` in the CAPTURE phase. Capture
 * always runs before bubble in the DOM event flow (regardless of registration
 * order), so this keydown always arrives before `HomePage.tsx`'s
 * `topology-esc-ladder` (bubble phase, `window`). Calling
 * `event.preventDefault()` makes the ladder's handler stop immediately at
 * `if (event.defaultPrevented) return;` — the same trick Radix
 * `DismissableLayer` uses to compete with the map's popovers and search (see the
 * header comment in `topology-esc-ladder.ts`).
 */
export function useFirstRunStarter() {
  const vault = useLocalVault();
  const locale = useLocale();
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [dismissed, setDismissed] = useState(() => readFirstRunStarterDismissed());
  // A vault created from a screen in one language must read in that language —
  // the same contract as the checklist and docs CTAs (walkthrough 2026-07-26).
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault, locale);

  const visible = sampleModeSettled && !dismissed;

  const dismiss = useCallback(() => {
    writeFirstRunStarterDismissed();
    setDismissed(true);
  }, []);

  // Back to the guide (owner report from real use, 2026-07-24) — closing the card
  // with "I'll look around here" and browsing the sample left no way back to the
  // start of that session (the starter guide, the sample switch, the folder CTA).
  // This is the explicit path that reverses a dismiss within the session.
  const undismiss = useCallback(() => {
    try {
      window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    } catch {
      /* Private mode — revert the state only. */
    }
    setDismissed(false);
  }, []);

  const openFolder = useCallback(async () => {
    setActionError(null);
    await vault.open();
  }, [vault, setActionError]);

  /**
   * **The door for someone who already has code** (decision, 2026-08-24; location revised the
   * same day).
   *
   * ⚠️ Measured on the shipped card: of its four actions, none makes an ontology from a repository
   * that already exists. Opening a folder with no Markdown gives an empty map; creating one gives
   * five seeded examples. The only real path was the folded terminal row, whose own copy tells app
   * users it excludes them.
   *
   * The app cannot do the analysis itself — it never calls MCP, that being the agents' surface —
   * so this hands the work to the agent, which is the shape this product argues for anyway: the
   * agent works through MCP and the person approves every write.
   *
   * **What changed on 2026-08-24**: the door used to ask for a *vault* folder and hand it over. It
   * now asks for the *project* and puts the map inside it, at `<project>/atlas`, so the code and its
   * meaning travel together in one repository — see `project-vault-location.ts` for why that is the
   * only version that keeps the product's central claim. Because that writes into somebody's source
   * tree, the flow gained a middle step that shows the exact path and waits.
   */
  const build = useBuildFromCode({
    openRecord: vault.openRecent,
    handoff: useCallback((location: ProjectVaultLocation) => {
      // A second guard, not the only one: the door is not drawn on the web at all, but a request
      // that arrived some other way still must not promise a conversation that cannot open.
      if (!isDesktopShell()) return;
      requestAgentChat(null, buildFromCodePrompt(location.projectRoot, null));
    }, []),
  });

  const busy =
    vault.status === 'opening' || vault.status === 'loading' || scaffolding;
  /**
   * **Say whatever can be said about what went wrong.**
   *
   * ⚠️ This used to read `vault.errorMessage` alone. But "not a valid root",
   * "folder is gone", and "no permission" **deliberately leave that value
   * `null`** so the raw string is not leaked to the screen. So all three became
   * states where this card **said nothing at all** (review 2026-08-16). Silence
   * on screen while the code knows the meaning is worse than leaking the raw string.
   *
   * The neighbouring screen (`FirstRunPage`) already handled these branches — two
   * screens were answering the same fact differently.
   */
  const t = useTranslations('firstRunStarter');
  const errorText =
    actionError !== null
      ? actionError
      : vault.status === 'error'
        ? (vault.errorCode === 'root-rejected'
            ? t('errorRootRejected')
            : vault.errorCode === 'path-missing'
              ? t('errorPathMissing')
              : vault.errorMessage) ?? ''
        : null;

  useEffect(() => {
    if (!visible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Yield while the guided tour (`src/features/guided-tour`) is open (measured
      // correction 2026-07-23) — the tour's Escape contract is "close only the tour"
      // (the `close-tour` rung of `topology-esc-ladder.ts`), but this capture handler
      // ran before the bubble ladder, swallowed Escape, and permanently dismissed a
      // first-run card that was **not even visible** (beneath the tour scrim). The
      // tour overlay's presence in the DOM is the signal — while the card is covered
      // by the scrim it is not the topmost surface and has no claim on Escape.
      if (document.querySelector('[data-testid="guided-tour-overlay"]') !== null) return;
      // Yield the same way while a modal is open (the guidance sheet, the agent
      // connect sheet, and so on). Measured in QA 2026-07-24: pressing Escape in a
      // sheet should close only the sheet, but this capture handler ran first and
      // permanently dismissed a first-run card that was not even visible.
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [visible, dismiss]);

  return {
    visible,
    dismissed,
    sampleModeSettled,
    dismiss,
    undismiss,
    openFolder,
    /** The choose → see the path → create flow. The screen must render `build.location` before `confirm`. */
    build,
    /** Only the installed app can hand work to an agent; the web has none to hand it to. */
    canBuildFromCode: isDesktopShell(),
    createVault: handleCreate,
    busy,
    scaffolding,
    errorText,
    /**
     * Detects a browser without File System Access (Safari, Firefox). Both open-folder
     * and create-vault use FSA, so when unsupported the primary CTA is degraded
     * honestly **up front** rather than "failing only once pressed" (the module
     * consumes this). It only reads the existing state `use-local-vault` switches to
     * 'unsupported' after hydration for SSR consistency.
     */
    fsaUnsupported: vault.status === 'unsupported',
  };
}
