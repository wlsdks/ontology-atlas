/**
 * The containment tables of the vault schema (spec §5): the list named for a kind, and which kinds may
 * keep it. `vault-schema.contract.test.ts` holds both answers over every kind pair to the answers
 * recorded from the script server. When a document changes kind, an entry naming it moves
 * to the list for its new kind only if the referrer's kind may keep that list; nothing is guessed.
 */
export type ContainmentKey = "domains" | "capabilities" | "elements";

export const CONTAINMENT_KEYS: readonly ContainmentKey[] = ["domains", "capabilities", "elements"];

const KEY_FOR_KIND: Readonly<Record<string, ContainmentKey>> = {
  domain: "domains",
  capability: "capabilities",
  element: "elements",
};

const HOLDER_KINDS: Readonly<Record<ContainmentKey, readonly string[]>> = {
  domains: ["project"],
  capabilities: ["project", "domain"],
  elements: ["project", "domain", "capability"],
};

/** The list a node of `holderKind` keeps a `childKind` node in, or null when it keeps none. */
export function containmentKeyFor(
  holderKind: string | null | undefined,
  childKind: string | null | undefined,
): ContainmentKey | null {
  if (!holderKind || !childKind) return null;
  const key = KEY_FOR_KIND[childKind];
  if (!key) return null;
  return HOLDER_KINDS[key].includes(holderKind) ? key : null;
}

/** The list named for a kind (`capability` → `capabilities`), or null for a kind no list holds. */
export function containmentKeyForKind(kind: string | null | undefined): ContainmentKey | null {
  return (kind && KEY_FOR_KIND[kind]) || null;
}

/** The kind a list named for a kind holds (`capabilities` → `capability`), or null. */
export function kindForContainmentKey(key: string): string | null {
  for (const [kind, listKey] of Object.entries(KEY_FOR_KIND)) {
    if (listKey === key) return kind;
  }
  return null;
}
