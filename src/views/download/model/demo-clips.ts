/**
 * The front-page demo clip registry — **the ledger's scenario moved into data.**
 *
 * Ledger: `docs/DECISIONS.md` 2026-07-29 "front-page demo video scenario: 2 clips, 2 tabs, no
 * cuts, no loop, no sound", plus the same night's "the demo video goes on the front page".
 *
 * **Why a separate registry.** **While there is no footage, this section must not appear on
 * screen.** A player with nothing to play is dead UI, and dead UI in the gateway's
 * first-impression slot is the same defect this repository pinned as "coming soon is not a
 * degradation, it is a lie" (`.claude/rules/surfaces.md`).
 *
 * **Why clip A was renamed (2026-07-30).** The id and label used to be `agent-edits` /
 *[the map follows when the AI edits]*. When the owner redefined clip A as a **feature tour**
 *([no need to show it connected to Claude Code]), that label became **false**: the footage has no scene of an AI editing. Applying the
 * rule above ("the label is the sentence the viewer will hold when the clip ends") it became
 * `one-folder` / *[one folder opens into six screens]*. **Attaching a sentence that differs from
 * what was filmed is the defect this registry exists to prevent.**
 *
 * So whether an asset exists is decided in **one place, in data**. Before a file is attached
 * `AVAILABLE` is empty and the section does not render. When footage arrives it is switched on by
 * adding one line to the array below — the component is not touched.
 *
 * **A tab label is not a feature name.** Ledger-confirmed: the label is *[the sentence the viewer will hold when the clip ends]*. A feature name like "MCP connection" reads only to someone who already knows, and this asset's primary audience includes **people who do not know what an agent is**.
 */

/**
 * One clip's contract. The delivery spec (the ledger's "post-shoot gate") is pinned into the type.
 *
 * ## Revised 2026-08-03 — **one** clip, no captions, per-locale video
 *
 * Three owner decisions:
 *
 * ① **From two to one.** With two tabs the viewer must first choose *what to watch*, and in the
 *    first-impression slot that choice is a cost, not a value — most people watch only the first
 *    tab and leave, so the second clip becomes «made but never watched».
 * ② **Captions are neither burned in nor rendered.** Each locale is filmed separately, so
 *    captions carry no information. Leaving the `.vtt` plumbing in place attaches an empty track.
 * ③ **The video itself is locale-dependent** — the text inside the frame differs between Korean
 *    and English. Hence `basenameFor(locale)` rather than `basename`.
 */
export interface DemoClip {
  id: 'atlas-tour';
  /** Length in seconds (measured). The post-shoot gate compares against this. */
  seconds: number;
  /** The leading part of the filename in `public/demo/` — `.ko` / `.en` is appended. */
  basename: string;
}

/**
 * The two clips the scenario defines. **The declaration always lives here** — the table must
 * exist before filming so that "what has to be filmed" is recorded in code and the post-shoot
 * gate has something to compare against.
 */
export const DEMO_CLIPS: readonly DemoClip[] = [
  // `seconds` is measured with ffprobe (2026-08-22 footage: 9.000s).
  { id: 'atlas-tour', seconds: 9, basename: 'atlas-tour' },
];

/**
 * **The footage actually attached.** When empty, the demo section does not render.
 *
 * To switch it on: place `public/demo/<basename>.{webm,mp4}`, `<basename>-poster.png`, and
 * `<basename>.ko.vtt` / `.en.vtt`, then add that id here. Adding files without editing this array
 * leaves the section off — **both the asset and the declaration must exist**, which is the point
 * of this array (switching on from file existence alone would put a half-uploaded asset straight
 * into the first-impression slot).
 */
