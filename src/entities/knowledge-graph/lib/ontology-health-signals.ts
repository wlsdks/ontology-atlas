export interface OntologyHealthSignalCandidate {
  slug: string;
  name: string;
}

/** Fan-in at which a node is a promotion candidate; read by node significance. */
export const PROMOTION_MIN_FAN_IN = 4;

export interface OntologyHealthActionTarget {
  slug: string;
  title: string;
  // `island` and `containment` come from the CLI-parity health result and rank first, because the
  // CLI reports `needs_attention` on them.
  kind: "island" | "containment" | "stale" | "orphan" | "promotion";
}

/** One repair target: stale, then orphan, then promotion. */
export function buildOntologyHealthActionTarget({
  stale,
  orphan,
  promotion,
}: {
  stale: readonly OntologyHealthSignalCandidate[];
  orphan: readonly OntologyHealthSignalCandidate[];
  promotion: readonly OntologyHealthSignalCandidate[];
}): OntologyHealthActionTarget | null {
  const firstStale = stale[0];
  if (firstStale) {
    return { slug: firstStale.slug, title: firstStale.name, kind: "stale" };
  }

  const firstOrphan = orphan[0];
  if (firstOrphan) {
    return { slug: firstOrphan.slug, title: firstOrphan.name, kind: "orphan" };
  }

  const firstPromotion = promotion[0];
  if (firstPromotion) {
    return { slug: firstPromotion.slug, title: firstPromotion.name, kind: "promotion" };
  }

  return null;
}
