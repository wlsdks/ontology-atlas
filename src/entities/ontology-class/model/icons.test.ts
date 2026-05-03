import { describe, expect, it } from "vitest";
import { Box, Cog, FileText, Folder, HelpCircle, Layers } from "lucide-react";
import { getOntologyKindIcon } from "./icons";

describe("getOntologyKindIcon", () => {
  it("5 정식 kind 의 metaphor icon 매핑", () => {
    expect(getOntologyKindIcon("project")).toBe(Folder);
    expect(getOntologyKindIcon("domain")).toBe(Layers);
    expect(getOntologyKindIcon("capability")).toBe(Cog);
    expect(getOntologyKindIcon("element")).toBe(Box);
    expect(getOntologyKindIcon("document")).toBe(FileText);
  });

  it("unknown 은 HelpCircle (stub placeholder)", () => {
    expect(getOntologyKindIcon("unknown")).toBe(HelpCircle);
  });

  it("legacy / 알 수 없는 kind 는 HelpCircle fallback", () => {
    expect(getOntologyKindIcon("legacy-kind")).toBe(HelpCircle);
    expect(getOntologyKindIcon("")).toBe(HelpCircle);
    expect(getOntologyKindIcon("vault-readme")).toBe(HelpCircle);
  });
});
