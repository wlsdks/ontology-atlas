---
name: 온톨로지 export / import path
description: ontology 데이터 백업·이주·표준 포맷 호환을 위한 export 와 import 경로
status: 🌱 draft (P3 spec)
date: 2026-04-28
related:
  - docs/superpowers/specs/2026-04-27-ontology-design-loop.md (v0 백본)
  - docs/superpowers/specs/2026-04-27-ontology-id-resolution.md (canonical ID)
  - docs/superpowers/specs/2026-04-27-ontology-manual-editor-v0.md (manual source)
---

# 온톨로지 export / import

> 사용자가 자기 ontology 를 **이 시스템 밖으로 가져갈 수 있어야** 진짜 신뢰. 그리고 외부 ontology (다른 워크스페이스 / 표준 RDF) 를 **가져올 수 있어야** 시작점이 ontology 0 인 부담 ↓.

---

## 1. 한 문장

> **사용자가 자기 ontology graph 를 표준 포맷으로 export 하고, 외부 ontology 를 import 해 시작점으로 쓸 수 있다.**

---

## 2. 현재 상태와 문제

### 2.1 현재 상태

- **export**: 없음. `knowledgeApprovedNodes/Edges` 는 Firestore 직접 쿼리만 가능.
- **import**: 없음. 시작 시 ontology 0 → 사용자가 모든 문서를 손으로 등록해서 자라게 함.
- **백업**: Firestore 자동 백업 (Cloud level) 만. 사용자 손에 안 닿음.

### 2.2 문제

- **데이터 ownership 신뢰**: 사용자가 "이 시스템에 lock-in 되는 거 아닌가?" 의심. ontology 자라날수록 lock-in 비용 ↑.
- **이주 불가**: workspace A → workspace B 로 ontology 옮길 수 없음. 회사 분사·팀 이동 시 다시 처음부터.
- **표준 호환**: 다른 ontology 도구 (Protégé, Neo4j, Obsidian Graph) 와 데이터 교환 불가.
- **Cold start 부담**: 신규 사용자가 자기 도메인 ontology 처음 만들 때 reference template 없음.

---

## 3. 해결 옵션

### 3.1 옵션 A — JSON export / import (권장 first)

자체 schema 의 JSON 으로 export.

```json
{
  "version": "ontology-export-v1",
  "exportedAt": "2026-04-28T...",
  "accountId": "...",
  "tboxVersionId": "v3",
  "tbox": { "classes": [...], "relations": [...] },
  "nodes": [{ "id": "capability.auth", "kind": "capability", "title": "...", ... }],
  "edges": [{ "id": "...", "type": "depends_on", "from": "...", "to": "...", ... }]
}
```

**장점**: 자체 system 호환 100%, round-trip 보장.
**단점**: 표준 ontology 도구 호환 X.

### 3.2 옵션 B — JSON-LD / RDF Turtle export

W3C 표준. `kind` 는 rdf:type, `relation type` 은 owl:ObjectProperty.

**장점**: Protégé / GraphDB / 학술 호환.
**단점**: 우리 schema 와 RDF 매핑 작업 큼. round-trip 손실 (manualNote 같은 우리 자체 필드).

### 3.3 옵션 C — Markdown bundle export

각 노드를 md 파일로, frontmatter 에 메타. ZIP 으로.

**장점**: Obsidian / Foam / 기타 markdown wiki 직접 import.
**단점**: 관계 표현이 frontmatter `relates.target` 만 — 손실 큼.

### 3.4 결정

→ **Phase 1 = 옵션 A (JSON), Phase 3 = 옵션 B (JSON-LD), Phase 4 = 옵션 C (markdown bundle)**.

옵션 A 먼저 — 자체 round-trip 보장이 신뢰의 첫 단계. B/C 는 외부 호환을 추가.

---

## 4. 사용자 시나리오

### S1 — 진안, 백업용 export

