---
uid: 8fd8d44a-64d6-483d-9fd2-a903db6352f4
slug: elements/source-inspection-probe
kind: element
title: Source inspection probe
display_en: Source inspection probe
display_ko: 소스 점검 프로브
domain: domains/code-evidence
path: mcp/src/project-source-inspection.mjs
created_by: "agent:claude-code"
---

Takes the live reading of a bound code folder: what kind of source it is, which revision it sits at, whether it has uncommitted changes, and a fingerprint of its current contents.

## Includes
- Repository identity, revision, dirty flag, and a bounded file inventory.
- The fingerprint every later freshness comparison is made against.

## Excludes
- Judging whether the folder is the right one for a project.
- Changing anything in the folder it reads.

## Uncertainty
- Read from the module's imports and its role in the receipt. The fingerprint's exact inputs were not traced, which matters here: measuring this repository twice a minute apart produced two different fingerprints, and what changed between them was not identified.