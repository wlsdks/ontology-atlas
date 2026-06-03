import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "OntologyEditCanvas.tsx"), "utf8");

describe("OntologyEditCanvas edge layering", () => {
  it("keeps relation edges behind atlas node cards", () => {
    expect(source).toContain(".react-flow__edges");
    expect(source).toContain("z-index: 0 !important");
    expect(source).toContain(".react-flow__nodes");
    expect(source).toContain("z-index: 2 !important");
    expect(source).toContain(".react-flow__node-atlas");
    expect(source).toContain("z-index: 3 !important");
  });
});
