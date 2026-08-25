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
dependency_policy: lower-only
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
