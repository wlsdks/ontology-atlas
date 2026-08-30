# Launch playbook

Collection of drafts for the open-source launch phase. Maintainers will publish directly at the appropriate time.

> **Distribution channel (confirmed 2026-07-27, `docs/DECISIONS.md`)**: The plan to publish on npm has been scrapped. The public channel is a **signed and notarized macOS DMG** only, with the app carrying its compiled MCP server in its bundle — one download installs both the human surface and the agent surface. For those who use the terminal, **source checkout** is the second path. Do not add `npx` back to the drafts below — it will result in a 404.

## Recommended Step-by-Step Order

1. **Preparation**
   - [ ] Upload the signed and notarized macOS DMG to [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases) — all CTAs in the drafts point to this single asset
   - [ ] Verify that the [Connect Agent] button in the installed app actually writes `.mcp.json` / `.codex/config.toml` and shows green for self-verification
   - [ ] Deploy static hosting (GitHub Pages / Vercel / Netlify / Cloudflare Pages, etc.) — `pnpm build` → upload to `out/`. See `docs/DEPLOYMENT.md` for detailed guides.
   - [ ] Reconfirm that the hosted demo URL matches the README + draft text
   - [x] Record the 23-second X LNB overview as `docs/launch/ontology-atlas-x-demo.ko.mp4`
     (current shoot contract: `docs/DEMO-SCENARIO.md`)
   - [x] Enable GitHub Discussions + setup categories (automatically enabled in this PR)

2. **Launch day**
   - [ ] Post X thread (`docs/launch/X-THREAD.md`)
   - [ ] Post HN Show HN (`docs/launch/HN-POST.md`) — Tue/Wed 8-10am ET
   - [ ] If on HN front page, quote tweet on X

3. **Launch week**
   - [ ] Post to r/programming — 24–48 hours after HN (`docs/launch/REDDIT-POSTS.md`)
   - [ ] Post to r/ChatGPTCoding — on a different day
   - [ ] Post to r/LocalLLaMA — on a different day

4. **Post-launch**
   - [ ] Maintainer responds to the first 5 threads in Discussions
   - [ ] Prioritize fixing onboarding friction discovered during the first week → release v0.2

## Where Not to Post

- Korean communities (geeknews / Disquiet / Clangan) — low affinity because the Korean README is second-class. The primary target audience is English-speaking.
- LinkedIn — weak dev tool adoption patterns
- Product Hunt — early-stage code tools don't fit well with PH (PH favors SaaS)

## Response Template

Templated answers to frequently asked questions — essential for fast, consistent responses in community building.

### "How is this different from Obsidian?"

> Obsidian excels at markdown note linking, backlinks, and canvas. We restrict our use of markdown frontmatter to serve as the *schema for codebase architecture* — embedding keys like `kind: capability`, `domain: ...`, `depends_on: [...]` using a agreed-upon vocabulary. This allows AI agents (MCP) to query graph semantics without ambiguity.
>
> Obsidian body text is for human reading; here, frontmatter is first-class data. The two complement each other well — editing actually becomes easier with Obsidian.

### "Why not a real graph DB like GraphQL/Neo4j?"

> Mission v2's first principle: the source of truth must be markdown on the user's disk. Using a DB introduces (a) misalignment with user git workflows, (b) unreadability for non-developers, and (c) hosting costs. Frontmatter remains grep + sed compatible.

### "What is MCP?"

> Model Context Protocol: A standard for AI agent tool invocation. JSON-RPC over stdio. Supported by Claude Code, Cursor, Codex, etc. Our server advertises current read/write tools at runtime, providing vault read/write, vault-scoped Git history/checkpointing, and Builder handoff with project semantic receipt confirmation. The exact list is handled by `tools/list`, and connection verification by `mcp-verify`.

### "What backend do you use?"

> 0. The source of truth is the markdown folder on the user's disk. No authentication, database, or server runtime required. Build artifacts are pure static exports — deployable anywhere.
> Multi-device sync is handled via git (naturally achieved if the user manages the folder as a git repo).

## Metrics (Self-review after 1 week)

- [ ] HN post results (whether it reached the front page, point count)
- [ ] Reddit upvote / comment count
- [ ] GitHub stars (delta compared to pre-launch baseline)
- [ ] DMG download count (GitHub Releases asset download count)
- [ ] Hosted demo visitors (GitHub Pages traffic — Insights → Traffic)
- [ ] Number of newly opened Issues + Discussions + external PRs

We judge initial launch success based on these 6 metrics. Traction begins with 1000+ stars and at least 1 external contributor.
