---
title: Library Rounds — the Library keeps itself current while nobody is looking
doc_type: spec
status: current
area: library
date: 2026-09-17
decisions: [0e82da66-48d2-44f1-a923-82857d7a3710]
---

# Library Rounds — the Library keeps itself current while nobody is looking

Date: 2026-09-17 · Owner ask: "leave the app on, go home or keep working, and the
agent updates the Library on its own; a consistency check registered for every hour
runs every hour." Design bar: as strong as a workflow builder, copied from none.

## 1. Person and moment

A tech lead opens Ontology Atlas at 09:02. Last night at 18:30 they left it open. Two
Confluence pages and one Jira board changed overnight. Today they have to answer, from
the Library, "what became untrue while I was away, and what has already been fixed?"
Today the answer is: nothing, because nothing ran. Compile is a press. Lint is a press.
Bring-from-a-service is a press.

The human ability restored: **knowing what went stale, and having the redraft waiting,
without having pressed anything.**

## 2. What Atlas already has and the two missing pieces

Already here (paths are the authority; see the survey in this spec's plan):

- Connectors: MCP servers a person already registered elsewhere, attached to the in-app
  ACP session, secrets in the keychain, listed by name only.
- Bring from a service: a bounded brief to the agent; imported files carry `source_url`
  and `fetched_at` in frontmatter.
- Staleness: every wiki page carries `sources` + `source_hash`; `deriveSourceState`
  says `stale` when the bytes changed; the Rust `hash_vault_files` command hashes on
  demand.
- Compile, Lint, `judgePageWrite`, `wiki/_log.md`, the permission `autoDecide` hook
  in `useAcpSession` (a wiki page that fits its contract lands without a card,
  2026-09-07), the folder watcher, the adaptive poller, a native tray.

Missing: **(1) a clock** — nothing in the app repeats on a schedule except a 24-hour
update check; **(2) a standing scope** — every non-wiki write and every connector tool
call stops at a card only a present person can press.

n8n is not a source. It is source-available under the Sustainable Use License, not
open source, and Atlas executes no third-party code anyway. What we take is the idea
that a person composes "when · from where · what · to where" once. What we do not take
is the node canvas, because the Atlas unit is not a data hop but **a claim and its
evidence**.

## 3. Vocabulary

| Word | Meaning |
|---|---|
| **Round** | A rule the Library keeps: what to check, how often, what it may do. |
| **Pass** | One execution of a round at one time. |
| **Held** | A pass that found every checked page still matching its sources. |
| **Went stale** | A pass found a source changed under a page. |
| **Redraft** | A pass wrote a new draft page from the changed source; the person judges it. |
| **Asleep** | The Mac slept or the app was closed; no pass could run. |

Korean labels live in `messages/ko.json` only, as typed locale data.

The words "workflow", "automation", "scheduler", "cron", "trigger", "node" never appear
on screen.

## 4. Round kinds in this slice

### 4.1 Consistency round (local, free)

Checks that every wiki page still matches its sources. No agent turn.

Work per pass: hash every cited source (`hash_vault_files`), compare with each page's
`source_hash`, run the structural wiki report (`mcp/src/wiki-report.mjs` via
`use-library-model`'s `structural`), and count broken citations. Outcome sentence:
"14 pages checked · all held" or "14 checked · 2 went stale: Payments API, Release
plan".

Option **"When a page goes stale"**: `mark` (default off) or `redraft` (default on,
per the owner: "the agent updates on its own"). `redraft` starts one agent turn with
the existing Compile brief for only the stale sources, under the round's standing
scope (§6). A redraft lands as `status: draft`; the person judges it in Wiki.

### 4.2 Service round (agent, one turn per pass)

Re-reads documents from one attached connector. Work per pass is one agent turn whose
brief says: for every file under `sources/` whose frontmatter `source_url` belongs to
this service, fetch the current version; if the body differs, overwrite that file with
the new body and `fetched_at`; then search the service for the round's query (for
example "pages changed in the last 24 hours in space ENG") and write each new document
as a new file under `sources/`, at most N (default 20, the same cap Bring-from-a-service
uses). Finally write or redraft the wiki page for each source that changed or is new,
following the Compile rules verbatim. Nothing else.

Overwriting a source is not "modifying `sources/`" in the compile-rule sense: the
compiler never touches evidence; the **importer** refreshes it, and the hash change is
what makes the page report itself stale. A Git vault keeps the previous bytes.

Connectors offered: those attached and switched on in `.ontology-atlas/connectors.json`
for a runtime that carries connectors (Claude, config-isolated). The dialog names the
service by the person's label, never by transport.

### Named for the next slice, not built now

A folder-on-this-Mac round (bound project roots already exist in
`project-sources.json`), a Swagger/OpenAPI URL round, and the time scrub on the
Library graph (§9.4).

## 5. Scheduling

- **Cadence choices**: every hour · every 6 hours · daily at HH:MM · weekdays at HH:MM.
  Stored as `{ every: 'hour' | '6h' } | { daily: 'HH:MM', weekdaysOnly: boolean }`.
- **Clock**: a 60-second tick in the WebView while a native vault is open, owned by one
  `RoundsRunner` mounted beside `TauriVaultWatchBridge` in `LocalVaultProvider`, so it
  runs on every route, not only Library. The web build (no native root) never ticks.
- **Due**: `nextDueAt <= now` and no pass is running. Passes never overlap; if two are
  due, the local one goes first, then one service pass, then the tick continues.
- **Catch-up**: a missed window runs **once**, at the first tick after it, never N
  times. `nextDueAt` is computed from the cadence and the *scheduled* time, not from
  the late run.
- **Asleep**: if the gap between two ticks exceeds 3 × 60 s, or the app was closed, the
  ledger gets one `asleep` entry from the last tick to now. The screen draws it as a
  hatched gap. This is the honest line: "01:12 → 08:55 asleep".
- **Only while open**: the round runs while Ontology Atlas is open on this Mac. Closing
  the window quits the app today; hide-to-tray is not in this slice. The Rounds header
  says so in one sentence.
- **Run now**: every round has a manual press that starts a pass immediately.
- **Pause**: per round `enabled: false`; a paused round keeps its ledger.

## 6. Standing scope — what a pass may do without a person

A round is approved **once, at registration**, for exactly what its kind needs. The
sheet's primary button reads "Allow and save", and the sentences above it are the
scope. During a pass the existing `autoDecide` hook answers each permission request:

| Request | Consistency (redraft on) | Service |
|---|---|---|
| Atlas vault MCP read tools | allow | allow |
| This round's connector tools, unless the adapter says `edit`, `delete`, `move` or `execute` | — (no connector) | allow |
| This round's connector tools the adapter marks as mutating | — | reject |
| Any other connector's tools | reject | reject |
| Write a page under `wiki/` that `judgePageWrite` accepts | allow | allow |
| Write a page under `wiki/` that it rejects | reject | reject |
| Write a file under `sources/` | reject | allow |
| Ontology write (`reviewKind: 'ontology-write'`) | reject | reject |
| Any other path, any execute, delete, move | reject | reject |

Adapters rarely classify an MCP server's tools, which arrive as `other` or unclassified,
so the round's own connector is allowed unless the adapter says the call mutates; the
brief forbids writing to the service, and every connector tool the pass called is listed
in the ledger (`called`), so a tool that should not have run is visible next morning.

A rejection is not silent: the pass ledger records `refused: <tool or path>` and the
pass outcome shows it. `autoDecide` gains a rejecting return (`{ reject: reason }`),
backward compatible with the string-or-null contract the Library uses today.

This overturns, for round sessions only, the 2026-09-05 falsifier "a connector tool
executing in any offered runtime without a permission card", and takes up the remedy
the 2026-09-01 decision named: "a scoped allow_always the user picks explicitly, never
a return to silent path-based allow". The map's rule (ontology writes wait for
`allow_once`) is untouched. Decision record: `docs/records/decisions/2026-09-17-…`.

