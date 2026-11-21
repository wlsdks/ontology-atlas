import type { Dispatch, RefObject, SetStateAction } from 'react';

import {
  applyCurrentMode,
  type AcpClient,
  type AcpSessionChoices,
  type AcpSessionSummary,
} from '../acp-client';
import type { AcpEvent } from '../conversation/acp-events';
import { GATED_SESSION_MODE } from '../runtime-wiring/runtime-gate';
import { sessionSystemPrompt } from '../runtime-wiring/vault-handoff-prompt';
import { vaultWriteConsentOn } from '../runtime-wiring/vault-mcp-server';
import { modeKeepsGate } from '../session-choices/mode-safety';
import { rememberedModel } from '../session-choices/remembered-choices';
import { latestSession, orderSessionsByRecency } from '../session-recency';

export interface SessionOpening {
  client: AcpClient;
  runtimeId: string;
  vaultRoot: string;
  mcpServers: unknown[] | undefined;
  hasVaultMcp: boolean;
  locale: string;
  rememberChoices: boolean;
  isStale: () => boolean;
  resumeIdRef: RefObject<string | null>;
  resumeLatestRef: RefObject<boolean>;
  freshRequestedRef: RefObject<boolean>;
  disposedRef: RefObject<boolean>;
  idleStoppedSessionIdRef: RefObject<string | null>;
  systemPromptAppendixRef: RefObject<string | null>;
  sessionIdRef: RefObject<string | null>;
  sessionConsentRef: RefObject<boolean>;
  latestUserRequestRef: RefObject<string | null>;
  setSessions: Dispatch<SetStateAction<AcpSessionSummary[]>>;
  updateEvents: (update: (previous: AcpEvent[]) => AcpEvent[]) => void;
  keepDiagnostic: (line: string) => void;
}

export interface OpenedSession {
  choices: AcpSessionChoices;
  /** The mode the session opened in when that mode removes the permission gate; null when the gate stands. */
  gateRemovedMode: string | null;
}

/** The kept model, only when this adapter offers it and the session is not already on it. */
export function keptModelToApply(choices: AcpSessionChoices, keptModelId: string | null): string | null {
  if (keptModelId === null || keptModelId === choices.currentModelId) return null;
  return choices.models.some((model) => model.id === keptModelId) ? keptModelId : null;
}

/**
 * Resumes or creates the conversation on a client that has finished its handshake, then applies
 * the kept model and raises the permission gate. Null when a newer start superseded this one.
 * Throws when the gate cannot be raised: ready with no gate would make "outside the folder, we ask
 * first" a lie.
 */
export async function openSession(opening: SessionOpening): Promise<OpenedSession | null> {
  const {
    client,
    runtimeId,
    vaultRoot,
    mcpServers,
    hasVaultMcp,
    locale,
    rememberChoices,
    isStale,
    resumeIdRef,
    resumeLatestRef,
    freshRequestedRef,
    disposedRef,
    idleStoppedSessionIdRef,
    systemPromptAppendixRef,
    sessionIdRef,
    sessionConsentRef,
    latestUserRequestRef,
    setSessions,
    updateEvents,
    keepDiagnostic,
  } = opening;
  // Read before the session is created: only that order changes which one is created. An adapter
  // without `session/list` yields an empty list and falls to `newSession`.
  if (!resumeIdRef.current && resumeLatestRef.current && !freshRequestedRef.current) {
    const known = await client.listSessions(vaultRoot).catch(() => [] as AcpSessionSummary[]);
    if (!isStale()) {
      const ordered = orderSessionsByRecency(known);
      if (!disposedRef.current) setSessions(ordered);
      resumeIdRef.current = latestSession(ordered)?.sessionId ?? null;
    }
  }
  let session: { sessionId: string; choices: AcpSessionChoices } | null = null;
  if (resumeIdRef.current) {
    try {
      session = await client.loadSession({
        sessionId: resumeIdRef.current,
        cwd: vaultRoot,
        mcpServers,
        appendSystemPrompt: sessionSystemPrompt(hasVaultMcp, locale, systemPromptAppendixRef.current),
      });
    } catch {
      keepDiagnostic('resume-failed');
    }
    resumeIdRef.current = null;
  }
  session ??= await client.newSession({
    cwd: vaultRoot,
    mcpServers,
    appendSystemPrompt: sessionSystemPrompt(hasVaultMcp, locale, systemPromptAppendixRef.current),
  });
  if (idleStoppedSessionIdRef.current !== null && idleStoppedSessionIdRef.current !== session.sessionId) {
    updateEvents(() => []);
    latestUserRequestRef.current = null;
  }
  idleStoppedSessionIdRef.current = null;
  sessionIdRef.current = session.sessionId;
  sessionConsentRef.current = vaultWriteConsentOn(mcpServers);

  let choices = session.choices;
  // Before the gate below, so the gated mode is the last thing this start applies.
  const keptModelId = keptModelToApply(choices, rememberChoices ? rememberedModel(vaultRoot, runtimeId) : null);
  if (keptModelId !== null && await client.setModel(session.sessionId, keptModelId)) {
    choices = { ...choices, currentModelId: keptModelId };
  }
  // `setModel` swallows the rejection a stop causes, so a superseded start ends here.
  if (isStale()) return null;

  // Raise the permission gate: codex is held only by session mode, applied to measured runtimes
  // (`runtime-gate.ts`). On failure the conversation is not opened.
  const gatedMode = GATED_SESSION_MODE[runtimeId];
  if (gatedMode) {
    if (await client.setMode(session.sessionId, gatedMode)) {
      // `session/new` answered from before the mode was applied; the dropdown would show a stale value.
      choices = { ...choices, currentModeId: gatedMode };
    } else {
      const failure = `gate-mode-failed:${gatedMode}`;
      keepDiagnostic(failure);
      throw new Error(failure);
    }
  }

  // A resumed `session/load` can start in a mode the filter hides. Runs after the gate: the
  // applied mode is where the session is.
  const openingMode = choices.currentModeId;
  const openedWithoutGate = openingMode !== null && !modeKeepsGate(openingMode);
  if (openingMode !== null) choices = applyCurrentMode(choices, openingMode);
  return { choices, gateRemovedMode: openedWithoutGate ? openingMode : null };
}
