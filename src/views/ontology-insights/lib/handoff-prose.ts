import type { DoNextHandoffProse } from "./do-next-queue";
import type { MeaningGapProse } from "./meaning-gap-rows";

/**
 * The locale-resolved handoff prose — typed locale data, deliberately NOT in
 * `messages/*.json`.
 *
 * These strings interleave literal MCP calls (`query_ontology({operation:…})`)
 * with prose, and the messages catalog requires every entry to compile as ICU —
 * the braces read as malformed arguments there (the `validate-messages` gate
 * exists precisely so a malformed entry cannot render a raw key path). Keeping
 * them as a typed per-locale record follows the same rule as `display_<locale>`
 * frontmatter: localized data lives in data, and the strings stay verbatim so
 * the copied payload runs as written. They were previously hardcoded Korean in
 * the builders, so an English-locale user copied Korean operating instructions
 * (bug sweep 2026-09-01); `%ref%`-style tokens are filled by
 * `fillHandoffTemplate`.
 */

type HandoffLocale = "en" | "ko";

export interface InsightsHandoffProse extends DoNextHandoffProse, MeaningGapProse {
  duplicate: string;
  duplicateProof: string;
  cycle: string;
  cycleProof: string;
  tabDoNext: string;
  tabComposition: string;
  tabConnections: string;
  tabBoundaries: string;
  tabFreshness: string;
  tabFlow: string;
}

const EN: InsightsHandoffProse = {
  verificationGate: 'query_ontology({operation:"health"}) to re-check the result',
  createDocFirst:
    'This concept exists in the ontology folder only as the reference "%ref%" (no document yet) → create its document first with add_concept({slug:"%ref%", kind:"%kind%"})',
  doNextUpdate:
    'query_ontology({operation:"blast_radius", slug:"%ref%"}) to see the impact area → review the document, then update it with patch_concept({slug:"%ref%", …})',
  doNextUpdateProof: 'get_concept({slug:"%ref%"}) to confirm the updated text',
  doNextNewDocProof: 'get_concept({slug:"%ref%"}) to confirm the new document',
  orphanRelate:
    'add_relation({from:"%ref%", to:"«target»", type:"relates", why:"«one-line reason»"})',
  orphanFindNeighbors:
    'find_neighbors({slug:"%ref%"}) to find candidates → pre-check with relation_check → add_relation({from:"%ref%", to:"«target»", type:"relates", why:"«one-line reason»"})',
  orphanProof: 'find_neighbors({slug:"%ref%"}) to confirm the new relation',
  promotionNewDoc: "if the promotion is right, raise that document's kind",
  promotionDocumented:
    'query_ontology({operation:"node_profile", slug:"%ref%"}) to check fan-in → if the promotion is right, raise the kind with patch_concept or create the parent concept with add_concept',
  promotionProof:
    'query_ontology({operation:"node_profile", slug:"%ref%"}) to re-check kind and fan-in',
  missingDefinition:
    'patch_concept({slug:"%ref%", frontmatter:{description:"«this concept in one sentence»"}}) to write its meaning',
  missingDefinitionProof: 'get_concept({slug:"%ref%"}) to confirm the sentence',
  missingDomain:
    'patch_concept({slug:"%ref%", frontmatter:{domain:"«domain name»"}}) to record where it belongs',
  missingDomainProof: 'get_concept({slug:"%ref%"}) to confirm the domain',
  duplicate:
    'merge_concepts({fromSlug:"%dissolve%", intoSlug:"%keep%"}) to preview the merge → if they mean the same thing, run the same call again with confirm:true',
  duplicateProof: 'get_concept({slug:"%keep%"}) to confirm the merged text',
  cycle:
    'Dependency cycle: %cycle%. query_ontology({operation:"cycles"}) to confirm → decide which direction to cut → fix dependencies with patch_concept',
  cycleProof: 'query_ontology({operation:"cycles"}) to confirm the cycle is gone',
  tabDoNext:
    'query_ontology({operation:"maintenance_plan"}) → work through the items → re-check with query_ontology({operation:"health"})',
  tabComposition:
    'list_kinds({}) → query_ontology({operation:"overview"}) → check empty definitions via validate_vault({}) warnings',
  tabConnections:
    'query_ontology({operation:"centrality"}) → query_ontology({operation:"blast_radius", slug:"«hub-slug»"})',
  tabBoundaries:
    'query_ontology({operation:"domain_matrix"}) → cross-domain examples via query_ontology({operation:"match_edges"})',
  tabFreshness:
    'query_ontology({operation:"maintenance_plan"}) → find_orphans({}) → query_ontology({operation:"growth_plan"})',
  tabFlow:
    'list_concepts({summary:true}) → get_concepts({body:"full"}) for the project and domain bodies → cite slugs in every paragraph',
};

