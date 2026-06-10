import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import enMessages from "../../../../messages/en.json";
import koMessages from "../../../../messages/ko.json";

/**
 * Contract guard for the `topology.significance.*` ICU messages that render the
 * node "so what" block. Catches ICU syntax errors and en/ko branch drift before
 * they reach the UI (the popover formats these at runtime via next-intl).
 */
const locales = [
  { locale: "en", messages: enMessages },
  { locale: "ko", messages: koMessages },
] as const;

describe("topology.significance ICU messages", () => {
  for (const { locale, messages } of locales) {
    const t = createTranslator({
      locale,
      messages,
      namespace: "topology.significance",
    });

    it(`[${locale}] formats the importance line for every level`, () => {
      for (const level of ["core", "supporting", "leaf"] as const) {
        const line = t("importance", { level, count: 12 });
        expect(line).toBeTruthy();
        expect(line).not.toContain("{");
      }
    });

    it(`[${locale}] formats dependsOn for the empty and populated branches`, () => {
      expect(t("dependsOn", { count: 0, names: "" })).not.toContain("{");
      const populated = t("dependsOn", { count: 2, names: "MCP SDK, Parser" });
      expect(populated).toContain("MCP SDK, Parser");
    });

    it(`[${locale}] formats impact for the safe and ripple branches`, () => {
      expect(t("impact", { count: 0 })).not.toContain("{");
      expect(t("impact", { count: 7 })).toContain("7");
    });

    it(`[${locale}] formats the what line with and without a domain`, () => {
      expect(t("whatWithDomain", { kind: "K", domain: "D" })).toContain("D");
      expect(t("what", { kind: "K" })).toContain("K");
    });
  }
});
