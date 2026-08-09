---
uid: a81da7e2-8ff6-46c9-a0aa-27b2948bc7b3
slug: capabilities/vault-agent
kind: capability
title: Agent Connect & Vault Access
domain: domains/agent-integration
elements: [elements/agent-connect, elements/vault-agent-panel]
created_by: human
---

## 정의
AI 에이전트가 볼트를 발견·인증하고 읽고 쓸 수 있게 하는 앱 내 connect 플로우와 MCP 대면 표면. 앱 안의 대화형 에이전트는 실제 볼트 도구 근거를 수집한다. 절대 경로와 읽힌 manifest가 함께 있을 때만 활성화하여 화면의 개념, 모델이 읽는 본문, 볼트 안 감사 로그가 한 출처를 가리킨다. 로컬 러너에서는 제한된 읽기 순서와 왕복 시간 상한을 적용한다. 필수 읽기, 상세 payload에 남은 정확한 인용, 한국어 질문의 한국어 응답 중 하나를 생략하면 한 번 교정하고, 두 번째에도 따르지 않은 답은 사용자에게 싣지 않는다. 구조 감사는 census 후 `domain` 후보를 고르고 최대 8개의 정확한 slug를 모두 상세 읽는 인자 계약까지 검증한다. 모델이 project 루트 하나만 고르거나 census가 존재한다고 확인한 capability·element를 없다고 합성하면 응답을 거부한다. 마지막 합성은 개수나 fan-out을 결함·권장 노드 수·브릿지 근거로 쓰지 않고 확인한 범위의 불완전성을 보존한다. 배치 상세 읽기가 글자 상한을 넘으면 첫 행만 남기는 대신 모든 후보를 정의 발췌·관계 개수·해소된 이웃의 같은 모양으로 먼저 압축하고, 실제 payload에 남은 slug와 본문 글자만 읽기 범위로 기록한다. 각 `*Info` 필드는 무엇이 잘렸는지 보존하며 편집 전 단일 개념 재읽기를 요구한다. 이 표면은 소스 코드를 볼 수 없는 vault-only curator이므로 project의 `## Competency answers`를 직접 만들거나 고치지 않는다. system prompt와 write-intent, 최종 apply 경계가 모두 이를 막고 source-backed 자격은 repository를 읽는 Atlas MCP builder로 넘긴다.

App Settings의 agent config 상태는 실제 client config 두 개만 세며 example template을
연결로 가장하지 않는다. source-checkout과 app-bundled launch shape, 현재 vault 좌표가
맞아야 ready이고, live stdio 연결과 tool inventory는 별도 `mcp-verify`가 증명한다.

## 근거
- src/features/vault-agent — 제공자 중립 에이전트 루프, 도구 실행, 근거 인용
- src-tauri/src/llm.rs — 로컬/원격 전송, 감사 로그, 분리된 timeout
- src/widgets/vault-agent-panel — 사용자가 읽기·실패·제안을 판정하는 패널
- src/shared/config/mcp-server-launch.ts · src/features/docs-vault-local/model/use-local-vault.ts
  — JSON/TOML launch shape와 vault readiness의 공유 판정
- src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx — 활성 config 2개와
  template 역할을 숨기지 않는 Settings 표면
- src/features/vault-agent/model/competency-qualification-boundary.ts — vault-only
  proposal/apply가 source-backed 자격을 우회하지 못하게 하는 공유 경계
- scripts/deploy-macos-app-local.mjs — 최신 설치 앱 자산을 dogfood 하는 로컬 배포 계약

## 확신도
high (0.92)
