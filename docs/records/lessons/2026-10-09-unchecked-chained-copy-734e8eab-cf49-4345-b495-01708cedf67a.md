---
id: 734e8eab-cf49-4345-b495-01708cedf67a
date: 2026-10-09
kind: gate-gap
status: reported
harness_area: approval-export
---
**Observed**: The existing proposal applier and proposal card tests passed, 22 tests in two files, with pnpm exec vitest run src/features/vault-agent/model/proposal-applier.test.ts src/widgets/vault-agent-panel/ui/AgentProposalCard.test.tsx. An isolated probe using the current proposal-applier.ts showed that applyProposal refuses a selected later change whose earlier same-file change is unchecked, while proposalToClipboardPacket includes that unchecked content in the full-file output. A second probe executed the current card click handler with a simulated rejected clipboard promise and observed copied=true. Source references: src/features/vault-agent/model/proposal-applier.ts:145 and src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx:223.

**Cost**: Unknown. The bounded existing test run took 1.92 seconds; no CI round was spent.

**Suspected cause**: Selection-chain safety is covered on the direct writer but not on the read-only handoff. The card also treats starting a clipboard operation as proof of its completion.

**Proposed change**: gate: add behavioral regression coverage for selection parity between direct apply and clipboard handoff, and for rejected or unavailable clipboard writes. Use one selected-file planning contract and report copy success only after the clipboard operation resolves. This audit records the gap; no product implementation or gate was changed.
