import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../../messages/en.json";
import { CodeRow } from "./CodeRow";

function renderRow(changedEvidence: { path: string; gone: boolean } | null) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CodeRow row={{ path: "src/a.ts", citeCount: 1, readerOpen: false, onToggle: vi.fn(), changedEvidence }} />
    </NextIntlClientProvider>,
  );
}

describe("CodeRow", () => {
  it("names the cited file that changed after the document, which is why the map rings the concept", () => {
    renderRow({ path: "src/b.ts", gone: false });
    expect(screen.getByTestId("map-detail-panel-code-changed").textContent).toBe(
      "src/b.ts changed after this document was written.",
    );
  });

  it("says a cited file left its path instead of calling it changed", () => {
    renderRow({ path: "src/gone.ts", gone: true });
    expect(screen.getByTestId("map-detail-panel-code-changed").textContent).toBe(
      "src/gone.ts is not at that path in this repository.",
    );
  });

  it("adds nothing while the evidence is current or unmeasured", () => {
    renderRow(null);
    expect(screen.queryByTestId("map-detail-panel-code-changed")).toBeNull();
  });
});
