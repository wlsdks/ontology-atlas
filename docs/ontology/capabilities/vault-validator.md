---
slug: capabilities/vault-validator
kind: capability
title: Vault Validator (Silent Corruption 가시화)
domain: vault-local-first
elements:
  - src/shared/lib/validate-vault-document.ts
  - scripts/validate-vault.mjs
relates:
  - capabilities/frontmatter-to-ontology
  - domains/vault-local-first
---

# Vault Validator

frontmatter parser 가 lenient by-design — `---` 닫힘 빠짐 / 빈 키 / 잘못된 들여쓰기에서
조용히 빈 frontmatter 반환. 사용자가 .md 잘못 작성하면 노드가 *graph 에서 조용히 사라짐*.
R11 에서 이 silent corruption 을 가시화.

## 두 surface

1. **CLI** — `pnpm vault:validate [vaultPath]`
   - `validateVaultDocument(raw)` — 5 issue codes: unclosed-frontmatter / empty-kind / missing-kind / unknown-kind / parse-zero-keys
   - error 1+ 시 exit 1 (CI 게이트 가능)
   - dogfood vault 는 매 PR 마다 `.github/workflows/ci.yml` 의 step 으로 자동 검증

2. **UI chip** — LocalVaultPicker 안의 ✗ N / ⚠ N
   - `validateVaultDocFrontmatter(fm)` — fast UI path (raw 다시 안 읽음, parsed frontmatter 만 검증)
   - `summarizeVaultValidation(items)` — collection helper
   - error 빨강 / warning amber

## issue codes

| code | severity | 검출 가능 surface |
|---|---|---|
| `unclosed-frontmatter` | error | CLI only (raw 필요) |
| `empty-kind` | error | both |
| `missing-kind` | warning | both |
| `unknown-kind` | warning | both |
| `parse-zero-keys` | warning | CLI only |

UI 측은 fast path 라 raw 의존 issue 는 detect 못 하지만 *대부분의 사용자 실수* (kind 값 오타 / 빠뜨림) 는 cover.
