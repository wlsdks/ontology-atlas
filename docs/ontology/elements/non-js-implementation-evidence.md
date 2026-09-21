---
uid: 77ccc7b6-6cc8-4bec-8fd8-3afde2a992ae
slug: elements/non-js-implementation-evidence
kind: element
title: Non-JavaScript implementation evidence
display_en: Non-JavaScript implementation evidence
display_ko: 비 JavaScript 구현 근거
domain: domains/code-evidence
path: mcp/src/analyze/native-evidence.mjs
created_by: "agent:claude-code"
---

Finds implementation evidence in repositories that are not JavaScript, reading Autotools role assignments out of build files and Cargo targets and modules out of the manifest and the Rust sources it names.

## Includes
- Autotools and C role assignment from the declared build manifests.
- Cargo target and module evidence from the manifest plus the sources it explicitly names.

## Excludes
- Running any build; every fact is read as bounded text.
- Languages with no reader here, which produce no evidence rather than a guess.

## Uncertainty
- Read from the module header and its constants. This repository has no Autotools or Cargo package, so nothing here was exercised in this scan, and its output shape is taken from the code rather than seen.