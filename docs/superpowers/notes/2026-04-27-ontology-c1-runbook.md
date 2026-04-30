# C-1 ontology 추출 runbook (측정용)

**작성일**: 2026-04-27
**대상 단계**: C-1 (옵션 C 의 첫 phase — `/ontology` surface + 명시 추출)
**목표**: 한국어 spec md 1 개로 ontology 추출을 처음부터 끝까지 돌려, **§3.3 cutover 임계값** 측정 데이터를 수집한다.

> 측정 임계값 (재확인): 정확도 ≥ 80% / 단가 ≤ $0.05/page / 검수 cycle ≤ 24h / 워커 실패율 < 5%.

---

## 0. 사전 준비 (한 번만)

### 0.1 Anthropic API 키 등록

Cloud Functions secret 에 `ANTHROPIC_API_KEY` 등록.

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# Anthropic Console (https://console.anthropic.com/settings/keys) 에서 발급한 키 입력
```

⚠️ **`processExtractionJob` 워커는 `defineSecret([GEMINI_API_KEY, ANTHROPIC_API_KEY])`
양쪽을 둘 다 요구**한다 (functions/index.js — secrets array). Gemini 경로를
쓰지 않더라도 `GEMINI_API_KEY` 가 미등록이면 deploy 가 fail. 측정 단계에서
Gemini 가 필요 없다면 placeholder 라도 등록:

```bash
firebase functions:secrets:set GEMINI_API_KEY  # 미사용이면 dummy 값
```

배포까지 1 회:

```bash
cd functions
pnpm install   # 첫 회만 (functions/node_modules 가 비어 있음)
cd ..
firebase deploy --only functions:processExtractionJob
```

### 0.2 ontology TBox 시드 (한 번만)

빈 컬렉션이면 `loadOntologyTBox()` 가 fallback seed 를 쓰지만, 실제 Firestore 에 시드 박아 두면 진안이 직접 클래스·관계 정의를 변경 가능.

⚠️ **T-11 측정은 production Firestore 를 대상으로 한다**. 아래 emulator 시드 명령은 로컬 검증용이고, production 시드는 service-account credential 로 실행해야 한다.

```bash
# emulator (로컬 검증)
FIRESTORE_EMULATOR_HOST=localhost:8080 \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aslan-project-map \
  node scripts/seed-ontology-tbox.mjs

# production (T-11 측정 직전 1 회)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<prod-project-id> \
  node scripts/seed-ontology-tbox.mjs
