import type { SigmaNodeAttrs } from "./graph-build";

/**
 * Owner tint is an overlay for project ownership, not ontology identity.
 * Ontology nodes keep their kind hue so project/domain/capability/element stays
 * readable even when the owner overlay is enabled.
 */
export function applyOwnerTintOverlay<T extends Pick<SigmaNodeAttrs, "color" | "isHub" | "isOntology" | "ownerKey">>(
  attrs: T,
  resolveTone: (ownerKey: string) => string,
): T {
  if (attrs.isHub || attrs.isOntology) return attrs;
  return {
    ...attrs,
    color: resolveTone(attrs.ownerKey),
  };
}
