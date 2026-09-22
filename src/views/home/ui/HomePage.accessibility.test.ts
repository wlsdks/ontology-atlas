import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chromeSource = readFileSync("src/views/home/ui/TopologyCommandChrome.tsx", "utf8");
const homePageSource = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");

describe("topology sample switch accessibility", () => {
  it("keeps the visible label inside the longer accessible name", () => {
    expect(homePageSource).toContain("<TopologyCommandChrome");
    expect(chromeSource).toContain(
      "aria-label={`${t('controls.switchToMyDataLabel')} — ${t('controls.switchToMyDataAriaLabel')}`}",
    );
  });
});