- `/settings/ontology` (P1 spec) 또는 `/ontology` 헤더 "↓ 내보내기"
- 모달: 형식 선택 (JSON / 향후 JSON-LD / md bundle)
- 범위: 전체 / public projection만 / 특정 프로젝트만
- "export 시작" → 진행 표시 → 다운로드 trigger
- 결과: `ontology-aslan-2026-04-28.json` 다운로드

### S2 — 진안, 다른 워크스페이스로 import

- 새 워크스페이스 (또는 같은 곳) `/settings/ontology` "↑ 가져오기"
- 파일 선택 (JSON 만 supported Phase 1)
- preview: "노드 145 / 관계 287 / TBox v3 가져옵니다"
- conflict 정책: skip / overwrite / merge (manual wins) — 이 spec 의 핵심 결정
- "가져오기 시작" → 진행 표시 (chunked write)
- 결과: 새 노드/관계가 `knowledgeApprovedNodes/Edges` 에 자람, source=`imported`

### S3 — 신규 사용자, template import

- 기본 제공 ontology template (예: "B2B SaaS 제품 ontology", "오픈소스 라이브러리 ontology")
- `/settings/ontology` "템플릿으로 시작" → 선택 → import
- 즉시 트리에 노드 자람, 사용자가 자기 도메인에 맞게 수정

---

## 5. 데이터 모델

### 5.1 새 필드 — `KnowledgeGraphNode.source` 확장

기존: `"manual" | "extraction"`
새: `"manual" | "extraction" | "imported"`

```ts
interface KnowledgeGraphNode {
  source?: "manual" | "extraction" | "imported";
  importedFrom?: {
    /** export 한 워크스페이스의 accountId (있으면). */
    sourceAccountId?: string;
    /** export 시 timestamp. */
    exportedAt?: Date;
    /** import 한 사용자 uid. */
    importedBy: string;
    /** import 한 시점. */
    importedAt: Date;
    /** export file 의 자체 versionId — round-trip diff 추적. */
    sourceVersionId?: string;
  };
}
```

같은 패턴이 `KnowledgeGraphEdge`.

### 5.2 export 형식 v1

```ts
interface OntologyExportV1 {
  version: "ontology-export-v1";
  exportedAt: string;          // ISO
  exportedBy: string;          // uid
  accountId: string;
  tboxVersionId: string;
  tbox: {
    classes: OntologyClassDef[];
    relations: OntologyRelationDef[];
  };
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  /** 옵션 — public projection 일치 여부. */
  publicProjection?: { nodes: KnowledgePublicNode[]; edges: KnowledgePublicEdge[] };
}
```

### 5.3 conflict 정책 (import 시)

같은 ID 노드 만났을 때:

| 정책 | 동작 | 사용 사례 |
|---|---|---|
| **skip** | 기존 유지, import 의 노드 무시 | 부분 backup 복원 |
| **overwrite** | import 노드로 교체. evidenceIds 합집합 | 마스터 워크스페이스 → mirror |
| **merge (manual wins)** | 기존이 source=manual 이면 보존, extraction/imported 면 overwrite | 일반 import |

기본 = **merge (manual wins)** — 사용자 수동 작업 보존.

---

## 6. UI 진입점

### 6.1 새 widget

- `<OntologyExportButton>` — 헤더 / settings 모두에서 mount 가능
- `<OntologyExportModal>` — 형식 + 범위 선택, 진행 표시
- `<OntologyImportButton>`
- `<OntologyImportModal>` — 파일 선택, preview, conflict 정책 선택, 진행 표시

### 6.2 위치

- `/settings/ontology` — 가장 자연스러운 위치 (P1 TBox UI 와 같이)
- `/ontology` 헤더 — 자주 쓰는 사용자용 quick access (옵션)

---

## 7. Cloud Function 또는 client-side?

### 7.1 export — client-side (권장 first)

- Firestore 에서 nodes/edges fetch (pagination)
- 메모리에서 JSON 직렬화
- Blob URL → download

**장점**: 추가 인프라 0
**단점**: 큰 ontology (10k 노드 이상) 면 브라우저 메모리 부담

