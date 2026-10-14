import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MtimeConflictBadge } from "./mtime-conflict-badge";

describe("MtimeConflictBadge", () => {
  it("renders the given message with a status role", () => {
    render(<MtimeConflictBadge message="이 문서가 다른 곳에서 바뀌었어요 — 덮어쓰기 전에 확인하세요" />);
    const badge = screen.getByTestId("mtime-conflict-badge");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toHaveTextContent("덮어쓰기 전에 확인하세요");
  });
});