Falsifier for the whole feature: a pass writing outside `sources/` or `wiki/`, a node
written by a round, or a connector other than the round's own being called.

## 7. Cost honesty — check often, spend rarely

- Consistency passes cost nothing and may run hourly.
- A service pass is one agent turn; the sheet states the daily count in words:
  "one agent turn per pass · about 24 a day at this cadence". The quota exhaustion of
  2026-09-07 (session limit and credits both gone) is the reason this sentence exists.
- A consistency round with redraft on spends a turn only on the pass that found
  something stale, and the ledger line says "1 agent turn" or "no agent turn".

## 8. Storage — local to this Mac

`.ontology-atlas/` is fully ignored by its own `.gitignore`, so a round is a fact
about **this machine**, which is right: the Mac that is open is the one that runs it,
and two machines sharing a round would fetch twice.

- `.ontology-atlas/rounds.json` — `{ v: 1, rounds: RoundRecord[] }`, same medium
  pattern as `connector-store.ts`.
- `.ontology-atlas/rounds-ledger.jsonl` — one line per pass or gap, newest last, capped
  at 500 lines (the receipt cap pattern). Fields: `id, roundId, kind, startedAt,
  endedAt, outcome: 'held' | 'stale' | 'redrafted' | 'refused' | 'failed' | 'asleep',
  checked, stale: string[], written: string[], refused: string[], agentTurns: 0 | 1,
  summary`.
