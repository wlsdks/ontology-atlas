import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Locks the **reach** of the "show screen guides automatically" switch.
 *
 * Guides appear **seven times**: one folder-prompt sheet
 * (`vault-guide-auto-open`), one map tour (`HomePage`), and five destinations
 * (handled by a single component, `DestinationGuide`). That sum is exactly what
 * the owner found annoying — each fires once, but together they fire every time —
 * so **gating one place leaves the switch half-deaf**.
 *
 * A walkthrough on 2026-08-07 confirmed the sum by actually walking it: dismissing
 * the folder sheet with "later" on a first visit hands straight over to the tour
 * **on the same screen**, and going to a destination raises another. (That handover
 * is itself the deliberate order recorded in `vault-guide-auto-open.ts` and is not
 * judged here. This contract asks only whether the switch covers all seven.)
 *
 * Why read the source: on the `DestinationGuide` side a render test can confirm
 * the switch suppresses firing, but the map's auto-start lives inside an effect in
 * `HomePage` (about ten thousand lines, reachable only with vault, camera, and
 * layout all alive) and cannot be exercised the same way. A probe confirmed it:
 * deleting the map gate leaves all 91 guide render tests passing. Covering that
 * blind spot is this test's only job.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Files that own an auto-start = files that must read the switch. This list is the reach. */
const AUTO_START_SITES = [
  "src/views/home/ui/HomePage.tsx",
  "src/features/guided-tour/ui/DestinationGuide.tsx",
  /**
   * The folder-prompt sheet — **the third site, and it was not registered**
   * (2026-08-07).
   *
   * This is the very file where the "switch is half-deaf" incident happened on
   * 2026-08-02 (owner: *"It keeps appearing, which is inconvenient while testing"* — it keeps appearing,
   * which is inconvenient while testing: guides were turned off in settings, yet the
   * sheet still appeared on the first screen with no folder). It was fixed then to
   * read `readGuideAutoStart()`, but **it never entered this list** — so deleting
   * that one line leaves the gate green and brings the same complaint straight back.
   *
   * Found by walkthrough: a first visit meets the folder sheet, then the map tour,
   * then a destination guide in succession, and only one of the three was outside
   * the switch.
   */
  "src/features/first-run-starter/model/vault-guide-auto-open.ts",
] as const;

/** Where the switch is **defined**. Not a consumer, so it is not in the list above. */
const SWITCH_DEFINITION = "src/shared/lib/guide-auto-start.ts";

describe("화면 안내 자동 표시 — 스위치가 모든 발화 지점을 덮는다", () => {
  it.each(AUTO_START_SITES)("%s 가 스위치를 읽는다", (path) => {
    expect(read(path), `${path} 의 자동 시작이 스위치를 안 본다 — 스위치가 반만 듣는다`).toContain(
      "readGuideAutoStart()",
    );
  });

  /**
   * A new auto-start site must extend the list above.
   *
   * ⚠️ **The previous check could not discover a new site in principle**
   * (2026-08-07). It ran `AUTO_START_SITES.filter(...)` — filtering **the registry
   * itself** and comparing against its own length. A file outside the list was never
   * a candidate, so the assertion passed no matter what was added. In that blind
   * spot the third site (`vault-guide-auto-open.ts`) really did live unregistered.
   *
   * Worse, the discriminator was `watchGuidedTourAutoStartCancel` (a tour-only
   * mechanism), so any auto-open not using that mechanism failed the criterion
   * itself.
   *
   * So the tree is **walked directly** to find every file reading the switch, and
   * the result is compared against the list. "The list is the reach" — and a
   * hand-maintained list means the reach shrinks by hand too, a price this
   * repository already paid on the icon ratchet.
   */
  it("등록되지 않은 자동 시작 지점이 없다", () => {
    const found: string[] = [];
    const walk = (rel: string) => {
      for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(child);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
        if (child === SWITCH_DEFINITION) continue; // The definition is not a consumer
        if (read(child).includes("readGuideAutoStart()")) found.push(child);
      }
    };
    walk("src");

    // Idling guard — the scanner must not find 0 files and pass as "nothing diverged".
    expect(found.length, "스위치를 읽는 파일을 하나도 못 찾았다 — 스캔이 깨졌다").toBeGreaterThan(1);

    const registered = new Set<string>(AUTO_START_SITES);
    const unregistered = found.filter((p) => !registered.has(p));
    expect(
      unregistered,
      `등재되지 않은 자동 시작 지점: ${unregistered.join(", ")} — ` +
        `스위치를 읽는 파일이 늘었으면 AUTO_START_SITES 에도 넣는다`,
    ).toEqual([]);

    const stale = [...registered].filter((p) => !found.includes(p));
    expect(
      stale,
      `등재됐는데 스위치를 안 읽는 파일: ${stale.join(", ")} — ` +
        `자동 시작을 지웠으면 목록에서도 빼고, 안 지웠으면 그 파일이 스위치를 잃은 것이다`,
    ).toEqual([]);
  });

  /**
   * Turning it off is **not deletion.** The ways to summon a guide (Settings ›
   * replay, the map compass) must stay alive regardless of the switch — owner:
   * *"or else only when clicked."*
   */
  it("부르는 길은 스위치 뒤에 숨지 않는다", () => {
    const settings = read("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
    const replayRow = settings.slice(settings.indexOf("app-settings-replay-guide"));
    expect(replayRow.slice(0, 900)).not.toContain("guideAutoStart");
  });
});
