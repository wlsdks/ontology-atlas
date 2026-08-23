/**
 * The one address for the agent graph workflow document.
 *
 * **Why a constant.** The link lives on two surfaces, and writing it twice split
 * it: one carried `?source=server&sample=dogfood&…`, naming *which vault* the
 * document is in, while the other passed only `?slug=`. The second therefore
 * looked the slug up in whatever vault was open (by default the sample shop),
 * did not find it, and opened something else. Measured during the 2026-08-01 rc.5
 * review: someone trying to connect an agent landed on the demo shop's "Account Deletion" document, with nothing on screen saying the intended
 * document had not been found.
 *
 * This document exists only in **this repository's own vault** — not in the
 * sample vault, and certainly not in an arbitrary vault a user opened. So the
 * address is only true when it names the vault too; a bare slug assumes the
 * document is "somewhere", and that assumption is wrong by default.
 */
export const AGENT_GRAPH_WORKFLOW_HREF =
  '/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW';