/*
 * **What is attached now** (filmed 2026-08-22, installed build, vault `docs/ontology` with 82
 * nodes): one 9.000-second take. The path: the app opens on a folder it already knows → the map
 * draws itself and settles → a domain node is clicked → everything that is not its neighbour dims
 * out and the panel names what sits under it (16), above it (1), and which document evidences it.
 *
 * **Why the folder picking is not in frame** (owner, 2026-08-22): the vault is already connected
 * when the take starts. A picker sheet puts a real disk path on screen, and the scene it buys
 * ("choose a folder") is the one thing a viewer already assumes works.
 *
 * **Why it is nine seconds and not the previous 199.** The old take was a full feature tour —
 * dome, cloud, an ACP round trip — filmed when this slot was the page's argument. It is now one
 * scene above the install steps, and a tour asks for three minutes of attention before the viewer
 * has any reason to give it. What replaced it is the single claim the map makes: *click one thing
 * and the graph answers with its neighbourhood.*
 *
 * **No cuts and no speed-up** — the whole nine seconds runs at capture speed, so the assembly and
 * the click take exactly as long here as they do on a real machine.
 *
 * **Each locale is its own take** (2026-08-22). The Korean and English recordings are separate
 * passes over the same beats, filmed after switching the app's language, so the UI text and the
 * node names inside the frame are in the viewer's language. The layout turned out to be
 * deterministic — the same node measured at 812,797 in Korean and 813,798 in English — so the
 * coordinate path did not have to be re-planned after all.
 *
 * ⚠️ **The two assets must not become one again.** For its first two days this registry shipped a
 * single Korean master under both names, and `demoProvisionalNote` carried a clause admitting it.
 * Re-copying one locale over the other would restore that silently: every existing check would
 * stay green, because both files would still exist, still be over 10KB, and still measure 9s.
 * `demo-clip-assets.contract` now compares their bytes for exactly this reason.
 *
 * Why the registry is not simply left empty: emptying it removes the demo section from the gateway
 * entirely, which not only worsens the first impression but **silently voids the test below it**
 * that checks the three install steps do not fold — with the section gone the page shortens, the
 * steps end up above the fold on their own, and the test goes green while measuring nothing (that
 * test's own comment names this trap).
 *
 * **Replacement procedure**: overwrite `public/demo/atlas-tour.{ko,en}.{webm,mp4}` and
 * `atlas-tour.{ko,en}-poster.png` with the new footage, update `seconds` to the ffprobe
 * measurement, **and rewrite `demoProvisionalNote` to describe what was actually filmed** — the
 * length has a gate, the sentence does not.
 */
export const AVAILABLE_DEMO_CLIP_IDS: readonly DemoClip['id'][] = ['atlas-tour'];

/** The clips to render — only those with both a declaration and an asset. */
export function availableDemoClips(
  available: readonly DemoClip['id'][] = AVAILABLE_DEMO_CLIP_IDS,
): readonly DemoClip[] {
  return DEMO_CLIPS.filter((clip) => available.includes(clip.id));
}

/** Whether to draw the demo section — with no clips there is no section. */
export function hasDemoClips(
  available: readonly DemoClip['id'][] = AVAILABLE_DEMO_CLIP_IDS,
): boolean {
  return availableDemoClips(available).length > 0;
}

/**
 * Asset paths. **AV1 (webm) first, MP4 as the last resort** — per the ledger, this page's primary
 * visitor is on macOS (i.e. Safari), and Safari's AV1 depends on hardware support, so there must
 * be somewhere to fall back to.
 */
function localeTag(locale: string): 'ko' | 'en' {
  return locale === 'ko' ? 'ko' : 'en';
}

export function demoSources(clip: DemoClip, locale: string): { src: string; type: string }[] {
  const base = `/demo/${clip.basename}.${localeTag(locale)}`;
  return [
    { src: `${base}.webm`, type: 'video/webm' },
    { src: `${base}.mp4`, type: 'video/mp4' },
  ];
}

export function demoPoster(clip: DemoClip, locale: string): string {
  return `/demo/${clip.basename}.${localeTag(locale)}-poster.png`;
}
