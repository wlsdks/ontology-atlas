---
uid: dee1e2ca-3c47-4f9f-be08-5d818fa54137
slug: elements/import-reconciliation
kind: element
title: Import reconciliation
display_en: Import reconciliation
display_ko: 임포트 대사
domain: domains/code-evidence
path: mcp/src/reconcile-imports.mjs
created_by: "agent:claude-code"
---

Takes the difference between the import edges observed in code and the dependencies the vault already declares, turning a long list of imports into the short list of what actually differs.

## Includes
- Edges present in code but not declared, and declarations with no observed import behind them.
- A bounded review packet so a large repository returns something a person can read.

## Excludes
- Writing any of the differences into the vault.
- Claiming that an undeclared import ought to become a dependency; that stays a judgement.

## Uncertainty
- Read from the module header, which records that the unreconciled output was a firehose of several hundred edges. This scan measured 1,261 module edges in this repository but did not run a full reconciliation against the vault.