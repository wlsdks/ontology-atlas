import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every auto-start guide site must read the auto-start switch. The map auto-start lives in an effect
 * that render tests cannot reach, so the source is read directly.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Files that own an auto-start = files that must read the switch. This list is the reach. */
const AUTO_START_SITES = [
  "src/views/home/model/keyboard/use-topology-keyboard-tour.tsx",
  "src/features/guided-tour/ui/DestinationGuide.tsx",
  "src/features/first-run-starter/model/vault-guide-auto-open.ts",
] as const;

/** Where the switch is **defined**. Not a consumer, so it is not in the list above. */
const SWITCH_DEFINITION = "src/shared/lib/preferences/guide-auto-start.ts";

describe("화면 안내 자동 표시 — 스위치가 모든 발화 지점을 덮는다", () => {
  it.each(AUTO_START_SITES)("%s 가 스위치를 읽는다", (path) => {
    expect(read(path), `${path} 의 자동 시작이 스위치를 안 본다 — 스위치가 반만 듣는다`).toContain(
      "readGuideAutoStart()",
    );
  });

  /**
   * The tree is walked directly to find every file reading the switch and compared with the list,
   * so an unregistered auto-start site is discovered.
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
      `Unregistered auto-start sites: ${unregistered.join(", ")}. ` +
        `A new file that reads the switch goes into AUTO_START_SITES too`,
    ).toEqual([]);

    const stale = [...registered].filter((p) => !found.includes(p));
    expect(
      stale,
      `Registered files that no longer read the switch: ${stale.join(", ")}. ` +
        `If auto-start was removed, drop them from the list; if not, the file lost the switch`,
    ).toEqual([]);
  });

  /** Turning the switch off is not deletion: the ways to summon a guide must stay alive regardless. */
  it("부르는 길은 스위치 뒤에 숨지 않는다", () => {
    const settings = read("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
    const replayRow = settings.slice(settings.indexOf("app-settings-replay-guide"));
    expect(replayRow.slice(0, 900)).not.toContain("guideAutoStart");
  });
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('useTopologyKeyboardTour({');
});
