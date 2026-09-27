/**
 * Chat names → map node ids. Agents write `domains/x` while map ids are `domain:x`, so the two
 * namespaces never coincide; the test asserts they differ.
 */

import type { KnowledgeGraphNode } from '../model/types';

/** Agent names first; map ids are added too so an agent copying one still matches. */
export function buildChatNodeIndex(
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const node of nodes ?? []) {
    if (typeof node?.id !== 'string' || node.id.length === 0) continue;
    // Earlier writes win, so the agent name goes in first.
    const agentSlug = typeof node.agentSlug === 'string' ? node.agentSlug.trim() : '';
    if (agentSlug.length > 0 && !index.has(agentSlug)) index.set(agentSlug, node.id);
    if (!index.has(node.id)) index.set(node.id, node.id);
  }
  return index;
}
