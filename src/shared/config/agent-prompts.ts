/**
 * 사용자가 **복사해서 자기 에이전트에 붙여넣는 지시문**의 단일 정본.
 *
 * ## 왜 여기이고, 왜 함수인가
 *
 * `cli-invocation.ts` 의 형제 자리다 — 화면이 만들어 주는 «에이전트가 그대로
 * 받아들이는 문자열»이라는 점에서 같은 부류이고, 여러 표면(체크리스트 · 연결
 * 완료 카드)이 소비하므로 `shared/config` 가 유일하게 맞는 층이다.
 *
 * **상수가 아니라 빌더인 이유**: 경로를 `.` 로 박아 둔 정적 프롬프트가 이미 한
 * 번 사고를 냈다 — 에이전트를 다른 작업 폴더에서 열면 그 `.` 이 남의 폴더를
 * 가리킨다. 사실(볼트 경로)과 분리된 복사는 복사가 아니라 오답이다.
 *
 * ## 왜 영어 한 벌인가 (i18n 에 넣지 않는다)
 *
 * 이 문자열의 독자는 **에이전트**다. 도구 이름(`connection_info`,
 * `add_relations` …)과 지시어가 언어마다 갈리면 에이전트가 문장을 오역해 다른
 * 도구를 부른다. 이 저장소의 선례 셋이 모두 영문 상수이고, 유일하게 i18n 으로
 * 갔던 프롬프트가 정확히 오염된 자리였다. 사람이 읽을 설명은 화면의 캡션이
 * 맡는다 — 그 캡션이 「승인 전에는 아무것도 쓰지 않는다」를 사람에게 노출하는
 * 유일한 창구다.
 *
 * ⚠️ **여기 적는 도구·명령은 반드시 실재해야 한다.** 붙여넣는 순간 실패하는
 * 지시문은 도움이 아니라 함정이다. 특히 `/ontology-bootstrap` 같은 **우리
 * 저장소에만 있는 스킬**과 `npx ontology-atlas`(레지스트리에 없다)는 못 쓴다.
 * `tests/contract/agent-prompt-tool-names.contract.test.ts` 가 MCP 도구 목록과
 * 대조해 막는다.
 */

/** 볼트 경로를 모를 때(웹 등) 프롬프트가 대신 부르는 이름. */
const UNKNOWN_VAULT = "the folder you are opened in";

function vaultRef(vaultPath: string | null | undefined): string {
  const trimmed = vaultPath?.trim();
  return trimmed ? trimmed : UNKNOWN_VAULT;
}

/**
 * **연결 후 첫 걸음** — 이 저장소를 훑어 개념 후보를 «제안»하게 한다.
 *
 * 마지막 항이 이 제품의 서명이다: *제안하고, 사람이 승인한 것만 쓴다.* 같은
 * 부류의 설치 프롬프트가 대부분 "EXECUTE NOW"(자율 실행)로 끝나는 자리에서,
 * 우리는 사람이 의미의 심판이라는 계약을 프롬프트 안에 적는다.
 */
export function buildAgentAnalyzePrompt({
  vaultPath,
}: {
  vaultPath: string | null | undefined;
}): string {
  const vault = vaultRef(vaultPath);
  return [
    `You are an agent connected to ${vault} via the ontology-atlas MCP server.`,
    `Goal: inspect this codebase and produce a reviewable ontology proposal;`,
    `do not write to the vault yet.`,
    ``,
    `1. Call connection_info, list_kinds, and validate_vault first so the`,
    `   active vault, current graph, and write surface are known.`,
    `2. If the vault already has a curated graph, investigate and sync it; do`,
    `   not restart bootstrap merely because source evidence changed.`,
    `3. Use analyze_repo_structure, index_project, and infer_imports only as`,
    `   side-effect-free evidence. Folder/package boundaries and import edges`,
    `   are observations, not automatic domains, capabilities, or depends_on`,
    `   relations.`,
    `4. Keep three layers separate in the proposal: observed evidence,`,
    `   proposed meaning, and human-approved ontology facts. For every`,
    `   candidate, include kind, behavior, source witness, and why the nearest`,
    `   adjacent kind is not a better fit.`,
    `5. Qualify project meaning separately: report project source currentness,`,
    `   competency questions, witnesses, gaps, and any review-required state.`,
    `   Structural readiness is not semantic qualification.`,
    `6. Present the proposal, qualification gaps, and exact write plan for`,
    `   human review. Do not call add_concept / add_concepts / add_relation /`,
    `   add_relations until the human explicitly approves that plan. Write only`,
    `   approved items, with the expected mtime guard where available.`,
    `7. Never use delete_concept, merge_concepts, rename_concept,`,
    `   absorb_document, or git_snapshot as part of ordinary synchronization`,
    `   unless the human explicitly requested that operation and reviewed its`,
    `   dry-run or preflight.`,
  ].join("\n");
}

/**
 * **연결됐는지부터 확인시키는 지시문** — 설정 파일을 손으로 다루기 어려운
 * 사람이 붙여넣으면, 에이전트가 스스로 지금 상태를 확인하고 다음 수를 말한다.
 *
 * 에이전트가 설정 파일을 **직접 쓰게 하지 않는다**: 절대 경로를 아는 것은 앱
 * 이고, 설정을 써 주는 것은 앱의 「에이전트 연결」 버튼의 일이다. 여기서
 * 에이전트에게 파일을 쓰라고 시키면 두 곳이 같은 사실을 쓰게 된다.
 */
export function buildAgentSetupPrompt({
  vaultPath,
}: {
  vaultPath: string | null | undefined;
}): string {
  const vault = vaultRef(vaultPath);
  return [
    `This folder's vault path is ${vault}.`,
    `Goal: confirm whether the ontology-atlas MCP server is connected to this`,
    `session right now, and show the human the next step that matches the`,
    `actual state.`,
    ``,
    `1. If connection_info is in your available tools, call it first and check`,
    `   whether vaultRoot equals ${vault}. Then call list_kinds and`,
    `   validate_vault({}) and report node count and problem-file count.`,
    `2. If connection_info is not available, the connector is not attached yet.`,
    `   Check which of these already exist under ${vault}: .mcp.json,`,
    `   .codex/config.toml, .cursor/mcp.json, .agents/mcp_config.json.`,
    `   - If one exists: tell the human "config exists but this session hasn't`,
    `     picked it up — restart the agent."`,
    `   - If none exist: tell the human "use the ontology-atlas app's Connect`,
    `     Agent button to write config for this vault." Do not write the`,
    `     config file yourself.`,
    `3. Report only what you verified — do not propose next steps as if`,
    `   connected when you have not confirmed connection.`,
  ].join("\n");
}
