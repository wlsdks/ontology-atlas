---
uid: 9d0c5be0-e2dc-4487-8b52-1db955939352
slug: capabilities/vault-sample-source
kind: capability
title: Sample Vault Demo Source
display_ko: 예시 볼트 출처
domain: domains/local-vault-management
elements: []
path: src/features/vault-sample-source
created_by: "agent:unknown"
---

## Definition
Source for a bundled example vault that lets a vault-less web visitor explore without installing or choosing a folder. This source is web-only: the installed app exposes no sample entrance, switch, command, or fallback manifest.

## Evidence
- src/features/vault-sample-source (implementation evidence)
- src/app/providers/AppShell.tsx (installed-shell exclusion boundary)

## Confidence
medium-high (0.8)
