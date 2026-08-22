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
데스크톱 셸에서 새 버전을 자동 또는 수동으로 확인하고, 서명된 아카이브를
다운로드·설치한 뒤 앱을 다시 시작하게 하는 능력. 설치 앱은 release 종류에
따라 바뀌지 않는 Pages manifest 주소 하나만 읽는다.

## 포함 / 제외
- 포함: desktop-shell 24시간 자동 확인, 설정의 수동 확인, 버전별 dismiss,
  다운로드 진행률, 설치 후 relaunch, 검사 실패와 설치 실패의 분리.
- 포함: Pages 빌드가 newest non-draft GitHub Release의 `latest.json`을
  `/update/latest.json`에 staging하는 배포 계약. release candidate도 선택한다.
- 제외: 웹 앱 자체 업데이트, 별도 업데이트 서버·계정, 서명 검증 우회.

## 신뢰 경계
Pages manifest는 어느 릴리스를 가리킬지 안정적으로 배포하는 포인터다. 실제 설치
허용 여부는 Tauri updater가 각 아카이브의 번들 서명을 검증해 결정한다. 검사 실패는
설정 행에서 한 번 말하고, 설치 실패만 우하단 복구 안내를 쓴다. updater 라이브러리의
원시 영문 오류는 사용자 화면에 내보내지 않는다.

## 근거
- `src/features/app-update/model/use-app-update.ts`: 자동·수동 확인, check/install
  실패 단계, `downloadAndInstall`, 진행 상태와 relaunch
- `src/features/app-update/ui/UpdateToast.tsx` ·
  `src/widgets/app-settings-menu/ui/AppUpdateSettings.tsx`: 단계별 단일 실패 표면
- `scripts/stage-hosted-updater-manifest.mjs`: newest non-draft release 선택,
  manifest version·서명·tag-pinned HTTPS URL 검증
- `.github/workflows/deploy-pages.yml` · `src-tauri/tauri.conf.json`: Pages staging과
  설치 앱의 단일 안정 endpoint
- `scripts/check-hosted-download-surface.mjs`: 배포된 updater manifest를 함께
  확인하는 hosted surface gate

## 확신도
medium-high: 상태/배포 스크립트 시험과 현재 rc.9 manifest staging은 검증했다.
실제 새 버전 아카이브를 설치하고 재시작하는 릴리스 간 왕복은 다음 배포에서 다시
검증해야 한다.
