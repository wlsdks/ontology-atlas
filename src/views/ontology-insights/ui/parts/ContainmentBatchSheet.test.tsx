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
 * Nothing is written until a person says so, and only what they left ticked: every write is a row naming the
 * document, unticking removes it from what Apply sends, and nothing leaves before Apply.
 */
describe("ContainmentBatchSheet", () => {
  it("shows one row per write naming the document it changes", () => {
    renderSheet();
    const rows = screen.getAllByTestId("containment-batch-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Pay → the capabilities list in Billing");
    expect(rows[1]).toHaveTextContent("Receipt → the elements list in Billing");
  });

  it("opens with every row checked and applies only checked rows", () => {
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

  it("disables apply when nothing is selected", () => {
    renderSheet();
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(screen.getByTestId("containment-batch-apply")).toBeDisabled();
  });

  it("reports a result per row and shows a conflict as stopped, not failed", () => {
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

  it("offers no rerun after finishing", () => {
    renderSheet({ finished: true });
    expect(screen.queryByTestId("containment-batch-apply")).toBeNull();
    expect(screen.getByTestId("containment-batch-close")).toBeInTheDocument();
  });

  it("locks checkboxes and cancel while writing", () => {
    renderSheet({ running: true });
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    expect(screen.getByTestId("containment-batch-apply")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("renders nothing when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("containment-batch-row")).toBeNull();
  });
});

/**
 * With the page's real plan and run: the row names the file the write addresses (titles can repeat), and a
 * refused guard on one file leaves the next one written.
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
      // The same title on another file, which is why a row names the path.
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

  it("names the exact file each row writes so same-titled documents stay distinct", () => {
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

  it("still writes later files after a conflict and reports how many were written", async () => {
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
