---
slug: capabilities/studio-relation-write-confirm
kind: capability
title: 나침 무대 관계 쓰기 확인 (inline socket write)
domain: views
elements: [src/views/ontology-studio/lib/build-studio-item.ts, src/views/ontology-studio/ui/StudioCompass.tsx]
---

# 나침 무대 관계 쓰기 확인 (inline socket write)

은퇴한 xyflow 빌더의 드래그-후-확인 관계 쓰기 모달을 대체하는, 나침 무대
(`/ontology/studio`) 의 인라인 소켓 채우기 흐름. 노드를 헥사곤 아이템으로
놓고, 네 방위(bearing)의 관계 소켓을 인라인 picker 로 채운다. 각 소켓은
관계 타입 이름을 노출하지 않고 평문 질문으로 묻는다 (`ontologyStudio` i18n):
위=상위개념(is_a), 오른쪽=기대는 곳(depends_on), 아래=담는 것(contains),
왼쪽=비슷한 것(related_to).

관계를 확정하기 전 계약:

- **관계 → frontmatter 키는 스키마 그대로.** `BEARING_FRONTMATTER_KEY`
  (`build-studio-item`) 가 각 방위를 vault/MCP 가 읽는 canonical 키로 매핑한다:
  is_a → `broader` (SKOS `skos:broader`), depends_on → `dependencies`,
  contains → `contains`, related_to → `relates`. 모호한 semantic `relates`
  로 뭉개지 않고 계층을 정확한 키로 쓴다.
- **near-dup guard.** picker 는 사용자가 입력한 이름이 기존 노드의 이름과
  정확히 일치하면 (`similarFor`, `findSimilarNodeByTitle`) 그 후보를 먼저
  제안해 중복 노드/중복 관계 생성을 막는다.
- **후보 kind 제한.** 각 관계는 스키마에 맞는 kind 만 후보로 연다
  (is_a → capability/domain/project, depends_on·contains → capability/element,
  relates → 컨테이너가 아닌 노드). 이미 연결됐거나 자기 자신인 후보는 제외.
- **채움 = 쓰기.** writable local vault 에서는 소켓을 채우는 즉시
  `localVault.updateFrontmatter` 로 source 노드 frontmatter 배열에 append
  (dedup) 하고 `success` 토스트. non-writable 에서는 같은 변경을 복사 가능한
  MCP fill packet 으로 내보내 Claude Code/Codex 가 land 하게 한다.

frontmatter 는 그래프이고, 모든 그래프 변경은 진실원이 되기 전에 사람과
agent 모두가 이해할 수 있어야 한다는 MCP/CLI relation-check 정신을 UI 로
유지한다.
