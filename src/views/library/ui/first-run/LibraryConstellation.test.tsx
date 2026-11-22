import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryConstellation } from "./LibraryConstellation";

const { sceneFailure } = vi.hoisted(() => ({ sceneFailure: new Error("the scene could not be drawn") }));

vi.mock("../../expressive/constellation-scene", () => ({
  mountLibraryConstellation: () => {
    throw sceneFailure;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LibraryConstellation", () => {
  it("reports a backdrop that fails to draw instead of swallowing the error", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LibraryConstellation />);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.any(String), sceneFailure));
  });
});
