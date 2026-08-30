---
uid: 9d0c5be0-e2dc-4487-8b52-1db955939352
slug: capabilities/vault-sample-source
kind: capability
title: Sample Vault Demo Source
display_ko: 예시 볼트 출처
domain: domains/local-vault-management
elements: []
path: src/entities/vault-session/model/use-sample-source.ts
created_by: "agent:unknown"
---

## Definition
Source for a bundled example vault that lets a vault-less web visitor explore without installing or choosing a folder. This source is web-only: the installed app exposes no sample entrance, switch, command, or fallback manifest.

## Evidence
- src/entities/vault-session/model/use-sample-source.ts and use-static-vault-source.ts (moved from src/features/vault-sample-source on 2026-08-30; the sample source is session state every vault-reading feature depends on)
- src/app/providers/AppShell.tsx (installed-shell exclusion boundary)

## Confidence
medium-high (0.8)
