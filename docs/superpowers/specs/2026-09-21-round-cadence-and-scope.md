# Library rounds — a cadence you drag, and a scope that names its places

Date: 2026-09-21 · Owner ask (on the installed app, two screenshots): "make the cadence
feel good to drag — 1, 5, 10, 30 minutes, 1 hour; pick minutes or hours at the top and a
different drag comes out; the motion has to be very smooth" and "a document check cannot
be just this — you have to say which documents, where: a Slack room, a Slack canvas,
Notion, Obsidian, Confluence, Jira, and the documents I wrote myself".

Extends `2026-09-17-library-rounds-design.md`. Nothing here changes the standing-scope
table (§6 there) except that a round may now name more than one connector. Korean labels
quoted below are the keys' meaning; the copy itself lives in `messages/ko.json`.

## 1. Person and moment

The tech lead registers a round at 18:20 before leaving. Two things stop them today.

1. **Cadence.** Four chips (hourly · 6-hourly · daily · weekdays). They want the Slack
   incident room re-read every 10 minutes while a release is out, and the Confluence
   space once a night. Ten minutes is not on the row, and a text field would be a
   different product.
2. **Scope.** "Documents from a service" names a connector and nothing else. The round
   cannot say *which* Notion database, *which* Confluence space, *which* Slack channel,
   nor "and also the memos I keep under `sources/planning/`". So the person cannot
   tell what the pass will read, and neither can the ledger the next morning.

Restored ability: **saying, in one sentence the sheet reads back, exactly what is
watched, where, and how often — and dragging the "how often" until it feels right.**

## 2. Cadence

### 2.1 Model

```ts
type RoundCadence =
  | { every: 'hour' }                 // legacy, still read and written unchanged
  | { every: '6h' }                   // legacy
  | { everyMinutes: number }          // new: 1 5 10 15 30 · 120 180 720 1440
  | { daily: 'HH:MM'; weekdaysOnly: boolean };
```

- `everyMinutes` is the one interval form. `hour` ≡ 60 and `6h` ≡ 360 stay as the
  literals the store already holds; the writer keeps emitting those two literals for 60
  and 360 so a `rounds.json` written today still reads on the previous build. Every
  other interval is `everyMinutes`.
- `nextDueAt` for an interval aligns to the wall clock, as today: minutes divide the
  hour (`:00 :05 :10 …`), hours divide the day from 00:00 (`2h` → 00 02 04 …). Strictly
  after `from`, so a catch-up runs once.
- The 60-second tick (`TICK_MS`) already fits a one-minute round: a pass runs on the
  first tick at or after the boundary.
- `turnsPerDay` = `1440 / minutes` for intervals, `1` for daily/weekdays.

### 2.2 The control — `CadencePicker` (shared)

Lives in `src/shared/ui/cadence-picker/` so the automations screens can use the same
control; the Library sheet is its first consumer.

**Shape.**

```
How often
[ Minutes ] [ Hours ] [ Day ]                   ← unit, a segmented control (fills the column)
 ●────────┼────────┼────────┼────────          ← the rail: one drag track, detents below it
 1        5        10       15       30         (Hours: 1 · 2 · 3 · 6 · 12 · 24) (Day: chips Daily | Weekdays + time)
```

- **One rail per unit.** Switching the unit swaps the detent labels in place (crossfade,
  160 ms, `--motion-*` tokens) and puts the thumb on the nearest detent the new unit
  can say: 30 min → Hours lands on 1 h; 1 h → Minutes lands on 30 min; otherwise the
  first detent. The thumb travels there with the same spring as a drag release.
- **Drag.** Pointer capture on the thumb *and* on the track (press anywhere on the track
  moves the thumb there). While the pointer is down the thumb follows it without
  snapping; the nearest detent is highlighted and the readback sentence above the form
  updates the moment the nearest detent changes. On release the thumb springs to that
  detent (`cubic-bezier(0.2, 0.9, 0.3, 1.15)`, 240 ms; the overshoot is allowed since
  the 2026-09-08 lift). `prefers-reduced-motion`: the thumb jumps, the labels crossfade
  in 0 ms; nothing else differs.
- **Keyboard.** The thumb is `role="slider"` with `aria-valuemin/max` = detent indexes,
  `aria-valuetext` = the words ("every 5 minutes"). ← → step one detent, Home/End go to
  the ends. Each detent label is a real button (click = jump), so a person who does not
  drag has the chips they had.
- **Touch.** The thumb's hit area is the 44 px touch floor; the rail is at least 40 px
  tall in its hit region even though it draws 4 px.
- **Ratchet.** The thumb's travel is measured, not assumed: a vitest on the pure
  `nearestDetent(x, width, detents)` and an e2e that drags the real thumb 40 % across
  and reads back "every 10 minutes" from the sentence.

**Hours** detents: 1 · 2 · 3 · 6 · 12 · 24. 24 hours is the same as daily at the current
clock's hour; the readback says "every 24 hours", the store writes `everyMinutes: 1440`.

**Day**: the two chips that exist today (daily · weekdays) and the time field beside
them, unchanged.

### 2.3 Cost stays in view

The cost line under the scope card already says turns per day. It now turns amber (the
`--color-amber-source-*` ramp) when a service round would spend more than 48 turns a day
(every 30 minutes or faster), because 1440 turns a day is a real bill and the sheet must
not let the drag feel better than the invoice. The sentence is the same sentence; only
the ink changes.

