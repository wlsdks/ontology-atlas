import type { SavedConstellation } from './use-saved-constellations';

/**
 * Builds a visible handoff that names the saved scope without turning its
 * user-authored purpose or membership into ontology facts.
 */
export function buildConstellationAgentPrompt(
  saved: SavedConstellation,
  options: { vaultPath?: string | null } = {},
): string {
  const purpose = saved.folder.purpose?.trim() || 'unknown';
  const memberUids = saved.items.flatMap((item) => item.target.kind === 'ontology' ? [item.target.uid] : []);
  return [
    `Review saved constellation "${saved.folder.name}" (id: ${saved.folder.id}).`,
    ...(options.vaultPath ? [`Vault path: ${options.vaultPath}.`] : []),
    `Prepared snapshot updatedAt: ${saved.folder.updatedAt ?? 'unknown'}.`,
    `Prepared snapshot member UIDs: ${memberUids.length > 0 ? memberUids.join(', ') : '(none)'}.`,
    `User-stated purpose: ${purpose}.`,
    `Call get_constellation with id "${saved.folder.id}" to resolve its current members by UID.`,
    'Compare its updatedAt and member UIDs with the prepared snapshot above. If they differ, stop and show the change before expanding or changing scope.',
    'Treat membership as a saved collection, not as an ontology relation or proof of completeness.',
    'Keep missing or ambiguous members unresolved; do not retarget by name or path.',
    'Check current graph facts, review state, relation evidence, and relevant dependencies outside the saved set separately.',
    'Report evidence, uncertainties, and any correction or deferral before proposing changes. Do not write without explicit approval.',
  ].join('\n');
}
