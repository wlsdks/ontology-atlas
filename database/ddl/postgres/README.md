# PostgreSQL DDL (future migration target)

현재 런타임 canonical store 는 **Firestore** 다. 이 디렉토리의 SQL 은 PostgreSQL
/Prisma 로 전환할 때 쓸 **관계형 계약 스냅샷** 이다. Firestore schema 와
1:1 매핑되며, `docs/DATA-MODEL.md` 가 단일 출처다. 스키마 바뀌면 문서 먼저,
Firestore 계약 다음, 이 DDL 마지막 순서로 갱신한다.

## 적용 순서

```
000_core_project_map.sql      ← v1 public product (flat projects + taxonomy)
010_knowledge_subsystem_v2.sql ← documents · extraction · review · approved · public
020_accounts_memberships.sql  ← multi-tenant roots
030_workspace_containers.sql  ← 4-layer: workspace_projects > hubs > nodes (+ junctions)
040_api_keys.sql              ← M2 external API auth tokens
050_project_activity.sql      ← audit log
```

## 원칙

- **단일 출처는 `docs/DATA-MODEL.md`.** 필드 이름·타입·required 여부는 문서가 진짜다.
- **Firestore camelCase → SQL snake_case**. 예: `projectIds` → `project_ids`, `currentVersionId` → `current_version_id`.
- **Firestore document ID** 는 각 테이블의 `id text primary key` 로 매핑한다.
- **중첩 객체 (position, size, timeline 등)** 는 플랫 컬럼 또는 `jsonb` 로 저장. 쿼리에 필요한 필드만 펴고 나머지는 jsonb.
- **배열 필드** 는 Firestore `string[]` → PostgreSQL `text[]` 로 보존 (jsonb 대신). `array-contains` 쿼리는 `= any(column)` 로 대응.
- **멀티테넌트** 는 `account_id` FK 를 핵심 엔티티 PK 에 포함 (composite PK).
- **변경 이력** 은 append-only 테이블 (`knowledge_review_events`, `knowledge_approval_events`, `project_activity`) 로 별도 보존.

## 현재 Firestore → SQL 매핑 요약

| Firestore 컬렉션 | SQL 테이블 | 파일 |
|---|---|---|
| `projects/{slug}` | `projects` (flat global) | 000 |
| `categories/{id}` | `categories` | 000 |
| `statuses/{id}` | `statuses` | 000 |
| `admins/{email}` | `admins` | 000 |
| `meta/site` | `site_meta` | 000 |
| `knowledgeDocuments/{id}` | `knowledge_documents` | 010 |
| `knowledgeDocumentVersions/{id}` | `knowledge_document_versions` | 010 |
| `knowledgeDocumentChunks/{id}` | `knowledge_document_chunks` | 010 |
| `knowledgeExtractionJobs/{id}` | `knowledge_extraction_jobs` | 010 |
| `knowledgeExtractionOutputs/{id}` | `knowledge_extraction_outputs` | 010 |
| `knowledgeEvidence/{id}` | `knowledge_evidence` | 010 |
| `knowledgeReviews/{id}` | `knowledge_reviews` | 010 |
| `knowledgeReviewEvents/{id}` | `knowledge_review_events` | 010 |
| `knowledgeApprovalEvents/{id}` | `knowledge_approval_events` | 010 |
| `knowledgeApprovedNodes/{id}` | `knowledge_approved_nodes` | 010 |
| `knowledgeApprovedEdges/{id}` | `knowledge_approved_edges` | 010 |
| `knowledgePublishes/{id}` | `knowledge_publishes` | 010 |
| `knowledgePublicNodes/{id}` | `knowledge_public_nodes` | 010 |
| `knowledgePublicEdges/{id}` | `knowledge_public_edges` | 010 |
| `knowledgePublicMeta/current` | `knowledge_public_meta` | 010 |
| `accounts/{accountId}` | `accounts` | 020 |
| `accountMemberships/{uid__accountId}` | `account_memberships` | 020 |
| `accounts/{acc}/workspaceProjects/{id}` | `workspace_projects` | 030 |
| `accounts/{acc}/workspaceProjects/{p}/hubs/{id}` | `workspace_hubs` | 030 |
| `accounts/{acc}/workspaceProjects/{p}/nodes/{id}` | `workspace_nodes` + `workspace_node_hubs` | 030 |
| `accounts/{acc}/apiKeys/{id}` | `api_keys` | 040 |
| `projectActivity/{id}` | `project_activity` | 050 |

## 로컬 검증

```bash
# psql 로 순서대로 적용
for f in database/ddl/postgres/[0-9]*.sql; do
  psql -d aslan_map -f "$f" --single-transaction --set ON_ERROR_STOP=1
done
```

또는 Docker:

```bash
docker run --rm -v "$PWD/database/ddl/postgres:/ddl" postgres:17 bash -c '
  initdb -D /tmp/pg && pg_ctl -D /tmp/pg start &&
  createdb aslan_map && for f in /ddl/[0-9]*.sql; do
    psql -d aslan_map -f "$f" --single-transaction --set ON_ERROR_STOP=1
  done
'
```

## 변경 이력

- 2026-04-17: 초안 (000 core · 010 knowledge subsystem v2)
- 2026-04-21: DATA-MODEL 정합성 전수 정정 + 020~050 신규 추가
  - `knowledge_approved_nodes/edges`, `knowledge_publishes`, `knowledge_public_*` 가 DATA-MODEL 과 필드·타입이 달랐음. 모두 교체.
  - `knowledge_reviews` → `job_id`, `type`, `payload` 누락 추가.
  - `knowledge_review_events` → `action/actor/from_status/to_status/decision_payload/comment` 로 교체.
  - `knowledge_approval_events` → 감사용 `entity_type/entity_id/review_id/before/after/approved_by/approved_at/reverts_event_id` 로 교체.
  - `knowledge_documents.format_score` `integer` → `double precision` (0..1 실수).
  - `project_slugs` 명명 → `project_ids` 로 통일 (Firestore 필드명과 일치).
  - 신규 020 (accounts/memberships), 030 (workspace 4-layer), 040 (api_keys), 050 (project_activity) 추가.
