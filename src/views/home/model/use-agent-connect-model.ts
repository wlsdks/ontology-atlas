"use client";

import { useMemo } from "react";

/**
 * **Is an agent attached right now** — reads one heartbeat line as a status.
 *
 * Until 2026-08-21 this file assembled the whole "connect an AI agent" sheet
 * (heartbeat → status, vault handle → registration snippet, insight → domain
 * names). The sheet retired into a destination (decision ledger 90), leaving
 * the snippet and domain names with zero consumers; registration setup is now
 * built by the destination's `VaultAgentSetupPanel`.
 */

interface AgentHeartbeatStatus {
  valid?: boolean;
  stale?: boolean;
  heartbeat?: {
    updatedAt: string;
    agent?: string | null;
    focus: { ontologySlug: string | null };
  } | null;
}

/**
 * Agent connection status — read by the rail tile and the "Updated with AI"
 * branch. It moved here from `widgets/agent-connect` when that widget retired
 * (2026-08-21, decision ledger 90): the sheet is gone, the question "is one
 * attached right now" is not.
 */
type AgentConnectState =
  | { kind: "connected" }
  | { kind: "stale" }
  | { kind: "none" };

/**
 * Four arguments were removed on 2026-08-21 (decision ledger 90):
 * `vaultHandle` · `insightNodes` · `defaultAgentLabel` · `serverAvailability`.
 * All four fed things the retired sheet drew, and their read count went to
 * zero.
 *
 * Answering "is one attached right now" needs the heartbeat alone. **A
 * function that takes arguments it does not use puts a duty on its callers
 * that does not exist** — HomePage kept computing those four just to pass
 * them.
 */
export interface UseAgentConnectModelArgs {
  agentActivityStatus: AgentHeartbeatStatus | null;
}

/**
 * The model shrank with the sheet (2026-08-21, decision ledger 90). It used to
 * carry open state (`open`/`openSheet`/`closeSheet`), setup snippets and
 * domain titles, all of them the sheet's; `VaultAgentSetupPanel` owns those
 * now. One question is left: **is an agent attached right now.**
 */
export interface AgentConnectModel {
  status: AgentConnectState;
}

export function useAgentConnectModel({
  agentActivityStatus,
}: UseAgentConnectModelArgs): AgentConnectModel {

  /*
   * `agoLabel` · `agentLabel` · `focusTitle` were removed on 2026-08-21
   * (decision ledger 90) — the connect sheet was their only reader, and a full
   * consumer search after it retired found 0.
   *
   * `agoLabel` in particular was computed from the `nowMs` stamped when the
   * sheet **opened**, so with the sheet closed the reference time was `0` and
   * the value meant nothing off-screen. Leaving a dead value behind invites
   * the next person to render "N minutes ago" from it — and get the time since
   * 1970.
   */
  const status = useMemo<AgentConnectState>(() => {
    const hb = agentActivityStatus?.heartbeat ?? null;
    if (!hb || !agentActivityStatus?.valid) return { kind: "none" };
    if (agentActivityStatus.stale) return { kind: "stale" };
    return { kind: "connected" };
  }, [agentActivityStatus]);

  return { status };
}
