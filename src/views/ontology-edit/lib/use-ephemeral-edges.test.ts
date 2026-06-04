import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEphemeralEdges } from "./use-ephemeral-edges";

describe("useEphemeralEdges", () => {
  it("adds a direct parent to draft edge by node ids", () => {
    const { result } = renderHook(() => useEphemeralEdges());

    act(() => {
      result.current.addEdgeByIds("ontology/project", "ephemeral-domain");
    });

    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0]).toMatchObject({
      source: "ontology/project",
      target: "ephemeral-domain",
      edgeType: "related_to",
    });
  });

  it("ignores duplicate and self-loop direct edges", () => {
    const { result } = renderHook(() => useEphemeralEdges());

    act(() => {
      result.current.addEdgeByIds("a", "b");
      result.current.addEdgeByIds("a", "b");
      result.current.addEdgeByIds("a", "a");
    });

    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0]).toMatchObject({ source: "a", target: "b" });
  });
});
