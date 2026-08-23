---
uid: 12dfb05e-c76a-4d1c-b24d-e4c80db2be04
slug: capabilities/agent-work-visibility
kind: capability
title: Agent Work Visibility
display_ko: 에이전트 작업 가시화
display_en: Agent Work Visibility
domain: domains/agent-integration
elements: []
path: src/features/agent-activity
created_by: "agent:unknown"
---

## Definition
The ability for humans to read in one flow the AI agent's product name, verified current stage, work goals and targets, and next actions from the map. Only when there is a fresh heartbeat does it speak of plan/edit/verify/approval waits in present tense; if only write logs are recent, it does not infer "in progress" but distinguishes by change detection or last work time.

## Boundaries
- The screen converts audit client/runtime IDs like `codex-mcp-client`·`codex-acp` to human product names like Codex·Claude Code, but preserves original logs and heartbeat values. Map status bars, global rails, and detailed activity surfaces all use the same display name boundary.
- Current targets connect to map rings and focus only when heartbeats or tool inputs reveal actual vault slugs. Already on the map, it updates HomePage's selection state without remounting the vault; independent consumers use `/topology?mode=focus&p=…` fallback only. Unknown targets get no links or rings.
- In-app ACP's `onTurnActivityChange` updates map focus and activity chips first in the same render cycle, with sidecar records following for external consumer/restart continuity. If there is no target for the current in-app turn, it does not revive the previous sidecar target.
- When the right agent dock opens, INDEX does not change save preference but collapses for the session to yield map width. Closing the dock restores original preference; opening INDEX tab directly closes the dock.
- Dock space first opens with existing `--agent-panel-reflow-duration` and camera follows new width with live spring of the same clock. ACP sessions start after a 240ms landing window post-transition so process startup doesn't break map layout/camera motion. While agents are open, automatic INDEX degradation realigns camera meaning but does not steal directly panned/zoomed points.
- Thoughts and tool calls for one user turn are grouped as one collapsed `Work Process · N steps`. Agent answers remain in separate body text; expanding details shows original work order and actual target. Thought Markdown renders as bold/code/lists, not original markers.
- Notifications are not poured out per tool call but aggregated by work start/end and structural change units. Current work reading opens from the status bar below the top-right toolbar; past notifications open from the far-right independent bell and wide inbox. Both surfaces share one feed but do not mix content. The status bar inherits neither the short width of the top-right toolbar nor natural content width (upper limit 520px) to preserve agent name and last work time.
- In-app ontology writing allow/reject and terminal status remain as bounded snapshots in `.ontology-atlas/acp-work.jsonl` and are read as work receipts from notification popovers. Full conversations/thoughts/tool outputs/absolute paths/body values are not kept, nor mixed with `activity.jsonl` which records execution facts.
- `created_by: human` is provenance only, not a review-needed state. The reserved reader kind `vault-readme` stays in Docs and is excluded from the map, relation editing, and concept census.

## Evidence
- src/features/agent-activity/model/agent-work-projection.ts: Honest priority of heartbeats/write sessions and live/recent-write/completed separation
- src/features/agent-activity/model/use-agent-activity-feed.ts: In-app ACP observations beating next sidecar polling for current work projection via session overlay
- src/features/agent-activity/ui/AgentActivityChip.tsx: Agent/stage/current/last target and work detail/aggregation surfaces
- src/shared/lib/acp-work-receipt.ts: Bounded append-only receipt preserving only requests/typed changes/human decisions/final states, and latest snapshot read model
- src/features/acp-session/model/use-acp-session.ts: Lifecycle emitting ontology write allow/reject and tool terminal status with same receipt id
- src/features/acp-session/model/acp-turn-activity.ts: Deriving stages and actual targets from ACP user requests/tools/permission waits
- src/views/home/lib/acp-agent-heartbeat.ts: Ordered vault heartbeat write/clear and map focus handoff
- src/views/home/lib/resolve-contextual-index-state.ts: INDEX session degradation preserving user preferences
- src/widgets/acp-chat-panel/ui/group-events.ts: Thought/tool work process aggregation per user turn
- src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx: Collapsed work process, Markdown details, stage count and in-progress status
- src/views/home/ui/HomePage.tsx: Spatial priority transitions and mutual exclusivity of INDEX/map/ACP docks
- src/shared/lib/agent-display-name.ts: Boundary between audit original IDs and human display names

## Confidence
high (0.95): Verified through pure derivation, component and ACP integration contracts, 360~2560 overflow sweeps, and round-trip testing of the installed app's Codex Computer Use with 30/120fps motion capture.
