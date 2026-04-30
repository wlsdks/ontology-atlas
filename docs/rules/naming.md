# 네이밍 규칙

## 디렉토리

- **kebab-case**: `src/features/project-edit/`, `src/widgets/topology-map-sigma/`

## 파일

- **컴포넌트**: PascalCase + `.tsx` — `ProjectNode.tsx`, `HomePage.tsx`
- **훅**: camelCase, `use` prefix — `useProject.ts`, `useAdmin.ts`
- **유틸리티**: kebab-case — `cn.ts`, `format-date.ts`, `slugify.ts`
- **테스트**: 같은 이름 + `.test.ts` — `slugify.ts` → `slugify.test.ts`
- **Public API**: `index.ts` (각 슬라이스 루트)

## 변수 / 함수

- **camelCase**: `projectCount`, `formatDate`
- **Boolean**: `is/has/can` prefix — `isHub`, `hasAdmin`, `canEdit`

## 타입 / 인터페이스

- **PascalCase**: `Project`, `AdminUser`
- **접미사 X** — `ProjectProps`, `ProjectInterface` 대신 의미로 구분
- **Enum 대신 union literal**: `type Status = 'idea' | 'live' | ...`

## 상수

- **UPPER_SNAKE_CASE**: `MAX_PROJECTS`, `DEFAULT_LOCALE`

## CSS 클래스

- Tailwind 유틸리티 우선
- 커스텀 클래스 불가피할 때만 `kebab-case`

## Firestore 필드

- **camelCase**: `createdAt`, `isHub`, `launchedAt`
- 설계 문서 섹션 4.2 따름

## 이벤트 핸들러

- `handle*` prefix — `handleSubmit`, `handleNodeClick`
- props로 전달되는 콜백은 `on*` prefix — `onClose`, `onSelect`

---

# 사용자 대면 용어 딕셔너리

코드 상수·변수 이름은 위 규칙(영문 camelCase·PascalCase)을 유지한다.
아래 표는 **사용자 UI에 노출되는 한국어 표현** 통일을 위한 규칙이다.
신규 UI 카피·라벨·문구를 쓸 때 이 표를 기준으로 선택한다.

| 개념 | ✅ 권장 | ⛔ 지양 | 적용 맥락 |
| --- | --- | --- | --- |
| 사용자 데이터 단위 | **공간** | 작업 공간, 워크스페이스, 스코프 | 일반 사용자 UI (landing, hero, 드로어) |
| 인증·로그인 | **계정** | 공간, 사용자 프로필 | `/login`, `/signup`, `/reset-password`, `/account` |
| 프로젝트 간 관계 시각화 | **프로젝트 지도** | 토폴로지 지도, 맵, 장면, 씬 | 랜딩, 버튼 라벨, 드로어 |
| 기술 맥락의 그래프 | **토폴로지** | 지도, 맵 | Legend·툴팁·개발자 설명 |
| 강조 동선 | **추천 경로** | 큐레이션, 렌즈, 관점 | featured-path presets, 포트폴리오 모드 |
| 추천 경로 상의 단일 뷰 | **장면** | 씬, 스테이지, 챕터 | 포트폴리오 모드 하단 바, "이전/다음 장면" |
| 중심이 되는 노드 | **허브** | 코어 노드, 핵심 허브, 중심점 | "허브 중심", 허브 배지 |
| 여러 허브에 걸친 노드 | **공유** | 공유 시스템, 크로스오버 | 공유 배지 |
| 문서 자료 | **문서** | 지식 문서, knowledge document, md 문서 | 일반 사용자 UI |
| 내부 문서 파이프라인 | **지식 문서** | 문서 | admin/knowledge/* 관리 화면에서만 |
| 제품명 | **Narnia** | Aslan Maps, Aslan Project Map, 아슬란 지도 | 모든 사용자 대면 영역 |
| 조직명 | **아슬란 (Aslan)** | Narnia, Aslan Labs | "아슬란의 프로젝트…" 같은 설명문 |

## 적용 우선순위

1. **사용자 대면 문구**는 위 표를 따른다.
2. **코드 식별자**는 그대로 기존 영문 네이밍 유지 — `accountId`, `topologyViewMode`, `scopedAccountName` 등. 내부 API와 UI 라벨을 분리한다.
3. 하나의 화면 안에서 같은 개념은 같은 단어로. 예: 같은 드로어 안에서 "지도"와 "토폴로지"를 번갈아 쓰지 않는다.
4. 예외가 필요하면 PR 설명에 근거를 적고, 이 표를 업데이트한 PR과 같이 낸다.

## 브랜드 관련

- 사이트 브랜드는 **Narnia**. 로고·타이틀·메타데이터는 Narnia로 통일.
- 내부 프로젝트 슬러그 `aslan-maps`는 기술 식별자로 유지해도 되지만,
  사용자에게 보이는 display name (`Project.name`)은 Narnia 계열로 맞춘다.
- "Aslan Maps"가 주석·기술 문서에 남아있을 수 있으나 사용자 UI에서는 제거.
