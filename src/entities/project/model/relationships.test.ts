import { describe, expect, it } from "vitest";
import {
  getProjectRelationshipMeta,
  resolveProjectRelationshipKind,
} from "./relationships";

describe("resolveProjectRelationshipKind", () => {
  it("treats IAM dependencies as auth relationships", () => {
    expect(resolveProjectRelationshipKind("iam")).toBe("auth");
  });

  it("treats Reactor dependencies as agent relationships", () => {
    expect(resolveProjectRelationshipKind("reactor")).toBe("agent");
  });

  it("falls back to dependency for every other target", () => {
    expect(resolveProjectRelationshipKind("aslan-maps")).toBe("dependency");
    expect(resolveProjectRelationshipKind("unknown")).toBe("dependency");
  });
});

describe("getProjectRelationshipMeta", () => {
  it("returns stable labels and dash patterns for auth edges", () => {
    expect(getProjectRelationshipMeta("auth")).toEqual({
      kind: "auth",
      label: "Auth",
      description: "인증 흐름",
      strokeDasharray: undefined,
      strokeWidth: 1.15,
    });
  });

  it("returns dashed styling for agent edges", () => {
    expect(getProjectRelationshipMeta("agent")).toEqual({
      kind: "agent",
      label: "Agent",
      description: "AI 런타임",
      strokeDasharray: "10 6",
      strokeWidth: 1.2,
    });
  });

  it("returns dotted styling for generic dependencies", () => {
    expect(getProjectRelationshipMeta("dependency")).toEqual({
      kind: "dependency",
      label: "Dependency",
      description: "서비스 연결",
      strokeDasharray: "2 6",
      strokeWidth: 1,
    });
  });
});
