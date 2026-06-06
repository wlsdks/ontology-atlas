---
slug: capabilities/project-ontology-indexing
kind: capability
title: Project Ontology Indexing
domain: ai-agent-partner
elements: [cli/src/commands/index.mjs, cli/src/integration.test.mjs, elements/operations-nav, mcp/src/index.js, mcp/src/integration.test.mjs]
relates: [capabilities/cli-developer-entry, capabilities/mcp-server]
---

# Project Ontology Indexing

Long-running project ontology indexing entrypoint. `index_project` gives AI agents one read-only checkpoint that combines repo structure analysis, import-edge indexing, and vault validation before any write. The CLI pair is `ontology-atlas index`: default mode prints a side-effect-free plan, and `--apply` delegates to the existing bootstrap writer pipeline.

This capability exists because large projects need a resumable analyze -> index -> validate -> review -> apply loop, not only a cold-start bootstrap command. The meaning gate is now part of the structured payload, not only copy guidance: `analyze_repo_structure.meaningGate` separates `businessOntology` domain/capability candidates from `implementationEvidence` element paths, and `index_project.meaningGate` summarizes the same split as plan counts. Capability folders without README/domain evidence are listed under `implementationEvidence.reviewRequiredCapabilities` with a reason and source path, so raw code structure does not become product ontology by default. Code structure is implementation evidence, not the ontology itself. A plan must name the business/product domain and capability first, then cite source files, imports, and validation rows as element-level proof.

The Ontology Atlas app settings Agent tab surfaces this capability as a practical first-call checkpoint. It shows the direct MCP call and the local CLI plan command together, while keeping `--apply` as an explicit post-review write action. The visible card now tells the user to report business/product meaning before code rows, so the workflow does not collapse into raw source indexing.

The project reanalysis packet now tells Claude Code / Codex what evidence to report from `index_project`: `meaningGate.businessOntology`, `meaningGate.implementationEvidence`, `meaningGate.implementationEvidence.reviewRequiredCapabilities`, the core business/product meaning, `plan.concepts`, `plan.suggestedRelations`, `plan.importRelations`, validation problem/path-drift counts, import scan counts, threshold filtering, and `imports.reconciliationSummary`. This matters during dogfooding because a large `inCodeMissingEndpointAbsent` count means many code import endpoints are not materialized as vault nodes yet; it is a missing-node queue, not proof that the curated ontology is stale. Likewise `inVaultNotInCode` is review evidence only, because semantic `depends_on` edges can be intentional even when there is no direct source import.

The Handoff tab now mirrors that evidence contract visibly before copy. A user
can see that project reanalysis must report plan counts, reconciliation buckets,
endpoint gaps, and the `--apply` review gate before they hand the prompt to an
agent.

The write rule is intentionally conservative: do not run `ontology-atlas index --apply` until the human reviews noisy endpoint gaps and accepts the exact `add_concepts` / `add_relations` batch. The value of the indexing step is that an agent can show the delta, business meaning, implementation evidence, and uncertainty before it writes.
