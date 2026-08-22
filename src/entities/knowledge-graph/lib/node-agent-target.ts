import type { KnowledgeGraphNode } from "../model/types";

/**
 * The single source for the one name to hand an agent for a node.
 *
 * Why it must be one place (measured 2026-07-26): an MCP call the screen offers to
 * copy exists to work when pasted. Each surface was inlining
 * `node.evidenceIds[0]`, which differed from the agent's name for two reasons:
 *
 * 1. **Different vault roots.** The bundled dogfood manifest is built with `docs/`
 *    as its root, so ontology doc slugs read `ontology/elements/…`, while the vault
 *    root this repository hands an agent is `docs/ontology`. Insights' "verify with
 *    an agent" therefore copied
 *    `merge_concepts({fromSlug:"ontology/elements/topology-ontology-drawer-model"…})`,
 *    which failed on execution — one leading segment.
 * 2. **On a node with no document it is someone else's name.** A derived node's
 *    `evidenceIds[0]` is the slug of *another document that cited it*. Passing it
 *    through has the agent edit the wrong document.
 *
 * So surfaces do not decide this themselves; the answer comes only from here. With
 * no document it returns `documented: false` plus the reference string the vault
 * wrote, so the caller can write a handoff that does not hide the fact that the
 * document has to be created first.
 */
export interface NodeAgentTarget {
  /**
   * The name MCP and the CLI accept verbatim: the vault-root-relative doc slug for a
   * document node, or the reference string the vault wrote for one without a
   * document. Null when neither exists.
   */
  ref: string | null;
  /**
   * Whether this name can be read and written. When `false`, `add_concept` must
   * create the document before `patch_concept` / `merge_concepts` / `get_concept`
   * will work.
   */
  documented: boolean;
}

type AgentTargetInput = {
  evidenceIds?: readonly string[];
} & Pick<KnowledgeGraphNode, "hasOwnDocument" | "agentSlug" | "ref">;

export function resolveNodeAgentTarget(
  node: AgentTargetInput | null | undefined,
): NodeAgentTarget {
  if (!node) return { ref: null, documented: false };
  // Backwards compatibility: production paths that do not fill `hasOwnDocument`
  // (test fixtures, hand assembly) still read as document nodes.
  const documented = node.hasOwnDocument !== false;
  if (!documented) {
    const derivedRef = node.ref?.trim();
    return { ref: derivedRef || null, documented: false };
  }
  const explicit = node.agentSlug?.trim();
  if (explicit) return { ref: explicit, documented: true };
  const fallback = node.evidenceIds?.[0]?.trim();
  return { ref: fallback || null, documented: true };
}

/**
 * The segment left on ontology doc slugs because the bundled dogfood manifest is
 * built with `docs/` as its root. This is a **fact about this repository's build
 * output**, not a guess about a user's vault — a user who opens their own folder has
 * that folder as the vault root, with nothing to strip, which is why local mode
 * passes no prefix.
 */
export function stripVaultSlugPrefix(slug: string, prefix: string | undefined): string {
  if (!prefix) return slug;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}
