---
uid: 748a7bcd-1161-497a-be90-05556570d248
slug: elements/source-witness-claims
kind: element
title: Source witness claims
display_en: Source witness claims
display_ko: 소스 증거 주장
domain: domains/code-evidence
path: mcp/src/project-source-witnesses.mjs
created_by: "agent:claude-code"
---

Turns each explicit claim the vault makes about code into one checkable statement: this node is implemented at this path, so the count of claims that land is the binding's only honest confidence signal.

## Includes
- One witness per node entry point, plus the evidence paths a project's competency answers cite.
- A role on each witness saying whether it came from a node's entry point or a project answer.

## Excludes
- Inventing a claim the vault did not write down.
- Treating a landed path as proof the node's meaning is correct.

## Uncertainty
- Read from the module header and observed directly: this vault's binding currently reports 54 witnesses, all supported. How a partially-moved folder is reported was not tested.