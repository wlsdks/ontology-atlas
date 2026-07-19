export interface BuilderDraftPreview {
  id: string;
  kind: string;
  title: string;
  kindLabel: string;
  path: string;
  needsName: boolean;
}

/**
 * 저장 준비된(이름 있는) 임시 개념을 MCP `add_concepts` 인자 묶음으로
 * 직렬화 — 에이전트 전달 복사 버튼의 payload(OntologyEditPage.tsx A4 분해).
 */
export function formatBuilderDraftAgentPacket(drafts: BuilderDraftPreview[]): string {
  const readyDrafts = drafts.filter((draft) => !draft.needsName);
  const addConceptArgs = readyDrafts.map((draft) => ({
    slug: draft.path.endsWith(".md") ? draft.path.slice(0, -3) : draft.path,
    kind: draft.kind,
    title: draft.title,
  }));
  return [
    "Ontology Atlas draft ontology concepts",
    "",
    "Drafts:",
    ...readyDrafts.map(
      (draft) => `- ${draft.kind}: ${draft.title} -> ${draft.path}`,
    ),
    "",
    "MCP add_concepts args:",
    JSON.stringify({ concepts: addConceptArgs }, null, 2),
    "",
    "After saving, verify:",
    "- validate_vault({ repoRoot })",
    "- compile_ontology({ summary: true })",
  ].join("\n");
}
