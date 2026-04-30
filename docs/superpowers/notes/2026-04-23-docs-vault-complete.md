---
title: Docs Vault 구현 완료 기록 (2026-04-23)
status: shipped
updated: 2026-04-23
tags: [docs-vault, changelog, pkm, wiki]
---

# Docs Vault 구현 완료 기록

하루 작업으로 `/admin/docs` 를 PKM-급 위키 뷰어/에디터로 끌어올렸다. 스펙([spec](../specs/2026-04-23-docs-vault-viewer.md)) 수립부터 V-56 까지 총 50+ 기능 단위 커밋, 모두 프로덕션 배포 완료.

## 완성된 축

### 0. 기초 (V-0 ~ V-5)

- **V-0** 스펙 문서
- **V-1** 빌드타임 매니페스트 (`scripts/build-docs-vault.mjs`) — `docs/` 32개 md 를 트리·backlinks·헤딩·excerpt 로 추출
- **V-2** `/admin/docs` 라우트 + `AdminGuard`
- **V-3** 파일트리 위젯 (collapsible, mode filter)
- **V-4** 마크다운 뷰어 (react-markdown + 내부링크 resolver)
- **V-5** 기획자 / 개발자 / 전체 모드 토글

### 1. 탐색·검색 (V-6 ~ V-11, V-27, V-31, V-38)

- **V-6** 전문 검색 팔레트 `⌘K` (title · excerpt · slug · tags AND 토큰)
- **V-7** Backlinks 패널 (인용 문서별 120자 context snippet)
- **V-8** 태그 인덱스 + 필터 (ARCHITECTURE/DESIGN-SYSTEM/DATA-MODEL/ADMIN-GUIDE 시드)
- **V-9** Vault 링크 그래프 (Sigma WebGL 재활용)
- **V-11** 최근 열어본 문서 섹션 (localStorage)
- **V-27** 검색 후 문서 매치어 `<mark>` 하이라이트 + 첫 매치 auto-scroll
- **V-31** Quick Switcher `⌘O` — 제목 전용 퍼지 매칭, 고정·최근 보너스
- **V-38** 커맨드 팔레트 `⌘⇧P` — 25+ vault 명령 퍼지 매칭 hub

### 2. 읽기 경험 (V-13, V-22, V-23, V-24, V-29, V-33)

- **V-13** 그래프 노드 hover tooltip (title · mode · degree · excerpt)
- **V-22** 문서 메타 배지 (모드 · 단어수 · 읽는 시간 ≈200 wpm · 태그 · 수정일)
- **V-23** 목차 사이드바 스크롤 스파이 (IntersectionObserver)
- **V-24** 현재 문서 URL 복사 버튼
- **V-29** 인쇄 / PDF 저장 + `@media print` CSS (UI 숨기고 흰 배경 반전)
- **V-33** Heading `#` 앵커 URL 복사 (hover reveal)

### 3. 그래프 (V-12, V-21, V-26)

- **V-12** 노드 드래그 리포지션 (camera pan 차단, grabbing cursor)
- **V-21** 선택 slug 따라가는 camera focus + 엣지 보조 하이라이트
- **V-26** `focusMode='local'` 토글 — 선택 기준 2-hop BFS 만 표시

### 4. 고정·기억 (V-17, V-18, V-19, V-34)

- **V-17** 로컬 볼트 탭 포커스 자동 새로고침 + "N초 전 스캔" 배지
- **V-18** 고정 문서 (pinned) — ⭐ 섹션, 볼트별 namespace
- **V-19** 최근 문서 볼트별 namespace persist (server / local:folder 분리)
- **V-34** Vault 통계 대시보드 (모드별 분포 bar, top 인용, top 외부링크, 태그 top10, 고아 문서)

### 5. 로컬 PC 볼트 (V-15, V-30, V-35, V-36, V-39, V-41, V-46)

File System Access API 기반. Chrome/Edge/Safari 18.2+/Opera 지원.

