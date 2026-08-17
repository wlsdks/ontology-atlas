---
uid: cf8a7154-61e7-44e2-969e-b977d5019121
slug: elements/private-vault-sidecar-boundary
kind: element
title: Private Vault Sidecar Boundary
domain: domains/local-vault-management
path: mcp/src/vault-sidecar.mjs
created_by: "agent:unknown"
---

MCP와 CLI가 `.ontology-atlas` 아래의 비공개 영수증·활동 로그를 다루는 공통 파일 경계다. sidecar 디렉터리와 최종 파일의 symlink/junction, 파일 identity 변경, hardlink 별칭을 실패 닫고, 원자 교체와 충돌 검사를 제공한다. 순수 Node 경로 API의 한계 때문에 동일 UID 공격자가 검사 사이에 부모 이름을 바꾸는 경쟁까지 완전한 디렉터리 핸들 격리로 주장하지 않는다.