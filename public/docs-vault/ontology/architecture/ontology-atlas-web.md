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
summary_routing: The entry point for each page address. It only names which screen to open and hands over; no logic lives here.
summary_routing_ko: 각 주소가 들어오는 입구입니다. 어떤 화면을 열지 정해 넘기기만 하고, 로직은 여기 두지 않습니다.
summary_app: What every screen shares from the start: theme, language, and the app-wide data every page expects to be ready.
summary_app_ko: 모든 화면이 처음부터 함께 쓰는 것입니다. 테마, 언어, 그리고 모든 페이지가 준비돼 있다고 믿는 앱 전체 데이터입니다.
summary_views: One module per screen a page can open, put together from the layers below.
summary_views_ko: 열 수 있는 화면 하나마다 모듈 하나이며, 아래 계층을 조립해 만듭니다.
summary_widgets: A large block a screen drops in whole, such as the map or the agent panel.
summary_widgets_ko: 지도나 에이전트 패널처럼 화면이 통째로 가져다 쓰는 큰 블록입니다.
summary_features: One thing a person does, such as opening a folder or writing a relation, with the state that action needs.
summary_features_ko: 폴더 열기, 관계 쓰기처럼 사람이 하는 한 가지 행동과 그 행동에 필요한 상태입니다.
summary_entities: A thing the product talks about, with its shape and the rules for reading and writing it.
summary_entities_ko: 제품이 이야기하는 대상으로, 그 형태와 읽고 쓰는 규칙을 함께 담습니다.
summary_shared: Basic parts anything may use: design tokens, UI pieces, small helpers, and types. It depends on nothing here.
summary_shared_ko: 무엇이든 쓸 수 있는 기본 부품입니다. 디자인 토큰, UI 조각, 작은 도우미 함수, 타입이며, 여기 있는 어느 것에도 의존하지 않습니다.
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
