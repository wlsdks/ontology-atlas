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
- .github/workflows/release-macos.yml (`main` workflow_dispatch에서 태그와 SHA를 admission하고, `release-signing` 빌드와 별도 `release` 공개 승인을 거쳐 같은 SHA의 자산만 게시)
- .github/workflows/windows-beta-check.yml (비밀 키 없는 Windows PR 네이티브 검증)
- scripts/check-macos-release-source.mjs (annotated/lightweight tag를 commit까지 풀어 admit/pin 단계에서 태그 재지정과 stale source를 실패 폐쇄)
- scripts/check-macos-release-github.mjs (두 보호 환경의 main-only/no-tag/admin-bypass 정책, 공개 승인, 환경 secret 7개와 repository 복사본 부재를 사전 검증)
- scripts/build-macos-release-artifact.mjs (11개 릴리스 child에 단계별 credential allowlist를 적용하고 App Store Connect `.p8`를 `0600` 임시 파일로만 materialize한 뒤 제거)
- scripts/notarize-macos-dmg.mjs (keychain profile 또는 API key 경로·ID·issuer만 `notarytool`에 전달하며 password/private-key 본문의 argv·child env 상속을 금지)
- scripts/generate-download-release-facts.mjs (GitHub Release 자산에서 URL·크기·SHA-256을 생성하고, 자산 version을 태그와 대조하며 외부 문자열을 JSON 리터럴로 격리)
- scripts/check-macos-release-status.mjs (PR·workflow·보호 환경·secret·공개 자산 증거를 합치며, 다운로드 검증 생략을 readiness blocker로 유지)
- docs/FEATURES.md: "`/download`: the install decision"

## 확신도
high (0.95)
