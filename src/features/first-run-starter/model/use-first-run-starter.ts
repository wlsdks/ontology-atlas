import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useLocalVault } from '@/entities/vault-session';
import { useVaultCreateFlow } from '@/features/docs-vault-local';
import {
  FIRST_RUN_STARTER_DISMISSED_KEY,
  readFirstRunStarterDismissed,
  writeFirstRunStarterDismissed,
} from './first-run-starter-dismiss';
import { requestAgentChat } from '@/shared/lib/agent-chat/agent-chat-intent';
import { useFailureSentence } from '@/shared/lib/failures/use-failure-sentence';
import type { FailureCopy } from '@/shared/lib/failures/use-failure-sentence';
import { deniedFolderName } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { buildFromCodePrompt } from './build-from-code-prompt';
import type { ProjectVaultLocation } from './project-vault-location';
import { useBuildFromCode } from './use-build-from-code';
import { useFirstRunNoFolderSettled } from './use-first-run-no-folder-settled';

/** `visible` needs `useFirstRunNoFolderSettled()` and `!dismissed`. Escape is registered in the capture phase so `preventDefault()` stops the bubble-phase `topology-esc-ladder` in `HomePage.tsx`. */
export function useFirstRunStarter({ mapSelectionActive = false }: { mapSelectionActive?: boolean } = {}) {
  const vault = useLocalVault();
  const locale = useLocale();
  const noFolderSettled = useFirstRunNoFolderSettled();
  const [dismissed, setDismissed] = useState(() => readFirstRunStarterDismissed());
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault, locale);

  const visible = noFolderSettled && !dismissed;

  const dismiss = useCallback(() => {
    writeFirstRunStarterDismissed();
    setDismissed(true);
  }, []);

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

  /** The app never calls MCP, so the door hands the analysis to the agent; the map goes inside the project at `<project>/atlas`, so the flow shows the exact path and waits before writing. */
  const build = useBuildFromCode({
    openRecord: vault.openRecent,
    handoff: useCallback((location: ProjectVaultLocation) => {
      requestAgentChat(null, buildFromCodePrompt(location.projectRoot, null));
    }, []),
  });

  const busy =
    vault.status === 'opening' || vault.status === 'loading' || scaffolding;
  /** Codes that leave `errorMessage` null or carry only an errno still map to a sentence. */
  const t = useTranslations('firstRunStarter');
  const failureSentence = useFailureSentence();
  const failure: FailureCopy | null =
    actionError !== null
      ? failureSentence(actionError, t('errorFallback'))
      : vault.status === 'error'
        ? vault.errorCode === 'root-rejected'
          ? { sentence: t('errorRootRejected'), detail: null }
          : vault.errorCode === 'grant-needed'
            ? { sentence: t('errorGrantNeeded'), detail: null }
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
              /* `access-failed` carries a cause string: the shared lookup recognises OS signatures, and anything else falls back to this card's sentence with the English on `detail`. */
              : failureSentence(vault.errorMessage, t('errorFallback'))
        : null;
  const errorText = failure?.sentence ?? null;
  const errorDetail = failure?.detail ?? null;

  useEffect(() => {
    // Escape belongs first to a map selection, a modal or an edge panel.
    if (!visible || mapSelectionActive) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[data-testid="map-edge-panel"], [role="dialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [visible, mapSelectionActive, dismiss]);

  return {
    visible,
    dismissed,
    noFolderSettled,
    dismiss,
    undismiss,
    openFolder,
    /** The screen must render `build.location` before `confirm`. */
    build,
    createVault: handleCreate,
    busy,
    scaffolding,
    /** Always the reader's language, never a thrown message. */
    errorText,
    errorDetail,
  };
}
