import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ContainmentBatchSheet,
  type ContainmentBatchLabels,
  type ContainmentRowStatus,
} from "./ContainmentBatchSheet";
import {
  buildContainmentPlan,
  buildContainmentProposals,
  runContainmentBatch,
  selectContainmentWrites,
  type ContainmentPlanDoc,
  type ContainmentProposal,
} from "../../lib/containment-batch";
import { VaultConflictError } from "@/entities/vault-session";

const LABELS: ContainmentBatchLabels = {
  title: (count) => `Add back-links to ${count} domain entries`,
  lede: "Nothing is written until you press Apply.",
  row: (concept, domain, key) => `${concept} → the ${key} list in ${domain}`,
  rowTarget: (domain, concept) => `The file that changes is ${domain}, adding ${concept}.`,
  apply: (count) => `Apply ${count}`,
  applying: "Writing…",
  cancel: "Cancel",
  close: "Close",
  statusDone: "Written",
  statusConflict: "The file changed meanwhile",
  statusFailed: (message) => `Failed: ${message}`,
  outcome: (done, failed) => `${done} written, ${failed} left`,
};

const PROPOSALS: ContainmentProposal[] = [
  {
    id: "domains/billing::capabilities/pay",
    conceptSlug: "capabilities/pay",
    conceptTitle: "Pay",
    domainSlug: "domains/billing",
    domainTitle: "Billing",
    domainPath: "domains/billing.md",
    key: "capabilities",
  },
  {
    id: "domains/billing::elements/receipt",
    conceptSlug: "elements/receipt",
    conceptTitle: "Receipt",
    domainSlug: "domains/billing",
    domainTitle: "Billing",
    domainPath: "domains/billing.md",
    key: "elements",
  },
];

const renderSheet = (
  overrides: Partial<React.ComponentProps<typeof ContainmentBatchSheet>> = {},
) =>
  render(
    <ContainmentBatchSheet
      open
      proposals={PROPOSALS}
      statuses={new Map<string, ContainmentRowStatus>()}
      running={false}
      finished={false}
      onApply={() => {}}
      onClose={() => {}}
      labels={LABELS}
      {...overrides}
    />,
  );

/**
 * **Nothing is written until a person says so, and only what they left ticked.**
 *
 * This is the board's first control that changes more than one of the person's files, so the
 * properties under test are the promises the sheet makes on screen: every write is a row, the row
 * says which document changes, unticking one removes it from what Apply sends, and no write leaves
 * before Apply is pressed.
 */
