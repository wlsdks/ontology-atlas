---
slug: src/features/vault-ontology/ui/LiveActivityIndicator.tsx
kind: element
title: Live Activity Indicator
domain: views
---

`src/features/vault-ontology/ui/LiveActivityIndicator.tsx` renders the operations-nav Live badge that explains changed ontology nodes and the current AI-agent heartbeat.

Dogfood evidence, 2026-06-06: Codex used CodeGraph to locate `LiveActivityBadge`, Atlas MCP to inspect `capabilities/agent-live-activity-contract`, and macOS Accessibility `AXPress` plus Computer Use observation to prove the installed `/Applications/Ontology Atlas.app` opens the Live popover. The popover now exposes a real button contract (`aria-expanded` / `aria-controls`), a dialog body, and a dedicated close button; jsdom tests also cover Escape and outside-pointer dismissal.

Follow-up evidence, 2026-06-06: the trigger no longer renders a stale heartbeat as `CODEX · verifying` or another current work state. It renders the agent plus the stale label in the closed pill, while the popover keeps the old state and age for inspection.

The popover now shows a proof trail below the evidence counts. Instead of only
showing `MCP · N`, `CodeGraph · N`, and `Verify · N`, it also prints the first
reported MCP call, CodeGraph lookup, and verification command with a `+N`
overflow marker. That lets a human reviewer see whether the connected agent used
the shared ontology tools and local verification before trusting the heartbeat.

When the heartbeat publishes a focused ontology slug, the closed Live pill uses
that slug as the focus fallback when the agent has no summary, and the popover
exposes it as an `Open focus` deeplink into the ontology concept map. This keeps
the Live indicator anchored to reviewable business/product concepts instead of
only file paths and shell activity.

Computer Use inspection of the built macOS app showed that raw `Running shell
command: ...` summaries made the closed operations-nav pill read like a terminal
log. The closed pill now treats those summaries as detail-only: it falls back to
the ontology slug or first source file, while the popover still preserves the
full command for audit. That keeps the always-visible nav focused on agent state
and ontology target instead of command noise.

The closed Live pill now shows a short localized review chip (`ontology focus`
or `business extraction`) plus a compact localized proof-count chip when the
heartbeat has MCP, CodeGraph, or verification evidence. The proof chip title
and accessible label break that count down by source (`MCP`, `CodeGraph`,
`Verify`) before the human opens the popover, and the Live trigger's accessible
name includes the same breakdown. The popover keeps the parsed review mode
(`ontology-focus` or `business-extraction`) beside the heartbeat metadata. That
makes the collaboration lane and proof depth visible in the macOS app itself,
not only in the CLI JSON or copied packets.

It also provides a `Copy focus check` action. The copied packet preserves the
focused slug, summary, first touched file, and MCP check order (`node_profile`,
`reachability`, `health`) plus the rule that path-only/API-only/route-only
evidence is not enough for a business ontology claim. The action uses the shared
copy feedback state so the button confirms copied or failed inline.

For stale heartbeats, the popover's `Copy refresh request` action now mirrors
the CLI contract exactly. Its copied command uses `--verify` for verification
evidence, not the older `--verification` spelling, so the app handoff can be
pasted directly into `ontology-atlas agent-activity <vault> ... --json` without
agent-side flag translation. When the parser has already derived a structured
`refreshRequest`, the popover copies that command instead of reconstructing the
CLI flags from raw heartbeat fields; reconstruction remains only a fallback for
older or minimal status objects.
