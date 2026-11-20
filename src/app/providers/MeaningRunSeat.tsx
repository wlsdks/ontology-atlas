"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import { useVectorRun, useVectorRunStageShown, type VectorRun } from "@/features/vault-vectors";
import { workRuns, type CountedRunObservation } from "@/features/work-run";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { navigateWithViewTransition } from "@/shared/lib/navigation/route-view-transition";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/tauri-vault-fs";

/** The Wiki desk, where a question is asked and a failed preparation is fixed. */
const WIKI_DESK_HREF = `${DESTINATION_HREF.library}?tab=wiki`;
/** Long enough for the Library to open a large folder's desk; the field is focused once drawn. */
const DESK_FIELD_WAIT_MS = 4_000;

function observationOf(run: VectorRun | null): CountedRunObservation | null {
  if (run === null) return null;
  const phase = run.phase === "stopped" && run.failure !== null ? "failed" : run.phase;
  if (phase === "off" || phase === "notSetUp") return null;
  return {
    phase,
    updating: run.updating,
    quiet: run.quiet,
    filesDone: run.filesDone,
    filesTotal: run.filesTotal,
    bytes: run.model ? { done: run.model.doneBytes, total: run.model.totalBytes } : null,
    reading: run.currentPath,
    minutesLeft: run.minutesLeft,
    failure: run.failure,
    pressed: run.pressed,
  };
}

/** Puts focus in the desk's question field as soon as the Library draws it, so the person types. */
function focusDeskFieldWhenDrawn() {
  const field = () => document.querySelector<HTMLInputElement>('#main [data-testid="question-desk-input"]');
  const focus = () => {
    const input = field();
    if (!input || input.getClientRects().length === 0) return false;
    input.focus({ preventScroll: false });
    return true;
  };
  if (focus()) return;
  const observer = new MutationObserver(() => {
    if (focus()) stop();
  });
  const deadline = window.setTimeout(() => stop(), DESK_FIELD_WAIT_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(deadline);
  }
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
}

/**
 * Carries the open folder's search-by-meaning job into the long-work seat. It reads the job where
 * the vector store keeps it, tells the seat when the desk's own line stands on screen, and gives
 * the card its Stop and its doors. A job for another folder keeps running in the app's process;
 * its card returns as it was left when that folder opens again. Draws nothing itself.
 */
export function MeaningRunSeat() {
  const vault = useLocalVault();
  const folder = useVaultSessionIdentityScope();
  const rootPath = vault.handle ? (getTauriVaultRootPath(vault.handle) ?? null) : null;
  const run = useVectorRun(rootPath);
  const stageShown = useVectorRunStageShown(rootPath);
  const router = useRouter();

  useEffect(() => {
    workRuns.observeCounted(folder, observationOf(run), stageShown, Date.now());
  }, [folder, run, stageShown]);

  const stop = run?.stop ?? null;
  useEffect(() => {
    workRuns.setCountedStop(stop);
  }, [stop]);
  useEffect(() => () => workRuns.setCountedStop(null), []);

  useEffect(() => {
    workRuns.setCountedDoor((kind) => {
      navigateWithViewTransition(() => router.push(WIKI_DESK_HREF));
      if (kind === "ask") focusDeskFieldWhenDrawn();
    });
    return () => workRuns.setCountedDoor(null);
  }, [router]);

  return null;
}
