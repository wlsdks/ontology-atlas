---
title: "Maintenance Board: Analyzing My Folders"
doc_type: guide
status: current
area: analysis
---

# Maintenance Board: Analyzing My Folders

[After the folder has grown](/guide/growing-vault), you answered "what should I fix now" via CLI. There is a **screen that does the same thing**: "Insights" in the left rail, at `/ontology/insights`.

The screen describes its own purpose like this:

> This screen is a maintenance board for the person tending the map and the AI agent.

If the map is "what exists now," this is **"what is less done now."**
And the header emphasizes one thing: "All numbers are automatically calculated from documents." This means no numbers are manually entered anywhere.

## 1. Two rows of tabs

The first row names what a tab is about: "Brief" · "Concepts" · "Wiki" ·
"Guidance". "Brief" opens first; it is one screen across the ontology, the wiki
and the harness. "Wiki" counts the library's sources and pages, and "Guidance"
reads the declared guidance by domain.

Choosing "Concepts" opens a second row with one question per tab. It lands on
"To fix", and the address carries the tab (`?tab=`), so a shared link reopens it.

| Tab | Question Answered |
|---|---|
| "To fix" | How many things need fixing now, and what to start with today |
| "Missing concepts" | Which names a document points at that no concept answers to |
| "Inventory" | What exists in what quantities, which domain is heavy |
| "Relations" | Which relation types dominate, where the hubs are, what a change reaches |
| "Domain boundaries" | How much domains are leaking into each other |
| "Accumulation" | What the folder has grown into, and where it has stopped |
| "Product flow" | What this product is and how its domains and capabilities form one business flow |

The number next to a question tab is the size of that question; hover it to read
what it counts. "Accumulation" and "Product flow" have no badge because neither
has one honest count. The tab list lives in
`src/views/ontology-insights/lib/insights-tab-state.ts`.

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

## 5. What the remaining question tabs answer

### "Missing concepts": asked for, not held

Each row is a name written into this folder that no concept answers to, with the
number of times it appears.

### "Inventory": how many of each thing

"Kind census" counts concepts by kind. "Domain capacity" fills each domain's bar
with capabilities from the left and elements from the right; a domain leaning
hard one way has claims without evidence, or the reverse. A concept in several
domains counts once in each, so the totals can exceed the whole.

The strip above the question tabs carries "Concepts", "Relations" and the health
indicators "Lone concepts", "Disconnected groups", "Tangled loops" and
"Evidence linked".

### "Relations": where is the center

"Relation types" adds a judgment to the distribution: if containment dominates,
draw more "leans on" links. This is [how relations arise](/guide/relations) in
numbers: with only containment it is a tree; it becomes a graph once semantic
relations are attached.

The counting rule differs from the CLI and MCP. A relation written in both
documents counts once here, while the CLI and MCP count every written reference,
so their numbers are higher. Neither side is wrong.

"Most connected concepts" lists the hubs. "Dependency impact" is the same
question as `blast-radius` in the CLI: how much must be re-checked if this
changes, split into "direct" and "indirect". It follows only human-approved
"leans on" declarations, so it does not prove complete source dependencies.

### "Domain boundaries": are domains leaking?

The "Domain coupling" grid shows which domain pairs are connected; pick a cell to
see the connections linking those two domains. "Cross-domain share" gives each
domain's ratio of "self" to "cross" connections. A domain dominated by cross
connections signals a boundary drawn in the wrong place.

### "Accumulation": what the folder has grown into

"What the folder holds" is recomputed from the folder's version history and
stores nothing. Below it, "Recent changes by domain" draws a heatstrip of
document updates, with "Recent updates" and a "Not updated in 90+ days" count.
The first thing to rot in a vault is the area no one opens, so this tab names it.

## 6. Asking for the business flow

Flow shows the exact prompt before anything leaves the screen. In the installed
app, "Draw business flow" returns to the map, opens the existing agent panel,
and prefills the composer without sending. In a browser, the page says that it
cannot start a local process and offers "Copy request" instead. Every requested
paragraph must cite ontology node slugs so a person can open and challenge the
answer.

## 7. Handing over the entire screen to the agent

There is a line at the bottom labeled "For AI Agent · Agent Handoff," and clicking "Copy Next Action" on the right copies the next action for this entire board into a single line.

```
query_ontology({operation:"maintenance_plan"}) → Execute per item → Re-verify with query_ontology({operation:"health"})
```

**On this screen, what humans see and what the agent receives share the same queue.** The screen renders `maintenance_plan`, and the copied command also calls `maintenance_plan`. Humans scan the same list with their eyes, and the agent processes it in order.

## Summary

- The analysis is the **maintenance board**. The map shows "what exists," while this section shows "what has been less addressed."
- Two rows: "Brief" · "Concepts" · "Wiki" · "Guidance", and under "Concepts"
  one question per tab. "Product flow" is a visible, reviewable agent request
  and never sends on its own.
- "What to see first today" selects that day's items **with reasons**, and each line provides links to the map, original text, studio, and agent commands.
- What is copied is not just a single command line, but the **preview → execute → confirm → re-evaluate procedure**.
- In read-only folders, commands to skip appear instead of fix commands.
- To view the same queue via CLI, use `maintenance`, `health`, and `growth` from [CLI](/guide/cli).