## 3. Scope — the places a round watches

### 3.1 Vocabulary

| Word | Meaning |
|---|---|
| **Place** | One thing the round reads: a folder in this vault, or one connector with a location. |
| **Location** | The part of a service the round is limited to: a Slack channel, a Notion database, a Confluence space, a Jira project or board. Free text the person writes the way the tool names it (`#release-room`, `ENG`, `Roadmap DB`). |
| **My documents** | Files under `sources/` with no `source_url` — what a person dropped in, not what a service sent. |

### 3.2 Model

```ts
interface RoundPlaceVault   { kind: 'vault'; paths: string[] }            // folders relative to the root; [] = whole vault
interface RoundPlaceService { kind: 'service'; connectorId: string; connectorName: string; location?: string; query?: string }
type RoundPlace = RoundPlaceVault | RoundPlaceService;

interface RoundRecord {
  …existing fields…
  /** The places this round reads. Absent on records written before 2026-09-21. */
  places?: RoundPlace[];
}
```

- `kind` (`consistency` | `service`) is **derived** at save: no service place → `consistency`;
  any service place → `service`. The legacy fields `connectorId`, `connectorName`, `query`
  are still written from the *first* service place so an older build reads the record.
- A `vault` place with `paths: ['sources/planning', 'wiki/releases']` limits the
  consistency check to pages whose file or any cited source sits under one of those
  folders. `paths: []` is today's behaviour (everything). A path is a folder the person
  picked from the vault's real folder list (`list_vault_directory`), never typed.
- A `service` place may repeat a connector with two locations (`#release-room` and
  `#incidents`). The standing scope allows every connector named by the round's places
  (`round-scope.ts` matches `mcp__${name}__` for each).
- One agent turn per pass still holds: the service brief lists every service place, each
  with its location and query, and the vault paths the compile step may write for.
  Splitting into one turn per place would multiply the bill the cost line promises.

### 3.3 The sheet

"What to check" stops being a two-chip choice and becomes **"What to look at"**, a list
of places the person adds:

```
What to look at
  ▣ Documents in this folder · all        [Choose folders ▾]   ← always present, cannot be removed; folders are chips: sources/planning ×, wiki/releases ×
  ▣ Slack · #release-room                 [Where · What to look for]  ×
  ▣ Confluence · ENG space                [Where · What to look for]  ×
  + Add a place ▾   (menu: each enabled connector · another folder in this vault)
```

- "Documents in this folder" is the first row always. Its detail is the folder chips;
  "all" when none. "My documents" is a chip the folder menu offers (it resolves to
  `sources/` files without `source_url`, and the row says so).
- A service row has two short fields: **Where** (location) and **What to look for**
  (query; the placeholder is the service's own example: a channel name, a space key, a
  database name, a project key). Both optional; an empty location means "wherever the
  connector reaches", and the readback says so plainly.
- "Add a place" lists the connectors that are attached and switched on. When none is,
  the menu's one line says that no service is attached to this folder and opens
  `/agents/?tab=mcp`. Obsidian, a Slack canvas, Jira: each is a connector the person
  already registered; Atlas never names a transport, only the person's label.
- "When a page goes stale" (mark | redraft) stays and applies to the vault place.
- The readback sentence composes the places: "Every 10 minutes, re-read the documents
  from Slack's #release-room and Confluence's ENG space, check that the documents under
  sources/planning still match their sources, and redraft the stale ones. One agent turn
  per pass."
- "What this round may do" lists one line per service place ("call Slack to read
  #release-room, never write there") so the approval names each place.
- The index row's subtitle names the places in short form: "Slack · Confluence ·
  sources/planning · every 10 minutes".

### 3.4 Runner and ledger

- Consistency check: filtered by the vault place's paths before hashing.
- Service brief (`buildServiceRoundBrief`): takes `places` and emits one section per
  service place with its location and query; the connector tool allow-list is the union.
- Ledger entry gains `places?: string[]` (short labels) so the morning card and the
  per-pass line say where the pass looked. Existing entries without it read as today.

### 3.5 Not in this slice

- A folder outside this vault (an Obsidian vault on this Mac): the Rust commands are
  rooted to the open vault. Named for the next slice with the bound project roots in
  `project-sources.json` as the way in.
- Per-place cadence. One round, one cadence; a person who wants Slack every 10 minutes
  and Confluence nightly registers two rounds, and the sheet's readback makes that obvious.

## 4. Gates

- `round-record.test.ts`: `everyMinutes` alignment (5-minute boundary, 2-hour boundary,
  strictly after, DST day), legacy literals round-trip, `turnsPerDay` for 1/5/10/30/120.
- `cadence-picker.test.tsx`: nearest detent math, unit switch mapping, keyboard steps,
  reduced-motion path renders without transition classes.
- `round-scope.test.ts`: two connectors both allowed; a third rejected; `__` in a name.
- `NewRoundSheet.test.tsx`: derived kind, legacy fields written from the first service
  place, readback sentence for one vault + two service places, amber cost line at 30
  minutes for a service round.
- e2e (`library-rounds-cadence-drag.spec.ts`, desktop bridge stub): drag 40 % → "every
  10 minutes"; switch to Hours → thumb on 1 h; save → index subtitle "every 10 minutes".
