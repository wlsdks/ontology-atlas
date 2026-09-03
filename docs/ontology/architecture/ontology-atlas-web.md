---
architecture_schema: architecture-profile/v1
profile_uid: e9f5fe88-3711-4b3c-9f77-3b6f809db82c
profile_slug: atlas-web
project_uid: 8c48b61f-1f75-448e-87a5-6ea2a7b02cf8
title: Atlas Web Workbench
created_by: human
patterns: [source-organization:feature-sliced-design]
scope_paths: [app/**, src/**]
exclude_paths: [**/*.test.ts, **/*.test.tsx, **/*.test.mjs, **/*.spec.ts]
role_order: [routing, app, views, widgets, features, entities, shared]
role_routing: [app/**]
role_app: [src/app/**]
role_views: [src/views/**]
role_widgets: [src/widgets/**]
role_features: [src/features/**]
role_entities: [src/entities/**]
role_shared: [src/shared/**]
summary_routing: Locale-prefixed Next entry wrappers. They name a page and hand off; no logic lives here.
summary_routing_ko: 로케일이 붙은 Next 진입 래퍼로, 페이지를 지정해 넘길 뿐 로직은 여기 두지 않습니다.
summary_app: Providers and start-up wiring the whole app shares: theme, i18n, and the stores a page assumes are already running.
summary_app_ko: 앱 전체가 함께 쓰는 프로바이더와 시작 배선으로, 테마와 i18n, 그리고 화면이 이미 준비됐다고 전제하는 스토어가 여기 있습니다.
summary_views: One module per screen a route can open, assembled from the layers below it.
summary_views_ko: 라우트가 열 수 있는 화면 하나마다 모듈 하나이며, 아래 계층을 조립해 만듭니다.
summary_widgets: A composite block a screen drops in whole, such as the map canvas or the agent panel.
summary_widgets_ko: 지도 캔버스나 에이전트 패널처럼 화면이 통째로 가져다 쓰는 복합 블록입니다.
summary_features: One thing a person does (open a folder, write a relation, copy a handoff) with the state that act needs.
summary_features_ko: 사람이 하는 한 가지 행동(폴더 열기, 관계 쓰기, 핸드오프 복사)과 그 행동에 필요한 상태입니다.
summary_entities: A thing the product talks about, with its shape and the rules for reading and writing it.
summary_entities_ko: 제품이 이야기하는 대상으로, 그 형태와 읽고 쓰는 규칙을 함께 담습니다.
summary_shared: Primitives everything may use: design tokens, UI parts, pure helpers, and types. It depends on nothing here.
summary_shared_ko: 디자인 토큰, UI 부품, 순수 헬퍼, 타입처럼 무엇이든 쓸 수 있는 기본 요소이며, 여기 있는 어느 것에도 의존하지 않습니다.
dependency_policy: lower-only
dependency_usages: [value]
evidence: [docs/ARCHITECTURE.md#fsd-layers, eslint.config.mjs]
---

# Atlas Web Workbench Architecture

This profile records the reviewed source-organization contract for the Next.js
workbench. It is not an ontology node. The Ontology Map continues to describe
what the codebase builds and why; this profile describes which implementation
roles may depend on which lower roles.

The root `app/` directory owns locale-prefixed routing wrappers. Source modules
then follow `app -> views -> widgets -> features -> entities -> shared`, with
same-role imports allowed. The observed source model is always derived from the
connected repository and never copied into this document as a second truth.
