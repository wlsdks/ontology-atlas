import { describe, expect, it } from "vitest";
import { deriveProjectSourceWitnesses } from "./project-source-witnesses";

describe("deriveProjectSourceWitnesses", () => {
  it("collects only source-role paths contained by the selected project", () => {
    const witnesses = deriveProjectSourceWitnesses({
      projectSlug: "music",
      nodes: [
        { id: "project:music", kind: "project", title: "Music", projectIds: [], agentSlug: "project" },
        { id: "capability:play", kind: "capability", title: "Play", projectIds: ["music"], agentSlug: "capabilities/play" },
        { id: "element:player", kind: "element", title: "Player", projectIds: ["music"], agentSlug: "elements/player" },
        { id: "capability:shop", kind: "capability", title: "Shop", projectIds: ["store"], agentSlug: "capabilities/shop" },
      ],
      docs: [
        { slug: "project", frontmatter: { kind: "project" } },
        { slug: "capabilities/play", frontmatter: { kind: "capability", path: "src/play.ts", elements: ["elements/player", "src/audio.ts"] } },
        { slug: "elements/player", frontmatter: { kind: "element", path: "src/player.ts" } },
        { slug: "capabilities/shop", frontmatter: { kind: "capability", path: "src/shop.ts" } },
      ],
    });

    expect(witnesses).toEqual([
      { id: "capabilities/play:element:src/audio.ts", nodeSlug: "capabilities/play", role: "implementation", path: "src/audio.ts" },
      { id: "capabilities/play:path", nodeSlug: "capabilities/play", role: "entrypoint", path: "src/play.ts" },
      { id: "elements/player:path", nodeSlug: "elements/player", role: "implementation", path: "src/player.ts" },
    ]);
  });

  it("keeps a path-titled external element as implementation evidence and deduplicates it", () => {
    const witnesses = deriveProjectSourceWitnesses({
      projectSlug: "music",
      nodes: [
        { id: "project:music", kind: "project", title: "Music", projectIds: [], agentSlug: "project" },
        { id: "src/player.ts", kind: "element", title: "src/player.ts", projectIds: ["music"], agentSlug: null },
      ],
      docs: [{ slug: "project", frontmatter: { kind: "project", elements: ["src/player.ts"] } }],
    });

    expect(witnesses).toEqual([
      { id: "project:element:src/player.ts", nodeSlug: "project", role: "implementation", path: "src/player.ts" },
    ]);
  });
});
