---
uid: 0d020fba-7897-483f-a6a9-c688f3795d65
slug: elements/rust-feature-evidence
kind: element
title: Rust feature configuration evidence
display_en: Rust feature configuration evidence
display_ko: Rust 기능 설정 근거
domain: domains/code-evidence
path: mcp/src/rust-feature-evidence.mjs
created_by: "agent:claude-code"
---

Reads literal compile-time feature attributes out of conventional Cargo targets as text, recording where each one is written without deciding whether it is switched on.

## Includes
- Literal configuration attributes and the exact source location of each.
- An explicit claim boundary stating that predicates are not evaluated and no dependency is implied.

## Excludes
- Evaluating a condition, expanding a macro, or running a build script.
- Claiming runtime impact from a declared feature.

## Uncertainty
- Read from the module header and the empty result this repository produced, which reports no Cargo package present. Its behaviour on a real Rust workspace was not observed.