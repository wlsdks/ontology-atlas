# Hacker News — Show HN draft

Submission type: **Show HN**
Category: open source / dev tool

## Title (30 char range, < 80 max)

```
Show HN: oh-my-ontology – Markdown frontmatter as a codebase ontology, for humans + AI agents
```

(80 chars exactly — under HN's 80 char limit. If too long, fallback:
`Show HN: oh-my-ontology – frontmatter is the graph; AI agents read it via MCP`)

## URL

`https://github.com/wlsdks/oh-my-ontology`

## Text (optional, but encouraged for Show HN)

```
Hi HN. I built this because every "AI in your codebase" tool today
ingests source files into an LLM context window and hopes the model
remembers your architecture. The mental model — "what owns what, what
depends on what, why this exists" — lives in the AI vendor's memory
silo, or in nobody's.

oh-my-ontology takes the opposite path. The mental model is a folder of
markdown files. Frontmatter is the graph: `kind: capability`, `domain:
auth`, `depends_on: [...]`. Humans edit it in any markdown editor. AI
agents read and write it via a tiny MCP server (11 tools — list,
get, find_path, find_orphans, add_concept, patch_concept, delete, ...).

Three views over the same vault: Sigma WebGL topology, hierarchical
tree, and an xyflow ERD builder. Local-first by default — the static
build does not load Firebase JS into a single user-facing route's first
paint chunk (verified by a CI script).

30-second start:

  npx oh-my-ontology init my-vault
  # then copy .mcp.json.example to your AI agent's MCP config

Hosted demo (read-only, our own dogfood vault — ~130 nodes, 165
relations): https://oh-my-ontology.web.app

What I'd love feedback on:

1. Is "vault frontmatter as the canonical graph" a useful framing for
   you? Or does it feel like just glorified Obsidian?
2. The MCP integration — does this fit how you're using Claude Code /
   Cursor / Continue today? What tool would you add?
3. Non-developer angle — would your PMs, designers, domain experts
   actually open these markdown files? What would make that easier?

Built solo over the past few months. MIT licensed. Korean + English
docs (mixed). Critique welcome.
```

(Word count: ~280. HN expects substantive Show HN posts, not one-liners.)

## Posting tips

- **Best time**: Tue/Wed 8–10am ET (HN peak)
- **First comment** (you, OP): Add 1–2 sentence thank-you to early
  commenters and a *concrete* answer to the most upvoted question
- **Don't ask for upvotes**. HN explicitly disallows.
- **Respond fast** to the first 5 comments — they shape the thread
- **Link to specific code paths** in your replies to demonstrate depth
- If 4-hour mark and you're still on front page: post the demo gif as
  a follow-up reply (don't edit OP)
