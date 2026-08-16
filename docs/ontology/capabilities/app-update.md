---
uid: 74c21391-8605-46a0-b880-e19cd30c65e4
slug: capabilities/app-update
kind: capability
title: App Auto-Update
domain: domains/onboarding-and-shell
elements: []
path: src/features/app-update
created_by: "agent:unknown"
---

## 정의
데스크톱 셸에서 새 버전을 주기적으로 확인하고, 업데이트 토스트에서 다운로드·설치·
재시작하거나 버전별로 안내를 닫게 하는 능력.

## 포함 / 제외
- 포함: desktop-shell 자동 확인, 버전별 dismiss, 진행 상태, 설치 후 relaunch.
- 제외: 웹 업데이트, 현재 화면에 연결되지 않은 수동 확인, updater feed·서명·실제 설치
  성공의 배포 환경 보증.

## 근거
- `src/features/app-update/model/use-app-update.ts`: desktop gate, update 확인,
  `downloadAndInstall`, 진행 상태와 relaunch
- `src/features/app-update/ui/UpdateToast.tsx`: 설치·재시작·닫기 상태 표면
- `src/app/providers/AppShell.tsx`: 앱 셸의 hook/toast 연결
- `src/features/app-update/model/update-state.test.ts`: 웹 차단, 24시간 주기,
  dismiss, 진행률과 release-note 상태 검증

## 확신도
medium: 구현과 상태 단위 테스트는 일치하지만 실제 Tauri updater 설치는 미검증.
