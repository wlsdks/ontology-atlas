import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

// FSD 레이어 경계를 lint 단계에서 강제. boundaries v6 (2026~)의 공식
// `boundaries/dependencies` + object-form selectors로 작성.
//   문서: https://www.jsboundaries.dev/docs/rules/dependencies/

// ── 디자인 헌장 §11 (기존): scale hover · 보라핑크 그라디언트 금지 ──────
// 아래 셀렉터 배열은 여러 config object 에서 재사용된다. flat config 는 같은
// rule 을 여러 번 선언하면 마지막이 "덮어쓰기"(배열 병합 아님)라, size 램프
// 룰을 추가하는 config 도 이 셀렉터를 함께 실어야 scale/gradient 가드가 그
// 파일에서 유실되지 않는다.
const scaleGradientSelectors = [
  {
    selector: "Literal[value=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
    message: '디자인 헌장 §11 — scale hover 금지. bg/border 변경 또는 색 alpha 로 대체.',
  },
  {
    selector:
      "TemplateElement[value.raw=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
    message: '디자인 헌장 §11 — scale hover 금지 (template literal). bg/border 변경으로 대체.',
  },
  {
    selector: "Literal[value=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
    message: '디자인 헌장 §11 — 보라핑크 그라디언트 금지. 단일 인디고 또는 무채색만.',
  },
  {
    selector:
      "TemplateElement[value.raw=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
    message: '디자인 헌장 §11 — 보라핑크 그라디언트 금지 (template literal).',
  },
];