describe("ContainmentBatchSheet", () => {
  it("모든 쓰기가 한 줄씩 보이고, 어느 문서가 바뀌는지 그 줄이 말한다", () => {
    renderSheet();
    const rows = screen.getAllByTestId("containment-batch-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Pay → the capabilities list in Billing");
    expect(rows[1]).toHaveTextContent("Receipt → the elements list in Billing");
  });

  it("열릴 때는 전부 체크돼 있고, 적용은 체크한 것만 보낸다", () => {
    const onApply = vi.fn();
    renderSheet({ onApply });
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeChecked();

    fireEvent.click(
      within(screen.getAllByTestId("containment-batch-row")[1]).getByRole("checkbox"),
    );
    expect(screen.getByTestId("containment-batch-apply")).toHaveTextContent("Apply 1");

    fireEvent.click(screen.getByTestId("containment-batch-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect([...onApply.mock.calls[0][0]]).toEqual(["domains/billing::capabilities/pay"]);
  });

  it("아무것도 고르지 않으면 적용할 수 없다 — 빈 실행은 없다", () => {
    renderSheet();
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(screen.getByTestId("containment-batch-apply")).toBeDisabled();
  });

  it("줄마다 결과를 말한다 — 충돌은 실패가 아니라 막아 세운 것이다", () => {
    renderSheet({
      finished: true,
      statuses: new Map<string, ContainmentRowStatus>([
        ["domains/billing::capabilities/pay", { phase: "done" }],
        ["domains/billing::elements/receipt", { phase: "conflict" }],
      ]),
    });
    const rows = screen.getAllByTestId("containment-batch-row");
    expect(rows[0]).toHaveAttribute("data-row-status", "done");
    expect(rows[0]).toHaveTextContent("Written");
    expect(rows[1]).toHaveAttribute("data-row-status", "conflict");
    expect(rows[1]).toHaveTextContent("The file changed meanwhile");
    expect(screen.getByTestId("containment-batch-outcome")).toHaveTextContent("1 written, 1 left");
  });

  it("끝난 뒤에는 다시 실행할 길을 주지 않는다 — 같은 쓰기를 두 번 보내지 않는다", () => {
    renderSheet({ finished: true });
    expect(screen.queryByTestId("containment-batch-apply")).toBeNull();
    expect(screen.getByTestId("containment-batch-close")).toBeInTheDocument();
  });

  it("쓰는 중에는 체크도 취소도 잠긴다", () => {
    renderSheet({ running: true });
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    expect(screen.getByTestId("containment-batch-apply")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("containment-batch-row")).toBeNull();
  });
});

/**
 * **The row names the file the write lands in, and a run says on each row what happened to it.**
 *
 * Two documents in one folder can carry the same title (the dogfood vault does), so a sentence
 * built from titles cannot say which file changes. These cases take the plan and the run the page
 * uses — no imitation of them — and check that what a person reads is what the write addresses,
 * and that a refused guard on one file leaves the next one written.
 */
describe("ContainmentBatchSheet with the real plan", () => {
  const DOCS: ContainmentPlanDoc[] = [
    {
      slug: "domains/billing",
      path: "domains/billing.md",
      title: "Billing",
      frontmatter: { kind: "domain" },
      mtime: 111,
    },
    {
      slug: "domains/shop",
      path: "domains/shop.md",
      // The same title on another file — the reason a row must name the path.
      title: "Billing",
      frontmatter: { kind: "domain" },
      mtime: 222,
    },
    {
      slug: "capabilities/pay",
      path: "capabilities/pay.md",
      title: "Pay",
      frontmatter: { kind: "capability", domain: "domains/billing" },
    },
    {
      slug: "capabilities/browse",
      path: "capabilities/browse.md",
      title: "Browse",
      frontmatter: { kind: "capability", domain: "domains/shop" },
    },
  ];
  const proposals = buildContainmentProposals(
    [
      { slug: "capabilities/pay", domain: "domains/billing" },
      { slug: "capabilities/browse", domain: "domains/shop" },
    ],
    DOCS,
  );
  const plan = buildContainmentPlan(proposals, DOCS);
  const accepted = new Set(proposals.map((proposal) => proposal.id));

  it("줄이 적는 파일 이름을 그대로 말한다 — 제목이 같은 문서가 둘이어도 어느 쪽인지 안다", () => {
    const run = selectContainmentWrites(plan, accepted, DOCS);
    render(
      <ContainmentBatchSheet
        open
        proposals={plan.proposals}
        statuses={new Map<string, ContainmentRowStatus>()}
        running={false}
        finished={false}
        onApply={() => {}}
        onClose={() => {}}
        labels={LABELS}
      />,
    );
    const rows = screen.getAllByTestId("containment-batch-row");
    expect(rows).toHaveLength(2);
    for (const write of run.writes) {
      const row = rows.find((candidate) =>
        candidate.textContent?.includes(write.proposalIds[0].split("::")[1] ?? ""),
      );
      // The string the run addresses the file by is on the row a person ticked.
      expect(row?.textContent).toContain(write.domainPath);
    }
  });

  it("앞 파일이 충돌해도 뒤 파일은 적히고, 마무리 문장이 몇 개를 적었는지 말한다", async () => {
    const run = selectContainmentWrites(plan, accepted, DOCS);
    expect(run.writes).toHaveLength(2);
    const write = vi
      .fn<(target: (typeof run.writes)[number]) => Promise<void>>()
      .mockRejectedValueOnce(new VaultConflictError("domains/billing", 111, 999))
      .mockResolvedValueOnce(undefined);

    let statuses: ReadonlyMap<string, ContainmentRowStatus> = new Map();
    await runContainmentBatch(run, {
      write,
      skipMessage: () => "not attempted",
      onStatuses: (next) => {
        statuses = next;
      },
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(statuses.get(run.writes[0].proposalIds[0])).toEqual({ phase: "conflict" });
    expect(statuses.get(run.writes[1].proposalIds[0])).toEqual({ phase: "done" });

    render(
      <ContainmentBatchSheet
        open
        proposals={plan.proposals}
        statuses={statuses}
        running={false}
        finished
        onApply={() => {}}
        onClose={() => {}}
        labels={LABELS}
      />,
    );
    const rows = screen.getAllByTestId("containment-batch-row");
    expect(rows[0]).toHaveAttribute("data-row-status", "conflict");
    expect(rows[0]).toHaveTextContent("The file changed meanwhile");
    expect(rows[1]).toHaveAttribute("data-row-status", "done");
    expect(screen.getByTestId("containment-batch-outcome")).toHaveTextContent("1 written, 1 left");
  });
});
