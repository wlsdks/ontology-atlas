import { josa, type JosaKind } from "@/shared/lib/ko-josa";

/**
 * The relation popover's one sentence: its key and interpolated values. Relation types fold onto
 * five keys; endpoint names match the map labels, so sentence and nodes say the same word. Korean
 * particles are picked from each name by `@/shared/lib/ko-josa`, since a fixed particle breaks
 * after a final consonant.
 */
export type EdgeSentenceKey = "contains" | "depends" | "describes" | "belongsTo" | "related";

export function normalizeEdgeSentenceKey(type: string): EdgeSentenceKey {
  if (type === "dependencies" || type === "depends_on") return "depends";
  if (type === "contains" || type === "elements" || type === "capabilities" || type === "domains" || type === "domain") return "contains";
  if (type === "describes") return "describes";
  if (type === "belongs_to") return "belongsTo";
  return "related";
}

/** [particle after `from`, particle after `to`]. */
const PARTICLES: Record<EdgeSentenceKey, [JosaKind, JosaKind | null]> = {
  contains: ["subject", "object"],
  depends: ["subject", null],
  describes: ["subject", null],
  belongsTo: ["topic", null],
  related: ["with", "subject"],
};

/** A type alias, not an interface: next-intl's values parameter needs the implicit index signature. */
export type EdgeSentenceValues = {
  from: string;
  to: string;
  fromJosa: string;
  toJosa: string;
};

export function edgeSentenceValues(key: EdgeSentenceKey, from: string, to: string): EdgeSentenceValues {
  const [fromKind, toKind] = PARTICLES[key];
  return {
    from,
    to,
    fromJosa: josa(from, fromKind),
    toJosa: toKind === null ? "" : josa(to, toKind),
  };
}
