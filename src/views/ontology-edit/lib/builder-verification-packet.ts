/**
 * 저장/검증/되돌리기 체크리스트 — BuilderWriteSummary 의 "검증·되돌리기"
 * 복사 버튼 payload(OntologyEditPage.tsx A4 분해).
 */
export function formatBuilderVerificationPacket(): string {
  return [
    "Ontology Atlas save/verify/revert checklist",
    "",
    "What is saved:",
    "- Saved concepts and relations are markdown files in the selected local vault.",
    "- Draft canvas changes stay in memory until their Save action writes vault markdown.",
    "",
    "Review before you revert:",
    "git status --short",
    "git diff -- docs/ontology public/docs-vault src/entities/docs-vault/data",
    "",
    "Verify the ontology:",
    "pnpm docs-vault:build && pnpm docs-vault:check",
    "node cli/src/index.mjs validate docs/ontology --json",
    "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
    "",
    "Agent MCP follow-up:",
    "validate_vault({})",
    'query_ontology({"operation":"health"})',
    'query_ontology({"operation":"maintenance_plan","nodeLimit":8})',
    "",
    "Revert only after reviewing the diff:",
    "git restore -- docs/ontology public/docs-vault src/entities/docs-vault/data",
  ].join("\n");
}
