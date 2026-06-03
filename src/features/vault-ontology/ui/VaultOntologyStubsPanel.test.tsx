import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VaultOntologyStubsPanel } from "./VaultOntologyStubsPanel";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const messages: Record<string, string> = {
      headingFallback: "문서함 요약",
      emptyBody: "아직 개념이 없습니다.",
      summary: "개념 {nodes} · 관계 {edges}",
      intro: "현재 로컬 문서함에서 읽은 개념과 관계를 요약합니다.",
      polishBody: "저장·편집 캔버스에서 다듬을 수 있습니다.",
      polishCta: "저장·편집 열기",
      censusSummary: "종류별 요약 {count}개",
      groupSummary: "{kind} · {count}",
    };
    return (key: string, values?: Record<string, string | number>) => {
      let message = messages[key] ?? key;
      for (const [name, value] of Object.entries(values ?? {})) {
        message = message.replace(`{${name}}`, String(value));
      }
      return message;
    };
  },
}));

vi.mock("../model/use-vault-ontology", () => ({
  useVaultOntology: () => ({
    nodes: [{ id: "project:smoke", kind: "project", title: "Smoke" }],
    edges: [],
    warnings: [],
  }),
}));

describe("VaultOntologyStubsPanel", () => {
  it("keeps the populated ontology summary compact by default", () => {
    render(<VaultOntologyStubsPanel />);

    expect(screen.getByRole("heading", { name: "문서함 요약" })).toBeVisible();
    expect(screen.getByText("개념 1 · 관계 0")).toBeVisible();
    expect(screen.getByRole("link", { name: /저장·편집 열기/ })).toHaveAttribute(
      "href",
      "/ontology/edit/",
    );
    expect(
      screen.queryByText("현재 로컬 문서함에서 읽은 개념과 관계를 요약합니다."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("종류별 요약 1개").closest("details")).not.toHaveAttribute(
      "open",
    );
  });
});
