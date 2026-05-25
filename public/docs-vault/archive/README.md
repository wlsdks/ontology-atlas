# Archived analysis docs

이 폴더는 *과거 세션에서 만든 long-form 분석 문서* 의 보관소다. 현재 mission /
contributor 룰의 진실원은 다음 4 개:

- `docs/PRODUCT-DIRECTION.md` — mission v2 spec
- `docs/FEATURES.md` — 사용자 가시 기능 전수
- `docs/ARCHITECTURE.md` / `docs/DATA-MODEL.md` / `docs/DESIGN-SYSTEM.md` /
  `docs/DEPLOYMENT.md` — 영역별 룰
- `docs/CHANGELOG.md` — 시간순 변화

archive 안 문서는 *역사적 맥락* 으로 남겨둘 뿐 contributor 가이드로 더 이상
참조되지 않는다. 새 작업 시작 시 위 4 개부터 읽고, 필요할 때 archive 안 문서를
참고로 검색.

## 보관 사유 (각 파일별)

| 파일 | 사유 |
|---|---|
| `ATOMIC-AUDIT-2026-05-01.md` | 2026-05-01 1 세션의 13 도메인 atomic audit 결과. 후속 변경으로 결론 일부 stale. |
| `UX-FIRST-PRINCIPLES.md` | 7-step user journey 마찰 분석. mission v2 의 0-마찰 진입과 정렬 후 일부 행동 항목은 PR 로 처리됨. |
| `LOCAL-FIRST-SYNC.md` | local-first sync 메커니즘 설계 노트. 일부는 PR #99 의 firebase dynamic import 으로 흡수됨. |
| `OFFLINE-FIRST-UX-FLOW.md` | offline 진입 시 UX flow 초안. 현재 구현은 vault picker 기반 단순 모델. |
| `ONTOLOGY-MODEL-V2-DRAFT.md` | V1.x → V2 ontology 모델 진화 spec. mission v2 구현이 일부 채택, 일부 폐기. |
