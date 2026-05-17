---
slug: capabilities/vault-validator
kind: capability
title: Vault Validator (Silent Corruption 가시화)
domain: vault-local-first
elements:
  - scripts/audit-vault-paths.mjs
  - scripts/audit-vault-paths.test.mjs
  - scripts/validate-vault-script.test.mjs
  - scripts/validate-vault.mjs
  - src/shared/lib/validate-vault-document.ts
  - tests/contract/frontmatter-writer.contract.test.ts
  - tests/contract/known-codes-drift.contract.test.ts
  - tests/contract/parse-frontmatter.contract.test.ts
  - tests/contract/validate-vault-document.contract.test.ts
  - tests/contract/vault-schema.contract.test.ts
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
   - `validateVaultDocument(raw)` — frontmatter corruption + graph array canonicality issue codes
   - error 1+ 시 exit 1 (CI 게이트 가능)
   - `--help` / `-h` 는 vault path 로 오인하지 않고 usage 만 출력한다
   - `pnpm test:vault:validate` 로 script-level argument contract 만 focused 실행한다
   - dogfood vault 는 매 PR 마다 `.github/workflows/ci.yml` 의 step 으로 자동 검증

2. **Path audit** — `pnpm vault:audit [vaultPath] [repoPath]`
   - capability / element frontmatter 의 source path 가 실제 repo 파일과 drift 없는지 확인한다
   - pnpm `--` separator, `--help`, 잘못된 vault/repo path 를 stack trace 없이 진단한다
   - `pnpm test:vault:audit` 로 audit CLI argument contract 만 focused 실행한다

3. **UI chip** — LocalVaultPicker 안의 ✗ N / ⚠ N
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
| `missing-expected-field` | warning | both |
| `non-canonical-graph-array` | warning | both |
| `dangling-graph-reference` | warning | CLI / MCP whole-vault validation |
| `parse-zero-keys` | warning | CLI only |

UI 측은 fast path 라 raw 의존 issue 와 whole-vault reference issue 는 detect 못 하지만 *대부분의 사용자 실수* (kind 값 오타 / 빠뜨림 / graph 배열 drift) 는 cover.

## Drift contracts

- `tests/contract/parse-frontmatter.contract.test.ts` — TS runtime / MCP package / scripts / CLI parser 4-way parity.
- `tests/contract/frontmatter-writer.contract.test.ts` — MCP `buildMarkdown` / `serializeFrontmatter` 와 CLI writer 의 byte-for-byte markdown shape parity.
- `pnpm test:contracts` — cross-package parser / writer / schema / validator parity contract suite 만 focused 실행한다.
- `scripts/audit-vault-paths.test.mjs` — audit script argument parsing, pnpm separator, `--help`, invalid path regression.
- `scripts/validate-vault-script.test.mjs` — script-level argument parsing, `--help`, unknown option regression. CI 에서는 `pnpm test:vault:validate` 로 focused 실행한다.
