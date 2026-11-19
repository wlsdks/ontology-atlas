import { describe, expect, it } from "vitest";

import { buildDefinitionPreview, parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";

import { renameTitleHeading, replaceLeadParagraph } from "./lead-paragraph";

const HEAD = "---\nkind: capability\ntitle: Refunds\n---\n";
const preview = (raw: string) => {
  const { frontmatter, body } = parseFrontmatter(raw);
  return buildDefinitionPreview(body, frontmatter);
};

describe("replaceLeadParagraph", () => {
  it("replaces the first paragraph under the title and keeps the sections after it", () => {
    const raw = `${HEAD}\n# Refunds\n\nOld words\nover two lines.\n\n## Includes\n\n- Partial refunds\n`;
    const next = replaceLeadParagraph(raw, "Returns money for an order.", ["Refunds"]);
    expect(next).toBe(`${HEAD}\n# Refunds\n\nReturns money for an order.\n\n## Includes\n\n- Partial refunds\n`);
    expect(preview(next)).toBe("Returns money for an order.");
  });

  it("inserts a paragraph under a bare title heading", () => {
    const next = replaceLeadParagraph(`${HEAD}\n# Refunds\n`, "Returns money.", ["Refunds"]);
    expect(next).toBe(`${HEAD}\n# Refunds\n\nReturns money.\n`);
    expect(preview(next)).toBe("Returns money.");
  });

  it("inserts before a section that follows the heading directly", () => {
    const next = replaceLeadParagraph(`${HEAD}\n# Refunds\n\n## Includes\n\n- All\n`, "Returns money.", ["Refunds"]);
    expect(next).toBe(`${HEAD}\n# Refunds\n\nReturns money.\n\n## Includes\n\n- All\n`);
  });

  it("removes the paragraph when the new description is empty", () => {
    const next = replaceLeadParagraph(`${HEAD}\n# Refunds\n\nOld.\n\n## Includes\n`, "  ", ["Refunds"]);
    expect(next).toBe(`${HEAD}\n# Refunds\n\n## Includes\n`);
  });
});

describe("renameTitleHeading", () => {
  it("renames the heading that spells the old title and leaves a different heading alone", () => {
    expect(renameTitleHeading(`${HEAD}\n# Refunds\n\nBody.\n`, "Refunds", "Money back")).toBe(
      `${HEAD}\n# Money back\n\nBody.\n`,
    );
    expect(renameTitleHeading(`${HEAD}\n# Overview\n`, "Refunds", "Money back")).toBe(`${HEAD}\n# Overview\n`);
  });
});
