---
id: mcp-servers
kind: project
project: mcp-servers
title: MCP Servers
version: 1
---

# MCP Servers

3 종 MCP (Model Context Protocol) 서버 묶음 — `atlassian-mcp-server`,
`clipping-mcp-server`, `swagger-mcp-server`. Arc Reactor agent
runtime 의 Tool 공급원으로 동적 등록되어 사용됨.

## 도메인 (Domain)

### Atlassian Integration

Jira / Confluence / Bitbucket API 를 MCP Tool 로 노출 — 55 Tool
(Jira 16 + Confluence + Bitbucket).

### News Clipping

RSS 기반 뉴스 수집 → AI 요약 → 일일 다이제스트. 운영자 admin Tool
13 + 사용자 Tool.

### API Schema Exploration

OpenAPI / Swagger spec 로드 + 탐색. agent 가 외부 API 의 endpoint /
스키마 자동 이해.

## 기능 (Capability)

### Jira Tools (16)

`jira_list_projects` / `jira_get_issue` / `jira_create_issue` /
`jira_search_issues` (JQL) / `jira_transition_issue` 등.

### Confluence Tools

페이지 검색 / 본문 가져오기 / 작성.

### Bitbucket Tools

repository / PR / commit 조회.

### Allowlist 필터링

Atlassian 의 project / repo 별 접근 통제 — agent 가 허가된 자원만 보게.

### RSS 수집 (Collect)

`admin_collect` / `admin_collect_async` — 카테고리별 뉴스 수집.

### AI 요약 (Summarize)

`admin_summarize` / `admin_summarize_async` — Gemini 기반 요약.

### Daily Digest

`admin_daily_summary` — 일일 다이제스트 생성.

### Slack Digest 송신

`admin_send_digest` — 외부 액션 (Slack 즉시 게시).

### OpenAPI Spec Load

swagger-mcp-server 가 OpenAPI 3.x / Swagger 2.x 로드.

### Endpoint Search

agent 가 자연어로 endpoint 검색 → spec 일부 반환.

### MCP Protocol (SSE / STDIO)

3 서버 모두 MCP 프로토콜로 reactor 와 통신. SSE 또는 STDIO 모드.

## 핵심 요소 (Element)

### Kotlin

3 서버 모두 Kotlin.

### Spring Boot

application 프레임워크.

### Spring AI MCP Server

MCP 프로토콜 구현 — reactor 와의 핵심 인터페이스.

### PostgreSQL (clipping)

clipping 의 뉴스 / 카테고리 진실원.

### Google Gemini

clipping 의 AI 요약.

### Jira REST API / Confluence REST API / Bitbucket REST API

atlassian 의 외부 API.

### JDK 21

런타임.

### Gradle 8.14

빌드.

## 의존 (Dependencies)

reactor 의 MCP Registry 를 통해 동적 등록. atlassian 은 외부 Atlassian
Cloud, clipping 은 외부 RSS feeds, swagger 는 사용자 제공 OpenAPI spec.
