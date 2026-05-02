import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

// FSD 레이어 경계를 lint 단계에서 강제. boundaries v6 (2026~)의 공식
// `boundaries/dependencies` + object-form selectors로 작성.
//   문서: https://www.jsboundaries.dev/docs/rules/dependencies/

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
  // local-first 첫 paint firebase 0 약속 회귀 방지 (PR #99 이후).
  //
  // `@/entities/<x>` 메인 barrel 은 firebase 의존이 없어야 한다 (type / lib /
  // pure helper 만). firestore 구독·mutation 함수는 `@/entities/<x>/api` 로
  // 직접 import 해서 cloud-mode 진입 시점에만 chunk 가 다운로드되게.
  //
  // 메인 barrel 에서 아래 names 를 import 하면 "api 경로 사용해" 메시지로
  // 막는다. 새 api 함수 추가 시 메인 barrel 에 export 도 절대 X — 추가하면
  // 이 룰에 names 도 같이 추가해 회귀 차단.
  //
  // 자세히: `@.claude/rules/architecture.md`.
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
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
              message:
                "firestore api 는 '@/entities/ontology-relation/api' 로 직접 import 하세요.",
            },
            {
              name: '@/entities/ontology-tbox',
              importNames: [
                'loadActiveTBox',
                'createTBoxVersion',
                'activateTBoxVersion',
                'listTBoxVersions',
                'getActiveTBoxState',
                'generateTBoxVersionId',
                'appendClassAndActivate',
                'appendRelationAndActivate',
                'updateClassMetadataAndActivate',
                'ActiveTBox',
              ],
              message: "firestore api 는 '@/entities/ontology-tbox/api' 로 직접 import 하세요.",
            },
            {
              name: '@/entities/knowledge-document',
              importNames: [
                'listKnowledgeDocuments',
                'getKnowledgeDocument',
                'subscribeKnowledgeDocuments',
                'subscribeKnowledgeDocumentsByProject',
                'getPublicDocumentsForProject',
                'createKnowledgeDocumentWithInitialVersion',
                'createKnowledgeDocumentVersion',
                'setKnowledgeDocumentCurrentVersion',
                'listKnowledgeVersionsByDocument',
                'subscribeKnowledgeVersionsByDocument',
                'buildKnowledgeDocumentStoragePath',
                'downloadKnowledgeMarkdown',
                'uploadKnowledgeMarkdown',
                'deleteKnowledgeMarkdown',
              ],
              message:
                "firestore api 는 '@/entities/knowledge-document/api' 로 직접 import 하세요.",
            },
            {
              name: '@/entities/knowledge-evidence',
              importNames: ['subscribeKnowledgeEvidenceByDocument'],
              message:
                "firestore api 는 '@/entities/knowledge-evidence/api' 로 직접 import 하세요.",
            },
            {
              name: '@/entities/knowledge-job',
              importNames: ['subscribeKnowledgeJobsByDocument'],
              message: "firestore api 는 '@/entities/knowledge-job/api' 로 직접 import 하세요.",
            },
            {
              name: '@/entities/knowledge-output',
              importNames: ['subscribeKnowledgeOutputsByDocument'],
              message:
                "firestore api 는 '@/entities/knowledge-output/api' 로 직접 import 하세요.",
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
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
          message:
            '디자인 헌장 §11 — scale hover 금지. bg/border 변경 또는 색 alpha 로 대체.',
        },
        {
          selector:
            "TemplateElement[value.raw=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
          message:
            '디자인 헌장 §11 — scale hover 금지 (template literal). bg/border 변경으로 대체.',
        },
        {
          selector:
            "Literal[value=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
          message:
            '디자인 헌장 §11 — 보라핑크 그라디언트 금지. 단일 인디고 또는 무채색만.',
        },
        {
          selector:
            "TemplateElement[value.raw=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
          message:
            '디자인 헌장 §11 — 보라핑크 그라디언트 금지 (template literal).',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
