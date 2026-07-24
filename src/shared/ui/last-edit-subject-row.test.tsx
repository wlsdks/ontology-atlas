import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LastEditSubjectRow } from "./last-edit-subject-row";

describe("LastEditSubjectRow", () => {
  it("renders the agent subject with prefix/subject/age text", () => {
    render(
      <LastEditSubjectRow
        kind="agent"
        prefixLabel="마지막 편집"
        subjectLabel="AI 에이전트"
        ageLabel="3분 전"
      />,
    );
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "agent");
    expect(row).toHaveTextContent("마지막 편집");
    expect(row).toHaveTextContent("AI 에이전트");
    expect(row).toHaveTextContent("3분 전");
  });

  it("renders the human subject with a different kind marker, same structure", () => {
    render(
      <LastEditSubjectRow kind="human" prefixLabel="Last edited" subjectLabel="me" ageLabel="yesterday" />,
    );
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "human");
    expect(row).toHaveTextContent("Last edited");
    expect(row).toHaveTextContent("me");
    expect(row).toHaveTextContent("yesterday");
  });
});