```

확인:

- Firebase Console → Firestore → `ontologyClasses` (**6 docs**: project / domain / capability / element / document / **unknown** — `unknown` 은 stub placeholder)
- `ontologyRelations` (7 docs: contains / belongs_to / depends_on / implements / uses / describes / related_to)

시드가 production 에 실제 적용됐는지 확인하지 못한 채 측정을 시작하면 워커가 `loadOntologyTBox` 의 fallback `DEFAULT_ONTOLOGY_CLASSES/RELATIONS` 로 떨어진다 — 정상 동작이지만 진안이 클래스/관계를 수정해도 반영되지 않는다.

### 0.3 Firestore rules / indexes 배포

T-1b 에서 추가한 rules + 기존 contract:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 1. 측정 대상 문서 준비

진안이 가진 spec / capability / element 문서 중 **10 개** 골라 등급 A 로 frontmatter 정형화한다 — `docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md` 참조.

권장 분포:

- 4 개 — `kind: capability` (가장 많은 추출 후보 발생)
- 3 개 — `kind: element` (with `elementType`)
- 2 개 — `kind: domain`
- 1 개 — `kind: project`

각 문서 frontmatter 가 등급 A 를 받아야 ontology 추출 cap 1.0 적용. 등급 B / C 는 별도 라벨링 후 cap 측정 (medium 0.84 / low 0.59).

---

## 2. 추출 1 회 돌리기

1. 사용자 ID 로 로그인 → `/knowledge/documents/[documentId]` 진입.
2. **추출 엔진 토글**: `Ontology` 선택 (기본 Gemini, T-8 에서 추가).
3. **분석 시작** 클릭.
4. Cloud Function 트리거 → `knowledgeExtractionJobs.{jobId}` 가 `processing` → `succeeded` 로 전환.
5. 완료 후 `latestOutput` 의 헤더에 `OntologyOutputBadges` 노출 — provider=anthropic / grade / confidence cap / token i/o / cost / latency.

### 2.1 이 단계에서 기록할 raw data

| 항목 | 어디서 보는가 |
|---|---|
| input tokens | `OntologyOutputBadges` 의 tok 칩 또는 `knowledgeExtractionOutputs.{outputId}.usage.inputTokens` |
| output tokens | 같은 위치, `usage.outputTokens` |
| 비용 (USD) | `OntologyOutputBadges` 의 $ 칩 또는 `usage.estimatedCostUsd` |
| LLM latency | latency 칩 또는 `latencyMs` 필드 |
| 추출된 노드 수 | `nodeCount` |
| 추출된 엣지 수 | `edgeCount` |
| validator drop 수 | drop 칩 또는 `validationErrorCount` |

---

## 3. 검수 cycle 측정

1. `/review/knowledge` 에서 해당 문서의 candidates 확인.
2. 각 노드/엣지에 대해 진안이 직접 검수:
   - **승인** — `applyReviewAction(action='approve_output')` Cloud Function. 자동으로 `knowledgeApprovedNodes/Edges` 에 반영.
   - **거절** — `applyReviewAction(action='reject_output', rejectedNodeTempIds, rejectedEdgeTempIds, reason?)` Cloud Function. **`knowledgeApprovedNodes/Edges` 는 변경하지 않고** `knowledgeReviews` + `knowledgeApprovalEvents` 에 거절 사실만 남는다 — T-11 정확도 분모 보존용.
     - `rejectedNodeTempIds` / `rejectedEdgeTempIds` 가 비어 있으면 "전체 거절" 로 간주.
     - `reason` 은 같은 문서 재추출 시 같은 잘못된 후보를 다시 봤을 때 검수자 단서.
3. 검수 시작 시각과 끝난 시각을 기록. 차이가 **검수 cycle**.

> ✅ **Partial approve 지원**. `applyReviewAction(action='approve_output', acceptedNodeTempIds, acceptedEdgeTempIds)` 로 output 의 일부 후보만 승인 가능. 미제공이면 전체 승인 (기존 동작). 잘못된 후보는 `reject_output` 으로 분리 기록 — 측정 분자/분모가 정확히 보존됨 (`approve(승인된 tempId)` + `reject(거절된 tempId)` ≤ 전체 후보).

### 3.1 정확도 계산

`정확도 = (승인된 후보 수) / (전체 후보 수)`

전체 후보 수 = `latestOutput.nodes.length + latestOutput.edges.length` (`OntologyOutputBadges` 의 `nodeCount + edgeCount`).
승인된 후보 수 = `knowledgeReviews` 의 `type='approve_output'` 에 묶인 `approvedNodeIds.length + approvedEdgeIds.length`.
거절된 후보 수 = `knowledgeReviews` 의 `type='reject_output'` 에 묶인 `rejectedNodeTempIds.length + rejectedEdgeTempIds.length` — 측정 후 sanity check 용 (approve + reject ≤ 전체 후보).

- ≥ 0.80 — C-1 → C-2 진입 조건 충족.
- 0.70 ~ 0.79 — 추출 prompt 또는 frontmatter 재정비 필요.
- < 0.70 — 모델 변경 검토 (sonnet → opus) 또는 schema 정밀화.

---

## 4. 공개 / 트리 확인

승인 후:

1. (필요 시) `publishKnowledgeProjection` Cloud Function 트리거 — admin UI 의 "공개에 보이기".
2. `/ontology` 진입 → 트리에서 새 노드 표시 확인.
3. orphan 섹션 / warnings details 도 함께 확인.

---

## 5. 측정 기록 양식

10 개 문서 결과를 한 시트에 모아 통계.

| 문서 ID | grade | 입력토큰 | 출력토큰 | 비용 ($) | latency (s) | 노드 후보 | 엣지 후보 | drop | 승인 노드 | 승인 엣지 | 정확도 | 검수 시간 (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (예) auth-login | A | 1500 | 320 | 0.009 | 1.8 | 8 | 7 | 0 | 7 | 6 | 0.87 | 0.5 |
| ... | | | | | | | | | | | | |

집계:
- **단가 평균** = mean(비용 / 1)  — 페이지당 단가
- **정확도 평균** = sum(승인) / sum(승인 + 거절)
- **검수 cycle 중앙값** = median(output createdAt → 첫 review createdAt)
- **워커 실패율** = (failed jobs) / (total jobs) — 별도 `knowledgeExtractionJobs` 집계

### 5.0 측정 인프라 dry-run (production 진입 전 권장)

production 셋업 (Anthropic key / functions deploy / TBox 시드) 하기 전에
emulator 에서 측정 사이클 자체가 정상 동작하는지 확인:

```bash
firebase emulators:start --only firestore   # 별 터미널
FIRESTORE_EMULATOR_HOST=localhost:8080 \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aslan-project-map \
  node scripts/simulate-t11-cycle.mjs --docs=5 --reset
