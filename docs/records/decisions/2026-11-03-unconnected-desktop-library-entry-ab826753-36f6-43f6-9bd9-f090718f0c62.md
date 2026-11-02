---
id: ab826753-36f6-43f6-9bd9-f090718f0c62
date: 2026-11-03
---
## 2026-11-03 — An unconnected desktop keeps a door to Library

**Why**: the installed app without a vault showed only Planning, Agents and Briefing. Its route guard redirected Library to the root, even though Library already has a folder-entry screen. The owner mistook the three destinations for document mode and could not find Wiki.

**Prior**: the 2026-09-06 folder-shape decision and 2026-09-13 launch chooser decision still describe loaded wiki-only folders correctly. The current unconnected-desktop restriction is narrower than that older decision's empty-folder wording. No loaded-folder policy or restore count changes here.

**Decision**: Library joins the destinations that provide their own entry without a vault. One shared set drives the route guard, rail and shortcuts. A neutral folder-open tile occupies the existing folder slot until a vault is connected. Briefing gets a repository-entry stage; its public GitHub and explicit-read boundaries remain unchanged.

**Dissent**: showing every destination would mirror the older empty-folder policy, but exposes ontology-only screens before they have a graph. The four usable entry destinations retain that distinction.

**Falsifier**: Library redirects to root after an empty restore; rail and shortcuts disagree; a wiki-only loaded folder loses Library; or a folder-required destination renders unrelated bundled content before restoration.

**Owner**: jinan, through the request to restore the missing wiki entry and improve empty states.