// ── Geometry & Type Codex (R5) 봉쇄 ─────────────────────────────────
// text-[Npx] / rounded-[Npx] arbitrary 클래스 금지 — docs/DESIGN-SYSTEM.md
// "Geometry & Type Codex" 램프(text-caption…text-hero / rounded-chip…panel)
// 로만 표현한다. 램프 밖의 의도적 예외는 `// eslint-disable-next-line
// no-restricted-syntax -- <사유>` 로 명시. 마이그레이션 완료 디렉토리 = error,
// 미완(topology-map-v2 · views/home) = warn.
const arbitrarySizeSelectors = [
  {
    selector: 'Literal[value=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — text-[Npx] 하드코딩 금지. text-caption/label/body/body-lg/title/display/hero 램프로. 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — text-[Npx] 하드코딩 금지 (template literal). text-* 램프로.',
  },
  {
    selector: 'Literal[value=/rounded-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — rounded-[Npx] 하드코딩 금지. rounded-chip/card/panel 램프로. 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/rounded-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — rounded-[Npx] 하드코딩 금지 (template literal). rounded-* 램프로.',
  },
  // 2026-07-26 — 소유자 질문("박스 모양이나 모서리나 테두리 규격 ... **md말고
  // 코드로도**")에서 드러난 구멍. `text`/`rounded` 는 잡고 있었는데 **그림자는
  // 룰이 없었다** — `design.md` 가 `--shadow-elevation-1/2/3` 사다리를 정의해
  // 놨는데도 하드코딩 rgba 섀도가 5건 살아 있었다(치환 완료).
  //
  // **`var(` 가 없는 것만 잡는다.** `shadow-[var(--chrome-shadow)]` 는 Tailwind
  // 에서 CSS 변수를 참조하는 **정상 문법**이지 위반이 아니다 — 초안에서 `shadow-\[`
  // 를 통째로 금지했다가 정상 토큰 사용 90여 건까지 경고해 lint 출력이 144 →
  // 548 로 뛰었다. 노이즈가 신호를 덮으면 게이트는 무력해진다.
  // ⚠️ 메시지에 **리터럴 유틸리티 문법을 쓰지 말 것.** Tailwind v4 의 소스
  // 스캐너가 이 파일의 문자열도 훑기 때문에, 예시로 적은 클래스명이 실제
  // 클래스로 생성된다 — 2026-07-26 에 예시 하나가 `--tw-shadow: var(--...)`
  // 라는 파싱 불가 CSS 를 만들어 프로덕션 빌드를 깨뜨렸다(Playwright 전체 실패).
  {
    selector: 'Literal[value=/shadow-\\[(?:(?!var\\()[^\\]])*\\]/]',
    message:
      'Geometry Codex — shadow 하드코딩 금지. --shadow-elevation-1/2/3 (coach-mark < popover < dialog) 또는 --topology-*-shadow 토큰을 shadow 유틸리티 안에서 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/shadow-\\[(?:(?!var\\()[^\\]])*\\]/]',
    message:
      'Geometry Codex — shadow 하드코딩 금지 (template literal). --shadow-elevation-* 토큰을 shadow 유틸리티 안에서 var() 로 참조한다.',
  },
  // 2026-07-26 hex — **현재 위반 0건인 예방 게이트다.** 전수 측정 결과 Tailwind
  // arbitrary value 안에 hex 를 박은 곳은 src/app 전체에 하나도 없었고, 남은
  // hex 127건은 전부 정당한 예외였다: 테스트 픽스처 83 · PR 번호 주석 16 ·
  // CSS-var 가 닿지 않는 표면 16(next/og Satori · viewport.themeColor ·
  // standalone HTML) · JS 측 토큰 진실원 7 · 토큰 리더 fallback 3 · 마스크
  // 알파 스텐실 2.
  //
  // 그래서 "모든 hex 금지" 는 27건의 소음만 만들고 잡을 신호가 0 이었다.
  // **Tailwind arbitrary value 안**으로 좁히면 오늘 0건 · 미래 유입만 차단한다.
  // (shadow 룰에서 배운 것과 같은 교정 — 넓은 룰은 정상 사용을 위반으로 센다.)
  {
    selector: 'Literal[value=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      '디자인 헌장 — Tailwind arbitrary value 안 hex 금지. --color-* 토큰을 var() 로 참조한다. CSS 변수가 닿지 않는 표면(Canvas·next/og·standalone HTML)은 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      '디자인 헌장 — Tailwind arbitrary value 안 hex 금지 (template literal). --color-* 토큰을 var() 로.',
  },
  // 2026-07-27 모션 duration — 그림자 사다리와 **똑같은 실패 모드**였다. 램프
  // (--motion-fast/base/settle)를 정의해 놓고 룰이 없어, 참조하는 컴포넌트는
  // 하나뿐인데 리터럴 30건이 그 옆에 살아 있었다.
  //
  // 켜기 전 측정(design.md 4단계): 위반은 tsx 30건뿐이고 정상 사용으로 오인될
  // 부류가 없다 — 토큰 참조형은 대괄호가 뒤따라서 이 정규식(뒤에 숫자)에 애초에
  // 안 걸린다. 그림자 룰이 필요했던 `var(` 예외 협소화가 여기선 불필요하다.
  // 30건을 **먼저 치환하고** 룰을 켰으므로 켜는 순간 위반 0, lint 총계 불변.
  //
  // 앞쪽 `(?:^|[^-\w])` 는 `transition-duration-…` 같은 CSS 속성명 문자열이
  // 오탐되는 것을 막는다.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을
  // 훑는다(2026-07-26 에 예시 하나가 프로덕션 빌드를 깨뜨렸다).
  {
    selector: 'Literal[value=/(?:^|[^-\\w])duration-\\d/]',
    message:
      '모션 duration 하드코딩 금지. 기본(--motion-fast, 확인)이면 duration 클래스를 생략하고, 표면 이동은 --motion-base, 확정은 --motion-settle 을 duration 유틸리티 안에서 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])duration-\\d/]',
    message:
      '모션 duration 하드코딩 금지 (template literal). --motion-fast/base/settle 토큰으로.',
  },
  // 2026-07-27 행간 — 글자 크기는 규격이 있는데 줄 사이 간격은 없었다. 전수
  // 측정 결과 arbitrary 19종 75건이 네 클러스터로 갈렸고, 클러스터 **안**의
  // 값 차이(같은 패널에서 1.5·1.55·1.6·1.65)는 전부 드리프트였다.
  //
  // 켜기 전 측정(design.md 4단계): 정상 사용으로 오인될 부류 0 — 램프 스텝은
  // 대괄호를 안 쓰고, 기존 named 유틸리티(leading-4/relaxed 등 199건)는 이
  // 정규식이 요구하는 숫자-대괄호 형태가 아니라 애초에 안 걸린다. named 쪽을
  // 룰로 잡지 않는 이유: 199 warning 은 베이스라인 143 을 덮는 소음이고,
  // 대세인 leading-4/5/6 의 값(16/20/24px)은 램프 짝과 동일해 위반도 아니다.
  // 74건을 **먼저 치환하고** 룰을 켰으므로 켜는 순간 위반 0, 총계 불변.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/leading-\\[[0-9.]+\\]/]',
    message:
      '행간 하드코딩 금지. --leading-caption 부터 --leading-prose 까지 9단 램프가 만드는 유틸리티로 쓴다 (크기 스텝과 1:1 짝). 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/leading-\\[[0-9.]+\\]/]',
    message:
      '행간 하드코딩 금지 (template literal). --leading-* 램프 토큰이 만드는 유틸리티로.',
  },
  // 2026-07-27 램프 우회 — 행간 companion 결합(B2) 이후 새로 생긴 실패 모드다.
  // 크기 스텝이 행간을 함께 싣게 되면서, **램프 토큰을 arbitrary length 로
  // 우회 참조**하면 크기만 얻고 그 단의 행간은 못 얻는다. 같은 원소에 다른
  // 단의 램프 클래스가 있으면 그 단의 행간이 그대로 남아, 아무도 고른 적 없는
  // 비율이 만들어진다 — 실측: /git 헤드라인이 23px 글자에 title 짝 24px 행간
  // (1.04)이었고 이 저장소에서 가장 큰 이탈이었다.
  //
  // 켜기 전 측정(design.md 4단계): 위반 3건(전부 램프 토큰을 가리키는 것),
  // 정상 사용으로 오인될 부류 0 — 램프 밖 크기 토큰(레일 라벨·크롬 타이틀 등
  // 5건)은 `--text-` 접두가 아니라 정규식에 애초에 안 걸린다. 3건을 먼저
  // 치환하고 룰을 켰으므로 켜는 순간 위반 0, lint 총계 불변.
  //
  // 짝이 어긋나는 **일반형**(램프 클래스 + 반응형 arbitrary px)은 이 룰이 못
  // 잡는다 — 판정에 한 원소의 클래스 전체가 필요한데 cn() 인자로 쪼개지면
  // 셀렉터 하나에 안 담긴다. 그 층은 계약 테스트가 맡는다
  // (tests/contract/type-ramp-leading-pair.contract.test.ts).
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/text-\\[length:var\\(--text-/]',
    message:
      '타입 램프 토큰을 arbitrary length 로 우회 참조 금지. 램프 유틸리티(text-<스텝>)를 직접 쓴다 — 우회하면 크기만 얻고 그 단이 싣는 행간 짝을 잃는다. 램프 밖 크기 토큰(레일·크롬 전용)은 이 룰에 걸리지 않는다.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[length:var\\(--text-/]',
    message:
      '타입 램프 토큰을 arbitrary length 로 우회 참조 금지 (template literal). 램프 유틸리티를 직접 쓴다.',
  },
];

