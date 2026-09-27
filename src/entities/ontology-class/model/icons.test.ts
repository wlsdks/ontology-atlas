import { describe, expect, it } from "vitest";
import { Box, Cog, FileText, Folder, HelpCircle, Layers } from "lucide-react";
import { getOntologyKindIcon } from "./icons";

describe("getOntologyKindIcon", () => {
  it("maps the five canonical kinds to icons", () => {
    expect(getOntologyKindIcon("project")).toBe(Folder);
    expect(getOntologyKindIcon("domain")).toBe(Layers);
    expect(getOntologyKindIcon("capability")).toBe(Cog);
    expect(getOntologyKindIcon("element")).toBe(Box);
    expect(getOntologyKindIcon("document")).toBe(FileText);
  });

  it("maps unknown to HelpCircle", () => {
    expect(getOntologyKindIcon("unknown")).toBe(HelpCircle);
  });

  it("falls back to HelpCircle for legacy or unrecognized kinds", () => {
    expect(getOntologyKindIcon("legacy-kind")).toBe(HelpCircle);
    expect(getOntologyKindIcon("")).toBe(HelpCircle);
    expect(getOntologyKindIcon("vault-readme")).toBe(HelpCircle);
  });
});
