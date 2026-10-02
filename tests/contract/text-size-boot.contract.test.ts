import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_ROOT_PERCENT,
  TEXT_SIZES,
} from "../../src/shared/lib/preferences/text-size";

const ROOT = process.cwd();
const boot = readFileSync(join(ROOT, "src", "shared", "ui", "lang-boot-script.tsx"), "utf8");
const store = readFileSync(join(ROOT, "src", "shared", "lib", "preferences", "text-size.ts"), "utf8");
const css = readFileSync(join(ROOT, "app", "styles", "base-responsive.css"), "utf8");
const snippet = /const TEXT_SIZE_BOOT = \[([\s\S]*?)\]\.join/.exec(boot)?.[1] ?? "";
const storageKey = /key: "([^"]+)"/.exec(store)?.[1];

describe("text size is planted before the first paint", () => {
  it("is rendered by the boot script and holds constants only", () => {
    expect(snippet, "TEXT_SIZE_BOOT is missing from lang-boot-script.tsx").not.toBe("");
    expect(boot).toMatch(/__html: LANG_BOOT \+ TEXT_SIZE_BOOT/);
    expect(snippet).not.toContain("${");
    expect(snippet).not.toMatch(/innerHTML|eval|Function|document\.write/);
  });

  it("reads the store's key and plants the store's attribute", () => {
    expect(storageKey, "could not read the text-size storage key").toBeDefined();
    expect(snippet).toContain(`localStorage.getItem('${storageKey}')`);
    expect(snippet).toContain(`setAttribute('${TEXT_SIZE_ATTRIBUTE}',t)`);
  });

  it("plants exactly the non-default steps", () => {
    const planted = [...snippet.matchAll(/t==='([a-z-]+)'/g)].map((match) => match[1]);
    expect(planted).toEqual(TEXT_SIZES.filter((size) => size !== "default"));
  });

  it("sizes the root by the store's percents", () => {
    const rules = Object.fromEntries(
      [...css.matchAll(/html\[data-text-size="([a-z-]+)"\]\s*\{\s*font-size:\s*([\d.]+)%;\s*\}/g)].map((match) => [
        match[1],
        Number(match[2]),
      ]),
    );
    const expected = Object.fromEntries(
      TEXT_SIZES.filter((size) => size !== "default").map((size) => [size, TEXT_SIZE_ROOT_PERCENT[size]]),
    );
    expect(rules).toEqual(expected);
    expect(TEXT_SIZE_ROOT_PERCENT.default).toBe(100);
  });
});