// 마이그레이션 완료(치환 끝 · error 봉쇄) 디렉토리.
// 계약 테스트(`tests/contract/type-ramp-coverage.contract.test.ts`)가 이 목록을
// 그대로 읽는다 — 목록 밖 디렉토리의 램프 이탈은 lint 가 **0건으로 보고**하므로
// (2026-07-26 실측: `project-detail` 의 text-[12px] 가 그렇게 통과했다) 그 사각을
// 테스트가 래칫으로 붙든다. 여기에 디렉토리를 추가하려면 그 안의 이탈을 먼저 0으로.
export const codexMigratedGlobs = [
  // 진입 검수 E-11 (2026-07-26) — 첫 화면 카드가 `text-[Npx]` 20건을 들고도
  // `pnpm exec eslint <file>` 에서 **error 0 / warning 0** 을 보고했다. 룰이
  // 틀린 게 아니라 이 디렉토리들을 안 보고 있었다(침묵하는 통과). 진입 경로
  // 4곳의 이탈을 0으로 만들고 여기 승격한다 — 이제 error 로 막힌다.
  'src/features/first-run-starter/**/*.{ts,tsx}',
  'src/features/docs-vault-local/**/*.{ts,tsx}',
  'src/features/locale-switch/**/*.{ts,tsx}',
  'src/features/project-quick-edit/**/*.{ts,tsx}',
  // 2026-07-27 `/download` 리메이크 — 첫 공개에서 낯선 사람이 처음 만나는
  // 표면이 램프 이탈 59건(장부 최대 항목)을 들고 있었다. 재구성으로 0이 됐고,
  // 승격했으니 이제 error 로 막힌다.
  'src/views/download/**/*.{ts,tsx}',
  'src/views/ontology-insights/**/*.{ts,tsx}',
  'src/views/project-selector/**/*.{ts,tsx}',
  'src/views/ontology-edit/**/*.{ts,tsx}',
  'src/views/docs-vault/**/*.{ts,tsx}',
  'src/shared/ui/**/*.{ts,tsx}',
  'src/widgets/**/*.{ts,tsx}',
];
// R6(다른 에이전트) 동시 작업 중 — 아직 미치환, warn 으로만 신규 유입 경고.
const codexR6Globs = [
  'src/widgets/topology-map-v2/**/*.{ts,tsx}',
  'src/views/home/**/*.{ts,tsx}',
];
// 테스트는 렌더된 className 문자열을 assert 하므로 램프 룰에서 제외.
const codexTestIgnores = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

