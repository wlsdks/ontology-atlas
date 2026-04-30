---
title: Docs Vault Viewer — 기획자·개발자 공용 PKM 급 문서 체계
status: accepted
owner: stark
updated: 2026-04-23
tags: [docs-vault, pkm, wiki, admin, knowledge]
---

# Docs Vault Viewer

## 1. 목적

- Aslan Project Map 레포 안의 `docs/` 디렉터리는 이미 스펙·플랜·차터·아키텍처 같은 의사결정 문서를 31+ 파일로 쌓아두고 있다.
- 지금은 이걸 "에디터로 열어서 읽거나 GitHub 에서 열어서 읽는" 상태인데, PM·개발자가 브라우저에서 한 번에 훑고 링크 넘나들며 읽을 수 있어야 한다.
- 목표는 **옵시디언 수준의 vault 경험을 이 서비스 안에 내장**하는 것. Next.js static export 제약 안에서 작동해야 하고, 공개 토폴로지 제품 외양을 해치지 않아야 한다.

## 2. 핵심 결정

| 결정 | 값 | 이유 |
|------|------|------|
| 소스 | git-tracked `docs/` | 이미 존재하는 자산, PR = 히스토리, static export 친화 |
| 라우트 | `/admin/docs/*` (MVP), `/workspace/docs/*` 로 승격 예정 | 처음엔 `AdminGuard` 로 안전하게 시작, 추후 invited user 에게 viewer 권한 |
| 번들 전략 | 빌드타임 스크립트 → `public/docs-vault/` 에 raw md + `src/entities/docs-vault/data/manifest.json` | static export 와 맞물림. 런타임 의존성 0. |
| 마크다운 | `react-markdown` + `remark-gfm` (이미 의존성 있음) | 새 라이브러리 없이 재사용 |
| 권한 | admin 읽기·(향후) 편집 / invited 읽기 전용 / 미로그인 차단 | 소유자 자신 = admin, 외부 초대 = viewer/editor 가능하지만 편집은 향후 기능 |
| 편집 | **MVP 에서는 편집 UI 없음** — PR 기반 | 최소 슬라이스 원칙. 런타임 편집은 차후 knowledge v2 와 합류할 수 있음 |

## 3. 모드 설계 — 기획자 / 개발자

### 철학

같은 vault, 같은 문서. 모드는 **pre-filter + 강조** 수준. 하나의 모드가 다른 모드에서 문서를 숨기지 않는다 ("모두 보기" 옵션 기본 제공).

### 분류

| 영역 | 기획자 모드 | 개발자 모드 | 공용 |
|------|-------------|-------------|-------|
| `superpowers/specs/*` | ● 주요 | ○ 참고 | — |
| `superpowers/plans/*` | ● 주요 | ○ 참고 | — |
| `superpowers/notes/*` | ● 주요 | ○ 참고 | — |
| `CHANGELOG.md` | ● 주요 | ● 주요 | ● |
| `ARCHITECTURE.md` | ○ 참고 | ● 주요 | — |
| `DATA-MODEL.md` | ○ 참고 | ● 주요 | — |
| `DESIGN-SYSTEM.md` | ● 주요 | ● 주요 | ● |
| `DEPLOYMENT.md` | — | ● 주요 | — |
| `ADMIN-GUIDE.md` | ● 주요 | ● 주요 | ● |
| `rules/*` | — | ● 주요 | — |
| `SEED-DATA.md` | — | ● 주요 | — |

- `●`: 해당 모드의 "Focus" 섹션에 pinned 표시, 트리에서도 상단 고정.
- `○`: 트리에 그냥 보임. 모드 필터를 "엄격" 으로 두면 숨김.
- 모드 = localStorage persist, 토글 한 번이면 즉시 전환.

## 4. 데이터 모델

### 매니페스트 (`manifest.json`)

```ts
interface VaultManifest {
  version: '2026-04-23';
  generatedAt: string; // ISO
  docs: VaultDoc[];
  backlinks: Record<string /* slug */, string[] /* slugs */>;
  tags: Record<string /* tag */, string[] /* slugs */>;
  tree: VaultTreeNode;
}

interface VaultDoc {
  slug: string;           // 'superpowers/specs/2026-04-23-docs-vault-viewer'
  path: string;           // 'docs/superpowers/specs/2026-04-23-docs-vault-viewer.md'
  title: string;
  description?: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  headings: { depth: number; text: string; slug: string }[];
  excerpt: string;        // 첫 320자 (검색용)
  wordCount: number;
  updatedAt: string;      // git 이 있으면 git log, 아니면 mtime
  mode: 'planner' | 'engineer' | 'both';
  linksOut: string[];     // 이 문서가 참조하는 vault 내부 slug 들
}

interface VaultTreeNode {
  name: string;
  path: string;
  type: 'dir' | 'doc';
  slug?: string;
  children?: VaultTreeNode[];
}
```

### 슬러그 규칙

