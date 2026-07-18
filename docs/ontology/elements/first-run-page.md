---
slug: elements/first-run-page
kind: element
title: Desktop First-Run Page
domain: onboarding-ux
relates: [capabilities/desktop-app-distribution, domains/vault-local-first]
---

`src/views/first-run/` — 설치형 앱(Tauri)의 볼트 미선택 첫 화면. 마케팅 랜딩
대신 옵시디언식 진입: 볼트 폴더 열기(기존 `useLocalVault().open()`) · 새 볼트
만들기(빈 폴더면 기존 `scaffoldOntology()` — 마크다운 시드 5개 + 에이전트
설정) · 데모 볼트 둘러보기(`/docs` 정적 dogfood fallback) + local-first 신뢰
라인.

분기는 `src/shared/lib/desktop-shell.ts` 의 `isDesktopShell()` — Tauri 런타임
(`isTauriVaultRuntime`)과 1:1, dev 전용 시뮬 시임(`?shell=desktop`)은
production 게이트 밖. 웹 `/` 는 랜딩(획득 표면) 유지 — 진입 표면 2원화
(정체성 결정 2026-07-18). 릴리스 프리플라이트 `check-desktop-readiness` 가
이 계약을 검증한다.