- Page writes keep going to `wiki/_log.md` through the existing compile path, with
  writer `round:<name>`, so the wiki's own record stays complete. Nothing new is
  written into the ontology.

```ts
interface RoundRecord {
  id: string;                 // uuid
  name: string;               // "Confluence · daily 09:00" (editable)
  kind: 'consistency' | 'service';
  cadence: RoundCadence;
  enabled: boolean;
  onStale?: 'mark' | 'redraft';       // consistency
  connectorId?: string;               // service
  query?: string;                     // service
  limit?: number;                     // service
  createdAt: string; lastPassAt?: string; nextDueAt: string;
}
```

## 9. Surface — a fifth Library tab, "Rounds"

Library header: `Sources · Wiki · Ontology · Collections · Rounds`. The tab carries a
count of enabled rounds. URL `?tab=rounds`.

### 9.1 Index column (280 px, the Library pattern)

Header "Rounds N" with the Info glyph. One primary press **New round**. Then the list:
one row per round — name, cadence in words, a state glyph (enabled / paused), and the
last outcome in one word ("held", "2 stale", "asleep"). Pressing a row selects it and
the stage filters to its passes.

### 9.2 Stage — the morning card, then the ledger

**Header strip** (same row the graph uses): "3 rounds · last pass 09:00 · next 10:00
Consistency" · **Run now** · **Pause all**. Right end: the one-sentence limit "Runs while
Atlas is open on this Mac."

**Since you left** — the primary surface, one card, at the top: the span since the
last time the person was in the app ("18:30 → 09:02"), then three lines at most:
what went stale, what was redrafted and waits, what held. Each page named is a chip;
pressing it opens that page in Wiki. When nothing changed the card says so in one line
and is visibly quieter. This card is the attention winner; the ledger below is support.

**Ledger** — a vertical time axis on the left with hour ticks; passes sit on it at
their time. A pass that changed something is a card: round name, duration, outcome
sentence, chips of affected pages, and the cost line ("no agent turn"). A `held` pass
is a thin tick with a hover line, so the eye goes to change. An `asleep` gap is a
hatched band with its span. Newest at the top. Selecting a round in the index filters
the axis to that round.

### 9.3 New round — one sheet, four fields, in the person's words

1. **What to check** — segmented: *Pages still match their sources* · *Documents from
   a service*. Choosing the service shows the attached connectors as a list (label +
   what it can reach), and a query line "What to look for" with a placeholder.
   If no connector is attached, the option says so and links to Bring from a service.
2. **How often** — chips: every hour · every 6 hours · daily at [time] · weekdays at
   [time]. The daily choice shows a time field.
3. **When a page goes stale** (consistency only) — *Redraft it* (default) · *Mark it*.
4. **This round may** — a fixed list derived from 1 and 3 (the §6 rows that allow),
   plus the cost sentence from §7. Not editable: it is what is being approved.

Name is derived and shown above the button, editable inline. Primary button:
**Allow and save**. Secondary: Cancel. The sheet dims the stage (modality rule).

### 9.4 What makes it ours

The ledger draws **what became untrue and when**, not "37 executions succeeded". The
next slice puts the same axis under the Library graph as a date scrub, so the marks
themselves show which pages went stale on which day. This spec reserves the axis
component (`RoundsTimeAxis`) so the scrub reuses it rather than a second one.

### 9.5 Web build and empty states

- No native root: the tab renders the explanation and "Get the app", no New round.
- Native root, no rounds: the stage shows one empty stage in the Library style with
  the two round kinds described in one line each and the New round press.
