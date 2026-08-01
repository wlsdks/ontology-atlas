---
slug: capabilities/vault-agent
kind: capability
title: Agent Connect & Vault Access
domain: domains/agent-integration
elements: [elements/agent-connect, elements/vault-agent-panel]
created_by: human
---

## 정의
AI 에이전트가 볼트를 발견·인증하고 읽고 쓸 수 있게 하는 앱 내 connect 플로우와 MCP 대면 표면. 앱 안의 대화형 에이전트는 실제 볼트 도구 근거를 수집한다. 절대 경로와 읽힌 manifest가 함께 있을 때만 활성화하여 화면의 개념, 모델이 읽는 본문, 볼트 안 감사 로그가 한 출처를 가리킨다. 로컬 러너에서는 제한된 읽기 순서와 왕복 시간 상한을 적용하고, 필수 읽기를 생략하면 한 번 교정한 뒤에도 따르지 않은 답은 사용자에게 싣지 않는다.

## 근거
- src/features/vault-agent — 제공자 중립 에이전트 루프, 도구 실행, 근거 인용
- src-tauri/src/llm.rs — 로컬/원격 전송, 감사 로그, 분리된 timeout
- src/widgets/vault-agent-panel — 사용자가 읽기·실패·제안을 판정하는 패널
- scripts/deploy-macos-app-local.mjs — 최신 설치 앱 자산을 dogfood 하는 로컬 배포 계약

## 확신도
high (0.92)
