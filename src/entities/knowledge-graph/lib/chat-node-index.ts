/**
 * Maps a name that appeared in chat to a node on the map. **Needed because there
 * are two namespaces.**
 *
 * Observed in the installed app, 2026-08-17. Asked codex *"이 폴더에 있는 개념들의
 * slug 를 전부 알려줘"* (list every concept slug in this folder), it answered:
 *
 * ```
 * project
 * domains/example-domain
 * capabilities/example-capability
 * elements/example-element
 * ```
 *
 * Hovering those strings changed **zero pixels** on the map (instrument check:
 * hovering a button the same way changes 2430 pixels, so hover itself was firing).
 *
 * The chat was building its list of recognizable names out of **internal map ids**:
 *
 * | | Looks like | Who uses it |
 * |---|---|---|
 * | map node id | `domain:example-domain` | canvas, selection, hover |
 * | agent slug | `domains/example-domain` | **what the agent writes and reads** |
 *
 * The two can **never** coincide — `derive-ontology-from-vault.ts` builds ids as
 * `` `${kind}:${idSlug}` ``. So no name in chat ever matched, and the feature was
 * wired but dead.
 *
 * Why no gate caught it: the panel's test passed
 * `knownSlugs={new Set(['capabilities/invoice', …])}` **directly** — handing it the
 * agent namespace by hand. The panel worked perfectly with those names, so it was
 * green. The wrong place was not the panel but **where the screen builds that list**,
 * and there was no test there.
 *
 * > Where two namespaces meet without a gate, both sides stay correct in their own
 * > names and never meet.
 *
 * So that place is extracted as a pure function. `chat-node-index.test.ts` starts by
 * asserting **the two names really are different** — if they ever converge this test
 * measures nothing, and it should fail that day.
 */

import type { KnowledgeGraphNode } from '../model/types';

/**
 * The names to pick out of chat text, each mapped to the map node id it means.
 *
 * **The agent's name goes in first.** The map id is included too because it is free
 * (same string as key and value) and because an agent that happens to copy an id
 * verbatim should match rather than silently miss.
 */
export function buildChatNodeIndex(
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const node of nodes ?? []) {
    if (typeof node?.id !== 'string' || node.id.length === 0) continue;
    // The map id must not claim the slot first — later writes do not overwrite, so
    // the agent name is inserted **first**.
    const agentSlug = typeof node.agentSlug === 'string' ? node.agentSlug.trim() : '';
    if (agentSlug.length > 0 && !index.has(agentSlug)) index.set(agentSlug, node.id);
    if (!index.has(node.id)) index.set(node.id, node.id);
  }
  return index;
}
