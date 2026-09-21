---
uid: 327af46e-0bf1-4b5e-9617-2b1b50d4436c
slug: capabilities/agent-work-visibility
kind: capability
title: Agent work visibility
display_en: Agent work visibility
display_ko: 에이전트 작업 가시성
domain: domains/human-workbench
elements: []
path: src/features/agent-activity/model/use-agent-activity-feed.ts
created_by: "agent:claude-code"
---

Shows a person what an agent is doing to their folder and what it has left for them, turning work that would otherwise happen silently into something visible and answerable.

## Includes
- A live activity feed read from the folder, an inbox of what an agent proposed, and a presence indicator.

## Excludes
- Approving or rejecting the work, which is the review checkpoint's job.
- Claiming background work is happening when the app is closed.

## Uncertainty
- Read from the feature's file layout and the product document's mention of an Agent Work Visibility state driving the mascot's motion. The activity log format was not opened and no agent was observed working while this was read.