- `docs/X/Y/Z.md` → `X/Y/Z`
- `docs/README.md` → `README` (root level)
- 공백·한글 유지, URL 안전을 위해 `encodeURIComponent` 만.

## 5. 링크 resolve

1. `[text](./other.md)` 처럼 상대 경로 → vault 내부 slug 로 치환 → `<Link href="/admin/docs/slug">`.
2. `[text](other.md)` 처럼 형식의 wiki-ish relative → 현재 문서 디렉터리 기준으로 해석.
3. `http(s)://...` → `<a target="_blank" rel="noreferrer">`.
4. 앵커 (`#heading-slug`) → 내부 scroll.
5. 이미지 `![alt](./img/foo.png)` → 같은 디렉터리의 정적 파일로 해석 (MVP 에서는 assets 도 `public/docs-vault/` 로 같이 복사).

## 6. MVP 슬라이스 (V-0 ~ V-5, 이번 주)

1. **V-0**: 이 스펙 (지금 문서).
2. **V-1**: 빌드 스크립트 — `scripts/build-docs-vault.ts` 가 `docs/` 를 스캔해 `public/docs-vault/*.md`, `src/entities/docs-vault/data/manifest.json` 을 생성. `pnpm build` 의 prebuild hook 으로 연결.
3. **V-2**: `/admin/docs` 루트 + `/admin/docs/[...slug]` 다이나믹 — `AdminGuard` 래핑. 최소 레이아웃 (트리 좌, 뷰어 우).
4. **V-3**: `DocsVaultTree` 위젯 — hierarchical collapsible, 선택 highlight, 모드 pre-filter.
5. **V-4**: `DocsVaultViewer` 위젯 — react-markdown 으로 렌더, 내부 링크 resolver, 헤딩 앵커, code block 스타일링.
6. **V-5**: 기획자/개발자 모드 토글 — 상단 pill, localStorage persist, 트리 필터링.

## 7. 확장 슬라이스 (V-6 ~ V-10, loop 로 이어서)

7. **V-6**: 전문 검색 — `manifest.excerpt` 기반 client-side fuzzy search. ⌘K 재사용 혹은 vault 전용 `⌘⇧F`.
8. **V-7**: Backlinks 패널 — 현재 문서 slug 를 `manifest.backlinks` 에서 조회해 우측 사이드 노출.
9. **V-8**: 태그 인덱스 — `/admin/docs/tags/[tag]` + 문서 상단 태그 칩.
10. **V-9**: Graph view — Sigma 스택 재활용해 vault 링크 그래프. 옵시디언의 시그니처 피처.
11. **V-10**: Membership guard 완화 — `AdminGuard` → `DocsVaultAccessGuard` (admin OR membership owner/editor/viewer). 편집 UI 가 붙을 때 admin/editor 만 쓰기.

## 8. UX 가이드라인

- 디자인 시스템 준수 — 무채색 + 인디고, glass/gradient 금지, Linear 베이스.
- 토폴로지 탭 공존성: 상단 HeroCollapsed 유지, `/admin/docs` 에서는 topology canvas 미렌더.
- 모션: 페이지 전환 160ms ease-out, 트리 토글 120ms.
- 로딩: manifest 는 import 로 번들링 → 초기 로드 시점에 이미 presence. 각 md 는 `fetch('/docs-vault/...md')` 지연 로드, skeleton 3줄.
- 키보드: `⌘K` 검색, `/` 트리 포커스, `j/k` 또는 `↑/↓` 트리 내비, `⌘⇧E` 개발자 모드 토글 (차후 추가).
- 빈 상태: "vault 가 비어있어요" + "`docs/` 폴더에 md 를 추가하고 `pnpm build` 를 다시 돌려요" 안내.

## 9. 비목표 (이번 범위 아님)

- 런타임 편집 / 실시간 협업
- Firestore / Storage 기반 문서
- knowledge subsystem v2 와의 실제 통합 (향후 별도 과제)
- 공개 제품으로 노출 (`/docs` public)
- 한글 검색 tokenization 고도화 (MVP 는 단순 includes)

## 10. 성공 지표

- 어드민으로 로그인 시 `/admin/docs` 에서 31개 문서 전부 스캔·클릭 가능
- 문서 간 상대 경로 링크가 새 탭 없이 내부 내비게이션으로 이동
- 모드 토글 후 트리 구성이 기대대로 필터됨
- static export 빌드 크기 증가가 2MB 이하 (매니페스트 + raw md)
- 첫 문서 렌더까지 상호작용 가능 시점 < 1s (fast 3G 가정)

## 11. 관련 문서

- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) — 전체 아키텍처
- [`docs/DESIGN-SYSTEM.md`](../../DESIGN-SYSTEM.md) — 색·모션·타이포
- [`docs/ADMIN-GUIDE.md`](../../ADMIN-GUIDE.md) — admin 권한 흐름
- [`docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md`](./2026-04-17-document-knowledge-subsystem-v2.md) — 향후 합류 가능 지점
