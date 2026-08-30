# 30s Demo GIF — retired storyboard

> Retired on 2026-08-30. The shipped X MP4 and localized download-page takes follow
> `docs/DEMO-SCENARIO.md`: the page takes show one selected capability, its relations and
> evidence, and a real read-only Codex `get_concept`/`find_path` round trip; the separate X take
> rapidly crosses the seven LNB destinations. The five-cut editor/terminal/picker plan below
> remains only as historical launch planning and must not be used for a new capture.

Storyboard for the 30-second GIF/mp4 to be featured on the README first screen. **claim → proof** 5-cut sequence. Each cut ~6 seconds.

## Cut 1 (0–6s) — "AI and humans editing the same vault"

- **screen**: Left side shows VS Code (or Obsidian) opening `domains/auth.md` with frontmatter visible. Right side shows Claude Code terminal displaying results of `ontology-atlas` tool calls.
- **action**: Human adds `capabilities/login` to the `capabilities:` key in markdown → saves. AI creates `capabilities/login.md` in the same vault via `add_concept`.
- **caption**: `humans + AI agents author the same vault`

## Cut 2 (6–12s) — "Frontmatter is the graph"

- **screen**: Open the vault folder in the installed Ontology Atlas macOS app via the `/docs` picker to immediately display nodes and edges on the map.
- **action**: Click `domains/auth` in the left tree of the workbench → frontmatter appears as-is in the right detail panel.
- **caption**: `frontmatter is the graph`

## Cut 3 (12–18s) — "Topology view"

- **screen**: `/topology` canvas map/graph — current dogfood vault drag / hover.
- **action**: User hovers over one node → highlights 1-hop neighbors → clicks → opens ProjectDrawer.
- **caption**: `Topology · 1 click → context`

## Cut 4 (18–24s) — "AI agent reads the ontology and suggests code"

- **screen**: Claude Code queries the dependency chain between two capabilities using `find_path` → responds with something like "This change affects capabilities/login → elements/jwt-token".
- **action**: User asks "Tell me the impact scope of the auth refactor" → AI answers based on the ontology dependency tree.
- **caption**: `AI reads the ontology before suggesting code`

## Cut 5 (24–30s) — "One button click connects the agent"

- **screen**: Click [Connect Agent] in the installed app → preview where and how to use it (all paths + create/overwrite) → approve → green confirmation.
- **action**: User reads the preview and approves → the app writes `.mcp.json` / `.codex/config.toml`, spawns the bundle server, and verifies `get_concept` round-trip.
- **caption**: `one download installs the agent's server too — no terminal`
- **Why this cut**: After npm publishing was scrapped (`docs/DECISIONS.md` 2026-07-27), the setup narrative for this product is not "one line in the terminal" but rather **"one download installs both the human surface and the agent surface."** Do not include a terminal cut again.

## Recording Environment

- **OS**: macOS (user's actual environment)
- **App**: Installed macOS desktop app, 1280×800 window (for readability)
- **Terminal**: Dark theme, 14pt or larger
- **VSCode/Obsidian**: Dark theme, same font size
- **Recording tool**: `kap.app` (.gif export, 12fps, ~5 MB) or OBS → ffmpeg
- **Resolution**: 1280×720 (GitHub README embed-friendly)
- **File size**: < 8 MB (limit for inline embedding in GitHub markdown)

## README Embed

```markdown
![ontology-atlas demo](docs/launch/demo.gif)
```

Or briefly show just one surface of the hosted demo:

```markdown
![Topology view](docs/launch/topology-30s.gif)
```

## Alternative: 4-image grid

The same message can be conveyed with 4 static images instead of a GIF:
1. Installed app [Connect Agent] preview + green confirmation
2. Workbench `/topology`
3. Workbench `/ontology/studio` (workshop)
4. Claude Code MCP tool call result

Each PNG is ~200 KB. Arrange them in a grid using a README markdown table.
