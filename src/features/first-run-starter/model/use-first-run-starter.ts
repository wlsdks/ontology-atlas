import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { useVaultCreateFlow } from '@/features/docs-vault-local';
import {
  FIRST_RUN_STARTER_DISMISSED_KEY,
  readFirstRunStarterDismissed,
  writeFirstRunStarterDismissed,
} from './first-run-starter-dismiss';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { requestAgentChat } from '@/shared/lib/agent-chat-intent';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import type { FailureCopy } from '@/shared/lib/use-failure-sentence';
import { deniedFolderName } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { buildFromCodePrompt } from './build-from-code-prompt';
import type { ProjectVaultLocation } from './project-vault-location';
import { useBuildFromCode } from './use-build-from-code';
import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

/**
 * Logic behind the INDEX "get started" module: dismiss policy, open-folder and create-vault
 * actions, and Escape consumption. `visible` needs `useFirstRunSampleModeSettled()` and
 * `!dismissed`, so a restored vault hides it without extra handling. Escape is registered in the
 * capture phase so `preventDefault()` stops the bubble-phase `topology-esc-ladder` in
 * `HomePage.tsx` (see `topology-esc-ladder.ts`).
 */
export function useFirstRunStarter() {
  const vault = useLocalVault();
  const locale = useLocale();
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [dismissed, setDismissed] = useState(() => readFirstRunStarterDismissed());
  // A vault created from a screen in one language reads in that language.
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault, locale);

  const visible = sampleModeSettled && !dismissed;

  const dismiss = useCallback(() => {
    writeFirstRunStarterDismissed();
    setDismissed(true);
  }, []);

  // Reverses a dismiss within the session, so the guide, sample switch and folder CTA come back.
  const undismiss = useCallback(() => {
    try {
      window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    } catch {
      /* Private mode: revert the state only. */
    }
    setDismissed(false);
  }, []);

  const openFolder = useCallback(async () => {
    setActionError(null);
    await vault.open();
  }, [vault, setActionError]);

  /**
   * The door for someone who already has code. The app never calls MCP, so it hands the analysis
   * to the agent; the map goes inside the project at `<project>/atlas` (see
   * `project-vault-location.ts`), so the flow shows the exact path and waits before writing.
   */
  const build = useBuildFromCode({
    openRecord: vault.openRecent,
    handoff: useCallback((location: ProjectVaultLocation) => {
      // A second guard: the door is not drawn on the web, but a request arriving another way still
      // must not promise a conversation that cannot open.
      if (!isDesktopShell()) return;
      requestAgentChat(null, buildFromCodePrompt(location.projectRoot, null));
    }, []),
  });

  const busy =
    vault.status === 'opening' || vault.status === 'loading' || scaffolding;
  /**
   * Says what can be said about a failure: codes that leave `errorMessage` null or carry only an
   * errno still map to a sentence, as `FirstRunPage` does.
   */
  const t = useTranslations('firstRunStarter');
  const failureSentence = useFailureSentence();
  /*
   * `actionError` is a failure code, not a sentence; see `use-vault-create-flow.ts`.
   */
  const failure: FailureCopy | null =
    actionError !== null
      ? failureSentence(actionError, t('errorFallback'))
      : vault.status === 'error'
        ? vault.errorCode === 'root-rejected'
          ? { sentence: t('errorRootRejected'), detail: null }
          : vault.errorCode === 'path-missing'
            ? { sentence: t('errorPathMissing'), detail: null }
            : vault.errorCode === 'permission-denied'
              // The OS refused; a retry gives the same refusal, so name the folder and the setting.
              ? {
                  sentence: t('errorPermissionDenied', {
                    folder:
                      deniedFolderName(
                        vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null,
                      ) ?? t('errorPermissionDeniedThisFolder'),
                  }),
                  detail: vault.errorMessage,
                }
              /*
               * `access-failed` carries a cause string: the shared lookup recognises OS signatures,
               * and anything else falls back to this card's sentence with the English on `detail`.
               */
              : failureSentence(vault.errorMessage, t('errorFallback'))
        : null;
  const errorText = failure?.sentence ?? null;
  const errorDetail = failure?.detail ?? null;

  useEffect(() => {
    if (!visible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Yield while the guided tour (`src/features/guided-tour`) is open: its Escape closes only the
      // tour (`close-tour` in `topology-esc-ladder.ts`), and this card is beneath the scrim.
      if (document.querySelector('[data-testid="guided-tour-overlay"]') !== null) return;
      // Yield while a modal is open too, so Escape closes only the sheet.
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
    /** The screen must render `build.location` before `confirm`. */
    build,
    /** Only the installed app has an agent to hand work to. */
    canBuildFromCode: isDesktopShell(),
    createVault: handleCreate,
    busy,
    scaffolding,
    /** Always the reader's language, never a thrown message. */
    errorText,
    /** The machine half of the failure, only for `data-failure-detail` or the console. */
    errorDetail,
    /**
     * Browsers without File System Access (Safari, Firefox) degrade the primary CTA before it is
     * pressed; `use-local-vault` sets 'unsupported' after hydration.
     */
    fsaUnsupported: vault.status === 'unsupported',
  };
}
