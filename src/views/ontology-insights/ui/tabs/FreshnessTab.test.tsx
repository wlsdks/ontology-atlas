import { render, screen } from "@testing-library/react";
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
  recentUpdatesTitle: "Recent updates",
  noRecentUpdates: "No recent updates",
  staleCountLabel: "Stale (90d+)",
  trendTitle: "Trend",
  trendCaption: "Weekly updates",
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

  it("shows the empty state instead of a list when there are no recent updates", () => {
    render(
      <FreshnessTab
        domainRows={[]}
        recent={[]}
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
});