### 7.2 import — Cloud Function (권장)

- 클라이언트가 file upload → Storage `ontology-imports/{importId}/file.json`
- Cloud Function `processOntologyImport` 가 chunked read + batch write
- 진행 상태 `ontologyImportJobs/{importId}.status`

**장점**: 큰 import 도 안정. 트랜잭션 안전성.
**단점**: 새 Function 배포 필요.

### 7.3 결정

- **Phase 1 = client-side export** + **client-side import** (small graph 한정, < 1k 노드)
- **Phase 2 = Cloud Function import** (큰 graph)
- **Phase 3 = JSON-LD export** + RDF Turtle

---

## 8. 단계적 구현 plan

### Phase 1 — JSON export (가장 작은 슬라이스)

- `<OntologyExportButton>` + `<OntologyExportModal>`
- Firestore fetch + JSON serialize + Blob download
- 형식 = `ontology-export-v1`
- **분량**: 3-4 fire

### Phase 2 — JSON import (client-side)

- `<OntologyImportButton>` + `<OntologyImportModal>`
- 파일 read + preview + conflict 정책 모달
- batch write (Firestore writeBatch 500 단위)
- source=imported 박음
- **분량**: 5-6 fire

### Phase 3 — Cloud Function import (큰 graph)

- `processOntologyImport` 워커 + `ontologyImportJobs` 컬렉션
- `OntologyImportModal` 이 client/cloud 자동 분기 (노드 수 1000 이상)
- **분량**: 4-5 fire

### Phase 4 — JSON-LD / Turtle export (표준 호환)

- 우리 schema → RDF 매핑 (kind → rdfs:Class, relation type → owl:ObjectProperty)
- 손실 필드 (manualNote 등) 는 자체 namespace `aslan:`
- **분량**: 5-6 fire (RDF 라이브러리 추가)

### Phase 5 — Markdown bundle export

- 각 노드 → md 파일 + frontmatter
- 관계는 frontmatter `relates.target`
- ZIP 다운로드
- **분량**: 3-4 fire

### Phase 6 — Template import

- 기본 제공 template 파일 (`/templates/ontology/<name>.json`)
- `<OntologyImportModal>` 이 "템플릿" 탭에서 선택
- **분량**: 2-3 fire (template 자체는 별도)

**총 22-28 fire** — 매우 큰 작업. Phase 1 (export) 만 해도 신뢰의 첫 단계 닫힘.

---

## 9. 위험 / 대안

### 9.1 위험

- **export 데이터 일관성**: Firestore read 가 transaction 아니면 partial state 가능. 완화: 한 번 client snapshot 으로 묶기.
- **import 권한 escalation**: 사용자가 다른 사람 ontology 를 import 해 자기 워크스페이스에 박음 → 데이터 모순. 완화: import 시 모든 노드 source=imported + accountId 강제 변경.
- **PII / 민감 정보**: ontology summary / manualNote 에 민감 정보 가능. 완화: export 모달에 "민감 정보 포함 가능, 전송에 주의" 안내.
- **표준 RDF 손실**: JSON-LD 로 round-trip 시 우리 자체 필드 잃음. 완화: aslan: namespace 정의 + 별도 mapping doc.

### 9.2 대안

- "Firestore admin SDK 직접 쓰기" — gcloud CLI 가 export 명령 제공. 사용자 입장에선 너무 low-level.
- "JSON 만 영원히" — Phase 3 (RDF) skip. 학술/표준 호환 미달.

---

## 10. 다음 액션

1. **사용자 결정 항목**:
   - Phase 1 (JSON export only) 부터 시작?
   - conflict 정책 default = merge (manual wins) 동의?
   - export UI 위치 = `/settings/ontology` only vs `/ontology` 헤더 quick access 도?
   - PII 안내 문구 강도?
2. Phase 1 docs-first 시작 — `OntologyExportV1` 타입 + DATA-MODEL.md 갱신.

---