- Native root, no connector: the service option is present, disabled, with the reason.

## 10. Design directions considered (routed `directions=yes`)

1. **Status quo plus a switch** — a "keep current" toggle per imported source and a
   hidden hourly check, no new surface. Rejected: nothing shows what happened; the
   morning question stays unanswered; the owner asked for a registration a person can
   read.
2. **Rounds tab with a morning card and a time ledger** — selected. One surface owns
   registration and report; the Library's index/stage geometry is reused; the time
   axis is the distinctive mark and is reusable under the graph.
3. **Rounds as a layer on the graph** — a clock control in the graph header, rounds
   registered from a source's card, the report being the graph with a date scrub. Held
   for the next slice: it depends on the axis and the ledger existing first, and a
   person registering a round needs a place that lists them.

## 11. Motion or stillness

- A pass that completes while the screen is open: its card enters on the axis with a
  short opacity/transform arrival on the existing usability motion family; no bounce.
- The header's "next" time counts down by minute; no arc animation in this slice.
- Reduced motion: cards appear without transition; text is identical.
- Everything else is still. The morning card is stillness on purpose.

## 12. Architecture

FSD placement:

- `src/entities/library-round/` — `model/round-record.ts` (types, parse, validate,
  cadence math `nextDueAt(cadence, from)`, `isDue`), `model/round-store.ts` (sidecar
  file store for `rounds.json`), `model/round-ledger.ts` (jsonl append/parse/cap),
  `index.ts`.
- `src/features/library-rounds/` — `model/round-scope.ts` (the §6 judge; pure),
  `model/service-round-brief.ts` (the brief), `model/consistency-pass.ts` (hashing +
  report → outcome), `model/use-rounds-runner.ts` (tick, due, catch-up, asleep,
  one-at-a-time), `model/use-library-agent-wiring.ts` (extracted from
  `views/library/lib/use-library-agent.ts`: runtime id, mcpServers, availability —
  no UI state), `ui/NewRoundSheet.tsx`, `index.ts`.
- `src/views/library/ui/LibraryRounds.tsx` + `parts/RoundsIndex.tsx`,
  `parts/SinceYouLeft.tsx`, `parts/RoundsLedger.tsx`, `parts/RoundsTimeAxis.tsx`.
- `src/app/library-workspace/index.tsx` — the fifth tab.
- `src/entities/vault-session/model/LocalVaultProvider.tsx` — mounts `RoundsRunner`
  (a thin component from the feature, exported for the provider; the entity layer
  does not import a feature, so the provider receives it through an app-layer
  composition point — see plan).
- `src/features/acp-session/model/use-acp-session.ts` — `autoDecide` return type
  gains `{ reject: string }`.

No Rust change in this slice: hashing, the watcher, `acp_*` and connector secrets
already exist. The runner is WebView-side so the session/permission path is the one
already measured.

## 13. Testing

Unit: cadence math (hourly/6h/daily/weekdays, catch-up once, DST-safe by using local
time components), scope judge (every §6 row), service brief text (rules present, cap,
connector name), ledger parse/append/cap, consistency outcome derivation,
runner (fake timers: due, overlap, asleep gap, pause, run-now).

Contract: `rules-path-scope` unchanged; a new `library-rounds-scope.contract.test.ts`
pinning that a round never auto-allows an ontology write or a path outside
`sources/`/`wiki/`.

E2E (desktop bridge stub, the compile-dock pattern): the Rounds tab renders, New round
sheet opens with modality, saving writes `rounds.json` through the stubbed bridge,
the ledger renders seeded passes with the asleep band, chip opens the Wiki page.

Installed app: one real consistency pass on the dogfood vault with a changed source,
screenshot of the morning card and the ledger entry; one real service pass is proof
the owner runs with a connector attached (recorded as a limit if no connector is
available at proof time).

## 14. Out of scope

Hide-to-tray and launchd; folder and OpenAPI rounds; the graph date scrub; sharing
rounds through Git; Codex runtime for service rounds (connectors ride Claude only
today); notifications outside the app.

## 15. Documentation to update with the code

`docs/FEATURES.md` (Library section), `docs/ARCHITECTURE.md` (Library tab list and
the runner mount), `README.md` if a script is added (none planned), `messages/en.json`
and `messages/ko.json` (`library.rounds.*`), the decision fragment, and a change
fragment.
