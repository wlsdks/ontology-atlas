---
title: Docs Vault Audience Workflows
description: Developer Activity Ingest 와 Relationship Radar 의 최소 제품 계약
tags: [docs-vault, ux, github, mcp]
mode: both
---

# Docs Vault Audience Workflows

이 문서는 Docs Vault 의 `기획자` / `개발자` 관점을 단순 필터가 아니라 실제 작업 흐름으로 확장하기 위한 최소 계약이다.

## 1. 원칙

- 관점은 문서를 숨기는 모드가 아니다. 선택된 본문은 유지하고, 추천과 주변 맥락만 관점에 맞게 정렬한다.
- 자동 연결은 쓰기 전에 반드시 사람이 승인한다.
- 외부 연동은 공개 앱에 직접 비밀키를 넣지 않는다.
- GitHub App, MCP, HTTP API 이벤트는 같은 `DeveloperActivityEvent` 형태로 정규화한다.

## 2. Developer Activity Ingest

개발자 관점은 “지금 작업한 지점이 어느 문서/노드에 닿았는지”를 즉시 보여주는 기능이다.

### 2.1 이벤트 모델

```ts
type DeveloperActivitySource = 'mcp' | 'api' | 'github';
type DeveloperActivityKind =
  | 'doc.created'
  | 'doc.updated'
  | 'doc.linked'
  | 'github.push'
  | 'github.pull_request'
  | 'github.issue';
```

필수 필드는 `source`, `kind`, `title` 이다. `docSlug`, `projectSlug`, `targetSlugs` 가 있으면 Docs Vault 트리와 그래프에서 해당 문서/프로젝트 노드가 표시된다.

### 2.2 현재 구현 범위

- 브라우저 localStorage 기반 event inbox
- Firestore `accounts/{accountId}/developerActivityEvents` 구독
- Firestore `accounts/{accountId}/developerActivityDeliveries` delivery log 구독
- `window.aslanDocsVaultActivityIngest(input)` 진입점
- `aslan:docs-vault:activity:append` CustomEvent 진입점
- 개발자 관점에서 Activity 패널 표시
- 문서 트리, Vault Graph, Folder Topology 의 activity marker/pulse
- GitHub App webhook receiver `receiveGitHubActivity`
- 수신된 delivery payload 기반 재처리 callable `reprocessGitHubActivityDelivery`
- GitHub App JWT/private key 기반 자체 redelivery callable `redeliverGitHubActivityDelivery`
- delivery payload 30일 보존/삭제 scheduler `pruneDeveloperActivityDeliveries`
- 개발자 관점의 `Agent Work Monitor`: AI agent / MCP / GitHub commit 이 건드린 문서를 작업 중 목록과 트리 marker 로 표시

### 2.3 GitHub 연동 방향

GitHub 연동은 GitHub App + webhook 이 맞다. GitHub App webhook 이 이벤트 발생 시 서버로 HTTP POST payload 를 보낼 수 있기 때문이다. 정적 export 앱은 webhook secret/JWT 를 안전하게 보관할 수 없으므로 Cloud Functions for Firebase 같은 trusted backend 가 수신해야 한다.

권장 흐름:

1. GitHub App 설치
2. Cloud Functions `receiveGitHubActivity` 가 `X-Hub-Signature-256` 검증
3. push / pull_request / issues 이벤트를 `DeveloperActivityEvent` 로 정규화
4. `accounts/{accountId}/developerActivityEvents/{eventId}` 에 저장
5. 클라이언트는 activity projection 만 읽어 pulse 표시

Webhook URL 은 workspace 단위로 `?accountId={accountId}` 를 붙인다. secret 은 `GITHUB_WEBHOOK_SECRET` Secret Manager 값으로 둔다. push 이벤트는 `docs/*.md` 또는 `public/docs-vault/*.md` 경로를 Docs Vault slug 로 매핑하고, pull_request / issues 계열은 title/body 에 언급된 md 경로를 후보로 매핑한다.

AI agent 가 커밋에 문서 파일을 포함하면 push webhook 이 해당 md 경로를 읽어 Docs Vault slug 로 바꾼다. 그 결과 개발자 관점에서 해당 문서는 “작업 중”으로 표시되고, 선택된 문서가 작업 대상이면 상단 monitor 에 “현재 문서 작업 중” 상태를 보여준다.

GitHub App 설치 템플릿은 [`../templates/github-app-manifest.json`](../templates/github-app-manifest.json) 을 기준으로 한다. GitHub manifest flow 는 app 생성 시 webhook secret 과 private key 를 생성하므로, 생성된 webhook secret 을 Firebase Secret Manager 의 `GITHUB_WEBHOOK_SECRET` 값으로 등록한다.

### 2.4 Delivery log / reprocess

`receiveGitHubActivity` 는 서명 검증 후 `accounts/{accountId}/developerActivityDeliveries/{deliveryId}` 에 payload 와 처리 상태를 남긴다.

- `received`: 서명 검증 후 수신됨
- `processed`: activity projection 저장 완료
- `ignored`: Docs Vault slug 로 매핑되는 대상이 없음
- `failed`: projection 저장 중 실패

어드민 UI 의 “재처리”는 이미 수신·저장된 payload 를 다시 `DeveloperActivityEvent` 로 정규화하는 내부 reprocess 다. “GitHub 재전송”은 GitHub App JWT 와 private key 로 GitHub REST API 에 redelivery 를 요청한다. GitHub REST API 의 redelivery endpoint 는 numeric delivery id 를 요구하므로, 서버는 저장된 `X-GitHub-Delivery` GUID 를 `/app/hook/deliveries` 목록에서 먼저 해석한다.

payload 는 운영 디버깅에 필요하지만 장기 보존할 데이터가 아니므로 `pruneDeveloperActivityDeliveries` 가 30일 지난 delivery log 를 삭제한다.

`@octokit/rest` 는 GitHub REST API JavaScript client 이고 MIT license 라 오픈소스/상용 양쪽에 도입 가능하다. 단, 배포물에는 MIT notice 를 유지한다.

## 3. Relationship Radar

기획자 관점은 “비슷하거나 이어지는 문서/프로젝트를 바로 알아차리는” 기능이다.

### 3.1 점수 신호

- 이미 서로 링크됨
- 공통 태그
- 같은 `frontmatter.projects` 또는 `project:*` 참조
- 제목/설명/excerpt 의 공통 키워드
- 현재 관점과 맞는 문서

### 3.2 현재 구현 범위

- 선택 문서 기준 추천 후보 계산
- 후보별 점수와 이유 표시
- 후보 열기
- 승인 상태 표시
- 숨김 처리

승인은 현재 UI 상태에만 남는다. 실제 문서 링크 삽입, frontmatter 업데이트, approved graph 반영은 별도 쓰기 플로우로 분리한다.

## 4. 다음 구현 조건

서버 연동을 시작하기 전 닫아야 할 것:

1. webhook signature 검증 실패 로그 정책
2. Relationship Radar 승인 결과를 문서 본문에 쓸지, 별도 review queue 에 둘지 결정
3. 로컬 볼트와 서버 볼트 간 activity source of truth 분리
