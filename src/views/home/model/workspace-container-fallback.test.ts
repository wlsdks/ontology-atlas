import { describe, expect, it } from "vitest";
import type { Project } from "@/entities/project";
import {
  deriveWorkspaceProjectContainers,
  inferWorkspaceProjectGroup,
} from "./workspace-container-fallback";

function project(overrides: Partial<Project> & Pick<Project, "slug" | "name">): Project {
  return {
    category: "system",
    status: "developing",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("inferWorkspaceProjectGroup", () => {
  it("uses explicit workspaceProjectId before legacy name fallback", () => {
    expect(
      inferWorkspaceProjectGroup(
        project({
          slug: "aslan-ingest-classifier",
          name: "Aslan Ingest · Classifier",
          workspaceProjectId: "ingest",
        }),
      ),
    ).toEqual({ id: "ingest", name: "Aslan Ingest" });
  });

  it("infers a container from the legacy display name prefix", () => {
    expect(
      inferWorkspaceProjectGroup(
        project({
          slug: "aslan-billing-cache",
          name: "Aslan Billing · Cache",
        }),
      ),
    ).toEqual({ id: "aslan-billing", name: "Aslan Billing" });
  });
});

describe("deriveWorkspaceProjectContainers", () => {
  it("groups legacy flat hubs and nodes into project containers", () => {
    const containers = deriveWorkspaceProjectContainers(
      [
        project({
          slug: "aslan-ingest-classifier",
          name: "Aslan Ingest · Classifier",
          isHub: true,
        }),
        project({
          slug: "aslan-ingest-parser",
          name: "Aslan Ingest · Parser",
        }),
        project({
          slug: "aslan-billing-cache",
          name: "Aslan Billing · Cache",
          isHub: true,
        }),
      ],
      "account-1",
    );

    expect(containers.map((container) => container.id)).toEqual([
      "aslan-ingest",
      "aslan-billing",
    ]);
    expect(containers[0]).toMatchObject({
      name: "Aslan Ingest",
      accountId: "account-1",
      description: "기존 프로젝트 목록에서 추론한 프로젝트 컨테이너",
      hubCount: 1,
      nodeCount: 1,
    });
  });
});
