---
slug: elements/route-focus-manager
kind: element
title: Route Focus Manager
domain: onboarding-ux
dependencies: [elements/app-nav-rail, elements/app-settings-menu]
---

# Route Focus Manager

`src/shared/ui/route-focus-manager.tsx`는 영속 `AppShell`에서 화면 간
client/native navigation의 키보드 읽기 시작점을 소유한다.

- 실제 pathname surface가 바뀌고 destination이 아직 자체 포커스를 소유하지
  않았으면 page h1, h1이 없으면 `#main`으로 포커스를 옮긴다.
- query/hash만 바뀌는 같은 surface와 locale-only 전환에는 개입하지 않는다.
- main 내부 제어나 `aria-modal` dialog가 이미 포커스를 소유하면 덮지 않는다.
- 정적 export의 Suspense와 로컬 vault 복원이 늦게 끝나는 경로는 DOM이
  120ms 안정될 때까지 기다리되 최대 2초 뒤 관찰을 종료한다.
- native navigation에서도 살아남아야 하는 호출점은 `focus=main` URL 표식과
  짧은 session intent를 함께 남긴다. 표식은 포커스 인계 뒤 즉시 제거한다.
- 전역 `AppNavRail`의 5개 surface 목적지와 Atlas 로고도 같은 표식을 사용한다.
  context docs deep-link의 기존 query는 보존하며, modifier/new-tab activation은
  현재 탭의 session intent를 오염시키지 않는다.
- 목적 surface는 실제 `main#main`과 h1을 제공해야 한다. 공방은 무대 전체가
  main landmark이고 상단 현재 focal node명이 h1이라, route 도착과 agent가
  편집할 중심 노드가 같은 읽기 시작점을 공유한다.

`AppSettingsMenu`의 문서함/agent workflow 전환과 `AppNavRail`이 소비자다.
계약 테스트는 초기 mount, pathname/locale/query 경계, destination-owned
focus, shell remount, Suspense 지연, main 바깥 h1, 전역 목적지 query 보존과
URL 표식 정리를 검증한다.
