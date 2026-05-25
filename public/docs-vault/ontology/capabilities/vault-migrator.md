---
slug: capabilities/vault-migrator
kind: capability
title: Vault Migrator (Schema 진화)
domain: vault-local-first
elements:
  - scripts/migrate-vault.mjs
  - scripts/migrations
relates:
  - capabilities/frontmatter-to-ontology
  - domains/vault-local-first
---

# Vault Migrator

frontmatter 가 schema 다 → 키 추가 / 이름 변경 / 값 정리 시 vault 의 N 파일을
일괄 수정해야 한다. R11 에서 마이그레이션 패턴 정립.

## 사용

```bash
pnpm vault:migrate --list                 # 등록된 마이그레이션 목록
pnpm vault:migrate <id>                   # dry-run (default)
pnpm vault:migrate <id> --write           # 실제 디스크 기록
pnpm vault:migrate <id> --vault <dir>     # 다른 vault 경로
```

## 패턴

각 마이그레이션은 `scripts/migrations/<YYYY-MM-DD>-<slug>.mjs` 한 파일.
shape: `migrate(file: { path, raw, relativePath }) → { raw } | null`. null = no-op.

## 원칙

1. **Line 기반 변형 우선** — parse → reserialize 라운드트립은 주석/공백 손실 위험
2. **idempotent** — 두 번 적용해도 결과 동일
3. **dry-run default** — `--write` 명시 강제
4. **rollback 은 git** — 마이그레이션 자체가 inverse 미제공

## Reference 마이그레이션

`2026-05-04-trim-frontmatter-values` — frontmatter scalar 라인의 trailing whitespace 정리. 단위 test 8 케이스.

## Focused verification

`pnpm checks:changed` 는 `scripts/migrate-vault.mjs`, `scripts/migrations/README.md`, `scripts/migrations/*.mjs` 변경을 `pnpm vault:migrate --list` 로 먼저 안내한다. 마이그레이션 구현 파일은 추가로 `pnpm test:contracts` 로 route 되어 reference migration fixture 와 cross-package schema contract 를 같이 확인한다.
