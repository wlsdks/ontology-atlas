# Reddit — Launch Drafts

These drafts start with the developer's review problem, not the implementation
inventory. Rewrite the final post in the owner's natural voice before posting;
do not mass-post the same body across communities.

## r/programming

**Title**: `I built a local map for reviewing what AI coding agents changed`

**Body**:

````markdown
AI coding agents can change a codebase faster than I can review every line.
After a long run I usually have two artifacts:

- a Git diff, exact but low-level
- the agent's summary, concise but written by the thing that produced the work

I built [Ontology Atlas](https://github.com/wlsdks/ontology-atlas) for the
missing third artifact: a reviewable account of what the codebase means now.

Atlas stores a small codebase ontology beside the source: projects, domains,
capabilities, implementation evidence, dependencies, relation rationale, and
explicit unknowns. It is a folder of Markdown files in the repo. The desktop
app renders the folder as a map; coding agents query and update the same files
through MCP.

The intended loop is:

```text
agent changes code
→ agent proposes the capability/boundary/evidence change
→ person corrects, rejects, or accepts the Markdown diff
→ the next human or agent retrieves the accepted state
```

Atlas is not trying to replace Git, source search, language servers, AST
indexes, or CodeGraph. Those answer which lines, symbols, callers, and imports
changed. Atlas carries the product-level answer: which capability changed, why
the boundary exists, what evidence supports it, and what remains unknown.

One synthetic end-to-end run added discount handling to checkout. Both the
control and Atlas versions completed the code, tests, commit, push, and merge.
The Atlas version also committed one capability record beside the code:

> The confirmed total now accepts non-negative integer `discountCents` and
> clamps at zero.

That is the narrow result: a reviewed meaning record can travel with the code.
It is **not** evidence that Atlas made the code better or the work faster. In
that small run, Atlas was slower. I have not measured a general answer-quality
or productivity gain.

The storage and app are local-first: no Atlas account or backend. The vault is
plain Markdown on disk and Git remains the source of truth. The installed
desktop app reads/writes the same `.md` files through a local native bridge;
the hosted website is the product intro and download/demo gateway. macOS is
signed and notarized; Windows x64 is an explicitly unsigned beta; the browser
demo needs no install.

Demo: https://ontologyatlas.com/en/topology/

The current video proves concept, relation, evidence, and read-only agent
lookup. I am separately validating a post-agent review demo rather than
pretending the existing footage shows it.

I would value blunt feedback on the actual bet:

1. Is a capability/boundary-level review useful before the full diff, or is a
   good PR summary enough?
2. What would stop this Markdown folder from becoming stale documentation?
3. Which agent claim should never become durable meaning without stronger
   evidence?

MIT licensed. Solo-built. Korean and English UI/docs.
````

## r/ChatGPTCoding

**Title**: `I built a reviewable codebase map for after an AI agent finishes`

**Body**:

```markdown
My problem was not that the coding agent forgot the repo. It was that the agent
could finish a lot of code before I understood what the codebase had become.

The diff told me exactly which lines changed. The agent summary told me what it
claimed to have done. Neither left a durable product-level answer for the next
review or the next session.

So I built [Ontology Atlas](https://github.com/wlsdks/ontology-atlas): a local,
Git-backed map of domains, capabilities, boundaries, dependencies, code
evidence, and unknowns. Claude Code, Codex, Cursor, or another MCP client reads
and updates the same Markdown folder a person sees in the app.

The workflow I am aiming for is:

1. the agent changes code and runs verification;
2. it explicitly proposes the meaning that changed;
3. Atlas pauses writes for human review;
4. the person corrects/rejects/approves the Markdown diff;
5. the next agent retrieves the accepted state.

This is not automatic code understanding. Source tools still own definitions,
callers, imports, and exact diffs. Atlas owns only reviewed product meaning and
its evidence boundary.

In one small synthetic run, a checkout change added `discountCents`. The Atlas
arm committed the code and tests plus one capability note saying the confirmed
total now accepts a non-negative integer discount and clamps at zero. The run
proved that the note can travel with the code; it did not prove better code or
faster work, and Atlas was slower in that run.

No Atlas account or backend; the app and MCP server operate on local Markdown.
There is a no-install demo here:
https://ontologyatlas.com/en/topology/

For people using long-running coding agents: what do you review first when a
turn touches many files? Would a capability/boundary delta help, or would you
trust a PR summary and skip this layer?
```

## r/LocalLLaMA — hold, do not post yet

Do not post the old local-first draft merely because the vault and MCP server
run locally. Atlas does not itself run an LLM, and the current public demo uses
Codex. That makes the project only incidentally related to local inference.

Reconsider this community only after both conditions are true:

1. a real end-to-end Atlas flow has been demonstrated with a locally hosted
   model, and the post explains what that model did; and
2. the owner's account satisfies the community's current participation and
   self-promotion rules.

The 2026 rule update explicitly strengthened low-effort and self-promotion
enforcement. A local storage architecture is not enough to make an otherwise
remote-agent launch post on-topic.

## Posting notes

- Reddit's current [spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)
  prohibits repeated unsolicited mass engagement and tells posters whose
  contributions mainly promote their own work to be thoughtful about frequency
  and check each community's rules. Re-check the target subreddit on posting day.
- The [r/LocalLLaMA rule update](https://www.reddit.com/r/LocalLLaMA/comments/1su3ao4/rlocalllama_rule_updates/)
  raises the bar on low-effort, primarily generated, and self-promotional posts.
  Do not paste an AI-polished launch body there unchanged.
- Post to one relevant community first. Discuss the problem and evidence in the
  comments; do not repeat the link across unrelated communities for exposure.
- Disclose that this is the author's project. Do not ask for votes, coordinate
  comments, or imply customer evidence that does not exist.
- If feedback says a PR summary is enough, ask for the exact workflow and treat
  that as a falsifier, not an objection to talk around.