// local-first 첫 paint firebase 0 약속 회귀 방지 (PR #99 이후).
//
// `@/entities/<x>` 메인 barrel 은 firebase 의존이 없어야 한다 (type / lib /
// pure helper 만). firestore 구독·mutation 함수는 `@/entities/<x>/api` 로
// 직접 import 해서 cloud-mode 진입 시점에만 chunk 가 다운로드되게.
//
// 메인 barrel 에서 아래 names 를 import 하면 "api 경로 사용해" 메시지로
// 막는다. 새 api 함수 추가 시 메인 barrel 에 export 도 절대 X — 추가하면
// 이 목록에 names 도 같이 추가해 회귀 차단.
//
// **공유 배열인 이유**: flat config 는 같은 rule 을 뒤에서 다시 정의하면
// option 을 병합하지 않고 **교체**한다. 더 좁은 스코프 블록이 자기 제한만
// 적으면 이 firestore 가드가 그 경로에서 조용히 사라진다. 스코프 블록은
// 반드시 이 배열을 스프레드한 뒤 자기 항목을 더한다.
//
// 자세히: `@.claude/rules/architecture.md`.
const firestoreApiRestrictedPaths = [
  {
    name: '@/entities/project',
    importNames: [
      'listProjects',
      'getProject',
      'upsertProject',
      'upsertProjectPositions',
      'deleteProject',
      'deleteProjects',
      'subscribeProjects',
      'fetchAllProjectsAtBuild',
      'uploadScreenshot',
      'deleteScreenshot',
    ],
    message:
      "firestore api 는 '@/entities/project/api' 로 직접 import 하세요 (local-first 첫 paint 청크 firebase 0 보장).",
  },
  {
    name: '@/entities/category',
    importNames: [
      'subscribeCategories',
      'upsertCategory',
      'deleteCategory',
      'seedDefaultCategoriesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/category/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/status',
    importNames: [
      'subscribeStatuses',
      'upsertStatus',
      'deleteStatus',
      'seedDefaultStatusesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/status/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/admin',
    importNames: ['isAdmin'],
    message: "firestore api 는 '@/entities/admin/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/ontology-class',
    importNames: [
      'subscribeOntologyClasses',
      'upsertOntologyClass',
      'seedDefaultOntologyClassesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/ontology-class/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/ontology-relation',
    importNames: [
      'subscribeOntologyRelations',
      'upsertOntologyRelation',
      'seedDefaultOntologyRelationsIfEmpty',
    ],
    message: "firestore api 는 '@/entities/ontology-relation/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/knowledge-graph',
    importNames: [
      'listKnowledgeProjectInsight',
      'subscribeKnowledgeProjectInsight',
      'subscribeKnowledgePublicGraph',
      'subscribeKnowledgeApprovedGraph',
      'subscribeKnowledgePublicMeta',
      'addManualKnowledgeNode',
      'addManualKnowledgeEdge',
    ],
    message:
      "firestore api 는 '@/entities/knowledge-graph/api' 로 직접 import 하세요. (lazy hook `useKnowledgePublic*` 은 메인 barrel 그대로 OK.)",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next 16.2.4 부터 React Compiler 기반 새 규칙이 error
    // 로 승격됐는데, setState-in-effect / refs-during-render / 수동
    // memoization 등은 우리가 의도적으로 쓰는 유효 패턴이라 error 로
    // 막으면 과도. 경고 레벨로 낮춰 lint 는 통과시키고 점진적 개선.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app-layer', pattern: 'src/app/**' },
        { type: 'views', pattern: 'src/views/**' },
        { type: 'widgets', pattern: 'src/widgets/**' },
        { type: 'features', pattern: 'src/features/**' },
        { type: 'entities', pattern: 'src/entities/**' },
        { type: 'shared', pattern: 'src/shared/**' },
      ],
      'boundaries/include': ['src/**/*'],
    },
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          rules: [
            // 값 import — 표준 FSD 레이어 방향.
            {
              from: { type: 'app-layer' },
              allow: {
                to: {
                  type: ['views', 'widgets', 'features', 'entities', 'shared'],
                },
              },
            },
            {
              from: { type: 'views' },
              allow: {
                to: { type: ['widgets', 'features', 'entities', 'shared'] },
              },
            },
            {
              from: { type: 'widgets' },
              allow: { to: { type: ['features', 'entities', 'shared'] } },
            },
            {
              from: { type: 'features' },
              allow: { to: { type: ['entities', 'shared'] } },
            },
            {
              from: { type: 'entities' },
              allow: { to: { type: ['shared'] } },
            },
            {
              from: { type: 'shared' },
              allow: { to: { type: ['shared'] } },
            },
            // 타입 전용 import (`import type ...`) 은 모든 방향에서 허용.
            // 컴파일 시 소멸되므로 런타임 의존성이 없고, 아키텍처 결합도를
            // 만들지 않는다. shared/mocks/demo-data 가 entity shape 을 type
            // 으로 참조하거나, feature 가 다른 feature 의 타입을 참조하는
            // 합리적 케이스를 허용. `dependency.kind` 는 selector 레벨 필드.
            {
              from: {
                type: [
                  'app-layer',
                  'views',
                  'widgets',
                  'features',
                  'entities',
                  'shared',
                ],
              },
              allow: {
                to: {
                  type: [
                    'app-layer',
                    'views',
                    'widgets',
                    'features',
                    'entities',
                    'shared',
                  ],
                },
                dependency: { kind: 'type' },
              },
            },
          ],
        },
      ],
    },
  },
  // firestore api 경로 가드 — 목록은 `firestoreApiRestrictedPaths` 가 단일 출처.
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: firestoreApiRestrictedPaths }],
    },
  },
  // 도메인 용량 막대는 kind 팔레트를 쓰지 않는다 (소유자 확정 2026-07-26,
  // `.qa-scratch/domain-bar-color-2026-07-26.md`).
  //
  // 이 막대의 두 조각은 순서(역량이 늘 왼쪽) + 단위어 + 바로 옆 숫자가 이미
  // 정체를 나른다. 거기에 kind 색을 얹으면 중복 잉크인데, 하필 그 쌍(앰버
  // rgba(211,159,73) · 유칼립투스 rgba(124,166,141))은 트랙 위 합성 대비가
  // 1.14:1 이라 밝기로는 갈리지 않고 hue 로만 갈렸다 — 적록 색약이 가장 못
  // 가르는 축이다. 그래서 앱 공통 막대 문법(무채색 + 인디고 하나 + 1px 심)
  // 으로 내려왔다.
  //
  // 룰이 없으면 이 규격은 지켜지지 않는다 — `getOntologyKindTone` 은 한 줄
  // import 로 되돌아온다. kind 팔레트는 색이 정체를 나르는 **유일한** 채널인
  // 자리(종류 센서스의 무라벨 스택, 지도 점, 트리 칩)에만 남는다.
  //
  // ⚠️ flat config 는 rule option 을 병합하지 않고 **교체**한다 — 위 블록의
  // firestore 가드가 이 경로에서 사라지지 않도록 같은 배열을 스프레드한다.
  {
    files: ['src/widgets/domain-capacity-bar/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: firestoreApiRestrictedPaths,
          patterns: [
            {
              group: ['@/entities/ontology-class', '@/entities/ontology-class/**'],
              message:
                '도메인 용량 막대는 kind 팔레트를 쓰지 않습니다 — 조각의 정체는 순서·단위어·숫자가 나르고, 채색은 `--color-indigo-brand` + `--color-text-quaternary` + 1px 심입니다. 근거: `.qa-scratch/domain-bar-color-2026-07-26.md`.',
            },
          ],
        },
      ],
    },
  },
  // 디자인 헌장 §11 (CLAUDE.md) 자동 차단 — Track E-13 (자율 루프).
  // - scale hover 금지 (`hover:scale-*` `active:scale-*` etc)
  // - 보라핑크 그라디언트 금지 (`from-purple-*` `to-pink-*` 조합)
  // - glassmorphism: 별도 Track 으로 처리 (현재 코드 사용 0).
  // 위반 시 lint error — 코드 PR 통과 못 함.
  {
    files: ['src/**/*.{ts,tsx,jsx,js}', 'app/**/*.{ts,tsx,jsx,js}'],
    rules: {
      'no-restricted-syntax': ['error', ...scaleGradientSelectors],
    },
  },
  // Codex 램프 봉쇄 — 마이그레이션 완료 디렉토리 = error. scale/gradient
  // 셀렉터도 함께 실어 flat config 덮어쓰기로 그 가드가 유실되지 않게 한다.
  {
    files: codexMigratedGlobs,
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
      ],
    },
  },
  // R6 동시 작업 디렉토리 = warn (미치환 유입만 경고). 위 migrated 블록보다
  // 뒤라 widgets/topology-map-v2 는 여기서 warn 으로 내려간다.
  {
    files: codexR6Globs,
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'warn',
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
      ],
    },
  },
  globalIgnores([
    '.next/**',
    // 에이전트 병렬 작업용 임시 git worktree — 자기 lint는 각 워크트리에서
    // 돈다. 메인 lint가 이 안까지 스캔하면 타 세션 진행 중 코드가 노이즈로 섞임.
    '.claude/worktrees/**',
    // QA 에이전트 산출물 전용 디렉토리 (gitignored) — 조사 스크립트 잔여물이
    // 메인 lint 게이트를 깨는 재발 방지.
    '.qa-scratch/**',
    'out/**',
    'build/**',
    'src-tauri/target/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
