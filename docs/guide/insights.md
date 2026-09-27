---
title: "Maintenance Board: Analyzing My Folders"
doc_type: guide
status: current
area: analysis
---

# Maintenance Board: Analyzing My Folders

[After the folder has grown](/guide/growing-vault), you answered "what should I fix now" via CLI. There is a **screen that does the same thing**: "Insights" in the left rail, at `/ontology/insights`.

The header states what the screen is: "Your whole folder at a glance. Every
number is computed from the documents." No number on it is entered by hand. If
the map shows what exists, this screen shows what is still left to do.

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

## 2. "To fix": one list, grouped by finding

The "To fix" tab (`src/views/ontology-insights/ui/tabs/DoNextTab.tsx`) draws one
list titled "{count} things to fix". Rows are grouped by finding, and each group
carries one name, such as "Concepts nothing links to", "Concepts with no domain",
"Pairs whose names overlap" or "Tangled loops". Every row says why it is there,
for example "Nothing links to it yet. Connect it to a related concept."

Every row offers its actions in the same order and leaves out any it cannot
offer:

| Action | What it does |
|---|---|
| "Ask the agent" | Hands this row to the map's agent in words |
| "Fix it myself" | Opens the place where you can fix it on the map |
| "View on map" | Focuses that concept on the map |
| "More actions" | Opens "Open source", "Edit on map" and "Verify with agent" |

"Verify with agent" copies a request for this row to the clipboard. For a pair
whose names overlap, the request reads like this (from
`src/views/ontology-insights/lib/handoff-prose.ts`):

```
merge_concepts({fromSlug:"capabilities/order-partial-cancel", intoSlug:"capabilities/order-cancel"}) to preview the merge → if they mean the same thing, run the same call again with confirm:true
→ get_concept({slug:"capabilities/order-cancel"}) to confirm the merged text
→ query_ontology({operation:"health"}) to re-check the result
```

**It's a procedure that includes verification, not just a command.** Preview →
execute → confirm the text → re-check. Paste it into an agent and it runs as is.

When several domains do not point back at their concepts, "Fix these together"
opens one sheet that adds every back-link at once. Nothing is written until you
press "Apply {count}". The rules for attaching evidence are in
[What Becomes a Node](/guide/what-becomes-a-node).

When nothing is left, the list says "Nothing needs attention: the graph is
healthy."

## 3. Read-only folders get copyable requests

On the sample folder, the list opens with this line:

> This is the sample. Open your own folder and you can finish these right here: for now you can copy the command and hand it off.

In a folder you cannot write, "Edit on map" becomes "view on map". Where no agent
has been seen, "Verify with agent" becomes "Copy this request to paste into your
agent" (`src/views/ontology-insights/ui/parts/QueueRowActions.tsx`). Instead of
failing silently where you cannot write, the screen gives you **what to pass to
someone who can**.

## 4. What the remaining question tabs answer

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

## 5. Asking for the product flow

"Product flow" (`src/views/ontology-insights/ui/tabs/FlowTab.tsx`) shows "The
request that goes to the agent" before anything leaves the screen. In the
installed app, "Explain the flow with ACP" puts the request in the conversation
beside the board without sending it; you send it. In a browser, which cannot
start a process, the tab says "The app does this" and offers "Copy request"
instead. Every requested paragraph must cite ontology node slugs so a person can
open and challenge the answer.

## 6. Handing a tab to the agent

Below every question tab except "To fix", a row labelled "Agent handoff" · "For
agents" carries "Copy next action"
(`src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx`). It copies the
MCP request for that tab. On "Relations" it reads:

```
query_ontology({operation:"centrality"}) → query_ontology({operation:"blast_radius", slug:"«hub-slug»"})
```

The row hides while the agent conversation is open, because the conversation
already carries the same handoff.

## Summary

- The header says it: every number is computed from the documents. The map
  shows what exists; this screen shows what is left to do.
- Two rows: "Brief" · "Concepts" · "Wiki" · "Guidance", and under "Concepts"
  one question per tab. "Product flow" is a visible, reviewable agent request
  and never sends on its own.
- "To fix" is one list grouped by finding. Every row says why it is there and
  offers "Ask the agent", "Fix it myself", "View on map" and "More actions".
- What is copied is not a single command but a **preview → execute → confirm →
  re-check** procedure.
- In read-only folders, the actions turn into requests you can copy and hand off.
- To view the same queue via CLI, use `maintenance`, `health`, and `growth` from [CLI](/guide/cli).
