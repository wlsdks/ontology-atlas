import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FreshnessTab, type FreshnessTabLabels } from "./FreshnessTab";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: FreshnessTabLabels = {
  domainFreshnessTitle: "Domain freshness",
  windowCaption: "12 weeks",
  noDomains: "No domains yet",
  stale: "stale",
  currentWeek: "This week",
  unknownDate: "Unknown",
  daysAgo: (days) => `${days}d ago`,
  older: "Older",
  axisStart: "12 weeks ago",
  axisEnd: "Now",
  weekCell: (weeksAgo, count) => `${weeksAgo}w ago · ${count} updates`,
  weekCellCurrent: (count) => `This week · ${count} updates`,
  recentUpdatesTitle: "Recent updates",
  noRecentUpdates: "No recent updates",
  staleCountLabel: "Stale (90d+)",
  trendTitle: "Trend",
  trendCaption: "Weekly updates",
  evidenceShow: (count) => `Show ${count} names without a document`,
  evidenceHide: "Hide names without a document",
  evidenceCaption: "The date belongs to the document that wrote the name down.",
  evidenceTruncated: (shown, total) => `Top ${shown} / ${total}`,
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
};

const recentLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: (title: string) => `${title} — view on the map`,
};

describe("FreshnessTab", () => {
  // P4-③ 회귀: "Recent updates" 행이 UTC 가 아니라 사용자 로컬 타임존
  // 기준으로 날짜를 렌더하는지 고정 TZ 로 검증.
  let originalTz: string | undefined;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = "Asia/Seoul";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("renders a late-night KST update on its local calendar day, not the UTC day it crosses into (P4-③)", () => {
    render(
      <FreshnessTab
        domainRows={[]}
        recent={[
          {
            nodeId: "capability:offline-sync",
            title: "Offline sync",
            kind: "capability",
            domainTitle: null,
            // 2026-07-21 03:12 KST === 2026-07-20 18:12 UTC.
            updatedAt: "2026-07-20T18:12:00.000Z",
          },
        ]}
        recentEvidence={[]}
        recentEvidenceTotal={0}
        staleCount={0}
        weeklyTotals={[]}
        kindLabel={(kind) => kind}
        recentLink={recentLink}
        labels={labels}
      />,
    );

    const link = screen.getByTestId("insights-freshness-row-link");
    expect(link).toHaveTextContent("2026.07.21");
    expect(link).not.toHaveTextContent("2026.07.20");
  });

  it("renders each recent-update row as a map-focus deeplink (N4 — 신선도 행 비클릭 해소)", () => {
    render(
      <FreshnessTab
        domainRows={[]}
        recent={[
          {
            nodeId: "domain:auth",
            title: "Auth",
            kind: "domain",
            domainTitle: null,
            updatedAt: "2026-07-19T00:00:00.000Z",
          },
        ]}
        recentEvidence={[]}
        recentEvidenceTotal={0}
        staleCount={0}
        weeklyTotals={[]}
        kindLabel={(kind) => kind}
        recentLink={recentLink}
        labels={labels}
      />,
    );

    const link = screen.getByTestId("insights-freshness-row-link");
    expect(link).toHaveAttribute("href", "/ontology/?node=domain%3Aauth");
    expect(link).toHaveAttribute("aria-label", "Auth — view on the map");
    expect(link).toHaveTextContent("Auth");
  });

  it("히트스트립 셀마다 주차·실건수 툴팁을 단다 — 이번 주 셀은 전용 문구", () => {
    const weeks = Array.from({ length: 12 }, (_, i) => ({
      level: (i === 11 ? 2 : i === 9 ? 1 : 0) as 0 | 1 | 2 | 3,
      isCurrentWeek: i === 11,
      count: i === 11 ? 2 : i === 9 ? 1 : 0,
    }));
    render(
      <FreshnessTab
        domainRows={[
          {
            domainId: "domain:views",
            domainTitle: "Views",
            weeks,
            mostRecentUpdatedAt: "2026-07-20T00:00:00.000Z",
            daysAgo: 1,
            stale: false,
          },
        ]}
        recent={[]}
        recentEvidence={[]}
        recentEvidenceTotal={0}
        staleCount={0}
        weeklyTotals={[]}
        kindLabel={(kind) => kind}
        recentLink={recentLink}
        labels={labels}
      />,
    );

    const row = screen.getByTestId("insights-freshness-domain-row");
    const cells = row.querySelectorAll("i[title]");
    // 12개 셀 전부 툴팁 — 마지막(우측)이 이번 주, 그 앞은 "N주 전".
    expect(cells).toHaveLength(12);
    expect(cells[11]).toHaveAttribute("title", "This week · 2 updates");
    expect(cells[9]).toHaveAttribute("title", "2w ago · 1 updates");
    expect(cells[0]).toHaveAttribute("title", "11w ago · 0 updates");
  });

  it("shows the empty state instead of a list when there are no recent updates", () => {
    render(
      <FreshnessTab
        domainRows={[]}
        recent={[]}
        recentEvidence={[]}
        recentEvidenceTotal={0}
        staleCount={0}
        weeklyTotals={[]}
        kindLabel={(kind) => kind}
        recentLink={recentLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("No recent updates")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-freshness-row-link")).toBeNull();
  });
  it("근거 계층은 접혀 있고, 열면 배지·참조 원문으로 같은 제목의 두 행을 가른다 (A1)", () => {
    render(
      <FreshnessTab
        domainRows={[]}
        recent={[
          {
            nodeId: "capability:written",
            title: "Written by hand",
            kind: "capability",
            domainTitle: null,
            updatedAt: "2026-07-19T00:00:00.000Z",
          },
        ]}
        recentEvidence={[
          {
            nodeId: "element:hook-a",
            title: "Inject Ontology Summary",
            kind: "element",
            domainTitle: null,
            updatedAt: "2026-07-19T00:00:00.000Z",
            ref: ".claude/hooks/inject-ontology-summary.sh",
          },
          {
            nodeId: "element:hook-b",
            title: "Inject Ontology Summary",
            kind: "element",
            domainTitle: null,
            updatedAt: "2026-07-19T00:00:00.000Z",
            ref: ".codex/hooks/inject-ontology-summary.sh",
          },
        ]}
        recentEvidenceTotal={193}
        staleCount={0}
        weeklyTotals={[]}
        kindLabel={(kind) => kind}
        recentLink={recentLink}
        labels={labels}
      />,
    );

    // 접힘이 기본 — 파생 이름이 1계층에 앉아 있지 않다.
    expect(screen.queryByTestId("insights-freshness-evidence-row-link")).toBeNull();
    const toggle = screen.getByTestId("insights-freshness-evidence-toggle");
    // 규모는 라벨이 그대로 말한다 — 숨기기가 아니라 계층화다.
    expect(toggle).toHaveTextContent("Show 193 names without a document");

    fireEvent.click(toggle);

    const rows = screen.getAllByTestId("insights-freshness-evidence-row-link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(".claude/hooks/inject-ontology-summary.sh");
    expect(rows[1]).toHaveTextContent(".codex/hooks/inject-ontology-summary.sh");
    expect(screen.getAllByTestId("evidence-only-badge")).toHaveLength(2);
    // 날짜의 주인이 누구인지 캡션이 말한다.
    expect(
      screen.getByText(/date belongs to the document that wrote the name down/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Top 2 \/ 193/)).toBeInTheDocument();
  });

  it("근거 계층이 0건이면 토글 자체를 그리지 않는다", () => {
    render(
      <FreshnessTab
        domainRows={[]}
        recent={[]}
        recentEvidence={[]}
        recentEvidenceTotal={0}
        staleCount={0}
        weeklyTotals={[]}
        kindLabel={(kind) => kind}
        recentLink={recentLink}
        labels={labels}
      />,
    );

    expect(screen.queryByTestId("insights-freshness-evidence-toggle")).toBeNull();
  });
});
