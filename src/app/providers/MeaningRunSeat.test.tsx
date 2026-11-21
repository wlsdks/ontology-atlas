import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import type { VectorRun } from "@/features/vault-vectors";
import type { MeaningRunObservation } from "@/features/work-run";
import { MeaningRunSeat } from "./MeaningRunSeat";

const mocks = vi.hoisted(() => ({
  run: null as VectorRun | null,
  observeMeaning: vi.fn(),
}));

vi.mock("@/entities/vault-session", () => ({
  useLocalVault: () => ({ handle: { rootPath: "/vaults/launch" } }),
  useVaultSessionIdentityScope: () => "local:launch",
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/vault-vectors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/vault-vectors")>()),
  useVectorRun: () => mocks.run,
  useVectorRunStageShown: () => false,
}));
vi.mock("@/features/work-run", () => ({
  workRuns: { observeMeaning: mocks.observeMeaning, setMeaningStop: vi.fn(), setMeaningDoor: vi.fn() },
}));

const failedRun = (detail: string): VectorRun => ({
  phase: "failed",
  updating: false,
  quiet: false,
  fraction: 0,
  filesDone: 0,
  filesTotal: 10,
  currentPath: null,
  minutesLeft: null,
  model: null,
  failure: { message: "modelFailed", values: { detail } },
  pressed: null,
  stop: () => undefined,
  resume: () => undefined,
});

const observedFailure = () => (mocks.observeMeaning.mock.lastCall?.[1] as MeaningRunObservation | null)?.failure;

beforeEach(() => {
  mocks.observeMeaning.mockClear();
});

describe("the long-work seat's words for a model that could not run", () => {
  it.each([
    ["convert", "the model could not be prepared for this computer"],
  ])("name the cause as the desk does (%s)", (detail, cause) => {
    mocks.run = failedRun(detail);
    render(<NextIntlClientProvider locale="en" messages={en}><MeaningRunSeat /></NextIntlClientProvider>);
    expect(observedFailure()).toBe(`The model could not run on this computer: ${cause}.`);
  });
});