- **V-15** `showDirectoryPicker` → `buildLocalManifest` → IndexedDB 에 핸들 저장
- **V-30** readwrite 권한 + `saveDoc` + textarea 편집 UI
- **V-35** 새 문서 생성 (중간 dir auto create, template)
- **V-36** 문서 삭제 (pinned/recent 자동 정리)
- **V-39** Rename / move (경로 변경 + 마이그레이션)
- **V-41** 이미지 렌더 (.png/.jpg/.gif/.webp/.svg/.avif/.bmp → blob URL, auto revoke)
- **V-46** Rename 시 다른 문서의 `[[oldSlug]]` · `(oldSlug.md)` 본문 참조 자동 치환

### 6. 편집 (V-37, V-50, V-56)

- **V-37** Live preview split view (200ms debounce)
- **V-50** `[[` 입력 시 wikilink autocomplete popover
- **V-56** 마크다운 툴바 (Bold ⌘B · Italic ⌘I · Link ⌘K · H1-3 · List · Checkbox · Quote)

### 7. PKM 문법 (V-42, V-45, V-48, V-49)

- **V-42** `⌘⇧P` 로 현재 문서에 TOC 삽입 (`<!-- toc:start --><!-- toc:end -->` 마커 재실행 교체)
- **V-45** Daily notes 명령 — `daily/YYYY-MM-DD` 경로 open/create
- **V-48** Callouts `> [!note|tip|info|warning|danger|success]` 6종 스타일
- **V-49** Wikilinks `[[slug]]` `[[slug|text]]` `[[slug#anchor]]` 문법 (unresolved 는 노란 점선)

### 8. Export · Import · 공유 (V-20, V-44, V-47, V-55)

- **V-20** 어드민 대시보드에 Docs Vault 링크 (discoverability)
- **V-44** 볼트 JSON 백업 export (manifest + 모든 raw md 를 단일 JSON)
- **V-47** JSON import (충돌 시 덮어쓰기 / 스킵 선택)
- **V-55** 현재 문서 standalone HTML export (inline CSS)

### 9. 권한·접근 (V-10, V-25)

- **V-10** `DocsVaultAccessGuard` — AdminGuard 완화 (admin / owner / editor / viewer 모두 read 가능). `useDocsVaultCapabilities` 로 canEdit/canManage 도출. 편집 UI 는 canEdit 에서만
- **V-25** 모바일 responsive — md 미만 좌측 aside 숨기고 상단 Menu 아이콘 drawer

### 10. 디스커버리 (V-14, V-28, V-32)

- **V-14** Shortcut sheet 에 Docs Vault 섹션 추가
- **V-28** 4개 하위 섹션으로 확장 (일반/그래프/볼트/액션)

## 법적 체크

- `[[wikilink]]` 문법, graph view, daily notes, backlinks 모두 MediaWiki (2001+) 시절부터의 **업계 공용 PKM 개념**. LogSeq (AGPL), Foam (MIT), TiddlyWiki 등 오픈소스 구현 다수.
- File System Access API = W3C 표준
- Markdown + frontmatter = CommonMark/GFM
- 상표 "Obsidian" 만 주의 — UI 표기 2곳 모두 "위키"/"PKM" 으로 교체 완료

## 미구현 / 후속 과제

- Outlinks autocomplete (웹 도메인 suggest)
- 오디오·비디오 embed
- 볼트 diff (두 백업 비교)
- 문서 템플릿 라이브러리 (templates/ 폴더 기반)
- Firestore 런타임 볼트 (knowledge subsystem v2 와 합류)

## 관련 문서

- [Docs Vault Viewer 스펙](../specs/2026-04-23-docs-vault-viewer.md)
- [ARCHITECTURE](../../ARCHITECTURE.md)
- [ADMIN-GUIDE](../../ADMIN-GUIDE.md)
- [DESIGN-SYSTEM](../../DESIGN-SYSTEM.md)
