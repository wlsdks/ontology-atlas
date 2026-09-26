---
title: Download
doc_type: feature
status: current
area: release
routes: [/download]
---

# Download

### `/download` — the install decision (remade 2026-07-27)

**This screen's job, in one sentence**: *a first-time visitor chooses their
platform, understands its trust state, and gets the matching installer without
hunting for it.* Everything on the page earns its place against
that sentence; the remake removed what could not (a second landing hero, a
Korean-only changelog excerpt, 12 same-weight boxes, and the signing copy that
had become false).

- **Decision first, at full column width**: eyebrow → headline → one-paragraph lead → the macOS decision card. The card is the widest thing above the fold because it is the most important; it used to sit inside a half-width column under a taller figure.
- **One filled indigo button per release state, and it is the one that works.** Generated GitHub Release facts select the CTA: published assets show their real platform/architecture download and size; an unavailable asset gets honest pending copy instead of a dead release button. The releases link stays at lower weight.
- **Architecture help is on the page, not assumed**: "Apple menu → About This Mac; if *Chip* begins with Apple M, it's Apple Silicon". Naming both architectures and stopping there left the majority of visitors — who do not know which Mac they own — stuck in front of two buttons.
- **One release-state source**: everything the page may claim about a build comes from `src/views/download/model/macos-release.generated.ts`, written by `pnpm download:release-facts` out of the real GitHub Release. Published macOS → per-architecture DMGs; published Windows → the x64 NSIS installer; both carry real byte size, filename, direct URL, and copyable SHA-256. Unpublished → plain pending copy instead of placeholder facts. There is no state where the page shows a size or checksum that does not exist.
- **Trust is four facts with their proofs, not a paragraph**: Developer ID signing (`codesign verified`) · Apple notarization + stapling (`stapler validate passes`) · a published SHA-256 per file with the verify command built from the current version's real DMG name · and *what Atlas does not do* — no Atlas account or backend; the vault remains disk-backed and Atlas itself does not upload it. A connected coding agent may send prompts and the context or MCP results it reads to its own provider. Signing is stated as a property of the release path and drift-guarded by `release-facts.test.ts` against the real `desktop:release-artifact` chain (`desktop:sign` → `desktop:notarize` → `desktop:verify-release-dmg --require-signed --require-notarized`), so the claim cannot outlive the pipeline that backs it.
- **After-install path in three steps** — drag to Applications and launch · point it at a markdown folder · connect your AI assistant (tool and command counts derived from `mcp/src/index.js` and `cli/src/lib/cli-commands.mjs`, both drift-guarded) — plus the fact that makes this page a one-time visit: the installed app updates itself with one button (#726).
- **Windows x64 beta**: a published unsigned NSIS installer appears in its own platform section inside the same decision plate. The static warning precedes the outline CTA and names SmartScreen's unknown-publisher warning and managed-PC blocking. Native Windows CI requires dependency audits, Microsoft Defender scan, silent install, app launch, and the installed MCP sidecar smoke; it does not claim to have verified the Windows 11 SmartScreen UI.
- **Evidence figure**: the dogfood instrument (project hex + domain chips + hub capability circle, real `docs/ontology` census — `src/views/download/model/dogfood-census.generated.ts`, built by `scripts/build-docs-vault.mjs`) now sits beside step 02, the one place it is an answer rather than decoration, with its scope caption ("counts this repo's own vault, not yours").
- **Secondary CTA**: "Go to GitHub" → GitHub repo, as a visible medium outline button rather than a small source footnote.
- **Motion**: none on entrance (first painted frame is identical to the settled frame across every node in `#main`). The budget goes to the attention winner alone — the filled CTA eases on `--motion-base` + `--motion-ease` with a 6.1% first-frame share — and `prefers-reduced-motion` lands it instantly. The previous page inverted this: a staggered fade ran on background cards while the winner hard-cut.
- **Live deploy verification**: `pnpm desktop:verify-hosted` checks the deployed `wlsdks.github.io/ontology-atlas` root/download pages after the Pages workflow deploys; on a published release it also runs `pnpm desktop:verify-download` for that tag. It asserts only **server-rendered** text: a loaded-vault map hydrates client-side, so its in-app CTAs never reach the static HTML — expecting them is what kept this gate failing on every Pages deploy while the site itself was fine (5/5 runs red, 2026-07-26~27). Expected download copy is read from `messages/ko.json` instead of duplicated in the checker, so the contract is "the page renders its own copy" and cannot drift: title, source-code CTA, both platform headings, the Windows beta trust state, the hosted-site scope note, a stable GitHub Releases href, and no `/releases/latest` dependency.
- **Privacy note**: the installed app and vault data use local disk as the source of truth; `/docs`'s own local-source *browsing* tab stays desktop-only (unrelated to opening your primary vault from `/`)
- **The page closes its own loop (2026-09-02)**, after a survey of open-source and commercial download pages (Zed, Ghostty, Sublime, HandBrake, Godot, Cursor, Notion, Vercel, Antigravity):
  - the gateway chrome carries a GitHub link beside the X mark, and the facts strip ends with two destinations — *What changed in vX.Y.Z* → `/changelog` and the repository (`↗`) — because the eyebrow said "open source" while the only github.com links on the page were release files;
  - at the split width the hero claims the first viewport below the chrome, so the facts strip sits on the fold instead of 150px above it;
  - a **closing band** before the colophon bookends the page: the winner's file again as an `outline` control (the hero keeps the single filled indigo), the version line, the trust line, and the verification recipe — the platform's command (`shasum -a 256 <file>` / `Get-FileHash`), one sentence on why the hash must match, and the winner's full SHA-256. The winner is decided once for the hero, the strip, and the band;
  - a phone visitor (iPhone, Android mobile) gets *Try it in the browser* as the filled winner and the three files one step down — a phone cannot install a DMG or an EXE;
  - the agents section uses the evidence section's 11/9 grid: the in-app chat scene left, the three still cards stacked right, so the column is filled and the two sections share one grammar.
- **The map is the ground of the first screen (2026-09-02, round two — owner: *"I wanted cool motion or a background effect"*):**
  - the hero object is no longer a boxed column beside the type. It is the **stage behind the whole first screen**: the same graph in its **plane form** — a radial map seen from a tilted camera, anchored right of centre at the split width and dimmed so the type stays clear (measured 0.0% lit pixels under the headline, 0.5% under the decision block at 1512). Below `xl` it sits in a plinth under the facts strip instead of behind the text;
  - the stage **answers the hand**: yaw and pitch lean toward the pointer, eased over frames, and the gateway field gains a fourth light that trails the pointer with inertia (same ink, same alpha ceiling). Fine pointers only, never under reduced motion;
  - the stage carries a **scroll camera**: as the hero leaves the viewport the plane turns, pushes in, looks further down, lifts slower than the page, and fades out over the last half — so the evidence section's real map arrives on clear ground. Reduced motion keeps one still frame;
  - the mascot left the hero (it read as part of the map and is not data); the chrome's compact mark is the page's one mascot;
  - the e2e grid gate now measures legibility over the stage (lit-pixel share under the headline and the decision block) instead of "no destination stands on the object", which the stage makes true by design.
  - council (2026-09-03, five seats, guardian decided): the split opens at 90rem (1440) and follows resizes; the scroll camera runs only there; the cursor says `grab` only over a dot and the hover follows the dot through motion; the hover caption sits in the plane's corner and leads with the kind word; the fan lanes stay inside their rings, the fog floor is 0.22, and indigo on the stage means only `depends`. The decoder ghost that briefly showed a wrong letter in the headline was removed (the caret and the weight landing stay, h1 drift gated at ≤4px). On the gateway face the chrome no longer repeats the changelog chip — the facts strip's "What changed in vX.Y.Z" is the page's one changelog destination.
  - round three (2026-09-03): the hero rises inside half a second (eyebrow and lead 240ms, CTA 320ms, strip 400ms; the CTA used to be invisible yet hit-testable for 920ms); the scroll camera lays the plane down toward the demo poster's top-down view, drifts it to the centre axis, and dissolves it above the facts strip; phones keep three tiers (project, domains, capabilities) drawn larger instead of 96 unreadable dots.
- **The folder's other screens on one stage (2026-09-24, owner-selected direction B):** after the live map, one section — *One folder, read seven ways* — lists the app rail's own names in its order (Map, Harness, Library, Automations, Insights, Projects, Git; Agents keeps its own section). Map returns to the live map above; each other name is a tab that crossfades, in place, a real capture of that screen in the page's own language (1336×860 from a 2672×1720 PNG, one set per locale), one caption sentence naming what is on it, and a door to the destination. From 1280 the names are a 176px column beside the picture; narrower, a strip above it. The captures replaced the two separate architecture and library sections and come from `pnpm gateway:capture`, which renders the static export with the desktop bridge answered from this repository's own `docs/ontology`, its harness files and its Git history, plus a small sample library and one saved automation.

- **Footer**: license · GitHub · stack chips · `LocaleSwitch`

### `/download` — desktop app download (rebuilt 2026-07-18, Windows beta 2026-08-01)

RATIO-SYSTEM 1600px container / 960px centered utility column.

#### Header
- Back link · eyebrow · right-aligned "macOS · DMG · GitHub Release" caption · `LocaleSwitch`
- Title + subtitle · primary CTA (the Apple Silicon DMG once published, otherwise an honestly labelled link to GitHub Releases) + secondary CTA (view source on GitHub)

#### Engraved fact strip (repo facts that hold before any build exists)
- Version (`RELEASE_VERSION`, from `package.json`/`tauri.conf.json`) · format (DMG) · architecture · min macOS (`RELEASE_MIN_MACOS`) · channel
- Size and checksum are **not** here: they exist only once a build is published, so they live in the platform block and are read from the generated release facts

#### Platform block (macOS + Windows)
- **macOS** — published: one row per architecture with a direct download link, the real byte size, the DMG filename, and a copyable SHA-256. Unpublished: a single "not out yet" sentence, no placeholder facts
- **Windows** — unpublished: one honest beta-pending line. Published: one unsigned x64 NSIS installer CTA derived from its real release URL and byte size, with a warning immediately before it; GitHub Release carries the sibling SHA-256 asset. Native CI proves build/scan/install/launch/MCP behavior; Windows 11 SmartScreen UI remains unverified
- Source of truth: `src/views/download/model/macos-release.generated.ts`, written by `pnpm download:release-facts` from the real GitHub Release

#### "Includes" cards (3, sm+)
- Topology map · MCP server (tool count) · CLI (command count)

#### Install steps (4, numbered 01–04, sm+ 2-col grid)

#### Trust panel + changelog preview (2-col on lg+)
- **Trust panel** — "Developer ID signed" / "Notarized by Apple" / "checksums published" stated as facts about published builds (never as a gate that "requires" them) + a `spctl --assess --type open --context context:primary-signature ...` verify command built from the current version's DMG filename + the policy note that a build failing a gate is never published
- **Changelog preview** (`CHANGELOG_PREVIEW_ENTRIES`, sourced from `docs/CHANGELOG.md`) — version + a handful of recent entry titles + "as of DATE" caption

#### GitHub row + release-gate note + footer
- GitHub repo link row · the hosted-site scope note (the website never opens or edits vault folders) · footer (license / GitHub / stack)
