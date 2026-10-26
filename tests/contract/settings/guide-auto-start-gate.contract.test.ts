import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every remaining automatic folder-guide entry must read the shared switch.
 * The source inventory also catches a new caller that was not registered.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Files that own an auto-start = files that must read the switch. This list is the reach. */
const AUTO_START_SITES = [
  "src/features/first-run-starter/model/vault-guide-auto-open.ts",
] as const;

/** Where the switch is **defined**. Not a consumer, so it is not in the list above. */
const SWITCH_DEFINITION = "src/shared/lib/preferences/guide-auto-start.ts";

describe("on-screen guide auto display: the switch covers every firing point", () => {
  it.each(AUTO_START_SITES)("%s reads the switch", (path) => {
    expect(read(path), `the auto start of ${path} does not look at the switch, so the switch is only half heard`).toContain(
      "readGuideAutoStart()",
    );
  });

  /**
   * The tree is walked directly to find every file reading the switch and compared with the list,
   * so an unregistered auto-start site is discovered.
   */
  it("there is no unregistered auto start point", () => {
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
    expect(found.length, "found no file that reads the switch, so the scan is broken").toBeGreaterThan(0);

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


});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('useTopologyKeyboard({');
});
