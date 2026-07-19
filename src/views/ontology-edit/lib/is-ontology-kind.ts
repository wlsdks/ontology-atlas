/**
 * 4대 ontology kind 여부 가드 — 앵커 kind 라벨을 `tKinds()` 로 번역할 수
 * 있는지 판정한다(OntologyEditPage.tsx A4 분해).
 */
export function isOntologyKind(
  kind: string,
): kind is "project" | "domain" | "capability" | "element" {
  return kind === "project" || kind === "domain" || kind === "capability" || kind === "element";
}
