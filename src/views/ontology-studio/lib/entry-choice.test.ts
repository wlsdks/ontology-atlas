import { describe, expect, it } from "vitest";
import { studioHasDeepLinkIntent } from "./entry-choice";

const params = (q: string) => new URLSearchParams(q);

describe("studioHasDeepLinkIntent — entry choice gate (#1)", () => {
  it("a bare open has no deep-link intent → the choice moment shows", () => {
    expect(studioHasDeepLinkIntent(params(""))).toBe(false);
  });

  it("skips the choice for ?mode=create", () => {
    expect(studioHasDeepLinkIntent(params("mode=create"))).toBe(true);
  });

  it("skips the choice for ?node=", () => {
    expect(studioHasDeepLinkIntent(params("node=capability:x"))).toBe(true);
  });

  it("skips the choice for a create-from-socket ?from=&rel=", () => {
    expect(studioHasDeepLinkIntent(params("mode=create&from=capability:a&rel=dependsOn"))).toBe(true);
  });

  it("skips the choice for a map edge ?edit=", () => {
    expect(studioHasDeepLinkIntent(params("node=capability:a&edit=dependsOn:capability:b"))).toBe(true);
  });

  it("skips the choice for an insights review return (?via=)", () => {
    expect(studioHasDeepLinkIntent(params("via=insights:do-next"))).toBe(true);
  });

  it("an unrelated stray param alone does not skip the choice", () => {
    expect(studioHasDeepLinkIntent(params("foo=bar"))).toBe(false);
  });
});
