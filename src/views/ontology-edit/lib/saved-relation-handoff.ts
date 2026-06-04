import {
  inferVaultRelationKey,
  type VaultRelationKey,
  type VaultRelationProposal,
} from "./relation-proposal";

export interface PersistedRelationEndpoint {
  slug: string;
  kind: string;
}

export type SavedRelationHandoff = VaultRelationProposal & {
  selectedKey: VaultRelationKey;
};

export function buildSavedRelationHandoff({
  source,
  target,
  selectedKey,
}: {
  source: PersistedRelationEndpoint;
  target: PersistedRelationEndpoint;
  selectedKey?: VaultRelationKey;
}): SavedRelationHandoff {
  const inferredKey = inferVaultRelationKey(source.kind, target.kind);
  return {
    sourceSlug: source.slug,
    targetSlug: target.slug,
    sourceKind: source.kind,
    targetKind: target.kind,
    inferredKey,
    selectedKey: selectedKey ?? inferredKey,
  };
}
