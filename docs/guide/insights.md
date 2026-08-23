# Maintenance Board: Analyzing My Folders

[After the folder has grown](/guide/growing-vault), you answered "what should I fix now" via CLI. There is a **screen that does the same thing**: "Analysis" in the left rail, at `/ontology/insights`.

The screen describes its own purpose like this:

> This screen is a maintenance board for the person tending the map and the AI agent.

If the map is "what exists now," this is **"what is less done now."**
And the header emphasizes one thing: "All numbers are automatically calculated from documents." This means no numbers are manually entered anywhere.

## 1. Divided into five branches

The five tabs at the top each answer a different question.

| Tab | Question Answered |
|---|---|
| "To-Do" | How many things need fixing now, and what to start with today |
| "Structure" | What exists in what quantities, which domain is heavy |
| "Connections" | Which relationships are skewed towards which nature, where is the hub |
| "Boundaries" | How much domains are leaking into each other |
| "Freshness" | Where hasn't been touched for a long time |

The number next to the tab name is the size of that branch. If the number next to "To-Do" is not 0, that is the count of today's tasks.

## 2. "First things first today": The three items for the day

The top card selects today's priority items. Each line also answers **why it was selected**. For example, "Reason · Referenced from multiple places. Worth promoting to a parent concept."

The order assumed by this screen is written in one line at the head of the card.

```
Verify on map → Verify original text → Edit in Studio → Validate with agent
```

And each of those four steps is a button on the line. Only the first step is visible outside, while the remaining three are inside the ⋯ at the end of the line.

| Button | Destination |
|---|---|
| "View on Map" (above the row) | Focuses that node on the map |
| "View Source" (⋯) | The `.md` source of that node |
| "View in Studio" (⋯) | Puts that node on the [Studio](/guide/studio) stage |
| "Copy Merge Command" (⋯) | Copies the **MCP command** to process this item to your clipboard |

The last one best illustrates the nature of this screen. Clicking the "Similar Name: Same Thing?" row copies something like this.

```
Preview the result of merging with merge_concepts({fromSlug:"capabilities/order-partial-cancel", intoSlug:"capabilities/order-cancel"})
→ If they mean the same thing, add confirm:true to the same call to execute
→ Verify the merged original text with get_concept({slug:"capabilities/order-cancel"})
→ Re-verify the change result with query_ontology({operation:"health"})
```

**It's a procedure that includes verification, not just a command.** Preview → Execute → Verify source → Re-check. Paste this into an agent and it runs as-is.

## 3. What Humans Fix vs. What Agents Fix

Two panels sit side-by-side under the "To-Do" tab.

**"Agent Readiness"** divides relationships into three categories: "Ready", "Needs Verification", and "Needs Review". The screen's description explains the criteria.

> Based on how much evidence is attached to each relationship: it separates relationships the agent can trust and use immediately, those needing one check, and those requiring human review.

The longer this bar extends to the left, the **higher the degree to which you can entrust the agent**. The rules for attaching evidence are in [What Becomes a Node](/guide/what-becomes-a-node).

**"Repair Queue"** shows counts by fault type.

| Item | What is counted |
|---|---|
| "Old Evidence" | Concepts whose evidence hasn't been verified in a long time |
| "Unassigned Affiliation" | Concepts with no connections: "An orphan concept with no relationships" |
| "Superconcept Candidate" | Concepts referenced by many, suitable for promotion |
| "Disconnected Island" | Groups detached from the main body |
| "Missing Link" | Concepts without a designated home (domain) |

The last two are special. They are the two signals that flip CLI `health` to `needs_attention`, so for this screen to say "Nothing to repair", both must be 0. This is where the app and CLI are aligned to make the same judgment.

From each row, you can go directly to "Edit Relationship" (Studio) and "Concept Document" (Source).

## 4. Commands Appear in Read-Only Folders

Looking at the example folder, the screen tells you this first.

> This is currently an example folder. If you open your own folder, you can finish these tasks right here.
> You can copy and pass the commands now.

It follows the same rule as the save button in [Studio](/guide/studio). Instead of silently failing in a place where you can't write, it provides **what to pass to those who can**.

## 5. What the Remaining Four Tabs Answer

### "Configuration": How many of each thing

Counts by type (elements · capabilities · domains · projects), counts by relationship type (includes · depends on · related to), and four health indicators: "Orphan Concepts", "Disconnected Groups", "Tangled Loops", and "Evidence Links".

The "Domain Capacity" bar divides the number of capabilities and elements per domain. If one domain is unusually long, it's time to split it.

> Concepts belonging to multiple domains are counted once for each domain, so the total may exceed the overall count. The screen notes this in a footnote.

### "Connections": Where is the center

The screen adds a judgment to the relationship type distribution.

> If you are biased toward containment relations, it signals that you need to draw more 'expectation' relations.

This is a place to view the story of [how relations arise](/guide/relations) in numbers: if there is only structure (containment), it is a tree; it becomes a graph only when semantic relations are attached.

**We also clarify here that the counting rules differ per screen.**

> Here, we count each distinct relation once (both documents list at least one reference to the same relation).
> The CLI/MCP counts written references as-is, so its numbers will be higher.

It is just counting the same graph differently; neither side is wrong.

"Concepts that spread far when changed" is the same question as `blast-radius` in the CLI. How many items need re-verification if this is fixed? We count separately those that are "directly" connected and those that reach "across".

### "Boundaries": Are domains leaking?

The "domain coupling" grid shows which domain pairs are actually connected, and **clicking a cell** displays the connections linking those two domains. The horizontal lines go out from the source,
and the vertical lines come into the target.

"Boundary pressure" outputs the ratio of "internal" (connections within the same domain) to "cross" (connections going in/out) for each domain. A domain with an overwhelmingly high proportion of cross-connections signals that its boundary is drawn incorrectly.

### "Freshness": Where has it stopped?

For each domain, we draw a heatstrip of updates over the last 12 weeks and provide a list of "recently updated" items and a count of "not updated for 90+ days." The first thing to rot in a vault is **areas no one opens**, so this tab names them.

## 6. Handing over the entire screen to the agent

There is a line at the bottom labeled "For AI Agent · Agent Handoff," and clicking "Copy Next Action" on the right copies the next action for this entire board into a single line.

```
query_ontology({operation:"maintenance_plan"}) → Execute per item → Re-verify with query_ontology({operation:"health"})
```

**On this screen, what humans see and what the agent receives share the same queue.** The screen renders `maintenance_plan`, and the copied command also calls `maintenance_plan`. Humans scan the same list with their eyes, and the agent processes it in order.

## Summary

- The analysis is the **maintenance board**. The map shows "what exists," while this section shows "what has been less addressed."
- Five tabs: Todo · Composition · Connections · Boundaries · Freshness. The number next to the name indicates size.
- "What to see first today" selects that day's items **with reasons**, and each line provides links to the map, original text, studio, and agent commands.
- What is copied is not just a single command line, but the **preview → execute → confirm → re-evaluate procedure**.
- In read-only folders, commands to skip appear instead of fix commands.
- To view the same queue via CLI, use `maintenance`, `health`, and `growth` from [CLI](/guide/cli).
