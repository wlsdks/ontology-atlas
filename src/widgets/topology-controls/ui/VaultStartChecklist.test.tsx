import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultStartChecklist } from "./VaultStartChecklist";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("VaultStartChecklist", () => {
  it("marks steps done from live counts and routes the create CTA", () => {
    const onCreate = vi.fn();
    render(
      <VaultStartChecklist
        projectCount={0}
        domainCount={0}
        relationCount={0}
        onCreateNode={onCreate}
        onOpenAgentConnect={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId(/checklist-step-/)).toHaveLength(4);
    expect(screen.getByTestId("checklist-step-project")).toHaveAttribute("data-done", "false");

    fireEvent.click(screen.getByTestId("checklist-cta-project"));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("shows progress as counts appear", () => {
    render(
      <VaultStartChecklist
        projectCount={1}
        domainCount={1}
        relationCount={0}
        onCreateNode={vi.fn()}
        onOpenAgentConnect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("checklist-step-project")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("checklist-step-domain")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("checklist-step-relation")).toHaveAttribute("data-done", "false");
  });

  it("routes the agent step to the connect sheet when provided", () => {
    const onOpenAgentConnect = vi.fn();
    render(
      <VaultStartChecklist
        projectCount={0}
        domainCount={0}
        relationCount={0}
        onCreateNode={vi.fn()}
        onOpenAgentConnect={onOpenAgentConnect}
      />,
    );
    fireEvent.click(screen.getByTestId("checklist-cta-agent"));
    expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
  });

  it("links the relation step to the builder", () => {
    render(
      <VaultStartChecklist
        projectCount={1}
        domainCount={1}
        relationCount={0}
        onCreateNode={vi.fn()}
        onOpenAgentConnect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("checklist-cta-relation")).toHaveAttribute(
      "href",
      "/ontology/edit/",
    );
  });
});
