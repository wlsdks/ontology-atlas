import { describe, expect, it } from "vitest";
import { validationIssuesFor } from "./validation-issues";

const stored = {
  kind: "capability",
  slug: "capabilities/checkout",
  title: "Checkout",
  domain: "shop",
  uid: "0f0e5f1a-6c53-4a1b-9c2f-2f0f7b6a1d34",
};
const doc = { slug: "capabilities/checkout", frontmatter: stored, diagnostics: [] };
const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code);

describe("validationIssuesFor", () => {
  it("lists errors before warnings", () => {
    const issues = validationIssuesFor(
      { ...doc, diagnostics: [{ code: "malformed-quoted-scalar", line: 2, message: "raw" }] },
      { kind: "element", domain: "shop", moveTarget: null },
    );
    expect(codes(issues)).toContain("slug-outside-kind-folder");
    const severities = issues.map((issue) => issue.severity);
    expect(severities.indexOf("error")).toBeLessThan(severities.indexOf("warning"));
    expect(severities.lastIndexOf("error")).toBeLessThan(severities.indexOf("warning"));
  });

  it("validates a kind change as it would be saved: the folder warning goes once the move is planned", () => {
    const unmoved = validationIssuesFor(doc, { kind: "element", domain: "shop", moveTarget: null });
    const moved = validationIssuesFor(doc, { kind: "element", domain: "shop", moveTarget: "elements/checkout" });
    expect(codes(unmoved)).toContain("slug-outside-kind-folder");
    expect(codes(moved)).not.toContain("slug-outside-kind-folder");
  });

  it("does not rewrite a slug that does not mirror the address", () => {
    const issues = validationIssuesFor(
      { ...doc, frontmatter: { ...stored, slug: "custom-name" } },
      { kind: "element", domain: "shop", moveTarget: "elements/checkout" },
    );
    expect(codes(issues)).toContain("slug-outside-kind-folder");
  });

  it("applies the draft only when it names a kind, else validates the stored frontmatter as it is", () => {
    const misfiled = { ...doc, frontmatter: { ...stored, kind: "element" } };
    const asStored = validationIssuesFor(misfiled, { kind: "", domain: "", moveTarget: null });
    const asDrafted = validationIssuesFor(misfiled, { kind: "capability", domain: "shop", moveTarget: null });
    expect(codes(asStored)).toContain("slug-outside-kind-folder");
    expect(codes(asDrafted)).not.toContain("slug-outside-kind-folder");
  });
});
