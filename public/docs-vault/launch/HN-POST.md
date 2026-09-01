# Hacker News — Show HN Draft

Submission type: **Show HN**
Category: open-source developer tool

## Title

```text
Show HN: Ontology Atlas – see what your AI agent built
```

The title is 54 characters, including spaces. It names the human outcome rather
than frontmatter, MCP, or agent memory.

## Submission URL

`https://github.com/wlsdks/ontology-atlas`

Use the repository, not the download landing page. The project can be tried
without an account through the hosted demo linked below.

## Text

```text
Hi HN. I built Ontology Atlas after noticing that coding agents could change my
codebase faster than I could keep the whole result in my head.

I still had the Git diff, which was exact about the lines. I also had the
agent's summary, which was a concise account from the thing that produced the
change. What I did not have was a durable, reviewable answer to: what capability
does the codebase have now, which boundary moved, what evidence supports that,
and what is still unknown?

Atlas keeps that answer as a small codebase ontology in the repository:
projects, domains, capabilities, implementation elements, dependencies,
rationales, evidence, and explicit unknowns. The files are Markdown. The app
renders them as a map; Claude Code, Codex, Cursor, and other MCP clients query
and update the same folder. A person can correct, reject, or keep the resulting
Markdown/Git diff.

Hosted demo (read-only, our own dogfood vault, no install):
https://ontologyatlas.com/en/topology/

The intended workflow is:

  agent changes code
  -> agent proposes what that work changed at the capability/boundary level
  -> person reviews the semantic delta
  -> the next human or agent starts from the accepted map

Atlas does not replace source search, language servers, AST indexes, or Git.
Those remain the authority for structure and exact code changes. Atlas keeps
the product meaning that explains why those facts matter.

A concrete synthetic run added discount handling to checkout. Both the control
and Atlas versions completed the code, tests, commit, push, and merge. The Atlas
version additionally committed one reviewed capability record beside the code:
"The confirmed total now accepts non-negative integer discountCents and clamps
at zero." That is evidence of a durable meaning handoff, not evidence that Atlas
made the code better or the work faster. In that small run, Atlas was slower.

Everything is local-first: no Atlas account or backend. The desktop app carries
the MCP server; the vault remains plain Markdown on disk. macOS is signed and
notarized. Windows x64 is an explicitly unsigned beta. A source checkout and
the browser workbench cover the other paths.

Hosted demo, no install:
https://ontologyatlas.com/en/topology/

The current demo proves concept/relationship/evidence lookup. The post-agent
change-review demo is the next thing I am validating, not something I am
pretending the existing video shows.

I would especially value criticism on three questions:

1. After an agent finishes, is capability/boundary-level review useful before
   you open the full code diff, or is the PR summary enough?
2. Which claim from an agent would you refuse to let become durable meaning
   without stronger evidence?
3. Is a repository Markdown folder a maintainable judgment surface, or does it
   become another document set that drifts?

Solo-built, MIT licensed. Korean and English UI/docs. Critique welcome.
```

## Posting and reply notes

- The [Show HN guidelines](https://news.ycombinator.com/showhn.html) require
  something people can try, recommend removing signup barriers, say not to
  submit a landing page, and forbid asking friends to upvote. Keep the repository
  as the submission URL and the no-install demo near the top of replies.
- Be present to answer questions about how and why it was built. Link to the
  exact benchmark diff, schema, or source path when a claim is challenged.
- Do not defend `100x`, token savings, faster answers, better code, exhaustive
  coverage, or automatic semantic detection. None is established.
- Ask for falsifying examples, not feature requests by default: a PR summary that
  makes Atlas unnecessary, a meaning correction Atlas cannot represent, or a
  maintenance burden that outweighs the handoff.
