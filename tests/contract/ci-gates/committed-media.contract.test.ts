import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The repository commits only the media the product ships or the README shows. A screenshot,
 * recording or draft made while building or reviewing stays in the session scratchpad: once
 * committed, its bytes stay in every clone's history even after the file is deleted.
 */

const MEDIA = /\.(png|jpe?g|gif|webp|avif|heic|mp4|webm|mov)$/i;

/** Where product media lives, and what reads it. */
const PRODUCT_MEDIA: ReadonlyArray<readonly [RegExp, string]> = [
  [/^public\/(logo|og-image|brand-icon-512|icon|apple-icon)\.png$/, "site identity and the pages' icons"],
  [/^public\/og\/[^/]+\.png$/, "social cards"],
  [/^public\/(brand|gateway|demo)\/[^/]+$/, "the app's mascot and the download page"],
  [/^src-tauri\/icons\//, "the desktop app's icons"],
  [/^docs\/assets\/readme\/[^/]+$/, "README pictures"],
  [/^assets\/brand\/mascot\/(source\/)?[^/]+\.png$/, "the brand build's inputs and outputs"],
  [/^assets\/brand\/moru\/(?!source\/)/, "the Moru export pack"],
  [/^assets\/brand\/moru\/source\//, "Moru source sheets, each named by moru-source.json"],
];

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((path) => MEDIA.test(path));

describe("committed media", () => {
  it("lives only where the product reads it", () => {
    expect(tracked.length, "no media file was listed; the extension list is stale").toBeGreaterThan(300);
    const stray = tracked.filter((path) => !PRODUCT_MEDIA.some(([root]) => root.test(path)));
    expect(
      stray,
      "Screenshots, recordings and drafts stay in the session scratchpad. Attach review captures to the " +
        "pull request; add a product location here only for media the product ships.",
    ).toEqual([]);
  });

  it("keeps only the Moru source sheets the export reads, not drafts or first passes", () => {
    const manifest = readFileSync("assets/brand/moru/moru-source.json", "utf8");
    const sheets = tracked.filter((path) => path.startsWith("assets/brand/moru/source/"));
    expect(sheets.length, "no source sheet was listed").toBeGreaterThan(10);
    const unread = sheets.filter((path) => !manifest.includes(`"${path.slice("assets/brand/moru/".length)}"`));
    expect(unread, "a sheet moru-source.json does not name is a draft; keep it outside the repository").toEqual([]);
  });

  it("is ignored by Git anywhere else, so a capture cannot be staged by accident", () => {
    const captures = ["png", "jpg", "gif", "webp", "mp4", "webm", "mov"].flatMap((ext) => [
      `capture.${ext}`,
      `docs/review/after.${ext}`,
      `assets/brand/moru-draft.${ext}`,
    ]);
    const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      encoding: "utf8",
      input: captures.join("\n"),
    }).split("\n").filter(Boolean);
    expect(captures.filter((path) => !ignored.includes(path))).toEqual([]);
  });
});