```

스크립트가 5 문서 분량 dummy 추출 결과 + 일부 approve / 일부 reject 시뮬
레이션을 시드 + `aggregate-extraction-metrics.mjs` 자동 호출. 4 임계값
판정이 정상 출력되면 측정 인프라 OK — production 진입 가능. `--golden`
옵션 추가 시 fixture 채점도 검증.

### 5.1 자동 집계 스크립트

```bash
# production
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<prod-project-id> \
  node scripts/aggregate-extraction-metrics.mjs --since=2026-04-27

# JSON 출력 (CI/Notion 적재용)
... --json

# Golden fixture 자동 채점 (정확도 사람 의존 0화)
... --golden=scripts/fixtures/knowledge/ontology-golden

# Fuzzy 매칭 — LLM 이 살짝 다른 title 을 만들어 정확 매칭이 어긋날 때.
# token-Jaccard 임계값 ≥ 0.7 이면 TP 인정 (기본).
... --golden=scripts/fixtures/knowledge/ontology-golden --golden-mode=fuzzy --golden-threshold=0.7
```

스크립트는 4 임계값을 Firestore 직접 read 로 계산해 `pass / fail / no-data` 로 판정한다 (`docs/superpowers/notes/2026-04-27-ontology-c1-runbook.md` §5 의 분자·분모 정의를 그대로 코드화). 진안이 시트 수기 입력에 의존하지 않음.

`--golden` 옵션이 제공되면 추가로 fixture vs 실 추출 결과 비교 — `(kind, title)` / `(type, fromTitle, toTitle)` 정확 매칭으로 TP/FP/FN 산출, 전체 precision/recall/F1 출력. F1 ≥ 0.80 이 cutover 기준. fixture 가 0 개면 자동 skip — 진안이 첫 측정 사이클에서 정답을 박은 다음 사이클부터 자동 채점. 자세한 fixture 형식: `scripts/fixtures/knowledge/ontology-golden/README.md`.

판정:

- 4 지표 모두 통과 → **C-2 진입**.
- 1~2 지표만 통과 → 미통과 항목 보강 (prompt / frontmatter / 모델).
- 3 개월 안에 통과 못하면 → §3.3 의 "결단 강제 장치" — 진안 + 본 루프가 결정 회의.

---

## 6. 자주 일어나는 문제

| 증상 | 원인 추정 | 처방 |
|---|---|---|
| `ANTHROPIC_API_KEY secret 미설정` 에러 | Functions secret 미배포 | §0.1 |
| `errorCode='cost_cap'` (입력 300,000 chars 초과 또는 chunk > 5) | 자동 chunk 분해 한도 초과. 단일 chunk 60k chars × max 5 = 300k 까지는 워커가 자동 분할 → 결과 merge | 진안이 사전 분해 (예: 큰 spec 을 별도 .md 로 split). hard cap 은 `processExtractionJobCore` 의 `MAX_CHUNK_SIZE` / `MAX_CHUNKS`. |
| candidates 가 0 개 | frontmatter 등급 C → cap 0.59 → LLM 이 confidence 낮춰서 모두 drop | frontmatter 보강 → 등급 A/B |
| validator drop 다수 | LLM 이 schema-guided 출력 안 함 (kind enum 위반 / 미지의 edge type) | prompt 의 "JSON only" 강조, 모델 sonnet → opus |
| 검수 cycle 24h 초과 | 후보 수가 너무 많아 사람이 못 따라감 | confidence 임계값 0.85 → 0.90 으로 자동 승인 비율 늘리기 또는 추출 batch 축소 |
| 비용 $0.05 초과 (post-flight warn) | 입력은 cap 통과했지만 실제 토큰이 추정보다 많음 | OutputBadges 의 "비용" chip 으로 검수자가 인지 + cost_cap 가드 한도 (`INPUT_CHAR_HARD_CAP`) 를 내려서 조절. 즉시 추출 실패는 아님. |

---

## 7. 다음 단계

- 모든 측정이 끝나면 본 루프 문서 (`2026-04-27-ontology-design-loop.md`) §5 반복 로그에 결과 한 줄 추가.
- C-1 → C-2 전환 결정 시 §3.3 의 "C-2 → C-3 진입 조건" 으로 갱신.
- 측정 raw data 시트는 별도 보관 (Notion / Linear 페이지 등 — 이 repo 에는 anonymized aggregate 만).
