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
summary_domain: The rules the business would still have on paper: prices, stock, refunds. It depends on nothing.
summary_domain_ko: 가격, 재고, 환불처럼 종이에 적어도 그대로인 업무 규칙이며, 아무것에도 의존하지 않습니다.
summary_application: The steps that carry out one request, calling the domain and going out through ports.
summary_application_ko: 요청 하나를 처리하는 절차로, 도메인을 호출하고 포트를 통해 바깥으로 나갑니다.
summary_port: The interfaces the inside declares so it can talk outward without knowing who answers.
summary_port_ko: 안쪽이 누가 답하는지 모른 채 바깥과 이야기하려고 선언해 두는 인터페이스입니다.
summary_adapter: The outside edge: HTTP, queues, databases. It is replaceable, and nothing inside depends on it.
summary_adapter_ko: HTTP, 큐, 데이터베이스 같은 바깥 경계이며, 교체할 수 있고 안쪽의 무엇도 여기에 의존하지 않습니다.
evidence: [storefront.md]
---

# Storefront Services

Each of the nine areas is one service, and inside a service the dependency direction runs
inward. Adapters may reach the application and the ports; the application may reach the
domain; the domain reaches nothing at all.

That is what keeps a payment change from rippling into the catalogue. The map says which
areas exist and how they relate as a business; this says where their code is allowed to
reach, so an agent asked to change one of them knows the boundary before it starts.
