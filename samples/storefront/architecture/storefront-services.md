---
architecture_schema: architecture-profile/v1
profile_uid: 5b2e0f4a-9d61-4c8e-a0f7-2c9d4e13a780
profile_slug: storefront-services
project_uid: 1beed293-711b-4b51-b8c0-65f51bc4d606
title: Storefront Services
created_by: human
patterns: [dependency:hexagonal]
scope_paths: [services/**]
exclude_paths: ['**/*.test.ts']
role_domain: [services/*/domain/**]
role_application: [services/*/application/**]
role_port: [services/*/ports/**]
role_adapter: [services/*/adapters/**]
allow_domain: []
allow_application: [domain, port]
allow_port: [domain]
allow_adapter: [application, port, domain]
evidence: [storefront.md]
---

# Storefront Services

Each of the nine areas is one service, and inside a service the dependency direction runs
inward. Adapters may reach the application and the ports; the application may reach the
domain; the domain reaches nothing at all.

That is what keeps a payment change from rippling into the catalogue. The map says which
areas exist and how they relate as a business; this says where their code is allowed to
reach, so an agent asked to change one of them knows the boundary before it starts.
