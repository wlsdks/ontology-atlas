---
uid: de739ff1-9bfd-49e3-ac86-54427a5f5840
slug: capabilities/desktop-download-decision
kind: capability
title: Desktop Download Decision
domain: domains/onboarding-and-shell
elements: [elements/download]
path: src/views/download
created_by: "agent:unknown"
---

## 정의
플랫폼별 설치 파일과 신뢰 상태를 한 자리에서 비교하고, 설치가 막히면 웹으로
계속할 수 있게 하는 능력. macOS는 서명·공증된 Apple Silicon/Intel DMG를,
Windows는 SmartScreen 위험을 먼저 밝힌 미서명 x64 베타를 제시한다.

## 근거
- src/views/download (플랫폼 그룹·릴리스 사실·경고·CTA)
- .github/workflows/release-macos.yml (macOS + Windows 공개 릴리스 검증)
- .github/workflows/windows-beta-check.yml (비밀 키 없는 Windows PR 네이티브 검증)
- scripts/generate-download-release-facts.mjs (GitHub Release 자산에서 URL·크기·SHA-256 생성)
- docs/FEATURES.md: "`/download`: the install decision"

## 확신도
high (0.95)
