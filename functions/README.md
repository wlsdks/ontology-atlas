# Aslan Project Map — Cloud Functions

knowledge subsystem v2 의 trusted worker · publish backend. 2nd gen (asia-northeast3).

## Extraction 파이프라인

`processExtractionJob` (onDocumentCreated `knowledgeExtractionJobs/{jobId}`) 가 markdown 을
읽어 `knowledgeExtractionOutputs/{outputId}` 로 nodes/edges 를 쓴다.

- **primary**: Gemini adapter (`extract-gemini.js`) — 실제 LLM 호출로 구조 추출
- **fallback**: stub (`buildOutputRecord`) — frontmatter + heading 파서 기반 휴리스틱

Gemini 호출은 다음 조건에서 실패해 stub 으로 fallback:
- `GEMINI_API_KEY` 환경변수 미지정
- LLM 응답 타임아웃 (기본 20초)
- JSON 파싱 실패 또는 스키마 검증 실패 (document 루트 노드 누락, edge 의 tempId 미매칭 등)

`knowledgeExtractionOutputs` 문서의 `provider` 필드로 구분:
- `"gemini"` — 실제 LLM 추출 성공
- `"stub-fallback"` — Gemini 실패 후 stub 복구
- `"stub"` — stub 만 돌린 레거시 (이전 버전)

## 설정

### 로컬 emulator

`functions/.env.local` 에 키를 넣는다 (`.env.local` 은 git 에 올라가지 않음):

```
GEMINI_API_KEY=<Google AI Studio 에서 발급한 키>
```

`firebase emulators:start --only functions,firestore` 로 실행.

### 프로덕션 배포

Firebase Functions secret 으로 등록한 뒤 배포:

```bash
firebase functions:secrets:set GEMINI_API_KEY
# 프롬프트에서 키 입력

firebase deploy --only functions
```

배포된 함수는 `defineSecret("GEMINI_API_KEY")` 로 선언된 secret 을 런타임에 자동 주입.
secret 변경 시 재배포 필요.

### 키 발급

[Google AI Studio](https://aistudio.google.com/apikey) — 무료 quota 로 충분.
공개 저장소에 key 가 노출됐다면 바로 revoke 하고 재발급.

## 디버깅

- `processExtractionJob` 로그에서 `[gemini] extraction succeeded` 또는
  `[gemini] fallback to stub` 메시지로 분기 확인
- job 실패 시 `knowledgeExtractionJobs/{jobId}.status === "failed"` 와 `lastError` 필드 참고
- extraction 결과는 `knowledgeExtractionOutputs/{outputId}.provider` 로 추적

## M2 · 외부 HTTP API (`receiveDoc`)

`receive-doc.js` — `onRequest` HTTP 엔드포인트. 외부 클라이언트 (CLI · CI · MCP) 가
워크스페이스 컨테이너에 노드를 push.

```bash
curl -X POST https://<region>-<project>.cloudfunctions.net/receiveDoc \
  -H "Authorization: Bearer nk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "stark",
    "projectId": "narnia",
    "doc": {
      "slug": "iam-spec",
      "name": "IAM Spec",
      "isHub": false,
      "description": "...",
      "hubIds": ["iam-hub"]
    }
  }'
```

응답: `{ status:"ok", action:"created"|"updated", path, writtenAt }`.

키 검증: SHA-256(plaintext) 가 `accounts/{accountId}/apiKeys/*.keyHash` 와 일치
+ `revokedAt` 미설정 + 일치 직후 `lastUsedAt`/`usageCount` fire-and-forget 갱신.

write 경로: `accounts/{accountId}/workspaceProjects/{projectId|"general"}/{hubs|nodes}/{slug}`.
`isHub: true` → hubs 서브컬렉션, 아니면 nodes (with `hubIds[]`).

CORS: 모든 origin 허용 (Bearer 만 있으면 어디서든 호출 가능).

배포:
```bash
firebase deploy --only functions:receiveDoc
```

## Developer Activity Ingest (`receiveGitHubActivity`)

`receive-github-activity.js` — GitHub App webhook 을 받아 Docs Vault 개발자
관점의 activity projection 으로 저장하는 HTTP 엔드포인트.

Webhook URL:

```text
https://<region>-<project>.cloudfunctions.net/receiveGitHubActivity?accountId=<accountId>
```

설정/배포:

```bash
firebase functions:secrets:set GITHUB_WEBHOOK_SECRET
firebase functions:secrets:set GITHUB_APP_ID
firebase functions:secrets:set GITHUB_PRIVATE_KEY
firebase deploy --only functions:receiveGitHubActivity,functions:reprocessGitHubActivityDelivery,functions:redeliverGitHubActivityDelivery,functions:pruneDeveloperActivityDeliveries
```

수신 조건:

- `X-Hub-Signature-256` HMAC 검증 성공
- `X-GitHub-Event` 가 `push`, `pull_request`, `issues`, `issue_comment`
- payload 안의 `docs/*.md` 또는 `public/docs-vault/*.md` 경로가 Docs Vault
  slug 로 매핑됨

저장 위치:

```text
accounts/{accountId}/developerActivityEvents/{eventId}
```

클라이언트는 이 projection 을 읽어 Docs Vault 트리/그래프에 activity marker
를 표시하고, 확인 처리는 `unread=false` 만 업데이트한다.

Delivery log:

```text
accounts/{accountId}/developerActivityDeliveries/{deliveryId}
```

`received` → `processed|ignored|failed` 상태로 기록한다. Docs Vault 의 개발자
관점에서 delivery log 를 확인하고, 이미 저장된 payload 는
`reprocessGitHubActivityDelivery` callable 로 다시 projection 할 수 있다.

GitHub 자체 redelivery 는 `redeliverGitHubActivityDelivery` callable 이 담당한다.
이 callable 은 `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` 로 GitHub App JWT 를 만들고,
`GET /app/hook/deliveries` 에서 `X-GitHub-Delivery` GUID 를 numeric delivery id 로
해석한 뒤 `POST /app/hook/deliveries/{delivery_id}/attempts` 를 호출한다.

payload 보존 기간은 30일이다. `pruneDeveloperActivityDeliveries` scheduler 가
매일 오래된 `developerActivityDeliveries` 문서를 삭제한다.
