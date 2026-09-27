import { describe, expect, it } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { IMPACT_MODE_COPY_KEYS } from "./impact-mode-copy";

/** The four impact modes run different graph operations, so their help text must differ. */
describe("IMPACT_MODE_COPY_KEYS (rank16)", () => {
  it('registers all four modes', () => {
    expect(IMPACT_MODE_COPY_KEYS.map((item) => item.mode)).toEqual([
      "none",
      "upstream",
      "downstream",
      "network",
    ]);
  });

  it('gives every mode distinct label and help keys', () => {
    const helpKeys = IMPACT_MODE_COPY_KEYS.map((item) => item.helpKey);
    expect(new Set(helpKeys).size).toBe(helpKeys.length);
  });

  it.each([koMessages, enMessages])(
    'has every label and help key in the ko and en catalogs',
    (messages) => {
      const drawer = messages.vaultWidgets.projectDrawer as Record<
        string,
        string
      >;
      for (const item of IMPACT_MODE_COPY_KEYS) {
        expect(typeof drawer[item.labelKey]).toBe("string");
        expect(drawer[item.labelKey].length).toBeGreaterThan(0);
        expect(typeof drawer[item.helpKey]).toBe("string");
        expect(drawer[item.helpKey].length).toBeGreaterThan(0);
      }
    },
  );

  it('matches the upstream and downstream help to the ko direction vocabulary', () => {
    const drawer = koMessages.vaultWidgets.projectDrawer;
    expect(drawer.impactHelpUpstream).toContain("필요한 대상");
    expect(drawer.impactHelpDownstream).toContain("필요로 하는 대상");
  });
});
