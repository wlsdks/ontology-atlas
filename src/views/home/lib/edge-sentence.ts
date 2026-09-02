import { josa, type JosaKind } from "@/shared/lib/ko-josa";

/**
 * The relation popover's one sentence — key and the values it interpolates.
 *
 * Relation types fold onto five sentence keys (synonyms such as `elements`,
 * `capabilities` and `domains` all read as "contains"). The endpoint names are
 * whatever the map labels them (`display_<locale>` before the canonical title),
 * so the sentence and the two nodes under it say the same word.
 *
 * Korean particles (2026-09-03). The Korean messages used to carry fixed
 * particles with a space in front of them, which reads as broken Korean after a
 * name ending in a final consonant (the sample's project name does). Each
 * sentence names which particle follows each endpoint here, and
 * `@/shared/lib/ko-josa` picks the form from the name. The English messages
 * simply ignore the two extra values.
 */
export type EdgeSentenceKey = "contains" | "depends" | "describes" | "belongsTo" | "related";

export function normalizeEdgeSentenceKey(type: string): EdgeSentenceKey {
  if (type === "dependencies" || type === "depends_on") return "depends";
  if (type === "contains" || type === "elements" || type === "capabilities" || type === "domains" || type === "domain") return "contains";
  if (type === "describes") return "describes";
  if (type === "belongs_to") return "belongsTo";
  return "related";
}

/** Which particle follows each endpoint, per sentence: [after `from`, after `to`]. */
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
