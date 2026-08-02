---
slug: project
kind: project
title: My project
display_ko: 내 프로젝트
display_en: My project
domains:
  - domains/example-domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# 내 프로젝트

이 프로젝트가 무엇인지 한두 줄로 적어 주세요 — *무엇을 / 누구를 위해 / 왜*.

## 한 줄 사명

이 프로젝트가 푸는 문제, 또는 만들어 내는 가치를 한 문장으로.

## 어떻게 자라나

- frontmatter 의 `domains: [...]` 를 채우면 도메인 노드가 프로젝트 트리에
  자동으로 매달립니다.
- 각 도메인의 역량과 요소도 같은 방식으로 이어집니다.
- AI 에이전트가 새 노드를 추가하면 이 파일의 `depends_on` / `domains` 가
  자동 갱신될 수 있습니다 — frontmatter 가 단일 진실원이라 충돌이 없습니다.

## 다음에 할 일

1. 이 파일의 `title`(그리고 `kind: project` 외 다른 frontmatter)을 내 프로젝트에
   맞게 고칩니다.
2. 스타터 하나는 제자리에서 이름을 바꾸고, 도메인을 더 만들 때는 공방,
   MCP `add_concept`, 또는 CLI `add`를 씁니다. 스타터 UID를 새 노드에
   복사하지 않습니다.
3. AI 에이전트(Claude Code, Cursor, …)를 연결하고 "이 문서함의 온톨로지를
   정리해 줘" 라고 부탁합니다.
