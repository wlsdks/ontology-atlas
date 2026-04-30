# FSD 아키텍처 규칙

## 레이어 (상위 → 하위)

```
app → views → widgets → features → entities → shared
```

## Import 방향 규칙

- **상위는 하위만 import** 가능 (역방향 금지)
- **같은 레이어끼리 직접 import 금지** — 조립은 상위 레이어에서
- **검증**: ESLint `eslint-plugin-boundaries` 플러그인이 빌드 시 자동 체크

## Public API 원칙

각 슬라이스는 루트 `index.ts`로만 외부에 노출한다.

```ts
// ✅ 허용
import { ProjectCard } from '@/entities/project';

// ❌ 금지 (내부 경로 직접 접근)
import { ProjectCard } from '@/entities/project/ui/ProjectCard';
```

## 판단 기준 — 이 코드는 어디로 가나?

| 코드 성격 | 레이어 | 예시 |
|---|---|---|
| Next.js 라우팅 파일 | `app/` (루트) | `app/project/[slug]/page.tsx` |
| 앱 초기화·providers | `src/app/` | `FirebaseProvider`, `ThemeProvider` |
| 페이지 구성 (여러 widget 조합) | `src/views/` | `HomePage`, `ProjectDetailPage` |
| 여러 feature를 조립한 UI 블록 | `src/widgets/` | `SigmaTopology`, `ProjectDrawer` |
| 사용자 한 행동 단위 | `src/features/` | `project-edit`, `admin-auth` |
| 비즈니스 도메인 개체 | `src/entities/` | `Project`, `Admin` |
| 도메인과 무관한 공통 자원 | `src/shared/` | `Button`, `cn()`, `firebase.ts` |

## `app/` vs `src/app/` 네이밍 충돌

- **루트 `app/`**: Next.js 라우팅 전용. 파일은 얇게 — 내부적으로 `src/views/*`를 import만.
- **`src/app/`**: FSD app 레이어. providers, 전역 초기화 코드.

이건 Next.js가 `app/`을 강제 이름으로 예약해서 생긴 충돌인데, 해결책은 "루트 app은 얇은 라우팅 래퍼"로 유지하는 것.

## 작업 흐름

1. 새 기능 시작 → 어느 레이어에 들어갈지 먼저 결정
2. 여러 레이어에 걸친 기능이면 → 각 레이어의 슬라이스로 분리
3. 의심스러우면 → `shared/`는 가장 안전한 선택
4. 새 슬라이스 생성 시 → 반드시 `index.ts`로 Public API 정의

## Anti-Patterns

- ❌ `shared`에 도메인 지식 (예: `shared/ui/ProjectCard.tsx` — 이건 `entities/project/ui`로)
- ❌ `feature` 내부에서 다른 `feature`를 직접 import
- ❌ 슬라이스 내부 경로를 바깥에서 직접 참조
- ❌ `views`가 `entities`를 건너뛰고 `shared/api/firestore`를 직접 호출 (엔티티 레이어를 거쳐야 함)