const KO: InsightsHandoffProse = {
  verificationGate: 'query_ontology({operation:"health"}) 로 변경 결과 재확인',
  createDocFirst:
    '이 개념은 아직 온톨로지 폴더에 "%ref%" 라는 참조로만 적혀 있어요(문서 없음) → add_concept({slug:"%ref%", kind:"%kind%"}) 로 문서부터 만들기',
  doNextUpdate:
    'query_ontology({operation:"blast_radius", slug:"%ref%"}) 로 영향권 확인 → 문서 내용 검토 후 patch_concept({slug:"%ref%", …}) 로 갱신',
  doNextUpdateProof: 'get_concept({slug:"%ref%"}) 로 갱신된 원문 확인',
  doNextNewDocProof: 'get_concept({slug:"%ref%"}) 로 새 문서 확인',
  orphanRelate:
    'add_relation({from:"%ref%", to:"«대상»", type:"relates", why:"«근거 한 줄»"})',
  orphanFindNeighbors:
    'find_neighbors({slug:"%ref%"}) 로 이웃 후보 확인 → relation_check 사전 점검 → add_relation({from:"%ref%", to:"«대상»", type:"relates", why:"«근거 한 줄»"})',
  orphanProof: 'find_neighbors({slug:"%ref%"}) 로 새 관계 확인',
  promotionNewDoc: '승격이 맞으면 그 문서의 kind 를 상향',
  promotionDocumented:
    'query_ontology({operation:"node_profile", slug:"%ref%"}) 로 fan-in 확인 → 승격이 맞으면 patch_concept 로 kind 상향 또는 add_concept 로 상위 개념 신설',
  promotionProof:
    'query_ontology({operation:"node_profile", slug:"%ref%"}) 로 kind와 fan-in 재확인',
  missingDefinition:
    'patch_concept({slug:"%ref%", frontmatter:{description:"«이 개념을 한 문장으로»"}}) 로 뜻을 적기',
  missingDefinitionProof: 'get_concept({slug:"%ref%"}) 로 적힌 문장 확인',
  missingDomain:
    'patch_concept({slug:"%ref%", frontmatter:{domain:"«영역 이름»"}}) 로 소속을 적기',
  missingDomainProof: 'get_concept({slug:"%ref%"}) 로 소속 확인',
  duplicate:
    'merge_concepts({fromSlug:"%dissolve%", intoSlug:"%keep%"}) 로 합칠 결과 미리보기 → 같은 뜻이 맞으면 같은 호출에 confirm:true 를 더해 실행',
  duplicateProof: 'get_concept({slug:"%keep%"}) 로 합쳐진 원문 확인',
  cycle:
    '의존 사이클: %cycle%. query_ontology({operation:"cycles"}) 로 확인 → 어느 방향을 끊을지 판단 → patch_concept 로 dependencies 수정',
  cycleProof: 'query_ontology({operation:"cycles"}) 로 사이클 해소 확인',
  tabDoNext:
    'query_ontology({operation:"maintenance_plan"}) → 항목별 실행 → query_ontology({operation:"health"}) 로 재확인',
  tabComposition:
    'list_kinds({}) → query_ontology({operation:"overview"}) → 빈 정의는 validate_vault({}) 의 warnings 로 확인',
  tabConnections:
    'query_ontology({operation:"centrality"}) → query_ontology({operation:"blast_radius", slug:"«hub-slug»"})',
  tabBoundaries:
    'query_ontology({operation:"domain_matrix"}) → 교차 예시는 query_ontology({operation:"match_edges"})',
  tabFreshness:
    'query_ontology({operation:"maintenance_plan"}) → find_orphans({}) → query_ontology({operation:"growth_plan"})',
  tabFlow:
    'list_concepts({summary:true}) → get_concepts({body:"full"}) 로 project 와 domain 본문 → 문단마다 슬러그 인용',
};

const PROSE_BY_LOCALE: Record<HandoffLocale, InsightsHandoffProse> = { en: EN, ko: KO };

export function insightsHandoffProse(locale: string): InsightsHandoffProse {
  return PROSE_BY_LOCALE[locale === "ko" ? "ko" : "en"];
}
