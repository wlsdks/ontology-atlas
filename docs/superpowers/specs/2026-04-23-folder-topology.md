---
title: Folder-Topology — 로컬 vault 에서 토폴로지 생성
status: accepted
owner: stark
updated: 2026-04-23
tags: [docs-vault, topology, pkm, local-vault]
---

# Folder-Topology

로컬 PC 폴더를 Docs Vault 로 지정한 사용자가, **DB 없이** 그 폴더의 `projects/*.md` 파일들로부터 토폴로지 그래프를 생성해 볼 수 있게 하는 규격.

## 1. 디렉터리 구조

```
내-볼트/
├── projects/               ← 필수. 각 .md = 1 프로젝트
│   ├── reactor.md
│   ├── iam.md
│   └── aslan-maps.md
├── categories.md           ← 선택. 카테고리 메타
├── statuses.md             ← 선택. 상태(lifecycle) 메타
├── docs/                   ← 선택. 일반 위키 (기존 Docs Vault)
│   └── ARCHITECTURE.md
└── README.md               ← 선택. 볼트 소개
```

`projects/` 가 없으면 topology 뷰는 "빈 상태 + 초기화 CTA" 로 떨어지고, 있으면 파싱해서 `Project[]` 로 변환.

## 2. 프로젝트 파일 — `projects/{slug}.md`

`{slug}` 가 URL-safe 하고 파일 이름·frontmatter 의 slug 와 같아야 한다 (충돌 시 파일 이름 우선).

### Frontmatter 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `name` | string | ✅ | 사용자에게 보이는 이름 |
| `slug` | string | ⚠ | 생략하면 파일 이름으로 유도 |
| `category` | string | ✅ | 카테고리 slug (categories.md 참조) |
| `status` | string | ❌ | 상태 slug. 기본 `active` |
| `isHub` | boolean | ❌ | 허브 프로젝트 여부. 기본 `false` |
| `dependencies` | string[] | ❌ | 의존하는 프로젝트 slug 배열 |
| `tags` | string[] | ❌ | 태그 |
| `updatedAt` | string (ISO) | ❌ | 생략 시 파일 mtime |
| `description` | string | ❌ | 한 줄 요약. 생략 시 본문 첫 문단 |
| `position` | `{x,y}` | ❌ | 토폴로지 드래그 위치 저장용 (기기 간 공유) |
| `projects` | string[] | ❌ | (관련 문서용) 이 md 가 인용하는 다른 프로젝트 |

### 예시

```yaml
---
name: Arc Reactor
slug: reactor
category: iam-platform
status: launched
isHub: true
dependencies: [iam, aslan-maps]
tags: [infra, auth]
updatedAt: 2026-04-23
description: IAM 을 중심으로 엮이는 허브 프로젝트
position: { x: 120, y: -40 }
---

# Arc Reactor

본문은 자유. Docs Vault 뷰어로 그대로 렌더되고,
토폴로지 노드를 클릭하면 이 md 편집 모드로 전환.
```

## 3. Categories — `categories.md`

간단 파서 제약으로 **body 의 h2 섹션 기반** 포맷을 쓴다. 각 h2 제목이 slug, 하위 key:value 라인이 메타.

```markdown
# Categories

## iam-platform
name: IAM 플랫폼
tone: indigo

## aslan-maps
name: Aslan Maps
tone: amber
```

- `tone` 은 `indigo | amber | neutral` 중. 없으면 자동 tone.
- 섹션 내 `name:` / `tone:` 외의 라인은 무시 (자유로운 설명 허용).

## 4. Statuses — `statuses.md`

같은 h2 섹션 포맷.

```markdown
# Statuses

## draft
label: 초안

## active
label: 활성

## launched
label: 런칭됨

## archived
label: 보관
```

생략 시 기본 세트 (draft / active / launched / archived).

## 5. Topology 생성 규칙

1. `projects/*.md` 전부 재귀로 스캔
2. 각 파일 frontmatter 파싱 → `Project` 엔티티로 매핑
3. `categories.md` 있으면 해당 리스트 사용. 없으면 project 에서 등장한 고유 category slug 들을 default tone 으로.
4. `statuses.md` 동일.
5. `dependencies` 가 존재하는 slug 가 아니면 경고 표시 (dangling reference).
6. `position` 이 있으면 초기 배치, 없으면 ForceAtlas2 자동 레이아웃.

## 6. 편집 플로우

1. 토폴로지 뷰에서 노드 클릭 → 해당 `projects/{slug}.md` Viewer 열림
2. 우측 "편집" 버튼 (권한 있을 때) → Editor 로 raw md 수정
3. 저장 시 frontmatter 도 같이 업데이트 → 다음 재스캔에 반영
4. 드래그로 노드 위치 바꾸면 optional 로 frontmatter.position 에 저장

## 7. 서버 볼트와의 관계

- **서버 (git) 볼트 에는 이 규격을 강제하지 않는다.** 현 레포 `docs/` 는 위키 중심이라 projects/ 없음 → 서버 모드에선 topology 뷰 비활성.
- 로컬 볼트는 사용자 자유. projects/ 있으면 자동으로 topology 뷰 활성화.
- 같은 슬러그가 서버와 로컬에 겹치면 현재 active source 기준.

## 8. Auto-scaffold

로컬 볼트 첫 오픈 시 projects/ 가 없으면 안내 배너 + "Topology 초기화" 버튼:

1. `projects/` 디렉터리 생성
2. `projects/sample-project.md` 2개 (hub 1 + leaf 1)
3. `categories.md` 기본 2개 카테고리
4. `statuses.md` 기본 4개 상태
5. `README.md` 에 이 규격 링크

사용자는 이후 파일 수정·삭제·추가만 하면 토폴로지가 즉시 반영.

## 9. 비목표 (이번 범위 아님)

- Firestore 클라우드 볼트 (후속 Phase 2)
- Multi-vault sidebar (후속 Phase 3)
- 서버 볼트에 projects/ 를 박제하는 것 — 공개 제품과 혼동 유발

## 10. 관련 문서

- [Docs Vault Viewer 스펙](./2026-04-23-docs-vault-viewer.md)
- [ARCHITECTURE](../../ARCHITECTURE.md)
- [DATA-MODEL](../../DATA-MODEL.md) — 서버 projects 컬렉션 스키마 (이 규격의 모티브)
